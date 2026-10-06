import { Router } from 'express';
import { z } from 'zod';
import { Store, now, id } from './db.js';
import { requireRole, verifyPassword } from './auth.js';
import { assert } from './errors.js';
import { updateVersion } from './domain.js';
import { roles } from '../shared/roles.js';

export function accountsRouter(db: Store) {
  const router = Router();
  router.post('/people/:id/role', async (req, res) => {
    requireRole(req.user, 'admin');
    const data = z
      .object({
        role: z.enum(roles),
        version: z.number().int().positive(),
        current_password: z.string().min(1).max(128),
      })
      .strict()
      .parse(req.body);
    const actor = db.get('SELECT password_hash FROM users WHERE id=?', req.user.id)!;
    assert(
      await verifyPassword(data.current_password, actor.password_hash),
      'invalid_credentials',
      400,
    );
    const uid = String(req.params.id);
    assert(uid !== req.user.id, 'cannot_change_own_role', 409);
    db.transaction(() => {
      assert(
        db.get("SELECT id FROM users WHERE id=? AND role='admin' AND status='active'", req.user.id),
        'forbidden',
        403,
      );
      const target = db.get('SELECT * FROM users WHERE id=?', uid);
      assert(target, 'not_found', 404);
      assert(target.status === 'active', 'account_archived', 409);
      assert(
        target.auth_provider !== 'microsoft' || data.role === 'student',
        'microsoft_student_role',
        409,
      );
      if (target.role !== data.role) {
        if (target.role === 'admin')
          assert(
            db.get("SELECT count(*) n FROM users WHERE role='admin' AND status='active'")!.n > 1,
            'last_admin',
            409,
          );
        // Preserve academic identity; don't turn an active enrolled learner into staff
        // or leave a teaching assignment pointing at a non-teacher account.
        if (['teacher', 'student'].includes(target.role)) {
          const table = target.role === 'teacher' ? 'teacher_assignments' : 'enrollments';
          const column = target.role === 'teacher' ? 'teacher_id' : 'student_id';
          assert(
            !db.get(
              `SELECT m.id FROM ${table} m JOIN classes c ON c.id=m.class_id JOIN academic_years y ON y.id=c.year_id WHERE m.${column}=? AND c.status='active' AND y.status!='archived'`,
              uid,
            ),
            'role_has_active_classes',
            409,
          );
        }
      }
      if (data.role === 'teacher' && target.role !== 'teacher')
        db.run('DELETE FROM teaching_setup_completions WHERE teacher_id=?', uid);
      updateVersion(db, 'users', uid, data.version, {
        role: data.role,
        teacher_setup_required:
          data.role === 'teacher'
            ? target.role === 'teacher'
              ? target.teacher_setup_required
              : 1
            : 0,
      });
      db.run('DELETE FROM sessions WHERE user_id=?', uid);
      db.audit(
        req.user.id,
        'role_changed',
        'users',
        uid,
        { previous_role: target.role, role: data.role },
        req.requestId,
      );
    });
    res.json({ ok: true });
  });
  router.post('/people/microsoft', (req, res) => {
    requireRole(req.user, 'admin');
    const data = z
      .object({
        name: z.string().trim().min(1).max(200),
        email: z.email().max(254),
        object_id: z.uuid(),
      })
      .strict()
      .parse(req.body);
    const tenant = z.uuid().safeParse(process.env.MICROSOFT_TENANT_ID);
    assert(tenant.success, 'microsoft_unconfigured', 409);
    const uid = id();
    db.transaction(() => {
      db.insert('users', {
        id: uid,
        name: data.name,
        email: data.email.toLowerCase(),
        role: 'student',
        auth_provider: 'microsoft',
        password_hash: '',
        must_change_password: 0,
        created_at: now(),
      });
      db.insert('external_identities', {
        tenant_id: tenant.data.toLowerCase(),
        object_id: data.object_id.toLowerCase(),
        user_id: uid,
        created_at: now(),
      });
      db.audit(req.user.id, 'microsoft_registration', 'users', uid, {}, req.requestId);
    });
    res.status(201).json({ id: uid });
  });
  return router;
}
