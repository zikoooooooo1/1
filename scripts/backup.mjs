import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, cpSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
const destination = process.argv[2];
if (!destination) throw new Error('Usage: npm run backup -- /secure/new-backup-directory');
// Read-only connection: a backup must never initialize or migrate its source database.
const db = new DatabaseSync(resolve(process.env.DATABASE_PATH || 'data/claso.sqlite'), {
  readOnly: true,
});
try {
  mkdirSync(destination, { recursive: false, mode: 0o700 });
  await backup(db, resolve(destination, 'claso.sqlite'));
  chmodSync(resolve(destination, 'claso.sqlite'), 0o600);
  cpSync(resolve(process.env.STORAGE_PATH || 'data/files'), resolve(destination, 'files'), {
    recursive: true,
  });
  console.log('Database and files backed up. Protect this directory as private school data.');
} finally {
  db.close();
}
