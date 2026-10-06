import { Router } from 'express';
import { z } from 'zod';
import { Store, id, now } from './db.js';
import { classAccess, hashPassword, requireRole } from './auth.js';
import { assert } from './errors.js';
import { validateRelations } from './domain.js';
import { paginate } from './pagination.js';
import { personSchema } from './people.js';

const classIds = z
  .array(z.uuid())
  .min(1)
  .max(100)
  .refine((v) => new Set(v).size === v.length);
export function teachersRouter(db: Store) {
  const router = Router();
  router.get('/teaching-classes', (req, res) => {
    requireRole(req.user, 'admin', 'school_management');
    const query =
      '%' +
      String(req.query.q || '')
        .slice(0, 100)
        .replace(/[\\%_]/g, '\\$&') +
      '%';
    res.json(
      paginate(
        db,
        req,
        `SELECT c.id,c.name,g.name grade,s.name section,tr.name track,su.name subject,y.name academic_year,t.name term
      FROM classes c JOIN sections s ON s.id=c.section_id JOIN grades g ON g.id=s.grade_id
      LEFT JOIN tracks tr ON tr.id=c.track_id JOIN subjects su ON su.id=c.subject_id
      JOIN academic_years y ON y.id=c.year_id JOIN terms t ON t.id=c.term_id
      WHERE c.status='active' AND y.status!='archived' AND
      (c.name||' '||g.name||' '||s.name||' '||coalesce(tr.name,'')||' '||su.name||' '||y.name||' '||t.name) LIKE ? ESCAPE '\\'
      ORDER BY y.start_date DESC,g.name,s.name,c.name,c.id`,
        [query],
      ),
    );
  });
  const assign = (req: Parameters<typeof requireRole>[0], teacherId: string, classes: string[]) => {
    for (const classId of classes) {
      classAccess(db, req, classId, true);
      if (
        db.get(
          'SELECT id FROM teacher_assignments WHERE teacher_id=? AND class_id=?',
          teacherId,
          classId,
        )
      )
        continue;
      const row = { class_id: classId, teacher_id: teacherId };
      validateRelations(db, req, 'teacher_assignments', row);
      db.insert('teacher_assignments', { id: id(), ...row });
    }
  };
  router.post('/teachers', async (req, res) => {
    requireRole(req.user, 'admin');
    const data = personSchema.omit({ role: true }).extend({ class_ids: classIds }).parse(req.body);
    const hash = await hashPassword(data.password);
    const uid = id();
    db.transaction(() => {
      db.insert('users', {
        id: uid,
        name: data.name,
        email: data.email,
        role: 'teacher',
        password_hash: hash,
        must_change_password: 1,
        created_at: now(),
      });
      assign(req.user, uid, data.class_ids);
      db.audit(
        req.user.id,
        'teacher_onboarding',
        'users',
        uid,
        { class_ids: data.class_ids },
        req.requestId,
      );
    });
    res.status(201).json({ id: uid });
  });
  router.post('/teachers/:id/assignments', (req, res) => {
    requireRole(req.user, 'admin', 'school_management');
    const { class_ids } = z.object({ class_ids: classIds }).strict().parse(req.body);
    const uid = String(req.params.id);
    db.transaction(() => {
      assert(
        db.get("SELECT id FROM users WHERE id=? AND role='teacher' AND status='active'", uid),
        'not_found',
        404,
      );
      assign(req.user, uid, class_ids);
      db.audit(req.user.id, 'teacher_assignment', 'users', uid, { class_ids }, req.requestId);
    });
    res.json({ ok: true });
  });
  return router;
}
