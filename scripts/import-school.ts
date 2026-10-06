import { readFileSync, mkdirSync, writeFileSync, chmodSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { Store } from '../src/server/db.js';
import {
  parseSchoolRoster,
  parseTeacherNames,
  importSchoolRoster,
} from '../src/server/roster-import.js';
const [studentsFile, teachersFile, label, actorId, mode] = process.argv.slice(2);
if (!studentsFile || !teachersFile || !label || (mode && mode !== '--commit'))
  throw new Error(
    'Usage: npx tsx scripts/import-school.ts students.md teachers.txt "Roster label" [admin-id --commit]',
  );
const students = parseSchoolRoster(readFileSync(studentsFile, 'utf8'));
const teachers = parseTeacherNames(readFileSync(teachersFile, 'utf8'));
console.log(
  JSON.stringify({
    students: students.length,
    teachers: teachers.length,
    groups: Object.fromEntries(
      [...new Set(students.map((s) => s.code))].map((code) => [
        code,
        students.filter((s) => s.code === code).length,
      ]),
    ),
  }),
);
if (mode === '--commit') {
  if (!actorId) throw new Error('An existing administrator ID is required');
  const db = new Store();
  let handoffFile: string | undefined;
  try {
    const result = await importSchoolRoster(
      db,
      actorId,
      label,
      students,
      teachers,
      (batchId, credentials) => {
        const folder = resolve(process.env.STORAGE_PATH || 'data/files', '..', 'account-handoffs');
        mkdirSync(folder, { recursive: true, mode: 0o700 });
        chmodSync(folder, 0o700);
        handoffFile = resolve(folder, batchId + '.json');
        writeFileSync(
          handoffFile,
          JSON.stringify(
            credentials.map((r) => ({
              name: r.name,
              username: r.username,
              temporary_password: r.password,
            })),
            null,
            2,
          ) + '\n',
          { mode: 0o600, flag: 'wx' },
        );
      },
    );
    console.log(
      JSON.stringify({
        batch_id: result.batch_id,
        imported: result.imported,
        students: result.students,
        teachers: result.teachers,
        next: 'Set the real academic calendar and activate this roster from the administrator control center. Download teacher credentials there.',
      }),
    );
  } catch (error) {
    if (handoffFile) {
      try {
        unlinkSync(handoffFile);
      } catch {
        /* The write may not have created a file. */
      }
    }
    throw error;
  } finally {
    db.db.close();
  }
}
