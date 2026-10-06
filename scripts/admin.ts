import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Store } from '../src/server/db.js';
import { createUser } from '../src/server/auth.js';
import { personSchema } from '../src/server/people.js';
const db = new Store();
if (db.get('SELECT id FROM users LIMIT 1'))
  throw new Error('Initial administrator already exists. Use People management.');
const rl = createInterface({ input: stdin, output: stdout });
const name = await rl.question('Administrator name: ');
const email = await rl.question('Administrator email: ');
const loginId = (
  await rl.question('Administrator login ID (optional, letters/numbers/_/@/-): ')
).trim();
if (loginId && !/^[a-zA-Z0-9_@-]{3,64}$/.test(loginId)) throw new Error('Invalid login ID.');
stdout.write('Password (12–128 characters; input hidden): ');
// Suppress terminal echo while reading the password. No password is accepted in command arguments.
if (!stdin.isTTY) throw new Error('An interactive terminal is required.');
rl.close();
stdin.setRawMode(true);
stdin.resume();
const password = await new Promise<string>((resolve, reject) => {
  let value = '';
  const handler = (chunk: Buffer) => {
    for (const char of chunk.toString()) {
      if (char === '\u0003') {
        stdin.off('data', handler);
        reject(new Error('Cancelled'));
        return;
      }
      if (char === '\r' || char === '\n') {
        stdin.off('data', handler);
        resolve(value);
        return;
      }
      if (char === '\u007f') value = value.slice(0, -1);
      else if (char >= ' ') value += char;
    }
  };
  stdin.on('data', handler);
}).finally(() => {
  stdin.setRawMode(false);
  stdin.pause();
  stdout.write('\n');
});
const data = personSchema.parse({ name, email, password, role: 'admin' });
const uid = await createUser(db, data, false);
if (loginId) db.run('UPDATE users SET login_id=? WHERE id=?', loginId, uid);
db.audit(null, 'bootstrap', 'users', uid);
db.db.close();
console.log('Administrator created. Start CLASO and sign in.');
