import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import { Store, now, id } from '../src/server/db.js';
import { createApp } from '../src/server/app.js';
import { createUser, digest } from '../src/server/auth.js';
import { resolveMicrosoftStudent } from '../src/server/microsoft.js';
const db = new Store(':memory:');
const password = randomBytes(20).toString('hex');
const tenant = randomUUID();
let app: Awaited<ReturnType<typeof createApp>>,
  admin: any,
  csrf: string,
  adminId: string,
  classId: string,
  otherClass: string;
const claims = (extra = {}) => ({
  tid: tenant,
  oid: randomUUID(),
  name: 'اسم الطالب الكامل',
  preferred_username: `${randomUUID()}@school.example`,
  acct: 0,
  ...extra,
});
before(async () => {
  delete process.env.MICROSOFT_TENANT_ID;
  app = await createApp(db, { frontend: false });
  adminId = await createUser(
    db,
    { name: 'School Administrator', email: 'admin@school.example', role: 'admin', password },
    false,
  );
  db.run('UPDATE users SET login_id=? WHERE id=?', 'Admin@school', adminId);
  admin = request.agent(app);
  await admin.post('/api/auth/login').send({ email: 'ADMIN@SCHOOL', password }).expect(200);
  csrf = (await admin.get('/api/auth/me').expect(200)).body.csrf;
  const year = id(),
    term = id(),
    grade = id(),
    section = id(),
    track = id(),
    subject = id();
  classId = id();
  otherClass = id();
  db.insert('academic_years', {
    id: year,
    name: 'Year',
    start_date: '2026-01-01',
    end_date: '2027-12-31',
    status: 'active',
  });
  db.insert('terms', {
    id: term,
    year_id: year,
    name: 'Term',
    start_date: '2026-01-01',
    end_date: '2027-12-31',
  });
  db.insert('grades', { id: grade, name: 'Grade 10' });
  db.insert('sections', { id: section, grade_id: grade, name: 'Section A' });
  db.insert('tracks', { id: track, name: 'Science track' });
  db.insert('subjects', { id: subject, name: 'Physics', code: 'PHY' });
  for (const cid of [classId, otherClass])
    db.insert('classes', {
      id: cid,
      name: cid === classId ? 'Physics A' : 'Physics B',
      year_id: year,
      term_id: term,
      section_id: section,
      track_id: track,
      subject_id: subject,
    });
});
after(() => db.db.close());
const post = (url: string, body: any) =>
  admin
    .post('/api' + url)
    .set('X-CSRF-Token', csrf)
    .send(body);

async function approveIdentity(identity: ReturnType<typeof claims>) {
  process.env.MICROSOFT_TENANT_ID = tenant;
  try {
    const result = await post('/people/microsoft', {
      name: identity.name,
      email: identity.preferred_username,
      object_id: identity.oid,
    }).expect(201);
    return result.body.id as string;
  } finally {
    delete process.env.MICROSOFT_TENANT_ID;
  }
}

test('administrator login ID works without changing contact email or trusting client role', async () => {
  assert.equal(
    db.get('SELECT email FROM users WHERE id=?', adminId)!.email,
    'admin@school.example',
  );
  await request(app)
    .post('/api/auth/login')
    .send({ email: 'Admin@school', password: 'wrong', role: 'admin' })
    .expect(401);
  await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@school.example', password })
    .expect(200);
  await request(app).get('/api/teaching-classes').expect(401);
});

test('only administrator-approved school identity synchronizes full name without email linking', async () => {
  const identity = claims({ role: 'admin' });
  assert.throws(() => resolveMicrosoftStudent(db, identity, tenant));
  const approved = await approveIdentity(identity);
  const uid = resolveMicrosoftStudent(db, identity, tenant);
  assert.equal(uid, approved);
  assert.equal(db.get('SELECT role FROM users WHERE id=?', uid)!.role, 'student');
  assert.equal(db.get('SELECT name FROM users WHERE id=?', uid)!.name, identity.name);
  assert.equal(db.get('SELECT password_hash FROM users WHERE id=?', uid)!.password_hash, '');
  assert.equal(
    resolveMicrosoftStudent(
      db,
      { ...identity, name: 'Updated Full School Name', preferred_username: 'new@school.example' },
      tenant,
    ),
    uid,
  );
  assert.equal(db.get('SELECT name FROM users WHERE id=?', uid)!.name, 'Updated Full School Name');
  assert.throws(() =>
    resolveMicrosoftStudent(db, claims({ preferred_username: 'admin@school.example' }), tenant),
  );
  assert.throws(() =>
    resolveMicrosoftStudent(db, claims({ preferred_username: 'new@school.example' }), tenant),
  );
  db.run("UPDATE users SET status='archived' WHERE id=?", uid);
  assert.throws(() => resolveMicrosoftStudent(db, identity, tenant));
});

test('foreign tenants, guests, missing member claim and missing full names fail closed', () => {
  for (const change of [
    { tid: randomUUID() },
    { acct: 1 },
    { acct: undefined },
    { name: '' },
    { oid: 'not-an-id' },
  ]) {
    assert.throws(() => resolveMicrosoftStudent(db, claims(change), tenant));
  }
});

test('administrator can create and import local student accounts outside demo mode', async () => {
  const result = await post('/people', {
    name: 'Local Student',
    email: 'student@school.example',
    role: 'student',
    password,
  }).expect(201);
  const student = request.agent(app);
  await student
    .post('/api/auth/login')
    .send({ email: 'student@school.example', password })
    .expect(200);
  const me = await student.get('/api/auth/me').expect(200);
  assert.equal(me.body.user.id, result.body.id);
  assert.equal(me.body.user.must_change_password, 1);
  await student.get('/api/records/classes').expect(403);
  const preview = await post('/imports/preview', {
    csv: `name,email,role,password\nImported Student,imported@school.example,student,${password}`,
    mapping: { name: 'name', email: 'email', role: 'role', password: 'password' },
  }).expect(200);
  assert(preview.body.id);
  assert.deepEqual(preview.body.errors, []);
  await post(`/imports/${preview.body.id}/commit`, {}).expect(200);
  assert.equal(
    db.get('SELECT role FROM users WHERE email=?', 'imported@school.example')!.role,
    'student',
  );
});

test('Microsoft sessions stay within student permissions and expose no authentication metadata', async () => {
  const identity = claims();
  await approveIdentity(identity);
  const uid = resolveMicrosoftStudent(db, identity, tenant);
  const token = randomBytes(32).toString('hex');
  db.insert('sessions', {
    token_hash: digest(token),
    user_id: uid,
    csrf: 'student-csrf',
    auth_provider: 'microsoft',
    expires_at: new Date(Date.now() + 60000).toISOString(),
    created_at: now(),
  });
  const cookie = `claso_session=${token}`;
  const me = await request(app).get('/api/auth/me').set('Cookie', cookie).expect(200);
  assert.equal(me.body.user.role, 'student');
  assert.equal(me.body.user.password_hash, undefined);
  await request(app).get('/api/teaching-classes').set('Cookie', cookie).expect(403);
  await request(app)
    .post('/api/teachers')
    .set('Cookie', cookie)
    .set('X-CSRF-Token', 'student-csrf')
    .send({})
    .expect(403);
  await post(`/people/${uid}/password`, { current_password: password, password }).expect(403);
});

test('Microsoft unconfigured and forged callbacks do not issue sessions', async () => {
  const config = await request(app).get('/api/public').expect(200);
  assert.equal(config.body.microsoft, false);
  await request(app)
    .get('/api/auth/microsoft/start')
    .expect(302)
    .expect('Location', '/?authError=microsoft_unavailable');
  process.env.MICROSOFT_TENANT_ID = tenant;
  process.env.MICROSOFT_CLIENT_ID = randomUUID();
  process.env.MICROSOFT_CLIENT_SECRET = randomBytes(32).toString('hex');
  process.env.APP_ORIGIN = 'https://school.example';
  const size = db.get('SELECT count(*) n FROM sessions')!.n;
  await request(app)
    .get('/api/auth/microsoft/callback?state=forged&code=forged')
    .expect(302)
    .expect('Location', '/?authError=microsoft_failed');
  const state = randomBytes(32).toString('hex'),
    browser = randomBytes(32).toString('hex');
  db.insert('oauth_requests', {
    state_hash: digest(state),
    browser_hash: digest(browser),
    verifier: 'private-verifier',
    nonce: 'nonce',
    expires_at: new Date(Date.now() - 1000).toISOString(),
  });
  await request(app)
    .get(`/api/auth/microsoft/callback?state=${state}&code=forged`)
    .set('Cookie', `claso_microsoft_flow=${browser}`)
    .expect(302)
    .expect('Location', '/?authError=microsoft_failed');
  assert.equal(db.get('SELECT count(*) n FROM sessions')!.n, size);
  delete process.env.MICROSOFT_TENANT_ID;
  delete process.env.MICROSOFT_CLIENT_ID;
  delete process.env.MICROSOFT_CLIENT_SECRET;
  delete process.env.APP_ORIGIN;
});

test('teacher onboarding connects academic context atomically, assigns scope and forces password change', async () => {
  const listing = await admin.get('/api/teaching-classes?q=Science').expect(200);
  assert.equal(listing.body.total, 2);
  assert.equal(listing.body.items[0].grade, 'Grade 10');
  assert.equal(listing.body.items[0].section, 'Section A');
  assert.equal(listing.body.items[0].track, 'Science track');
  assert.equal(listing.body.items[0].subject, 'Physics');
  const result = await post('/teachers', {
    name: 'اسم المعلم الكامل',
    email: 'newteacher@school.example',
    password,
    class_ids: [classId],
  }).expect(201);
  assert(
    db.get(
      'SELECT id FROM teacher_assignments WHERE teacher_id=? AND class_id=?',
      result.body.id,
      classId,
    ),
  );
  assert.equal(
    db.get('SELECT must_change_password FROM users WHERE id=?', result.body.id)!
      .must_change_password,
    1,
  );
  const teacher = request.agent(app);
  await teacher
    .post('/api/auth/login')
    .send({ email: 'newteacher@school.example', password })
    .expect(200);
  const me = await teacher.get('/api/auth/me').expect(200);
  await teacher.get('/api/records/classes').expect(403);
  await teacher
    .post('/api/auth/password')
    .set('X-CSRF-Token', me.body.csrf)
    .send({ current_password: password, password: randomBytes(24).toString('hex') })
    .expect(200);
  const classes = await teacher.get('/api/records/classes').expect(200);
  assert.deepEqual(
    classes.body.items.map((r: any) => r.id),
    [classId],
  );
  await teacher.get(`/api/records/classes/${otherClass}`).expect(404);
  await post(`/teachers/${result.body.id}/assignments`, {
    class_ids: [classId, otherClass],
  }).expect(200);
  await post(`/teachers/${result.body.id}/assignments`, { class_ids: [classId] }).expect(200);
  assert.equal(
    db.get('SELECT count(*) n FROM teacher_assignments WHERE teacher_id=?', result.body.id)!.n,
    2,
  );
});

test('invalid relationships, duplicate selections, conflicts and archived classes roll back teacher creation', async () => {
  const data = { name: 'Rejected Teacher', email: 'reject@school.example', password };
  await post('/teachers', { ...data, class_ids: [] }).expect(400);
  await post('/teachers', { ...data, class_ids: [classId, classId] }).expect(400);
  await post('/teachers', { ...data, class_ids: [classId, randomUUID()] }).expect(404);
  assert(!db.get('SELECT id FROM users WHERE email=?', data.email));
  for (const cid of [classId, otherClass])
    db.insert('schedules', {
      id: id(),
      class_id: cid,
      day: 1,
      starts_at: '09:00',
      ends_at: '10:00',
      room: '',
    });
  await post('/teachers', { ...data, class_ids: [classId, otherClass] }).expect(409);
  assert(!db.get('SELECT id FROM users WHERE email=?', data.email));
  db.run("UPDATE classes SET status='archived' WHERE id=?", classId);
  await post('/teachers', { ...data, class_ids: [classId] }).expect(409);
  assert(!db.get('SELECT id FROM users WHERE email=?', data.email));
});
