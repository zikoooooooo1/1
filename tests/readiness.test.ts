import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { Store, id, now } from '../src/server/db.js';
import { schoolReadiness } from '../src/server/readiness.js';
import { createApp } from '../src/server/app.js';
import { createUser } from '../src/server/auth.js';

const done = (db: Store, key: string) => schoolReadiness(db).steps.find((s) => s.key === key)!.done;
function person(db: Store, role: string, status = 'active') {
  const uid = id();
  db.insert('users', {
    id: uid,
    name: role,
    email: uid + '@school.example',
    role,
    status,
    password_hash: 'unused-test-hash',
    created_at: now(),
  });
  return uid;
}
function structure(db: Store, status = 'active') {
  const year = id(),
    term = id(),
    grade = id(),
    section = id(),
    subject = id();
  db.insert('academic_years', {
    id: year,
    name: year,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    status,
  });
  db.insert('terms', {
    id: term,
    year_id: year,
    name: 'Term',
    start_date: '2026-01-01',
    end_date: '2026-06-01',
  });
  db.insert('grades', { id: grade, name: grade });
  db.insert('sections', { id: section, grade_id: grade, name: section });
  db.insert('subjects', { id: subject, name: subject, code: subject });
  const cls = id();
  db.insert('classes', {
    id: cls,
    name: cls,
    year_id: year,
    term_id: term,
    section_id: section,
    subject_id: subject,
  });
  return { year, term, section, subject, cls };
}
function connect(db: Store, cls: string, teacher: string, student: string) {
  db.insert('teacher_assignments', { id: id(), class_id: cls, teacher_id: teacher });
  db.insert('enrollments', { id: id(), class_id: cls, student_id: student, created_at: now() });
}
function schedule(db: Store, cls: string) {
  db.insert('schedules', { id: id(), class_id: cls, day: 1, starts_at: '09:00', ends_at: '10:00' });
}

test('empty schools and additional administrators do not imply configured teaching or saved identity', () => {
  const db = new Store(':memory:');
  try {
    person(db, 'admin');
    person(db, 'admin');
    assert.equal(schoolReadiness(db).completed, 0);
    assert.equal(schoolReadiness(db).total, 6);
    assert.equal(
      schoolReadiness(db).steps.find((s) => s.key === 'setup_classes')!.path,
      '/classes',
    );
    assert.equal(done(db, 'setup_people'), false);
    const teacher = person(db, 'teacher', 'archived');
    person(db, 'student');
    assert.equal(done(db, 'setup_people'), false);
    db.run("UPDATE users SET status='active' WHERE id=?", teacher);
    assert.equal(done(db, 'setup_people'), true);
    db.run('UPDATE school SET version=version+1');
    assert.equal(done(db, 'setup_identity'), true);
  } finally {
    db.db.close();
  }
});

test('archived years and their terms, memberships and timetable do not complete the current year', () => {
  const db = new Store(':memory:');
  try {
    const old = structure(db, 'archived'),
      teacher = person(db, 'teacher'),
      student = person(db, 'student');
    connect(db, old.cls, teacher, student);
    schedule(db, old.cls);
    assert.equal(done(db, 'setup_year'), false);
    assert.equal(done(db, 'setup_academic'), false);
    assert.equal(done(db, 'setup_classes'), false);
    assert.equal(done(db, 'setup_schedule'), false);
    const year = id();
    db.insert('academic_years', {
      id: year,
      name: year,
      start_date: '2027-01-01',
      end_date: '2027-12-31',
      status: 'active',
    });
    assert.equal(done(db, 'setup_year'), true);
    assert.equal(done(db, 'setup_academic'), false);
    assert.equal(schoolReadiness(db).activeClasses, 0);
    db.insert('terms', {
      id: id(),
      year_id: year,
      name: 'New term',
      start_date: '2027-01-01',
      end_date: '2027-06-01',
    });
    assert.equal(done(db, 'setup_academic'), true);
    assert.equal(done(db, 'setup_classes'), false);
  } finally {
    db.db.close();
  }
});

test('all active current-year classes need active teachers, active students and timetable entries', () => {
  const db = new Store(':memory:');
  try {
    const f = structure(db),
      second = id(),
      teacher = person(db, 'teacher'),
      student = person(db, 'student');
    db.insert('classes', {
      id: second,
      name: second,
      year_id: f.year,
      term_id: f.term,
      section_id: f.section,
      subject_id: f.subject,
    });
    connect(db, f.cls, teacher, student);
    schedule(db, f.cls);
    let state = schoolReadiness(db);
    assert.equal(state.activeClasses, 2);
    assert.equal(state.connectedClasses, 1);
    assert.equal(state.scheduledClasses, 1);
    assert.equal(done(db, 'setup_classes'), false);
    assert.equal(done(db, 'setup_schedule'), false);
    assert.equal(
      schoolReadiness(db).steps.find((s) => s.key === 'setup_classes')!.path,
      '/academic/teacher_assignments',
    );
    db.insert('teacher_assignments', { id: id(), class_id: second, teacher_id: teacher });
    assert.equal(
      schoolReadiness(db).steps.find((s) => s.key === 'setup_classes')!.path,
      '/academic/enrollments',
    );
    db.insert('enrollments', {
      id: id(),
      class_id: second,
      student_id: student,
      created_at: now(),
    });
    schedule(db, second);
    assert.equal(done(db, 'setup_classes'), true);
    assert.equal(done(db, 'setup_schedule'), true);
    db.run("UPDATE users SET status='archived' WHERE id=?", teacher);
    assert.equal(done(db, 'setup_classes'), false);
    db.run("UPDATE users SET status='active' WHERE id=?", teacher);
    db.run("UPDATE users SET status='archived' WHERE id=?", student);
    assert.equal(done(db, 'setup_classes'), false);
    db.run("UPDATE users SET status='active' WHERE id=?", student);
    db.run('DELETE FROM schedules WHERE class_id=?', second);
    db.run("UPDATE classes SET status='archived' WHERE id=?", second);
    state = schoolReadiness(db);
    assert.equal(state.activeClasses, 1);
    assert.equal(done(db, 'setup_schedule'), true);
    db.run("UPDATE academic_years SET status='archived'");
    assert.equal(schoolReadiness(db).activeClasses, 0);
    assert.equal(done(db, 'setup_schedule'), false);
  } finally {
    db.db.close();
  }
});

test('setup status reaches only school operators and is consistent between dashboard and control center', async () => {
  const db = new Store(':memory:');
  try {
    const app = await createApp(db, { frontend: false });
    const password = randomBytes(24).toString('hex');
    for (const role of ['admin', 'school_management', 'teacher', 'student']) {
      const email = role + '@school.example';
      await createUser(db, { name: role, role, email, password }, false);
      const agent = request.agent(app);
      await agent.post('/api/auth/login').send({ email, password }).expect(200);
      const dashboard = (await agent.get('/api/dashboard').expect(200)).body;
      if (role === 'admin' || role === 'school_management') {
        const control = (await agent.get('/api/control-center').expect(200)).body;
        assert.deepEqual(dashboard.setup, control.readiness);
        assert.equal(
          control.readiness.steps.find((s: any) => s.key === 'setup_identity').administratorOnly,
          true,
        );
      } else {
        assert.equal(dashboard.setup, null);
        await agent.get('/api/control-center').expect(403);
      }
    }
    await request(app).get('/api/dashboard').expect(401);
  } finally {
    db.db.close();
  }
});

test('management setup renders account and identity steps as information, with no edit buttons', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { LocaleProvider } = await import('../src/client/i18n/index.js');
  const { SchoolReadiness } = await import('../src/client/components/school-readiness.js');
  const db = new Store(':memory:');
  try {
    const render = (administrator: boolean) =>
      renderToStaticMarkup(
        createElement(LocaleProvider, {
          children: createElement(SchoolReadiness, { data: schoolReadiness(db), administrator }),
        }),
      );
    const management = render(false);
    const actions = management.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) || [];
    assert.equal(actions.length, 4);
    assert.equal(
      actions.some(
        (action) => action.includes('School identity') || action.includes('School community'),
      ),
      false,
    );
    assert.match(management, /The administrator completes this step/);
    const admin = render(true);
    assert.equal((admin.match(/<button\b/g) || []).length, 6);
    assert.match(admin, /value="0"/);
  } finally {
    db.db.close();
  }
});
