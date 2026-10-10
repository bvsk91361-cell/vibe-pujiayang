import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { BookingError } from './booking.js';

const derive = promisify(scrypt);
const cost = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const hash = value => createHash('sha256').update(value).digest('hex');
const safeEqual = (a, b) => {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
const usernameKey = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
export const ADMIN_COOKIE = 'borrow_admin';
export const ADMIN_SESSION_TTL = 8 * 60 * 60 * 1000;

export async function hashAdminPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new BookingError('管理员密码需为12～128个字符。', 422);
  }
  const salt = randomBytes(32).toString('hex');
  const key = await derive(password, salt, 64, cost);
  return `scrypt$32768$8$1$${salt}$${key.toString('hex')}`;
}

export async function verifyAdminPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 128 || typeof encoded !== 'string') return false;
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts.slice(0, 4).join('$') !== 'scrypt$32768$8$1' || !/^[a-f0-9]{64}$/.test(parts[4]) || !/^[a-f0-9]{128}$/.test(parts[5])) return false;
  const key = await derive(password, parts[4], 64, cost);
  return timingSafeEqual(key, Buffer.from(parts[5], 'hex'));
}

// Authentication is independent from the freely selected, demonstration user identities.
export function createAdminAuth(file = ':memory:', {
  clock = () => Date.now(), sessionTtlMs = ADMIN_SESSION_TTL,
  loginWindowMs = 15 * 60 * 1000, loginLimit = 5
} = {}) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS admin_accounts (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY, admin_id TEXT NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS admin_sessions_expiry ON admin_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS admin_login_limits (
      address_hash TEXT PRIMARY KEY, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL
    );`);
  const statement = sql => db.prepare(sql);
  const dummySalt = randomBytes(32).toString('hex');
  const csrfFor = token => hash(`borrow-lab-admin-csrf:${token}`);

  async function setup(username, password, { reset = false } = {}) {
    const key = usernameKey(username);
    if (!/^[a-z0-9_.-]{3,40}$/.test(key)) throw new BookingError('管理员账号需为3～40位字母、数字、点、横线或下划线。', 422);
    const existing = statement('SELECT id FROM admin_accounts WHERE username=?').get(key);
    if (existing && !reset) throw new BookingError('这个管理员已存在。仅明确使用 --reset 才能重置密码。', 409);
    if (!existing && reset) throw new BookingError('要重置的管理员不存在，请先初始化。', 404);
    const encoded = await hashAdminPassword(password), now = clock(), id = existing?.id || randomUUID();
    db.exec('BEGIN IMMEDIATE');
    try {
      if (existing) {
        statement('UPDATE admin_accounts SET password_hash=?,updated_at=? WHERE id=?').run(encoded, now, id);
        statement('DELETE FROM admin_sessions WHERE admin_id=?').run(id);
      } else {
        statement('INSERT INTO admin_accounts VALUES(?,?,?,?,?)').run(id, key, encoded, now, now);
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return { id, username: key };
  }

  function takeAttempt(address) {
    const key = hash(String(address || 'unknown')), now = clock();
    db.exec('BEGIN IMMEDIATE');
    let limited = false;
    try {
      statement('DELETE FROM admin_login_limits WHERE window_start<=?').run(now - loginWindowMs);
      const row = statement('SELECT * FROM admin_login_limits WHERE address_hash=?').get(key);
      limited = !!row && row.attempts >= loginLimit;
      if (!limited) statement('INSERT INTO admin_login_limits VALUES(?,?,1) ON CONFLICT(address_hash) DO UPDATE SET attempts=attempts+1').run(key, now);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    if (limited) throw new BookingError('登录尝试过于频繁，请15分钟后重试。', 429);
    return key;
  }

  async function login(username, password, address) {
    const limiter = takeAttempt(address), key = usernameKey(username);
    const account = /^[a-z0-9_.-]{3,40}$/.test(key) ? statement('SELECT * FROM admin_accounts WHERE username=?').get(key) : null;
    let valid = false;
    const candidate = typeof password === 'string' && password.length <= 128 ? password : '';
    if (account) valid = await verifyAdminPassword(candidate, account.password_hash) && candidate === password;
    else await derive(candidate, dummySalt, 64, cost);
    if (!valid) throw new BookingError('账号或密码不正确，请重新输入。', 401);
    const token = randomBytes(32).toString('base64url'), now = clock(), expires = now + sessionTtlMs;
    db.exec('BEGIN IMMEDIATE');
    try {
      // Lock the password recheck and session insertion against cross-process resets.
      if (statement('SELECT password_hash FROM admin_accounts WHERE id=?').get(account.id)?.password_hash !== account.password_hash) throw new BookingError('账号或密码不正确，请重新输入。', 401);
      statement('DELETE FROM admin_sessions WHERE expires_at<=?').run(now);
      statement('INSERT INTO admin_sessions VALUES(?,?,?,?)').run(hash(token), account.id, now, expires);
      statement('DELETE FROM admin_login_limits WHERE address_hash=?').run(limiter);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return { token, session: { admin: { id: account.id, username: account.username }, csrfToken: csrfFor(token), expiresAt: new Date(expires).toISOString() } };
  }

  function session(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const row = statement('SELECT a.id,a.username,s.expires_at FROM admin_sessions s JOIN admin_accounts a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires_at>?').get(hash(token), clock());
    return row ? { admin: { id: row.id, username: row.username }, csrfToken: csrfFor(token), expiresAt: new Date(row.expires_at).toISOString() } : null;
  }

  function tokenFromRequest(req) {
    const values = (req.headers.cookie || '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${ADMIN_COOKIE}=`));
    return values.length === 1 ? values[0].slice(ADMIN_COOKIE.length + 1) : null;
  }
  function requireSession(req) {
    const token = tokenFromRequest(req), value = session(token);
    if (!value) throw new BookingError('管理员会话已失效，请重新登录。', 401);
    return { ...value, token };
  }
  function requireCsrf(req, value) {
    const token = req.headers['x-admin-csrf'];
    if (typeof token !== 'string' || token.length !== 64 || !safeEqual(token, value.csrfToken)) throw new BookingError('管理请求校验失败，请刷新后重试。', 403);
  }
  function logout(token) { if (typeof token === 'string') statement('DELETE FROM admin_sessions WHERE token_hash=?').run(hash(token)); }
  function cookie(token, { secure = false, clear = false } = {}) {
    return `${ADMIN_COOKIE}=${clear ? '' : token}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : Math.floor(sessionTtlMs / 1000)}${secure ? '; Secure' : ''}`;
  }
  return { file, setup, login, session, requireSession, requireCsrf, logout, cookie, close: () => db.close() };
}
