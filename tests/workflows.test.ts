import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Store } from '../src/server/db.js';
import { createApp, expireAttempts } from '../src/server/app.js';
import { createUser } from '../src/server/auth.js';
import { parseCSV } from '../src/server/people.js';
// Existing password-based student fixtures are isolated Demo School accounts.
const db = new Store(':memory:');
const storage = mkdtempSync(join(tmpdir(), 'claso-tests-'));
let app: Awaited<ReturnType<typeof createApp>>;
const password = randomBytes(20).toString('hex');
const currentYear = new Date().getUTCFullYear();
let admin: any, teacher: any, student: any, outsider: any, otherTeacher: any;
let teacherId: string, studentId: string, outsiderId: string, otherTeacherId: string;
let year: string,
  term: string,
  grade: string,
  section: string,
  subject: string,
  cls: string,
  otherClass: string,
  assignment: string,
  exam: string,
  bank: string,
  question: string,
  manualQuestion: string,
  attemptId: string,
  submissionId: string,
  fileId: string;
async function login(email: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password }).expect(200);
  const me = await agent.get('/api/auth/me').expect(200);
  return { agent, csrf: me.body.csrf, id: me.body.user.id };
}
async function post(session: any, url: string, body: any = {}, status = 201) {
  const res = await session.agent
    .post('/api' + url)
    .set('X-CSRF-Token', session.csrf)
    .send(body)
    .expect(status);
  return res.body;
}
async function create(entity: string, data: any, session = admin) {
  return (await post(session, '/records/' + entity, data)).id;
}
async function transition(
  entity: string,
  id: string,
  action: string,
  session = admin,
  status = 200,
) {
  const row = (await session.agent.get(`/api/records/${entity}/${id}`).expect(200)).body;
  return post(
    session,
    `/records/${entity}/${id}/transition`,
    { action, version: row.version },
    status,
  );
}
before(async () => {
  app = await createApp(db, { storage, frontend: false });
  await createUser(
    db,
    { name: 'Integration Administrator', email: 'admin@example.test', role: 'admin', password },
    false,
  );
  teacherId = await createUser(
    db,
    { name: 'Assigned Teacher', email: 'teacher@example.test', role: 'teacher', password },
    false,
  );
  studentId = await createUser(
    db,
    { name: 'Enrolled Student', email: 'student@example.test', role: 'student', password },
    false,
  );
  outsiderId = await createUser(
    db,
    { name: 'Other Student', email: 'other@example.test', role: 'student', password },
    false,
  );
  otherTeacherId = await createUser(
    db,
    { name: 'Other Teacher', email: 'otherteacher@example.test', role: 'teacher', password },
    false,
  );
  admin = await login('admin@example.test');
  teacher = await login('teacher@example.test');
  student = await login('student@example.test');
  outsider = await login('other@example.test');
  otherTeacher = await login('otherteacher@example.test');
});
after(() => {
  db.db.close();
  rmSync(storage, { recursive: true, force: true });
});
test('authentication rejects anonymous access, CSRF, foreign origins, and client roles', async () => {
  await request(app).get('/api/people').expect(401);
  await admin.agent.post('/api/records/grades').send({ name: 'Invalid' }).expect(403);
  await admin.agent
    .post('/api/records/grades')
    .set('X-CSRF-Token', admin.csrf)
    .set('Origin', 'https://hostile.example')
    .send({ name: 'Invalid' })
    .expect(403);
  await post(
    student,
    '/people',
    { name: 'Escalation', email: 'escalate@example.test', role: 'admin', password },
    403,
  );
  await request(app)
    .post('/api/auth/login')
    .send({ email: 'missing@example.test', password })
    .expect(401);
});
test('administrator builds a connected academic hierarchy and enrolls people', async () => {
  year = await create('academic_years', {
    name: 'Integration Year',
    start_date: `${currentYear}-01-01`,
    end_date: `${currentYear + 1}-12-31`,
  });
  await transition('academic_years', year, 'activate');
  term = await create('terms', {
    name: 'Term One',
    year_id: year,
    start_date: `${currentYear}-01-01`,
    end_date: `${currentYear + 1}-12-31`,
  });
  grade = await create('grades', { name: 'Grade Ten' });
  section = await create('sections', { name: 'Section A', grade_id: grade });
  subject = await create('subjects', { name: 'Mathematics', code: 'MATH' });
  cls = await create('classes', {
    name: 'Mathematics A',
    year_id: year,
    term_id: term,
    section_id: section,
    subject_id: subject,
  });
  otherClass = await create('classes', {
    name: 'Mathematics B',
    year_id: year,
    term_id: term,
    section_id: section,
    subject_id: subject,
  });
  await create('teacher_assignments', { class_id: cls, teacher_id: teacherId });
  await create('teacher_assignments', { class_id: otherClass, teacher_id: otherTeacherId });
  await create('enrollments', { class_id: cls, student_id: studentId });
  await create('enrollments', { class_id: otherClass, student_id: outsiderId });
  await post(admin, '/records/enrollments', { class_id: cls, student_id: teacherId }, 400);
  await post(admin, '/records/enrollments', { class_id: cls, student_id: studentId }, 409);
  const classes = await student.agent.get('/api/records/classes').expect(200);
  assert.equal(classes.body.total, 1);
  assert.equal(classes.body.items[0].id, cls);
  await student.agent.get('/api/records/classes/' + otherClass).expect(404);
  await otherTeacher.agent.get('/api/records/classes/' + cls).expect(404);
});
test('files are private and published resources are visible only to enrolled students', async () => {
  const upload = await teacher.agent
    .post('/api/files')
    .set('X-CSRF-Token', teacher.csrf)
    .attach('file', Buffer.from('%PDF-1.4\nIntegration fixture'), {
      filename: 'worksheet.pdf',
      contentType: 'application/pdf',
    })
    .expect(201);
  fileId = upload.body.id;
  await student.agent.get('/api/files/' + fileId).expect(404);
  const resource = await create(
    'resources',
    {
      class_id: cls,
      title: 'Protected worksheet',
      description: 'A test resource',
      file_id: fileId,
    },
    teacher,
  );
  await student.agent.get('/api/records/resources/' + resource).expect(404);
  const hidden = await student.agent.get('/api/search?q=Protected').expect(200);
  assert.equal(hidden.body.length, 0);
  await transition('resources', resource, 'publish', teacher);
  await student.agent.get('/api/files/' + fileId).expect(200);
  await outsider.agent.get('/api/files/' + fileId).expect(404);
  await outsider.agent.get('/api/records/resources/' + resource).expect(404);
  const search = await student.agent.get('/api/search?q=Protected').expect(200);
  assert.equal(search.body[0].id, resource);
  await teacher.agent
    .post('/api/files')
    .set('X-CSRF-Token', teacher.csrf)
    .attach('file', Buffer.from('<script>alert(1)</script>'), {
      filename: 'unsafe.html',
      contentType: 'text/html',
    })
    .expect(400);
});
test('assignment lifecycle enforces publication, deadlines, one submission, grading and return', async () => {
  assignment = await create(
    'assignments',
    {
      class_id: cls,
      title: 'Algebra homework',
      instructions: 'Explain the solution',
      open_at: new Date(Date.now() - 3600000).toISOString(),
      due_at: new Date(Date.now() + 3600000).toISOString(),
      max_score: 20,
      allow_late: 0,
    },
    teacher,
  );
  await student.agent.get('/api/records/assignments/' + assignment).expect(404);
  await transition('assignments', assignment, 'publish', teacher);
  await post(outsider, '/assignments/' + assignment + '/submit', { content: 'unauthorized' }, 404);
  const sub = await post(student, '/assignments/' + assignment + '/submit', {
    content: 'Worked solution',
  });
  submissionId = sub.id;
  const duplicate = await post(student, '/assignments/' + assignment + '/submit', {
    content: 'Duplicate',
  });
  assert.equal(duplicate.id, sub.id);
  await post(
    otherTeacher,
    '/submissions/' + sub.id + '/grade',
    { score: 20, feedback: '', version: 1, return_result: false },
    403,
  );
  await post(
    teacher,
    '/submissions/' + sub.id + '/grade',
    { score: 21, feedback: '', version: 1, return_result: false },
    400,
  );
  await post(
    teacher,
    '/submissions/' + sub.id + '/grade',
    { score: 18, feedback: 'Clear reasoning', version: 1, return_result: false },
    200,
  );
  const hidden = await student.agent
    .get('/api/assignments/' + assignment + '/submissions')
    .expect(200);
  assert.equal(hidden.body.items[0].score, null);
  assert.equal(hidden.body.items[0].feedback, '');
  await post(
    teacher,
    '/submissions/' + sub.id + '/grade',
    { score: 18, feedback: 'Clear reasoning', version: 1, return_result: true },
    409,
  );
  await post(
    teacher,
    '/submissions/' + sub.id + '/grade',
    { score: 18, feedback: 'Clear reasoning', version: 2, return_result: true },
    200,
  );
  const results = await student.agent.get('/api/results').expect(200);
  assert.equal(results.body.items[0].score, 18);
  await transition('assignments', assignment, 'complete', teacher);
  await post(student, '/assignments/' + assignment + '/submit', { content: 'Too late' }, 409);
});
test('question banks and exam snapshots cannot be discovered by students', async () => {
  bank = await create('question_banks', { subject_id: subject, title: 'Algebra bank' }, teacher);
  question = await create(
    'questions',
    {
      bank_id: bank,
      type: 'multiple_choice',
      prompt: 'What is 2 + 2?',
      options: '["3","4","5"]',
      correct_answer: '4',
      points: 2,
      difficulty: 'easy',
    },
    teacher,
  );
  manualQuestion = await create(
    'questions',
    {
      bank_id: bank,
      type: 'short_answer',
      prompt: 'Explain a method.',
      options: '[]',
      points: 3,
      difficulty: 'medium',
    },
    teacher,
  );
  await student.agent.get('/api/records/questions').expect(403);
  await otherTeacher.agent.get('/api/records/questions/' + question).expect(404);
  exam = await create(
    'exams',
    {
      class_id: cls,
      title: 'Algebra exam',
      instructions: 'Answer carefully',
      opens_at: new Date(Date.now() - 60000).toISOString(),
      closes_at: new Date(Date.now() + 3600000).toISOString(),
      duration_minutes: 30,
      max_attempts: 1,
      randomize_questions: 1,
      randomize_options: 1,
    },
    teacher,
  );
  await post(teacher, '/exams/' + exam + '/questions', { question_id: question });
  await post(teacher, '/exams/' + exam + '/questions', { question_id: manualQuestion });
  await post(teacher, '/exams/' + exam + '/questions', { question_id: question }, 409);
  await transition('exams', exam, 'review', teacher);
  await transition('exams', exam, 'schedule', teacher);
  await student.agent.get('/api/records/exams/' + exam).expect(404);
  await transition('exams', exam, 'publish', teacher);
  await student.agent.get('/api/exams/' + exam + '/questions').expect(403);
  await post(teacher, '/exams/' + exam + '/questions', { question_id: question }, 409);
});
test('exam attempts persist answers, reject IDOR and stale saves, hide grades until release', async () => {
  await post(outsider, '/exams/' + exam + '/attempts', {}, 404);
  const attempt = await post(student, '/exams/' + exam + '/attempts');
  attemptId = attempt.id;
  assert.equal((await post(student, '/exams/' + exam + '/attempts')).id, attemptId);
  const content = await student.agent.get('/api/attempts/' + attemptId).expect(200);
  assert.equal(content.body.questions.length, 2);
  assert.ok(content.body.questions.every((q: any) => q.correct_answer === undefined));
  await outsider.agent.get('/api/attempts/' + attemptId).expect(403);
  const choice = content.body.questions.find((q: any) => q.type === 'multiple_choice'),
    manual = content.body.questions.find((q: any) => q.type === 'short_answer');
  const save = await student.agent
    .put('/api/attempts/' + attemptId + '/answers')
    .set('X-CSRF-Token', student.csrf)
    .send({
      version: 1,
      answers: [
        { question_id: choice.id, value: '4' },
        { question_id: manual.id, value: 'Reasoned answer' },
      ],
    })
    .expect(200);
  assert.equal(save.body.version, 2);
  await student.agent
    .put('/api/attempts/' + attemptId + '/answers')
    .set('X-CSRF-Token', student.csrf)
    .send({ version: 1, answers: [] })
    .expect(409);
  await post(student, '/attempts/' + attemptId + '/submit', {}, 200);
  await post(student, '/attempts/' + attemptId + '/submit', {}, 200);
  await post(student, '/exams/' + exam + '/attempts', {}, 409);
  const hidden = await student.agent.get('/api/attempts/' + attemptId).expect(200);
  assert.equal(hidden.body.answers.length, 0);
  assert.equal(hidden.body.questions.length, 0);
  const grading = await teacher.agent.get('/api/attempts/' + attemptId).expect(200);
  assert.equal(grading.body.answers.find((a: any) => a.question_id === choice.id).score, 2);
  await transition('exams', exam, 'close', teacher);
  await transition('exams', exam, 'release', teacher, 409);
  await post(
    teacher,
    '/attempts/' + attemptId + '/grade',
    {
      version: grading.body.attempt.version,
      answers: [{ question_id: manual.id, score: 3, feedback: 'Complete explanation' }],
    },
    200,
  );
  await transition('exams', exam, 'release', teacher);
  const released = await student.agent.get('/api/attempts/' + attemptId).expect(200);
  assert.equal(
    released.body.answers.reduce((n: number, a: any) => n + a.score, 0),
    5,
  );
  assert.equal((await student.agent.get('/api/results')).body.total, 2);
});
test('expired attempts close automatically and cannot accept late answers', async () => {
  const another = await create(
    'exams',
    {
      class_id: cls,
      title: 'Timed test',
      opens_at: new Date(Date.now() - 60000).toISOString(),
      closes_at: new Date(Date.now() + 3600000).toISOString(),
      duration_minutes: 1,
      max_attempts: 1,
    },
    teacher,
  );
  await post(teacher, '/exams/' + another + '/questions', { question_id: question });
  await transition('exams', another, 'review', teacher);
  await transition('exams', another, 'publish', teacher);
  const attempt = await post(student, '/exams/' + another + '/attempts');
  db.run(
    'UPDATE attempts SET deadline=? WHERE id=?',
    new Date(Date.now() - 1000).toISOString(),
    attempt.id,
  );
  await student.agent
    .put('/api/attempts/' + attempt.id + '/answers')
    .set('X-CSRF-Token', student.csrf)
    .send({ version: 1, answers: [] })
    .expect(409);
  expireAttempts(db);
  assert.equal(db.get('SELECT status FROM attempts WHERE id=?', attempt.id)!.status, 'graded');
  await transition('exams', another, 'close', teacher);
  await transition('academic_years', year, 'archive', admin, 409);
  await transition('exams', another, 'release', teacher);
});
test('schedule conflicts include shared teachers, rooms and future membership changes', async () => {
  await create(
    'schedules',
    { class_id: cls, day: '1', starts_at: '09:00', ends_at: '10:00', room: 'R1' },
    teacher,
  );
  await post(
    otherTeacher,
    '/records/schedules',
    { class_id: otherClass, day: '1', starts_at: '09:30', ends_at: '10:30', room: 'R1' },
    409,
  );
  await create(
    'schedules',
    { class_id: otherClass, day: '1', starts_at: '09:30', ends_at: '10:30', room: 'R2' },
    otherTeacher,
  );
  await post(admin, '/records/enrollments', { class_id: otherClass, student_id: studentId }, 409);
  await post(
    admin,
    '/records/teacher_assignments',
    { class_id: otherClass, teacher_id: teacherId },
    409,
  );
});
test('targeted announcements and inbox enforce audience boundaries', async () => {
  const announcement = await create(
    'announcements',
    {
      title: 'Class update',
      content: 'Review the next lesson',
      audience_type: 'class',
      audience_id: cls,
      publish_at: new Date(Date.now() - 1000).toISOString(),
    },
    teacher,
  );
  await transition('announcements', announcement, 'publish', teacher);
  await student.agent.get('/api/records/announcements/' + announcement).expect(200);
  const notified = await student.agent.get('/api/notifications').expect(200);
  assert.ok(notified.body.items.some((n: any) => n.entity_id === announcement));
  const hiddenNotice = await outsider.agent.get('/api/notifications').expect(200);
  assert.ok(!hiddenNotice.body.items.some((n: any) => n.entity_id === announcement));
  await outsider.agent.get('/api/records/announcements/' + announcement).expect(404);
  await post(
    teacher,
    '/records/announcements',
    {
      title: 'Forbidden',
      content: 'School-wide',
      audience_type: 'school',
      publish_at: new Date().toISOString(),
    },
    403,
  );
  await post(
    student,
    '/messages',
    { recipient_id: outsiderId, subject: 'No', content: 'Not allowed' },
    403,
  );
  await post(student, '/messages', {
    recipient_id: teacherId,
    subject: 'Question',
    content: 'Please clarify the instructions',
  });
  assert.equal((await teacher.agent.get('/api/messages')).body.total, 1);
  assert.equal((await outsider.agent.get('/api/messages')).body.total, 0);
});
test('import validates mappings and duplicates before atomic, idempotent confirmation', async () => {
  const csv = `Full Name,Email,Role,Initial Password\r\n"Imported, Student",imported@example.test,student,${password}`;
  const headers = await post(admin, '/imports/preview', { csv }, 200);
  assert.equal(headers.headers.length, 4);
  const mapping = { name: 'Full Name', email: 'Email', role: 'Role', password: 'Initial Password' };
  const preview = await post(admin, '/imports/preview', { csv, mapping }, 200);
  assert.equal(preview.errors.length, 0);
  assert.equal(preview.preview[0].password, undefined);
  assert.equal(db.get('SELECT id FROM users WHERE email=?', 'imported@example.test'), undefined);
  const result = await post(admin, '/imports/' + preview.id + '/commit', {}, 200);
  assert.equal(result.imported, 1);
  assert.deepEqual(await post(admin, '/imports/' + preview.id + '/commit', {}, 200), result);
  const duplicate = await post(admin, '/imports/preview', { csv, mapping }, 200);
  assert.equal(duplicate.errors[0].code, 'duplicate_email');
  assert.equal(duplicate.id, null);
  await post(student, '/imports/preview', { csv }, 403);
  const imported = request.agent(app);
  await imported
    .post('/api/auth/login')
    .send({ email: 'imported@example.test', password })
    .expect(200);
  await imported.get('/api/dashboard').expect(403);
  const me = await imported.get('/api/auth/me');
  await imported
    .post('/api/auth/password')
    .set('X-CSRF-Token', me.body.csrf)
    .send({ current_password: password, password: randomBytes(20).toString('hex') })
    .expect(200);
  await imported.get('/api/dashboard').expect(200);
});
test('archive preserves results, restricts writes, and rollover copies only structure', async () => {
  await transition('academic_years', year, 'archive');
  assert.equal((await student.agent.get('/api/results')).body.total, 3);
  await post(
    teacher,
    '/records/lessons',
    { class_id: cls, title: 'Not allowed', content: '' },
    409,
  );
  const rollover = await post(admin, '/years/' + year + '/rollover', {
    name: 'Next Year',
    start_date: `${currentYear + 2}-01-01`,
    end_date: `${currentYear + 3}-12-31`,
  });
  assert.ok(rollover.id);
  const classes = db.all('SELECT id FROM classes WHERE year_id=?', rollover.id);
  assert.equal(classes.length, 2);
  assert.equal(db.get('SELECT count(*) n FROM enrollments WHERE class_id=?', classes[0].id)!.n, 0);
  assert.equal(db.get('SELECT count(*) n FROM submissions WHERE id=?', submissionId)!.n, 1);
  await student.agent.get('/api/audit').expect(403);
  assert.ok((await admin.agent.get('/api/audit')).body.total > 15);
  await admin.agent.get('/api/health').expect(200);
});
test('CSV parser handles escaped quotes and rejects malformed rows', () => {
  assert.deepEqual(parseCSV('name,email\n"A ""quoted"" name",a@example.test'), [
    ['name', 'email'],
    ['A "quoted" name', 'a@example.test'],
  ]);
  assert.throws(() => parseCSV('name,email\n"unclosed,a@example.test'));
  assert.throws(() => parseCSV('name,email\nmissing'));
  assert.throws(() => parseCSV('name,email\n"quoted"trailing,a@example.test'));
  assert.throws(() => parseCSV('name,email\n"""unterminated,a@example.test'));
});

test('paginated work and maps retain scope and reports derive from stored records', async () => {
  const own = await student.agent.get('/api/results?page=1&limit=1').expect(200);
  assert.equal(own.body.items.length, 1);
  assert.equal(own.body.total, 3);
  const other = await outsider.agent.get('/api/results?limit=100').expect(200);
  assert.equal(other.body.total, 0);
  const map = await student.agent.get('/api/school-map?year_id=' + year).expect(200);
  assert.equal(map.body.total, 1);
  assert.equal(map.body.items[0].id, cls);
  assert.equal(map.body.items[0].grade_name, 'Grade Ten');
  await outsider.agent.get('/api/classes/' + cls + '/summary').expect(403);
  const teacherSearch = await teacher.agent.get('/api/search?q=Enrolled').expect(200);
  assert.equal(teacherSearch.body.find((r: any) => r.entity === 'people').id, studentId);
  const inbox = await student.agent.get('/api/inbox/tasks').expect(200);
  assert.equal(inbox.body.total, 0);
  const analytics = await teacher.agent.get('/api/analytics').expect(200);
  assert.equal(analytics.body.classes[0].average, 90);
});

test('administrator password reset revokes existing sessions and requires actor verification', async () => {
  const nextPassword = randomBytes(20).toString('hex');
  await post(
    admin,
    '/people/' + outsiderId + '/password',
    { current_password: 'incorrect-password', password: nextPassword },
    400,
  );
  await post(
    admin,
    '/people/' + outsiderId + '/password',
    { current_password: password, password: nextPassword },
    200,
  );
  await outsider.agent.get('/api/auth/me').expect(401);
  const reset = request.agent(app);
  await reset
    .post('/api/auth/login')
    .send({ email: 'other@example.test', password: nextPassword })
    .expect(200);
  const me = await reset.get('/api/auth/me').expect(200);
  assert.equal(me.body.user.must_change_password, 1);
  await reset.get('/api/dashboard').expect(403);
  assert.ok(
    db.get("SELECT id FROM audit_events WHERE entity_id=? AND action='password_reset'", outsiderId),
  );
});
