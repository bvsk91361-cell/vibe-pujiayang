import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createAdminAuth, hashAdminPassword, verifyAdminPassword } from '../src/admin-auth.js';

const password = 'isolated-test-password-only';
test('管理员密码：随机盐scrypt、无明文、正确和错误安全校验', async () => {
  const first = await hashAdminPassword(password), second = await hashAdminPassword(password);
  assert.notEqual(first, second); assert.ok(first.startsWith('scrypt$32768$8$1$'));
  assert.equal(first.includes(password), false);
  assert.equal(await verifyAdminPassword(password, first), true);
  assert.equal(await verifyAdminPassword('wrong', first), false);
  assert.equal(await verifyAdminPassword(password, 'sha256$unsafe'), false);
  await assert.rejects(hashAdminPassword('short'), error => error.status === 422);
});

test('独立SQLite管理员：禁止默认密码/覆盖，会话仅hash持久化、重启可用、过期和退出失效', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'borrow-admin-auth-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'test.sqlite'); let now = Date.now();
  let auth = createAdminAuth(file, { clock: () => now, sessionTtlMs: 1000 });
  await assert.rejects(auth.login('admin', password, 'unknown'), error => error.status === 401);
  const admin = await auth.setup('Lab.Admin', password);
  assert.equal(admin.username, 'lab.admin');
  await assert.rejects(auth.setup('lab.admin', password), error => error.status === 409);
  const login = await auth.login('LAB.ADMIN', password, 'browser');
  const request = { headers: { cookie: `borrow_admin=${login.token}` } };
  assert.deepEqual(auth.requireSession(request).admin, admin);
  assert.equal(login.session.csrfToken.length, 64);
  assert.notEqual(login.session.csrfToken, login.token);
  assert.throws(() => auth.requireCsrf({ headers: {} }, login.session), error => error.status === 403);
  auth.requireCsrf({ headers: { 'x-admin-csrf': login.session.csrfToken } }, login.session);
  const db = new DatabaseSync(file);
  const account = db.prepare('SELECT * FROM admin_accounts').get(), stored = db.prepare('SELECT * FROM admin_sessions').get();
  assert.equal(account.password_hash.includes(password), false); assert.notEqual(stored.token_hash, login.token);
  assert.equal(stored.token_hash.length, 64); db.close(); auth.close();
  auth = createAdminAuth(file, { clock: () => now, sessionTtlMs: 1000 });
  assert.equal(auth.session(login.token).admin.id, admin.id);
  now += 1001; assert.equal(auth.session(login.token), null);
  const renewed = await auth.login('lab.admin', password, 'browser');
  auth.logout(renewed.token); assert.equal(auth.session(renewed.token), null);
  assert.match(auth.cookie(renewed.token), /HttpOnly; SameSite=Strict/);
  assert.match(auth.cookie(renewed.token, { secure: true }), /; Secure$/);
  assert.match(auth.cookie('', { clear: true }), /Max-Age=0/);
  auth.close();
});

test('登录失败统一提示、持久限流、明确重置撤销旧会话', async t => {
  const auth = createAdminAuth(':memory:', { loginLimit: 2 }); t.after(() => auth.close());
  await auth.setup('console', password);
  const errors = [];
  for (const name of ['missing', 'console']) {
    try { await auth.login(name, 'incorrect', 'one-address'); } catch (error) { errors.push(error.message); assert.equal(error.status, 401); }
  }
  assert.equal(errors[0], errors[1]);
  await assert.rejects(auth.login('console', password, 'one-address'), error => error.status === 429);
  const login = await auth.login('console', password, 'another-address');
  await auth.setup('console', 'new-isolated-test-password', { reset: true });
  assert.equal(auth.session(login.token), null);
  await assert.rejects(auth.login('console', password, 'another-address'), error => error.status === 401);
  assert.ok((await auth.login('console', 'new-isolated-test-password', 'another-address')).session.admin);
  await assert.rejects(auth.setup('not-initialized', password, { reset: true }), error => error.status === 404);
});

test('管理员会话不接受演示身份、伪造Cookie、重复Cookie或LocalStorage式标记', t => {
  const auth = createAdminAuth(':memory:'); t.after(() => auth.close());
  for (const cookie of ['isAdmin=true', 'borrow_admin=true', 'borrow_admin=' + 'a'.repeat(43), 'borrow_admin=a; borrow_admin=b']) {
    assert.throws(() => auth.requireSession({ headers: { cookie } }), error => error.status === 401);
  }
});

test('失败限流在服务重启后保留，窗口到期才允许重试', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'borrow-admin-limits-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'limits.sqlite'); let now = Date.now();
  let auth = createAdminAuth(file, { clock: () => now, loginLimit: 1, loginWindowMs: 1000 });
  await auth.setup('limit-admin', password);
  await assert.rejects(auth.login('limit-admin', 'wrong', 'persistent-address'), error => error.status === 401);
  auth.close(); auth = createAdminAuth(file, { clock: () => now, loginLimit: 1, loginWindowMs: 1000 });
  await assert.rejects(auth.login('limit-admin', password, 'persistent-address'), error => error.status === 429);
  now += 1001;
  assert.ok((await auth.login('limit-admin', password, 'persistent-address')).session.admin);
  auth.close();
});

test('独立SQLite连接在旧密码校验途中重置，旧凭据不能获得新会话', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'borrow-admin-reset-race-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'race.sqlite'), auth = createAdminAuth(file);
  const admin = await auth.setup('reset-admin', password);
  const replacement = await hashAdminPassword('new-isolated-reset-password');
  // login has read the old hash and now awaits its asynchronous scrypt verification.
  const pending = auth.login('reset-admin', password, 'race-address');
  const resetting = new DatabaseSync(file);
  resetting.exec('BEGIN IMMEDIATE');
  resetting.prepare('UPDATE admin_accounts SET password_hash=?,updated_at=? WHERE id=?').run(replacement, Date.now(), admin.id);
  resetting.prepare('DELETE FROM admin_sessions WHERE admin_id=?').run(admin.id);
  resetting.exec('COMMIT'); resetting.close();
  await assert.rejects(pending, error => error.status === 401);
  const checking = new DatabaseSync(file);
  assert.equal(checking.prepare('SELECT COUNT(*) n FROM admin_sessions').get().n, 0);
  checking.close(); auth.close();
});
