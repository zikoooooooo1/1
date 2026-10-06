import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/server/db.js';
import { createApp } from '../src/server/app.js';
import { createUser } from '../src/server/auth.js';
const db = new Store(':memory:');
const storage = mkdtempSync(join(tmpdir(), 'claso-management-'));
const password = randomBytes(24).toString('hex');
let app: Awaited<ReturnType<typeof createApp>>;
let admin: any, manager: any, student: any, teacher: any, secondAdmin: any;
let year: string, cls: string, subject: string;
async function login(email: string, initial = password) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: initial }).expect(200);
  const me = (await agent.get('/api/auth/me').expect(200)).body;
  if (me.user.must_change_password)
    await agent
      .post('/api/auth/password')
      .set('X-CSRF-Token', me.csrf)
      .send({ current_password: initial, password })
      .expect(200);
  return { agent, csrf: me.csrf, id: me.user.id };
}
const post = (who: any, path: string, body: any = {}, status = 201) =>
  who.agent
    .post('/api' + path)
    .set('X-CSRF-Token', who.csrf)
    .send(body)
    .expect(status);
async function create(entity: string, body: any) {
  return (await post(manager, '/records/' + entity, body)).body.id;
}
async function transition(entity: string, uid: string, action: string) {
  const row = (await manager.agent.get(`/api/records/${entity}/${uid}`).expect(200)).body;
  return post(
    manager,
    `/records/${entity}/${uid}/transition`,
    { action, version: row.version },
    200,
  );
}
before(async () => {
  app = await createApp(db, { storage, frontend: false });
  await createUser(
    db,
    { name: 'Private Root Administrator', email: 'root@school.example', role: 'admin', password },
    false,
  );
  admin = await login('root@school.example');
  for (const [role, email, name] of [
    ['school_management', 'manager@school.example', 'School Leadership'],
    ['teacher', 'teacher@school.example', 'Teacher'],
    ['student', 'student@school.example', 'Student'],
    ['admin', 'otheradmin@school.example', 'Private Other Administrator'],
  ]) {
    await post(admin, '/people', { role, email, name, password });
  }
  manager = await login('manager@school.example');
  teacher = await login('teacher@school.example');
  student = await login('student@school.example');
  secondAdmin = await login('otheradmin@school.example');
});
after(() => {
  db.db.close();
  rmSync(storage, { recursive: true, force: true });
});

test('administrator creates all four roles; management cannot create accounts or reach security controls', async () => {
  assert.equal(db.get('SELECT count(*) n FROM roles')!.n, 4);
  for (const role of ['admin', 'school_management', 'teacher', 'student']) {
    await post(
      manager,
      '/people',
      { name: 'Unauthorized', email: role + '@blocked.example', role, password },
      403,
    );
  }
  for (const who of [manager, teacher, student]) {
    for (const path of [
      '/people',
      '/teachers',
      '/people/microsoft',
      '/imports/preview',
      `/imports/${randomUUID()}/commit`,
      `/people/${admin.id}/password`,
      `/people/${admin.id}/role`,
      `/people/${admin.id}/archive`,
      `/people/${admin.id}/restore`,
    ])
      await post(who, path, {}, 403);
    await who.agent
      .put('/api/people/' + admin.id)
      .set('X-CSRF-Token', who.csrf)
      .send({ role: 'admin' })
      .expect(403);
    await who.agent.put('/api/school').set('X-CSRF-Token', who.csrf).send({}).expect(403);
    await who.agent.get('/api/health').expect(403);
    await who.agent.get('/api/people/export').expect(403);
    await post(who, '/view-as', { role: 'admin' }, 403);
  }
  for (const who of [teacher, student]) await who.agent.get('/api/control-center').expect(403);
  const permissions = (await manager.agent.get('/api/permissions').expect(200)).body
    .filter((p: any) => p.role_id === 'school_management')
    .map((p: any) => p.id);
  assert.deepEqual(permissions.sort(), ['academic.audit', 'academic.manage', 'class.manage']);
  assert.equal(db.get("SELECT count(*) n FROM users WHERE email LIKE '%@blocked.example'")!.n, 0);
});

test('school management operates academic structure, memberships, schedules and school-wide announcements', async () => {
  const currentYear = new Date().getUTCFullYear();
  year = await create('academic_years', {
    name: 'Operational year',
    start_date: `${currentYear}-01-01`,
    end_date: `${currentYear + 1}-12-31`,
  });
  await transition('academic_years', year, 'activate');
  const term = await create('terms', {
    name: 'Current term',
    year_id: year,
    start_date: `${currentYear}-01-01`,
    end_date: `${currentYear + 1}-12-31`,
  });
  const grade = await create('grades', { name: 'Grade 10' });
  const section = await create('sections', { name: 'Section A', grade_id: grade });
  const track = await create('tracks', { name: 'Science' });
  subject = await create('subjects', { name: 'Physics', code: 'PHYS' });
  cls = await create('classes', {
    name: 'Physics 10A',
    year_id: year,
    term_id: term,
    section_id: section,
    track_id: track,
    subject_id: subject,
  });
  let center = (await manager.agent.get('/api/control-center').expect(200)).body;
  assert.equal(center.unassigned_classes, 1);
  assert.equal(center.empty_classes, 1);
  await create('teacher_assignments', { class_id: cls, teacher_id: teacher.id });
  await create('enrollments', { class_id: cls, student_id: student.id });
  await create('schedules', {
    class_id: cls,
    day: '1',
    starts_at: '09:00',
    ends_at: '10:00',
    room: 'A1',
  });
  const announcement = await create('announcements', {
    title: 'School plan',
    content: 'Academic announcement',
    audience_type: 'school',
    publish_at: new Date(Date.now() - 1000).toISOString(),
  });
  await transition('announcements', announcement, 'publish');
  assert.equal((await student.agent.get('/api/records/announcements').expect(200)).body.total, 1);
  center = (await manager.agent.get('/api/control-center').expect(200)).body;
  assert.equal(center.classes, 1);
  assert.equal(center.unassigned_classes, 0);
  assert.equal(center.empty_classes, 0);
  assert.equal(center.accounts, null);
  assert(
    (await admin.agent.get('/api/control-center').expect(200)).body.accounts.some(
      (a: any) => a.role === 'school_management',
    ),
  );
  await manager.agent.get('/api/records/classes/' + cls).expect(200);
  await manager.agent.get('/api/school-map?year_id=' + year).expect(200);
});

test('manager grades and returns work, reads all school results and controls exam lifecycle', async () => {
  const assignment = await create('assignments', {
    class_id: cls,
    title: 'Practical work',
    instructions: 'Show reasoning',
    open_at: new Date(Date.now() - 60000).toISOString(),
    due_at: new Date(Date.now() + 3600000).toISOString(),
    max_score: 10,
    allow_late: 0,
  });
  await transition('assignments', assignment, 'publish');
  const submission = (
    await post(student, `/assignments/${assignment}/submit`, { content: 'Student answer' })
  ).body.id;
  await post(
    manager,
    `/submissions/${submission}/grade`,
    { score: 9, feedback: 'Reviewed', return_result: true, version: 1 },
    200,
  );
  assert.equal((await manager.agent.get('/api/results').expect(200)).body.total, 1);
  assert.equal((await student.agent.get('/api/results').expect(200)).body.items[0].score, 9);
  const bank = await create('question_banks', { subject_id: subject, title: 'School bank' });
  const question = await create('questions', {
    bank_id: bank,
    type: 'multiple_choice',
    prompt: 'Choose a value',
    options: '["1","2"]',
    correct_answer: '2',
    difficulty: 'easy',
    points: 1,
  });
  const exam = await create('exams', {
    class_id: cls,
    title: 'School exam',
    instructions: 'Answer',
    opens_at: new Date(Date.now() - 60000).toISOString(),
    closes_at: new Date(Date.now() + 3600000).toISOString(),
    duration_minutes: 30,
    max_attempts: 1,
    randomize_questions: 0,
    randomize_options: 0,
  });
  await post(manager, `/exams/${exam}/questions`, { question_id: question });
  await transition('exams', exam, 'review');
  await transition('exams', exam, 'publish');
  await manager.agent.get(`/exams/${exam}/questions`.replace('/exams', '/api/exams')).expect(200);
  await transition('exams', exam, 'close');
  await transition('exams', exam, 'release');
  await manager.agent.get('/api/analytics').expect(200);
  await manager.agent.get(`/api/assignments/${assignment}/submissions`).expect(200);
});

test('management directory, search, audit and private attachments respect the higher administrator boundary', async () => {
  const users = (await manager.agent.get('/api/people?limit=100').expect(200)).body.items;
  assert(users.some((u: any) => u.id === student.id));
  assert(users.some((u: any) => u.id === teacher.id));
  assert(users.every((u: any) => u.role !== 'admin'));
  assert.equal((await manager.agent.get('/api/people?role=admin').expect(200)).body.total, 0);
  assert.equal(
    (await manager.agent.get('/api/search?q=Private').expect(200)).body.filter(
      (r: any) => r.entity === 'people',
    ).length,
    0,
  );
  db.audit(admin.id, 'password_reset', 'users', student.id, {
    private_context: 'security fixture',
  });
  const activity = (await manager.agent.get('/api/audit?limit=100').expect(200)).body.items;
  assert(activity.length > 0);
  assert(activity.every((a: any) => a.entity_type !== 'users'));
  assert(
    (await admin.agent.get('/api/audit?limit=100').expect(200)).body.items.some(
      (a: any) => a.entity_type === 'users',
    ),
  );
  const upload = await student.agent
    .post('/api/files')
    .set('X-CSRF-Token', student.csrf)
    .attach('file', Buffer.from('Private draft'), {
      filename: 'note.txt',
      contentType: 'text/plain',
    })
    .expect(201);
  await manager.agent.get('/api/files/' + upload.body.id).expect(404);
  const owned = await teacher.agent
    .post('/api/files')
    .set('X-CSRF-Token', teacher.csrf)
    .attach('file', Buffer.from('Teaching material'), {
      filename: 'lesson.txt',
      contentType: 'text/plain',
    })
    .expect(201);
  await teacher.agent
    .post('/api/records/resources')
    .set('X-CSRF-Token', teacher.csrf)
    .send({ class_id: cls, title: 'Draft lesson', file_id: owned.body.id })
    .expect(201);
  await manager.agent.get('/api/files/' + owned.body.id).expect(200);
  await post(manager, '/messages', {
    recipient_id: student.id,
    subject: 'Follow up',
    content: 'School leadership message',
  });
  await post(student, '/messages', {
    recipient_id: manager.id,
    subject: 'Reply',
    content: 'Student reply',
  });
});

test('role changes require administrator reauthentication, revoke sessions and reject self-escalation/stale edits', async () => {
  const target = (
    await post(admin, '/people', {
      name: 'New staff member',
      email: 'staff@school.example',
      role: 'student',
      password,
    })
  ).body.id;
  const session = await login('staff@school.example');
  let version = db.get('SELECT version FROM users WHERE id=?', target)!.version;
  await post(
    manager,
    `/people/${manager.id}/role`,
    { role: 'admin', version: 1, current_password: password },
    403,
  );
  await post(
    admin,
    `/people/${admin.id}/role`,
    { role: 'student', version: 1, current_password: password },
    409,
  );
  await post(
    admin,
    `/people/${target}/role`,
    { role: 'admin', version, current_password: 'wrong' },
    400,
  );
  await post(
    admin,
    `/people/${target}/role`,
    { role: 'admin', version: version + 1, current_password: password },
    409,
  );
  await post(
    admin,
    `/people/${target}/role`,
    { role: 'school_management', version, current_password: password },
    200,
  );
  await session.agent.get('/api/auth/me').expect(401);
  assert(db.get("SELECT id FROM audit_events WHERE action='role_changed' AND entity_id=?", target));
  const promoted = await login('staff@school.example');
  await promoted.agent.get('/api/control-center').expect(200);
  await promoted.agent.get('/api/health').expect(403);
  version = db.get('SELECT version FROM users WHERE id=?', target)!.version;
  await post(
    admin,
    `/people/${target}/role`,
    { role: 'admin', version, current_password: password },
    200,
  );
  const elevated = await login('staff@school.example');
  await elevated.agent.get('/api/health').expect(200);
  version = db.get('SELECT version FROM users WHERE id=?', target)!.version;
  await post(
    admin,
    `/people/${target}/role`,
    { role: 'teacher', version, current_password: password },
    200,
  );
  await elevated.agent.get('/api/health').expect(401);
  // A teacher with active class memberships cannot silently become a student.
  const teacherVersion = db.get('SELECT version FROM users WHERE id=?', teacher.id)!.version;
  await post(
    admin,
    `/people/${teacher.id}/role`,
    { role: 'student', version: teacherVersion, current_password: password },
    409,
  );
});

test('administrator archives/restores school management and imports the role; no automatic Microsoft signup', async () => {
  const version = db.get('SELECT version FROM users WHERE id=?', manager.id)!.version;
  await post(admin, `/people/${manager.id}/archive`, { version }, 200);
  await manager.agent.get('/api/control-center').expect(401);
  await post(admin, `/people/${manager.id}/restore`, { version: version + 1 }, 200);
  manager = await login('manager@school.example');
  await manager.agent.get('/api/control-center').expect(200);
  const preview = (
    await post(
      admin,
      '/imports/preview',
      {
        csv: `name,email,role,password\nLeadership,import-management@school.example,school_management,${password}`,
        mapping: { name: 'name', email: 'email', role: 'role', password: 'password' },
      },
      200,
    )
  ).body;
  assert.deepEqual(preview.errors, []);
  await post(admin, `/imports/${preview.id}/commit`, {}, 200);
  assert.equal(
    db.get('SELECT role FROM users WHERE email=?', 'import-management@school.example')!.role,
    'school_management',
  );
  process.env.MICROSOFT_TENANT_ID = randomUUID();
  try {
    const account = (
      await post(admin, '/people/microsoft', {
        name: 'Approved learner',
        email: 'ms@school.example',
        object_id: randomUUID(),
      })
    ).body.id;
    await post(
      admin,
      `/people/${account}/role`,
      { role: 'admin', version: 1, current_password: password },
      409,
    );
    await post(
      manager,
      '/people/microsoft',
      { name: 'Unapproved', email: 'no@school.example', object_id: randomUUID() },
      403,
    );
  } finally {
    delete process.env.MICROSOFT_TENANT_ID;
  }
  assert.equal((await secondAdmin.agent.get('/api/permissions').expect(200)).status, 200);
});
