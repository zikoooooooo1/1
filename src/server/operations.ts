import { schoolReadiness } from './readiness.js';
import { isSchoolOperator, academicAuditEntities } from '../shared/roles.js';
import { paginate } from './pagination.js';
import { Router } from 'express';
import { z } from 'zod';
import { accessSync, constants } from 'node:fs';
import { Store, now, id } from './db.js';
import { classAccess, classScope, requireRole } from './auth.js';
import { assert } from './errors.js';
import { entityScope, updateVersion } from './domain.js';
export function operationsRouter(db: Store, storage: string) {
  const router = Router();

  router.get('/school-map', (req, res) => {
    const scope = classScope(req.user, 'c');
    const year = z.string().uuid().parse(req.query.year_id);
    const page = Math.max(1, Number(req.query.page) || 1);
    const total = db.get(
      `SELECT count(*) total FROM classes c WHERE c.year_id=? AND ${scope.sql}`,
      year,
      ...scope.params,
    )!.total;
    const items = db.all(
      `SELECT c.id,c.name,c.status,g.name grade_name,s.name section_name,tr.name track_name,su.name subject_name,t.name term_name,(SELECT count(*) FROM enrollments WHERE class_id=c.id) students,(SELECT group_concat(u.name, ', ') FROM teacher_assignments ta JOIN users u ON u.id=ta.teacher_id WHERE ta.class_id=c.id) teachers FROM classes c JOIN sections s ON s.id=c.section_id JOIN grades g ON g.id=s.grade_id LEFT JOIN tracks tr ON tr.id=c.track_id JOIN subjects su ON su.id=c.subject_id JOIN terms t ON t.id=c.term_id WHERE c.year_id=? AND ${scope.sql} ORDER BY g.name,s.name,su.name,c.name LIMIT 50 OFFSET ?`,
      year,
      ...scope.params,
      (page - 1) * 50,
    );
    res.json({ items, total, page, limit: 50 });
  });
  router.get('/classes/:id/summary', (req, res) => {
    const cls = classAccess(db, req.user, String(req.params.id));
    const assignments = db.get(
      "SELECT count(*) n FROM assignments WHERE class_id=? AND status!='draft'",
      cls.id,
    )!.n;
    const students = db.get('SELECT count(*) n FROM enrollments WHERE class_id=?', cls.id)!.n;
    const submissions = db.get(
      `SELECT count(*) n FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE a.class_id=? ${req.user.role === 'student' ? 'AND s.student_id=?' : ''}`,
      cls.id,
      ...(req.user.role === 'student' ? [req.user.id] : []),
    )!.n;
    const activity = db.all(
      `SELECT a.id,a.title,a.created_at,a.status,'assignments' entity FROM assignments a WHERE a.class_id=? ${req.user.role === 'student' ? "AND a.status!='draft'" : ''} UNION ALL SELECT e.id,e.title,e.created_at,e.status,'exams' entity FROM exams e WHERE e.class_id=? ${req.user.role === 'student' ? "AND e.status IN ('published','closed','results')" : ''} ORDER BY created_at DESC LIMIT 10`,
      cls.id,
      cls.id,
    );
    res.json({
      students,
      assignments,
      submissions,
      year_status: cls.year_status,
      writable: cls.status === 'active' && cls.year_status !== 'archived',
      expected: assignments * (req.user.role === 'student' ? 1 : students),
      activity,
    });
  });
  router.get('/inbox/tasks', (req, res) => {
    const scope = classScope(req.user, 'c');
    const page = Math.max(1, Number(req.query.page) || 1);
    const own = req.user.role === 'student';
    const query = own
      ? `SELECT a.id,a.title,a.due_at date,c.name class_name,'assignments' entity FROM assignments a JOIN classes c ON c.id=a.class_id JOIN academic_years y ON y.id=c.year_id WHERE ${scope.sql} AND c.status='active' AND y.status='active' AND a.status='published' AND a.open_at<=? AND (a.allow_late=1 OR a.due_at>=?) AND NOT EXISTS(SELECT 1 FROM submissions s WHERE s.assignment_id=a.id AND s.student_id=?)`
      : `SELECT a.id,a.title,min(s.submitted_at) date,c.name class_name,'assignments' entity FROM submissions s JOIN assignments a ON a.id=s.assignment_id JOIN classes c ON c.id=a.class_id WHERE ${scope.sql} AND s.status='submitted' GROUP BY a.id`;
    const params = [...scope.params, ...(own ? [now(), now(), req.user.id] : [])];
    const total = db.get(`SELECT count(*) total FROM (${query})`, ...params)!.total;
    res.json({
      items: db.all(query + ' ORDER BY date LIMIT 25 OFFSET ?', ...params, (page - 1) * 25),
      total,
      page,
      limit: 25,
    });
  });
  router.get('/school', (_req, res) => res.json(db.get('SELECT * FROM school')));
  router.put('/school', (req, res) => {
    requireRole(req.user, 'admin');
    const data = z
      .object({
        name: z.string().trim().min(1).max(200),
        timezone: z
          .string()
          .max(100)
          .refine((v) => {
            try {
              new Intl.DateTimeFormat('en', { timeZone: v });
              return true;
            } catch {
              return false;
            }
          }),
        locale: z.enum(['en', 'ar']),
        version: z.number().int().positive(),
      })
      .parse(req.body);
    db.transaction(() => {
      updateVersion(db, 'school', 'school', data.version, {
        name: data.name,
        timezone: data.timezone,
        locale: data.locale,
      });
      db.audit(req.user.id, 'update', 'school', 'school', {}, req.requestId);
    });
    res.json({ ok: true });
  });
  router.get('/dashboard', (req, res) => {
    const scope = classScope(req.user, 'c');
    const classes = db.get(
      `SELECT count(*) n FROM classes c JOIN academic_years y ON y.id=c.year_id WHERE ${scope.sql} AND c.status='active' AND y.status='active'`,
      ...scope.params,
    )!.n;
    const assignments = db.get(
      `SELECT count(*) n FROM assignments a JOIN classes c ON c.id=a.class_id JOIN academic_years y ON y.id=c.year_id WHERE ${scope.sql} AND y.status='active' AND a.status='published'`,
      ...scope.params,
    )!.n;
    const pending =
      req.user.role === 'student'
        ? db.get(
            `SELECT count(*) n FROM assignments a JOIN classes c ON c.id=a.class_id WHERE ${scope.sql} AND c.status='active' AND c.year_id IN (SELECT id FROM academic_years WHERE status='active') AND a.status='published' AND a.open_at<=? AND NOT EXISTS(SELECT 1 FROM submissions s WHERE s.assignment_id=a.id AND s.student_id=?)`,
            ...scope.params,
            now(),
            req.user.id,
          )!.n
        : db.get(
            `SELECT count(*) n FROM submissions s JOIN assignments a ON a.id=s.assignment_id JOIN classes c ON c.id=a.class_id WHERE ${scope.sql} AND s.status='submitted'`,
            ...scope.params,
          )!.n;
    const upcoming = db.all(
      `SELECT e.id,e.title,e.opens_at,e.closes_at,c.name class_name FROM exams e JOIN classes c ON c.id=e.class_id WHERE ${scope.sql} AND c.status='active' AND c.year_id IN (SELECT id FROM academic_years WHERE status='active') AND e.status='published' AND e.closes_at>? ORDER BY e.opens_at LIMIT 5`,
      ...scope.params,
      now(),
    );
    const due = db.all(
      `SELECT a.id,a.title,a.due_at,c.name class_name FROM assignments a JOIN classes c ON c.id=a.class_id WHERE ${scope.sql} AND c.status='active' AND c.year_id IN (SELECT id FROM academic_years WHERE status='active') AND a.status='published' ${req.user.role === 'student' ? 'AND NOT EXISTS(SELECT 1 FROM submissions s WHERE s.assignment_id=a.id AND s.student_id=?)' : ''} ORDER BY a.due_at LIMIT 5`,
      ...scope.params,
      ...(req.user.role === 'student' ? [req.user.id] : []),
    );
    const announcement = entityScope(db, req.user, 'announcements');
    const announcements = db.all(
      `SELECT e.* FROM announcements e WHERE ${announcement.sql} AND e.status='published' AND e.publish_at<=? AND (e.expires_at IS NULL OR e.expires_at>?) ORDER BY e.publish_at DESC LIMIT 3`,
      ...announcement.params,
      now(),
      now(),
    );
    const timezone = db.get('SELECT timezone FROM school')!.timezone;
    const weekday = new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: timezone }).format(
      new Date(),
    );
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
    const schedule = db.all(
      `SELECT s.*,c.name class_name FROM schedules s JOIN classes c ON c.id=s.class_id JOIN terms t ON t.id=c.term_id WHERE ${scope.sql} AND s.day=? AND c.status='active' AND t.start_date<=? AND t.end_date>=? ORDER BY s.starts_at`,
      ...scope.params,
      day,
      today,
      today,
    );
    const setup = isSchoolOperator(req.user) ? schoolReadiness(db) : null;
    res.json({
      classes,
      assignments,
      pending,
      upcoming,
      due,
      announcements,
      schedule,
      setup,
      active_year: db.get("SELECT * FROM academic_years WHERE status='active'") || null,
    });
  });
  router.get('/analytics', (req, res) => {
    requireRole(req.user, 'admin', 'school_management', 'teacher');
    const scope = classScope(req.user, 'c');
    const classes = db.all(
      `SELECT c.id,c.name,(SELECT count(*) FROM enrollments WHERE class_id=c.id) students,(SELECT count(*) FROM assignments WHERE class_id=c.id AND status!='draft') assignments,(SELECT count(*) FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE a.class_id=c.id) submissions,(SELECT round(avg(s.score*100.0/a.max_score),1) FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE a.class_id=c.id AND s.status='returned') average,(SELECT count(*) FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE a.class_id=c.id AND s.status='submitted') pending FROM classes c WHERE ${scope.sql} ORDER BY c.name LIMIT 100`,
      ...scope.params,
    );
    const questions = db.all(
      `SELECT e.title,q.prompt,count(a.attempt_id) answered,round(avg(a.score*100.0/q.points),1) average FROM exam_questions q JOIN exams e ON e.id=q.exam_id JOIN classes c ON c.id=e.class_id LEFT JOIN answers a ON a.question_id=q.id WHERE ${scope.sql} AND e.status IN ('closed','results') GROUP BY q.id ORDER BY e.title,q.position LIMIT 100`,
      ...scope.params,
    );
    res.json({ classes, questions });
  });
  router.get('/search', (req, res) => {
    const q = z.string().trim().min(2).max(100).parse(req.query.q);
    const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
    const results: any[] = [];
    for (const entity of [
      'classes',
      'subjects',
      'resources',
      'assignments',
      'exams',
      'announcements',
    ]) {
      const scope = entityScope(db, req.user, entity);
      const column = ['classes', 'subjects'].includes(entity) ? 'name' : 'title';
      const items = db.all(
        `SELECT e.id,e.${column} title FROM ${entity} e WHERE ${scope.sql} AND e.${column} LIKE ? ESCAPE '\\' ORDER BY e.${column} LIMIT 6`,
        ...scope.params,
        like,
      );
      results.push(...items.map((i) => ({ ...i, entity })));
    }
    if (req.user.role === 'teacher')
      results.push(
        ...db
          .all(
            "SELECT u.id,u.name title FROM users u WHERE u.role='student' AND u.status='active' AND EXISTS(SELECT 1 FROM enrollments en JOIN teacher_assignments ta ON ta.class_id=en.class_id WHERE en.student_id=u.id AND ta.teacher_id=?) AND u.name LIKE ? ESCAPE '\\' LIMIT 6",
            req.user.id,
            like,
          )
          .map((u) => ({ ...u, entity: 'people' })),
      );
    if (isSchoolOperator(req.user))
      results.push(
        ...db
          .all(
            `SELECT id,name title,role FROM users WHERE status='active' ${req.user.role === 'school_management' ? "AND role IN ('teacher','student')" : ''} AND name LIKE ? ESCAPE '\\' LIMIT 6`,
            like,
          )
          .map((u) => ({ ...u, entity: 'people' })),
      );
    res.json(results);
  });
  router.get('/notifications', (req, res) =>
    res.json(
      paginate(db, req, 'SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC', [
        req.user.id,
      ]),
    ),
  );
  router.post('/notifications/:id/read', (req, res) => {
    assert(
      db.run(
        'UPDATE notifications SET read_at=? WHERE id=? AND user_id=?',
        now(),
        String(req.params.id),
        req.user.id,
      ).changes === 1,
      'not_found',
      404,
    );
    res.json({ ok: true });
  });
  router.get('/contacts', (req, res) => {
    let sql = "SELECT DISTINCT u.id,u.name,u.role FROM users u WHERE u.status='active' AND u.id!=?";
    const params = [req.user.id];
    if (req.user.role === 'student') {
      sql +=
        " AND (u.role IN ('admin','school_management') OR (u.role='teacher' AND EXISTS(SELECT 1 FROM teacher_assignments t JOIN enrollments e ON e.class_id=t.class_id WHERE t.teacher_id=u.id AND e.student_id=?)))";
      params.push(req.user.id);
    }
    if (req.user.role === 'teacher') {
      sql +=
        " AND (u.role IN ('admin','school_management') OR (u.role='student' AND EXISTS(SELECT 1 FROM enrollments e JOIN teacher_assignments t ON t.class_id=e.class_id WHERE e.student_id=u.id AND t.teacher_id=?)))";
      params.push(req.user.id);
    }
    if (req.query.q) {
      sql += ' AND u.name LIKE ?';
      params.push('%' + String(req.query.q).slice(0, 100) + '%');
    }
    res.json(db.all(sql + ' ORDER BY u.name LIMIT 100', ...params));
  });
  router.get('/messages', (req, res) =>
    res.json(
      paginate(
        db,
        req,
        'SELECT m.*,s.name sender_name,r.name recipient_name FROM messages m JOIN users s ON s.id=m.sender_id JOIN users r ON r.id=m.recipient_id WHERE m.sender_id=? OR m.recipient_id=? ORDER BY m.created_at DESC',
        [req.user.id, req.user.id],
      ),
    ),
  );
  router.post('/messages', (req, res) => {
    const data = z
      .object({
        recipient_id: z.string().uuid(),
        subject: z.string().trim().min(1).max(200),
        content: z.string().trim().min(1).max(10000),
      })
      .parse(req.body);
    const other = db.get(
      "SELECT id,role FROM users WHERE id=? AND status='active'",
      data.recipient_id,
    );
    assert(other, 'not_found', 404);
    if (!isSchoolOperator(req.user) && !isSchoolOperator(other as { role: string })) {
      assert(req.user.role !== other.role, 'forbidden', 403);
      const student = req.user.role === 'student' ? req.user.id : other.id,
        teacher = req.user.role === 'teacher' ? req.user.id : other.id;
      assert(
        db.get(
          'SELECT e.id FROM enrollments e JOIN teacher_assignments t ON t.class_id=e.class_id WHERE e.student_id=? AND t.teacher_id=?',
          student,
          teacher,
        ),
        'forbidden',
        403,
      );
    }
    const mid = id();
    db.insert('messages', { id: mid, sender_id: req.user.id, ...data, created_at: now() });
    res.status(201).json({ id: mid });
  });
  router.post('/messages/:id/read', (req, res) => {
    assert(
      db.run(
        'UPDATE messages SET read_at=? WHERE id=? AND recipient_id=?',
        now(),
        String(req.params.id),
        req.user.id,
      ).changes === 1,
      'not_found',
      404,
    );
    res.json({ ok: true });
  });
  router.get('/audit', (req, res) => {
    requireRole(req.user, 'admin', 'school_management');
    const where =
      req.user.role === 'admin'
        ? '1=1'
        : `a.entity_type IN (${academicAuditEntities.map(() => '?').join(',')})`;
    const params = req.user.role === 'admin' ? [] : [...academicAuditEntities];
    res.json(
      paginate(
        db,
        req,
        `SELECT a.*,u.name actor_name FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id WHERE ${where} ORDER BY a.created_at DESC,a.id`,
        params,
        50,
      ),
    );
  });
  router.get('/permissions', (req, res) => {
    requireRole(req.user, 'admin', 'school_management');
    res.json(
      db.all(
        'SELECT rp.role_id,p.* FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id ORDER BY rp.role_id,p.id',
      ),
    );
  });
  router.post('/view-as', (req, res) => {
    requireRole(req.user, 'admin');
    const { role } = z
      .object({ role: z.enum(['school_management', 'teacher', 'student']) })
      .parse(req.body);
    db.audit(req.user.id, 'view_as', 'role', role, {}, req.requestId);
    res.json({ role });
  });
  router.get('/health', (req, res) => {
    requireRole(req.user, 'admin');
    let database = false,
      storageOk = false;
    try {
      database = db.get('PRAGMA quick_check')?.quick_check === 'ok';
    } catch {
      /* report unhealthy */
    }
    try {
      accessSync(storage, constants.R_OK | constants.W_OK);
      storageOk = true;
    } catch {
      /* report unhealthy */
    }
    res.json({
      database,
      storage: storageOk,
      authentication: true,
      version: '1.0.0',
      checked_at: now(),
    });
  });
  return router;
}
