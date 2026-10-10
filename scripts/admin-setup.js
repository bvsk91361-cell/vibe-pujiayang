import { createInterface } from 'node:readline/promises';
import { stdin, stdout, argv } from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { StringDecoder } from 'node:string_decoder';
import { createAdminAuth } from '../src/admin-auth.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = argv.slice(2);
if (args.includes('--help')) {
  stdout.write('初始化：node scripts/admin-setup.js [--db 路径]\n重置已有账号：node scripts/admin-setup.js --reset [--db 路径]\n密码在本地终端隐藏输入；不会创建默认密码。\n');
} else {
  try {
    // Resolve the same configured database as the server; explicit --db wins.
    try { process.loadEnvFile(resolve(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    let databasePath, reset = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--reset' && !reset) reset = true;
      else if (args[i] === '--db' && databasePath === undefined && args[i + 1] && !args[i + 1].startsWith('--')) databasePath = args[++i];
      else throw new Error('参数无效，请使用 --help 查看本地初始化命令。');
    }
    if (!stdin.isTTY || !stdout.isTTY) throw new Error('请在交互式本地终端执行，密码不接受命令行参数、环境变量或管道输入。');
    const file = resolve(databasePath || process.env.BORROW_DB_FILE || resolve(root, 'data/borrow-lab.sqlite'));
    stdout.write(`Borrow Lab · ${reset ? '重置管理员密码（现有会话将失效）' : '初始化管理员'}\n`);
    const reader = createInterface({ input: stdin, output: stdout });
    let username;
    try { username = await reader.question('管理员账号（3～40位字母、数字、点、横线或下划线）：'); } finally { reader.close(); }
    const password = await hiddenQuestion('管理员密码（12～128个字符，输入隐藏）：');
    const confirmation = await hiddenQuestion('再次输入密码：');
    if (password !== confirmation) throw new Error('两次密码不同，未修改账号。');
    if (password.length < 12 || password.length > 128) throw new Error('管理员密码需为12～128个字符。');
    if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(username.trim())) throw new Error('管理员账号格式无效，未修改账号。');
    mkdirSync(dirname(file), { recursive: true });
    if (existsSync(file)) {
      // SQLite creates a consistent snapshot including committed WAL pages.
      const source = new DatabaseSync(file), snapshot = `${file}.pre-admin-${Date.now()}.sqlite`;
      try { source.prepare('VACUUM INTO ?').run(snapshot); } finally { source.close(); }
      stdout.write('已保存迁移前的本地数据库快照。\n');
    }
    const auth = createAdminAuth(file);
    try {
      const admin = await auth.setup(username, password, { reset });
      stdout.write(`管理员 ${admin.username} ${reset ? '密码已重置，原会话已撤销' : '已初始化'}。请使用自己的密码登录管理端。\n`);
    } finally { auth.close(); }
  } catch (error) {
    stdout.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

async function hiddenQuestion(prompt) {
  stdout.write(prompt);
  return new Promise((resolveQuestion, reject) => {
    let value = '', done = false;
    const decoder = new StringDecoder('utf8');
    const wasRaw = !!stdin.isRaw;
    stdin.setRawMode(true); stdin.resume();
    function finish(error) {
      if (done) return;
      done = true; stdin.off('data', input); stdin.off('end', ended); stdin.setRawMode(wasRaw); stdin.pause(); stdout.write('\n');
      error ? reject(error) : resolveQuestion(value);
    }
    function input(buffer) {
      for (const char of decoder.write(buffer).replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')) {
        if (char === '\u0003' || char === '\u0004') return finish(new Error('已取消，未修改管理员账号。'));
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u007f' || char === '\b') value = [...value].slice(0, -1).join('');
        else if (char >= ' ' && value.length < 129) value += char;
      }
    }
    function ended() { finish(new Error('输入已结束，未修改管理员账号。')); }
    stdin.on('data', input);
    stdin.once('end', ended);
  });
}
