import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { Store, id, now } from '../src/server/db.js';
import { createUser, verifyPassword } from '../src/server/auth.js';
import { createApp } from '../src/server/app.js';
import {
  parseSchoolRoster,
  parseTeacherNames,
  initialStudentPassword,
  importSchoolRoster,
} from '../src/server/roster-import.js';
const fixture = `| ID | Arabic | English | Class |
| -- | -- | -- | -- |
| 500001 | طالب أول | KAREEM MANSOUR | 9G5 |
| 50002ABC | طالب ثان | LINA AHMED | 10A1 |
| 500003 | طالب ثالث | NOOR SALEM | 9A1 |`;
const students = parseSchoolRoster(fixture);

test('roster parser preserves alphanumeric IDs, fifth sections, Arabic and correct password initials', () => {
  assert.equal(students.length, 3);
  assert.equal(students[1].number, '50002ABC');
  assert.equal(students[0].code, '9G5');
  assert.equal(initialStudentPassword(students[0]), '500001@KM2027');
  assert.throws(() => parseSchoolRoster(fixture + '\n| 500001 | اسم | Another Person | 9G1 |'));
  assert.throws(() => parseSchoolRoster(fixture.replace('10A1', '13A1')));
  assert.throws(() => parseSchoolRoster(fixture.replace('LINA AHMED', 'LINA')));
  assert.throws(() => parseTeacherNames('Test Teacher\nTest Teacher'));
});

test('user migration preserves populated identities, sessions and foreign keys', () => {
  const folder = mkdtempSync(join(tmpdir(), 'claso-roster-migration-'));
  const file = join(folder, 'school.sqlite');
  try {
    const old = new DatabaseSync(file);
    old.exec('PRAGMA foreign_keys=ON;');
    for (const name of [
      '001_initial.sql',
      '002_announcement_dispatch.sql',
      '003_school_identity.sql',
      '004_school_management.sql',
    ]) {
      old.exec(readFileSync('migrations/' + name, 'utf8'));
      old.prepare('INSERT INTO migrations(version,applied_at) VALUES(?,?)').run(name, now());
    }
    old
      .prepare(
        "INSERT INTO users(id,name,email,role,password_hash,created_at,login_id) VALUES('a','Admin','admin@example.test','admin','hash',?,'admin-id')",
      )
      .run(now());
    old
      .prepare(
        "INSERT INTO sessions(token_hash,user_id,csrf,expires_at,created_at) VALUES('token','a','csrf','2099-01-01',?)",
      )
      .run(now());
    old.close();
    const db = new Store(file);
    assert.equal(db.get('SELECT login_id FROM users WHERE id=?', 'a')!.login_id, 'admin-id');
    assert.equal(db.get('SELECT user_id FROM sessions')!.user_id, 'a');
    assert.deepEqual(db.all('PRAGMA foreign_key_check'), []);
    assert.equal(db.get('PRAGMA foreign_keys')!.foreign_keys, 1);
    assert.throws(() =>
      db.run(
        "INSERT INTO sessions(token_hash,user_id,csrf,expires_at,created_at) VALUES('bad','missing','csrf','2099-01-01',?)",
        now(),
      ),
    );
    db.db.close();
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('import is atomic, uses hashed passwords and optional email, and retries never reset accounts', async () => {
  const db = new Store(':memory:');
  try {
    const admin = await createUser(
      db,
      {
        name: 'Admin',
        email: 'a@example.test',
        role: 'admin',
        password: randomBytes(20).toString('hex'),
      },
      false,
    );
    await assert.rejects(
      importSchoolRoster(db, admin, 'Roster', students, ['Test Teacher'], () => {
        throw Error('disk unavailable');
      }),
    );
    assert.equal(db.get('SELECT count(*) n FROM users')!.n, 1);
    assert.equal(db.get('SELECT count(*) n FROM roster_batches')!.n, 0);
    const imported = await importSchoolRoster(db, admin, 'Roster', students, [
      'Test Teacher',
      'Tariq Teacher',
    ]);
    assert.equal(imported.credentials.length, 2);
    assert.notEqual(imported.credentials[0].username, imported.credentials[1].username);
    assert.equal(db.get('SELECT count(*) n FROM users WHERE email IS NULL')!.n, 5);
    const student = db.get('SELECT * FROM users WHERE student_number=?', '500001')!;
    assert(await verifyPassword(initialStudentPassword(students[0]), student.password_hash));
    assert.equal(student.must_change_password, 1);
    assert(
      !JSON.stringify(db.all('SELECT * FROM audit_events')).includes(
        initialStudentPassword(students[0]),
      ),
    );
    const again = await importSchoolRoster(db, admin, 'Roster', students, [
      'Test Teacher',
      'Tariq Teacher',
    ]);
    assert.equal(again.imported, false);
    assert.deepEqual(again.credentials, []);
    assert.equal(
      db.get('SELECT password_hash FROM users WHERE id=?', student.id)!.password_hash,
      student.password_hash,
    );
    assert.deepEqual(db.all('PRAGMA foreign_key_check'), []);
  } finally {
    db.db.close();
  }
});

test('mandatory teacher setup connects chosen subject sections, enrolls scoped students and rejects bypasses', async () => {
  const db = new Store(':memory:');
  try {
    const password = randomBytes(20).toString('hex');
    const adminId = await createUser(
      db,
      { name: 'Admin', email: 'a@example.test', role: 'admin', password },
      false,
    );
    const imported = await importSchoolRoster(db, adminId, 'Test roster', students, [
      'Teacher One',
      'Teacher Two',
    ]);
    const app = await createApp(db, { frontend: false });
    const admin = request.agent(app),
      teacher = request.agent(app),
      student = request.agent(app);
    await admin.post('/api/auth/login').send({ email: 'a@example.test', password }).expect(200);
    const csrf = (await admin.get('/api/auth/me')).body.csrf;
    const credential = imported.credentials[0];
    await teacher
      .post('/api/auth/login')
      .send({ email: credential.username, password: credential.password })
      .expect(200);
    let me = (await teacher.get('/api/auth/me')).body;
    await teacher.get('/api/teaching-setup').expect(403);
    await teacher
      .post('/api/auth/password')
      .set('X-CSRF-Token', me.csrf)
      .send({ current_password: credential.password, password })
      .expect(200);
    me = (await teacher.get('/api/auth/me')).body;
    assert.equal(me.user.teacher_setup_required, 1);
    await teacher.get('/api/records/classes').expect(403);
    await teacher.get('/api/people').expect(403);
    assert.equal((await teacher.get('/api/teaching-setup').expect(200)).body.batch, null);
    const year = id(),
      term = id();
    db.insert('academic_years', {
      id: year,
      name: 'Test year',
      start_date: '2026-08-01',
      end_date: '2027-07-01',
      status: 'active',
    });
    db.insert('terms', {
      id: term,
      year_id: year,
      name: 'Test term',
      start_date: '2026-08-01',
      end_date: '2026-12-20',
    });
    await admin
      .post(`/api/rosters/${imported.batch_id}/activate`)
      .set('X-CSRF-Token', csrf)
      .send({ year_id: year, term_id: id() })
      .expect(409);
    await admin
      .post(`/api/rosters/${imported.batch_id}/activate`)
      .set('X-CSRF-Token', csrf)
      .send({ year_id: year, term_id: term })
      .expect(200);
    const config = (await teacher.get('/api/teaching-setup').expect(200)).body;
    assert.equal(config.groups.length, 3);
    assert(!JSON.stringify(config).includes('KAREEM'));
    const physics = config.subjects.find((s: any) => s.code === 'PHY').id,
      math = config.subjects.find((s: any) => s.code === 'MATH').id;
    const group = (code: string) => config.groups.find((g: any) => g.code === code).id;
    const post = (selections: any[]) =>
      teacher
        .post('/api/teaching-setup')
        .set('X-CSRF-Token', me.csrf)
        .send({ batch_id: imported.batch_id, selections });
    await post([{ subject_id: physics, group_ids: [group('9G5'), id()] }]).expect(403);
    assert.equal(db.get('SELECT count(*) n FROM classes')!.n, 0);
    await post([{ subject_id: physics, group_ids: [group('9G5'), group('9G5')] }]).expect(400);
    const selections = [
      { subject_id: physics, group_ids: [group('9G5')] },
      { subject_id: math, group_ids: [group('10A1')] },
    ];
    await teacher
      .post('/api/teaching-setup')
      .send({ batch_id: imported.batch_id, selections })
      .expect(403);
    const result = (await post(selections).expect(200)).body;
    assert.equal(result.class_ids.length, 2);
    assert.equal((await teacher.get('/api/auth/me')).body.user.teacher_setup_required, 0);
    const roster = (await teacher.get(`/api/classes/${result.class_ids[0]}/roster`).expect(200))
      .body;
    assert.equal(roster.total, 1);
    assert.equal(roster.items[0].student_number, '500001');
    assert(!('password_hash' in roster.items[0]));
    assert(!('email' in roster.items[0]));
    const rosterPage = (
      await teacher.get(`/api/classes/${result.class_ids[0]}/roster?page=2&limit=1`).expect(200)
    ).body;
    assert.equal(rosterPage.items.length, 0);
    assert.equal((await teacher.get('/api/people?q=500001').expect(200)).body.total, 1);
    assert.equal((await teacher.get('/api/people?q=500003').expect(200)).body.total, 0);
    const repeat = (await post([{ subject_id: math, group_ids: [group('9A1')] }]).expect(200)).body;
    assert.deepEqual(repeat, result);
    assert.equal(db.get('SELECT count(*) n FROM classes')!.n, 2);
    await teacher.get('/api/rosters').expect(403);
    await teacher
      .post(`/api/rosters/${imported.batch_id}/teacher-credentials`)
      .set('X-CSRF-Token', me.csrf)
      .send({ current_password: password })
      .expect(403);
    await admin
      .post(`/api/rosters/${imported.batch_id}/teacher-credentials`)
      .set('X-CSRF-Token', csrf)
      .send({ current_password: 'wrong' })
      .expect(400);
    const c2 = imported.credentials[1];
    const other = request.agent(app);
    await other
      .post('/api/auth/login')
      .send({ email: c2.username, password: c2.password })
      .expect(200);
    const otherMe = (await other.get('/api/auth/me')).body;
    await other
      .post('/api/auth/password')
      .set('X-CSRF-Token', otherMe.csrf)
      .send({ current_password: c2.password, password })
      .expect(200);
    // Existing shared classes may already be scheduled before a second teacher selects them.
    for (const classId of result.class_ids)
      db.insert('schedules', {
        id: id(),
        class_id: classId,
        day: 1,
        starts_at: '09:00',
        ends_at: '10:00',
      });
    await other
      .post('/api/teaching-setup')
      .set('X-CSRF-Token', otherMe.csrf)
      .send({ batch_id: imported.batch_id, selections })
      .expect(409);
    assert.equal(
      db.get('SELECT count(*) n FROM teacher_assignments WHERE teacher_id=?', otherMe.user.id)!.n,
      0,
    );
    db.run('DELETE FROM schedules');
    await other
      .post('/api/teaching-setup')
      .set('X-CSRF-Token', otherMe.csrf)
      .send({
        batch_id: imported.batch_id,
        selections: [{ subject_id: physics, group_ids: [group('9A1')] }],
      })
      .expect(200);
    await other.get(`/api/classes/${result.class_ids[0]}/roster`).expect(403);
    await student
      .post('/api/auth/login')
      .send({ email: students[0].number, password: initialStudentPassword(students[0]) })
      .expect(200);
    const studentMe = (await student.get('/api/auth/me')).body;
    await student
      .post('/api/auth/password')
      .set('X-CSRF-Token', studentMe.csrf)
      .send({ current_password: initialStudentPassword(students[0]), password })
      .expect(200);
    assert.equal((await student.get('/api/records/classes').expect(200)).body.total, 1);
    await student.get(`/api/records/classes/${result.class_ids[1]}`).expect(404);
    await student.get(`/api/classes/${result.class_ids[0]}/roster`).expect(403);
    await admin.get('/api/people/export').expect(200);
    assert.deepEqual(db.all('PRAGMA foreign_key_check'), []);
  } finally {
    db.db.close();
  }
});

test('promotion to teacher requires setup and removes an obsolete setup completion', async () => {
  const db = new Store(':memory:');
  try {
    const password = randomBytes(20).toString('hex');
    const adminId = await createUser(
      db,
      { name: 'Admin', email: 'admin@example.test', role: 'admin', password },
      false,
    );
    const target = await createUser(
      db,
      { name: 'Staff', email: 'staff@example.test', role: 'school_management', password },
      false,
    );
    const batch = id();
    db.insert('roster_batches', {
      id: batch,
      label: 'Previous roster',
      fingerprint: 'test',
      created_by: adminId,
      created_at: now(),
    });
    db.insert('teaching_setup_completions', {
      teacher_id: target,
      batch_id: batch,
      class_ids: '[]',
      completed_at: now(),
    });
    const app = await createApp(db, { frontend: false }),
      admin = request.agent(app);
    await admin.post('/api/auth/login').send({ email: 'admin@example.test', password }).expect(200);
    const me = (await admin.get('/api/auth/me')).body;
    await admin
      .post(`/api/people/${target}/role`)
      .set('X-CSRF-Token', me.csrf)
      .send({ role: 'teacher', version: 1, current_password: password })
      .expect(200);
    assert.equal(
      db.get('SELECT teacher_setup_required FROM users WHERE id=?', target)!.teacher_setup_required,
      1,
    );
    assert.equal(
      db.get('SELECT teacher_id FROM teaching_setup_completions WHERE teacher_id=?', target),
      undefined,
    );
  } finally {
    db.db.close();
  }
});
