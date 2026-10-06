import { dispatchAnnouncements } from './notifications.js';
import { Router } from 'express';
import { z } from 'zod';
import { Store, now, id, type Row } from './db.js';
import { catalog } from '../shared/catalog.js';
import { requireRole } from './auth.js';
import { assert } from './errors.js';
import {
  canWrite,
  entityScope,
  getEntity,
  parseEntity,
  validateRelations,
  updateVersion,
  notifyClass,
  sharedPeople,
} from './domain.js';
export function academicRouter(db: Store) {
  const router = Router();
  router.get('/records/:entity', (req, res) => {
    const entity = String(req.params.entity);
    const def = catalog[entity];
    assert(def, 'not_found', 404);
    const scope = entityScope(db, req.user, entity);
    const params: any[] = [...scope.params];
    let where = scope.sql;
    if (req.query.class_id && def.fields.some((f) => f.key === 'class_id')) {
      where += ' AND e.class_id=?';
      params.push(String(req.query.class_id));
    }
    if (req.query.class_id && entity === 'announcements') {
      where += " AND e.audience_type='class' AND e.audience_id=?";
      params.push(String(req.query.class_id));
    }
    if (req.query.year_id && entity === 'classes') {
      where += ' AND e.year_id=?';
      params.push(String(req.query.year_id));
    }
    if (req.query.bank_id && entity === 'questions') {
      where += ' AND e.bank_id=?';
      params.push(String(req.query.bank_id));
    }
    if (req.query.q) {
      const column = def.fields.some((f) => f.key === 'name')
        ? 'name'
        : def.fields.some((f) => f.key === 'title')
          ? 'title'
          : def.fields.some((f) => f.key === 'prompt')
            ? 'prompt'
            : null;
      if (column) {
        where += ` AND e.${column} LIKE ? ESCAPE '\\'`;
        params.push(
          '%' +
            String(req.query.q)
              .slice(0, 100)
              .replace(/[\\%_]/g, '\\$&') +
            '%',
        );
      }
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const sort = def.columns.includes(String(req.query.sort))
      ? String(req.query.sort)
      : def.columns[0];
    const order = req.query.order === 'desc' ? 'DESC' : 'ASC';
    const total = db.get(`SELECT count(*) total FROM ${entity} e WHERE ${where}`, ...params)!.total;
    const labels = def.fields
      .filter((f) => f.ref)
      .map((f) => {
        const table = ['students', 'teachers'].includes(f.ref!) ? 'users' : f.ref!;
        const col = ['question_banks'].includes(table) ? 'title' : 'name';
        return `(SELECT ${col} FROM ${table} WHERE id=e.${f.key}) AS ${f.key}_label`;
      });
    const items = db.all(
      `SELECT e.*${labels.length ? ',' + labels.join(',') : ''} FROM ${entity} e WHERE ${where} ORDER BY e.${sort} ${order},e.id LIMIT ? OFFSET ?`,
      ...params,
      limit,
      (page - 1) * limit,
    );
    res.json({ items, total, page, limit });
  });
  router.get('/records/:entity/:id', (req, res) =>
    res.json(getEntity(db, req.user, String(req.params.entity), String(req.params.id))),
  );
  router.post('/records/:entity', (req, res) => {
    const entity = String(req.params.entity);
    const data = parseEntity(entity, req.body);
    canWrite(db, req.user, entity, data);
    const row = db.transaction(() => {
      validateRelations(db, req.user, entity, data);
      const record: Row = { id: id(), ...data };
      if (
        [
          'lessons',
          'resources',
          'assignments',
          'exams',
          'question_banks',
          'announcements',
        ].includes(entity)
      )
        Object.assign(record, { created_by: req.user.id, created_at: now() });
      if (entity === 'enrollments') record.created_at = now();
      db.insert(entity, record);
      db.audit(req.user.id, 'create', entity, record.id, {}, req.requestId);
      return db.get(`SELECT * FROM ${entity} WHERE id=?`, record.id);
    });
    res.status(201).json(row);
  });
  router.put('/records/:entity/:id', (req, res) => {
    const entity = String(req.params.entity),
      target = String(req.params.id);
    const { version, ...body } = z.record(z.string(), z.unknown()).parse(req.body);
    z.number().int().positive().parse(version);
    const data = parseEntity(entity, body);
    const result = db.transaction(() => {
      const old = getEntity(db, req.user, entity, target);
      canWrite(db, req.user, entity, old);
      canWrite(db, req.user, entity, data);
      if (['exams', 'assignments', 'resources', 'lessons', 'announcements'].includes(entity))
        assert(old.status === 'draft', 'published_locked', 409);
      if (['academic_years', 'classes'].includes(entity))
        assert(old.status !== 'archived', 'academic_archived', 409);
      // Structural records become immutable after their dependent records exist.
      const dependents: Record<string, [string, string]> = {
        academic_years: ['terms', 'year_id'],
        terms: ['classes', 'term_id'],
        classes: ['enrollments', 'class_id'],
        sections: ['classes', 'section_id'],
      };
      if (dependents[entity]) {
        const [table, column] = dependents[entity];
        if (db.get(`SELECT id FROM ${table} WHERE ${column}=? LIMIT 1`, target))
          assert(
            Object.keys(data).every((k) => k === 'name' || data[k] === old[k]),
            'relationships_locked',
            409,
          );
      }
      if (
        entity === 'classes' &&
        ['teacher_assignments', 'assignments', 'exams', 'resources', 'schedules', 'lessons'].some(
          (table) => db.get(`SELECT id FROM ${table} WHERE class_id=? LIMIT 1`, target),
        )
      )
        assert(
          Object.keys(data).every((k) => k === 'name' || data[k] === old[k]),
          'relationships_locked',
          409,
        );
      if (entity === 'teacher_assignments' || entity === 'enrollments')
        assert(false, 'relationships_locked', 409);
      validateRelations(db, req.user, entity, { ...data, id: target });
      updateVersion(db, entity, target, Number(version), data);
      db.audit(req.user.id, 'update', entity, target, {}, req.requestId);
      return db.get(`SELECT * FROM ${entity} WHERE id=?`, target);
    });
    res.json(result);
  });
  router.post('/records/:entity/:id/transition', (req, res) => {
    const entity = String(req.params.entity),
      target = String(req.params.id);
    const { action, version } = z
      .object({ action: z.string(), version: z.number().int().positive() })
      .parse(req.body);
    const result = db.transaction(() => {
      const row = getEntity(db, req.user, entity, target);
      canWrite(db, req.user, entity, row);
      let status: string | undefined;
      if (entity === 'academic_years') {
        if (action === 'activate') {
          assert(row.status === 'planned', 'invalid_transition', 409);
          assert(
            !db.get("SELECT id FROM academic_years WHERE status='active'"),
            'active_year_exists',
            409,
          );
          status = 'active';
        }
        if (action === 'archive') {
          assert(row.status === 'active' || row.status === 'planned', 'invalid_transition', 409);
          assert(
            !db.get(
              "SELECT a.id FROM attempts a JOIN exams e ON e.id=a.exam_id JOIN classes c ON c.id=e.class_id WHERE c.year_id=? AND a.status='in_progress'",
              target,
            ),
            'active_attempts',
            409,
          );
          assert(
            !db.get(
              "SELECT e.id FROM exams e JOIN classes c ON c.id=e.class_id WHERE c.year_id=? AND e.status IN ('scheduled','published')",
              target,
            ),
            'open_assessments',
            409,
          );
          status = 'archived';
        }
      }
      if (entity === 'classes' && action === 'archive') {
        assert(row.status === 'active', 'invalid_transition', 409);
        assert(
          !db.get(
            "SELECT a.id FROM attempts a JOIN exams e ON e.id=a.exam_id WHERE e.class_id=? AND a.status='in_progress'",
            target,
          ),
          'active_attempts',
          409,
        );
        assert(
          !db.get(
            "SELECT id FROM exams WHERE class_id=? AND status IN ('scheduled','published')",
            target,
          ),
          'open_assessments',
          409,
        );
        status = 'archived';
      }
      if (
        ['resources', 'lessons', 'assignments', 'announcements'].includes(entity) &&
        action === 'publish'
      ) {
        assert(row.status === 'draft', 'invalid_transition', 409);
        status = 'published';
      }
      if (entity === 'assignments' && action === 'complete') {
        assert(row.status === 'published', 'invalid_transition', 409);
        assert(
          !db.get(
            "SELECT id FROM submissions WHERE assignment_id=? AND status!='returned'",
            target,
          ),
          'grading_incomplete',
          409,
        );
        status = 'complete';
      }
      if (['resources', 'announcements'].includes(entity) && action === 'archive') {
        assert(row.status !== 'archived', 'invalid_transition', 409);
        status = 'archived';
      }
      if (entity === 'exams') {
        const allowed: Record<string, [string[], string]> = {
          review: [['draft'], 'review'],
          revise: [['review', 'scheduled'], 'draft'],
          schedule: [['review'], 'scheduled'],
          publish: [['review', 'scheduled'], 'published'],
          close: [['published'], 'closed'],
          release: [['closed'], 'results'],
        };
        const rule = allowed[action];
        assert(rule && rule[0].includes(row.status), 'invalid_transition', 409);
        status = rule[1];
        if (['review', 'schedule', 'publish'].includes(action)) {
          assert(
            db.get('SELECT id FROM exam_questions WHERE exam_id=?', target),
            'questions_required',
          );
          assert(row.closes_at > now(), 'exam_expired');
        }
        if (action === 'schedule' || action === 'publish') {
          for (const other of db.all(
            "SELECT id,class_id FROM exams WHERE id!=? AND status IN ('scheduled','published') AND opens_at<? AND closes_at>?",
            target,
            row.closes_at,
            row.opens_at,
          ))
            assert(
              !(other.class_id === row.class_id || sharedPeople(db, row.class_id, other.class_id)),
              'exam_conflict',
              409,
            );
        }
        if (action === 'close') {
          for (const attempt of db.all(
            "SELECT id FROM attempts WHERE exam_id=? AND status='in_progress'",
            target,
          ))
            finalizeAttempt(db, attempt.id);
        }
        if (action === 'release')
          assert(
            !db.get("SELECT id FROM attempts WHERE exam_id=? AND status!='graded'", target),
            'grading_incomplete',
            409,
          );
      }
      if (action === 'archive' && ['academic_years', 'classes'].includes(entity)) {
        const match = entity === 'academic_years' ? 'c.year_id=?' : 'c.id=?';
        assert(
          !db.get(
            `SELECT s.id FROM submissions s JOIN assignments a ON a.id=s.assignment_id JOIN classes c ON c.id=a.class_id WHERE ${match} AND s.status!='returned' LIMIT 1`,
            target,
          ),
          'grading_incomplete',
          409,
        );
        assert(
          !db.get(
            `SELECT a.id FROM attempts a JOIN exams e ON e.id=a.exam_id JOIN classes c ON c.id=e.class_id WHERE ${match} AND e.status!='results' LIMIT 1`,
            target,
          ),
          'unreleased_results',
          409,
        );
      }
      assert(status, 'invalid_transition', 409);
      updateVersion(db, entity, target, version, { status });
      db.audit(req.user.id, action, entity, target, {}, req.requestId);
      if (row.class_id && ['publish', 'release'].includes(action))
        notifyClass(db, row.class_id, row.title, entity, target);
      if (entity === 'announcements' && action === 'publish') dispatchAnnouncements(db);
      return db.get(`SELECT * FROM ${entity} WHERE id=?`, target);
    });
    res.json(result);
  });
  router.post('/years/:id/rollover', (req, res) => {
    requireRole(req.user, 'admin', 'school_management');
    const data = z
      .object({
        name: z.string().min(1).max(100),
        start_date: z.iso.date(),
        end_date: z.iso.date(),
      })
      .parse(req.body);
    assert(data.start_date < data.end_date, 'date_range');
    const newId = db.transaction(() => {
      const old = db.get('SELECT * FROM academic_years WHERE id=?', String(req.params.id));
      assert(old, 'not_found', 404);
      const next = id();
      db.insert('academic_years', { id: next, ...data });
      const dayShift = Date.parse(data.start_date) - Date.parse(old.start_date);
      const terms = new Map<string, string>();
      for (const term of db.all('SELECT * FROM terms WHERE year_id=?', old.id)) {
        const tid = id();
        const start = new Date(Date.parse(term.start_date) + dayShift).toISOString().slice(0, 10);
        const end = new Date(Date.parse(term.end_date) + dayShift).toISOString().slice(0, 10);
        assert(start >= data.start_date && end <= data.end_date, 'date_range');
        db.insert('terms', {
          id: tid,
          year_id: next,
          name: term.name,
          start_date: start,
          end_date: end,
        });
        terms.set(term.id, tid);
      }
      for (const cls of db.all('SELECT * FROM classes WHERE year_id=?', old.id)) {
        const cid = id();
        db.insert('classes', {
          id: cid,
          name: cls.name,
          year_id: next,
          term_id: terms.get(cls.term_id)!,
          section_id: cls.section_id,
          track_id: cls.track_id,
          subject_id: cls.subject_id,
        });
      }
      db.audit(req.user.id, 'rollover', 'academic_years', next, { source: old.id }, req.requestId);
      return next;
    });
    res.status(201).json({ id: newId });
  });
  return router;
}
export function finalizeAttempt(db: Store, attemptId: string) {
  const attempt = db.get('SELECT * FROM attempts WHERE id=?', attemptId);
  assert(attempt, 'not_found', 404);
  if (attempt.status !== 'in_progress') return;
  const questions = db.all('SELECT * FROM exam_questions WHERE exam_id=?', attempt.exam_id);
  let pending = false;
  for (const q of questions) {
    const answer = db.get(
      'SELECT * FROM answers WHERE attempt_id=? AND question_id=?',
      attemptId,
      q.id,
    );
    const value = answer?.value || '';
    let score: number | null = 0;
    if (value) {
      if (['multiple_choice', 'true_false'].includes(q.type))
        score = value === q.correct_answer ? q.points : 0;
      else {
        score = null;
        pending = true;
      }
    }
    db.run(
      'INSERT INTO answers(attempt_id,question_id,value,score) VALUES(?,?,?,?) ON CONFLICT(attempt_id,question_id) DO UPDATE SET score=excluded.score',
      attemptId,
      q.id,
      value,
      score,
    );
  }
  db.run(
    'UPDATE attempts SET status=?,submitted_at=?,version=version+1 WHERE id=?',
    pending ? 'submitted' : 'graded',
    now(),
    attemptId,
  );
}
