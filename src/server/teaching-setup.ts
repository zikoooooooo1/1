import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { Store, id, now } from './db.js';
import { assert } from './errors.js';
import { classAccess, requireRole, verifyPassword } from './auth.js';
import { validateRelations } from './domain.js';
import { paginate } from './pagination.js';

export function teachingSetupRouter(db: Store) {
  const router = Router();
  router.get('/rosters', (req, res) => {
    requireRole(req.user, 'admin');
    res.json({
      items:
        db.all(`SELECT b.*, (SELECT count(*) FROM roster_memberships m WHERE m.batch_id=b.id) students,
        (SELECT count(*) FROM roster_groups g WHERE g.batch_id=b.id) groups FROM roster_batches b ORDER BY b.created_at DESC`),
      years: db.all("SELECT id,name FROM academic_years WHERE status='active'"),
      terms: db.all(
        "SELECT t.id,t.name,t.year_id FROM terms t JOIN academic_years y ON y.id=t.year_id WHERE y.status='active' ORDER BY t.start_date",
      ),
    });
  });
  router.post('/rosters/:id/teacher-credentials', async (req, res) => {
    requireRole(req.user, 'admin');
    const batchId = z.uuid().parse(req.params.id);
    const { current_password } = z
      .object({ current_password: z.string().min(1).max(128) })
      .strict()
      .parse(req.body);
    const actor = db.get('SELECT password_hash FROM users WHERE id=?', req.user.id)!;
    assert(await verifyPassword(current_password, actor.password_hash), 'invalid_credentials', 400);
    assert(db.get('SELECT id FROM roster_batches WHERE id=?', batchId), 'not_found', 404);
    const file = resolve(
      process.env.STORAGE_PATH || 'data/files',
      '..',
      'account-handoffs',
      batchId + '.json',
    );
    assert(existsSync(file), 'credentials_unavailable', 404);
    res.set('Cache-Control', 'no-store');
    db.audit(
      req.user.id,
      'teacher_credentials_download',
      'roster_batches',
      batchId,
      {},
      req.requestId,
    );
    res.json({ credentials: JSON.parse(readFileSync(file, 'utf8')) });
  });
  router.post('/rosters/:id/activate', (req, res) => {
    requireRole(req.user, 'admin');
    const data = z.object({ year_id: z.uuid(), term_id: z.uuid() }).strict().parse(req.body);
    db.transaction(() => {
      const batch = db.get('SELECT * FROM roster_batches WHERE id=?', String(req.params.id));
      assert(batch, 'not_found', 404);
      if (
        batch.status === 'active' &&
        batch.year_id === data.year_id &&
        batch.term_id === data.term_id
      )
        return;
      assert(batch.status === 'pending', 'roster_already_activated', 409);
      assert(
        db.get(
          "SELECT t.id FROM terms t JOIN academic_years y ON y.id=t.year_id WHERE t.id=? AND y.id=? AND y.status='active' AND t.start_date>=y.start_date AND t.end_date<=y.end_date",
          data.term_id,
          data.year_id,
        ),
        'invalid_academic_context',
        409,
      );
      assert(
        !db.get("SELECT id FROM roster_batches WHERE status='active'"),
        'active_roster_exists',
        409,
      );
      db.run(
        "UPDATE roster_batches SET year_id=?,term_id=?,status='active' WHERE id=?",
        data.year_id,
        data.term_id,
        batch.id,
      );
      db.audit(req.user.id, 'roster_activated', 'roster_batches', batch.id, data, req.requestId);
    });
    res.json({ ok: true });
  });
  router.get('/teaching-setup', (req, res) => {
    requireRole(req.user, 'teacher');
    const batch = db.get(
      "SELECT b.id,b.label FROM roster_batches b JOIN academic_years y ON y.id=b.year_id WHERE b.status='active' AND y.status='active'",
    );
    res.json({
      batch: batch || null,
      subjects: db.all('SELECT id,name,code FROM subjects ORDER BY name'),
      groups: batch
        ? db.all(
            `SELECT g.id,g.code,g.grade_level,t.name track,
        (SELECT count(*) FROM roster_memberships m JOIN users u ON u.id=m.student_id WHERE m.group_id=g.id AND u.status='active') students
        FROM roster_groups g LEFT JOIN tracks t ON t.id=g.track_id WHERE g.batch_id=? ORDER BY g.grade_level,g.code`,
            batch.id,
          )
        : [],
    });
  });
  router.post('/teaching-setup', (req, res) => {
    requireRole(req.user, 'teacher');
    const data = z
      .object({
        batch_id: z.uuid(),
        selections: z
          .array(
            z
              .object({ subject_id: z.uuid(), group_ids: z.array(z.uuid()).min(1).max(40) })
              .strict(),
          )
          .min(1)
          .max(20),
      })
      .strict()
      .parse(req.body);
    assert(
      new Set(data.selections.map((s) => s.subject_id)).size === data.selections.length,
      'duplicate',
      400,
    );
    assert(
      data.selections.reduce((sum, s) => sum + s.group_ids.length, 0) <= 100,
      'selection_limit',
    );
    const result = db.transaction(() => {
      const completed = db.get(
        'SELECT class_ids FROM teaching_setup_completions WHERE teacher_id=?',
        req.user.id,
      );
      if (completed) return { class_ids: JSON.parse(completed.class_ids) as string[] };
      assert(
        db.get(
          "SELECT id FROM users WHERE id=? AND role='teacher' AND status='active' AND teacher_setup_required=1",
          req.user.id,
        ),
        'setup_already_complete',
        409,
      );
      const batch = db.get(
        "SELECT b.* FROM roster_batches b JOIN academic_years y ON y.id=b.year_id JOIN terms t ON t.id=b.term_id AND t.year_id=y.id WHERE b.id=? AND b.status='active' AND y.status='active'",
        data.batch_id,
      );
      assert(batch, 'roster_not_ready', 409);
      const classIds: string[] = [];
      for (const selection of data.selections) {
        const subject = db.get(
          'SELECT id,name,code FROM subjects WHERE id=?',
          selection.subject_id,
        );
        assert(subject, 'invalid_subject');
        assert(new Set(selection.group_ids).size === selection.group_ids.length, 'duplicate');
        for (const groupId of selection.group_ids) {
          const group = db.get(
            'SELECT * FROM roster_groups WHERE id=? AND batch_id=?',
            groupId,
            batch.id,
          );
          assert(group, 'invalid_roster_group', 403);
          let link = db.get(
            'SELECT class_id FROM roster_classes WHERE group_id=? AND subject_id=?',
            groupId,
            subject.id,
          );
          if (!link) {
            const classId = id();
            db.insert('classes', {
              id: classId,
              name: `${subject.name} · ${group.code} · ${batch.label}`,
              year_id: batch.year_id,
              term_id: batch.term_id,
              section_id: group.section_id,
              track_id: group.track_id,
              subject_id: subject.id,
            });
            db.insert('roster_classes', {
              group_id: groupId,
              subject_id: subject.id,
              class_id: classId,
            });
            link = { class_id: classId };
          }
          assert(
            db.get(
              "SELECT id FROM classes WHERE id=? AND status='active' AND year_id=? AND term_id=? AND subject_id=? AND section_id=? AND track_id IS ?",
              link.class_id,
              batch.year_id,
              batch.term_id,
              subject.id,
              group.section_id,
              group.track_id,
            ),
            'academic_archived',
            409,
          );
          if (
            !db.get(
              'SELECT id FROM teacher_assignments WHERE teacher_id=? AND class_id=?',
              req.user.id,
              link.class_id,
            )
          ) {
            const membership = { class_id: link.class_id, teacher_id: req.user.id };
            validateRelations(db, req.user, 'teacher_assignments', membership);
            db.insert('teacher_assignments', { id: id(), ...membership });
          }
          for (const student of db.all(
            "SELECT m.student_id FROM roster_memberships m JOIN users u ON u.id=m.student_id WHERE m.group_id=? AND m.batch_id=? AND u.role='student' AND u.status='active'",
            groupId,
            batch.id,
          )) {
            if (
              !db.get(
                'SELECT id FROM enrollments WHERE student_id=? AND class_id=?',
                student.student_id,
                link.class_id,
              )
            ) {
              const membership = { class_id: link.class_id, student_id: student.student_id };
              validateRelations(db, req.user, 'enrollments', membership);
              db.insert('enrollments', { id: id(), ...membership, created_at: now() });
            }
          }
          classIds.push(link.class_id);
        }
      }
      db.insert('teaching_setup_completions', {
        teacher_id: req.user.id,
        batch_id: batch.id,
        class_ids: JSON.stringify(classIds),
        completed_at: now(),
      });
      db.run('UPDATE users SET teacher_setup_required=0,version=version+1 WHERE id=?', req.user.id);
      db.audit(
        req.user.id,
        'teaching_setup_completed',
        'users',
        req.user.id,
        { batch_id: batch.id, class_ids: classIds },
        req.requestId,
      );
      return { class_ids: classIds };
    });
    res.json(result);
  });
  router.get('/classes/:id/roster', (req, res) => {
    requireRole(req.user, 'admin', 'school_management', 'teacher');
    classAccess(db, req.user, String(req.params.id));
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
        `SELECT u.id,u.name,u.name_ar,u.name_en,u.student_number FROM enrollments e JOIN users u ON u.id=e.student_id
      WHERE e.class_id=? AND u.status='active' AND (u.name LIKE ? ESCAPE '\\' OR u.name_ar LIKE ? ESCAPE '\\' OR u.student_number LIKE ? ESCAPE '\\') ORDER BY u.name,u.id`,
        [String(req.params.id), query, query, query],
      ),
    );
  });
  return router;
}
