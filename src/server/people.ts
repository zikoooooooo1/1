import { roles, isSchoolOperator } from '../shared/roles.js';
import { Router } from 'express';
import { z } from 'zod';
import { Store, now, id } from './db.js';
import { assert } from './errors.js';
import { digest, hashPassword, verifyPassword, requireRole } from './auth.js';
import { updateVersion } from './domain.js';
export const personSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    role: z.enum(roles),
    password: z.string().min(12).max(128),
  })
  .strict();
export function parseCSV(text: string): string[][] {
  assert(text.length <= 2_000_000, 'file_too_large', 413);
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false,
    closedQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else field += ch;
    } else if (ch === ',') {
      row.push(field);
      field = '';
      closedQuote = false;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      field = '';
      closedQuote = false;
    } else if (ch === '"') {
      assert(!closedQuote && field === '', 'invalid_csv');
      quoted = true;
    } else {
      assert(!closedQuote, 'invalid_csv');
      field += ch;
    }
  }
  assert(!quoted, 'invalid_csv');
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  assert(rows.length >= 2 && rows.length <= 501, 'import_limit');
  const cols = rows[0].length;
  assert(
    rows.every((r) => r.length === cols),
    'invalid_csv',
  );
  return rows;
}
export function peopleRouter(db: Store) {
  const router = Router();
  router.get('/people', (req, res) => {
    const user = req.user;
    const params: string[] = [];
    let where = "u.status='active'";
    if (user.role === 'school_management') {
      where += " AND (u.role IN ('teacher','student') OR u.id=?)";
      params.push(user.id);
    }
    if (user.role === 'teacher') {
      where +=
        " AND (u.id=? OR (u.role='student' AND EXISTS(SELECT 1 FROM enrollments e JOIN teacher_assignments t ON t.class_id=e.class_id WHERE e.student_id=u.id AND t.teacher_id=?)))";
      params.push(user.id, user.id);
    }
    if (user.role === 'student') {
      where += ' AND u.id=?';
      params.push(user.id);
    }
    if (req.query.role) {
      where += ' AND u.role=?';
      params.push(String(req.query.role));
    }
    if (req.query.status === 'archived' && isSchoolOperator(user))
      where = where.replace("u.status='active'", "u.status='archived'");
    if (req.query.q) {
      where +=
        " AND (u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR u.login_id LIKE ? ESCAPE '\\' OR u.name_ar LIKE ? ESCAPE '\\')";
      const q =
        '%' +
        String(req.query.q)
          .slice(0, 100)
          .replace(/[\\%_]/g, '\\$&') +
        '%';
      params.push(q, q, q, q);
    }
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25)),
      page = Math.max(1, Number(req.query.page) || 1);
    const total = db.get(`SELECT count(*) total FROM users u WHERE ${where}`, ...params)!.total;
    const items = db.all(
      `SELECT u.id,u.name,u.name_ar,u.name_en,u.student_number,u.login_id,${isSchoolOperator(user) ? 'u.email,u.auth_provider,' : ''}u.role,u.status,u.created_at,u.version FROM users u WHERE ${where} ORDER BY u.name,u.id LIMIT ? OFFSET ?`,
      ...params,
      limit,
      (page - 1) * limit,
    );
    res.json({ items, total, page, limit });
  });
  router.post('/people', async (req, res) => {
    requireRole(req.user, 'admin');
    const data = personSchema.parse(req.body);
    assert(!db.get('SELECT id FROM users WHERE email=?', data.email), 'duplicate', 409);
    const hash = await hashPassword(data.password);
    const uid = id();
    db.transaction(() => {
      db.insert('users', {
        id: uid,
        name: data.name,
        email: data.email,
        role: data.role,
        teacher_setup_required: data.role === 'teacher' ? 1 : 0,
        password_hash: hash,
        must_change_password: 1,
        created_at: now(),
      });
      db.audit(req.user.id, 'create', 'users', uid, { role: data.role }, req.requestId);
    });
    res.status(201).json({ id: uid });
  });
  router.put('/people/:id', async (req, res) => {
    requireRole(req.user, 'admin');
    const data = z
      .object({
        name: z.string().trim().min(1).max(200),
        email: z
          .union([z.email().max(254), z.literal(''), z.null()])
          .transform((v) => v?.toLowerCase() || null),
        version: z.number().int().positive(),
      })
      .parse(req.body);
    db.transaction(() => {
      updateVersion(db, 'users', String(req.params.id), data.version, {
        name: data.name,
        email: data.email,
      });
      db.audit(req.user.id, 'update', 'users', String(req.params.id), {}, req.requestId);
    });
    res.json({ ok: true });
  });
  router.post('/people/:id/password', async (req, res) => {
    requireRole(req.user, 'admin');
    const data = z
      .object({ current_password: z.string().max(128), password: z.string().min(12).max(128) })
      .parse(req.body);
    const actor = db.get('SELECT password_hash FROM users WHERE id=?', req.user.id)!;
    assert(
      await verifyPassword(data.current_password, actor.password_hash),
      'invalid_credentials',
      400,
    );
    const target = String(req.params.id);
    const account = db.get('SELECT id,auth_provider FROM users WHERE id=?', target);
    assert(account, 'not_found', 404);
    assert(account.auth_provider === 'password', 'microsoft_required', 403);
    assert(target !== req.user.id, 'use_password_settings');
    const hash = await hashPassword(data.password);
    db.transaction(() => {
      db.run(
        'UPDATE users SET password_hash=?,must_change_password=1,version=version+1 WHERE id=?',
        hash,
        target,
      );
      db.run('DELETE FROM sessions WHERE user_id=?', target);
      db.audit(req.user.id, 'password_reset', 'users', target, {}, req.requestId);
    });
    res.json({ ok: true });
  });
  router.post('/people/:id/archive', (req, res) => {
    requireRole(req.user, 'admin');
    const { version } = z.object({ version: z.number().int().positive() }).parse(req.body);
    const target = String(req.params.id);
    assert(target !== req.user.id, 'cannot_archive_self');
    db.transaction(() => {
      const person = db.get('SELECT * FROM users WHERE id=?', target);
      assert(person, 'not_found', 404);
      if (person.role === 'admin')
        assert(
          db.get("SELECT count(*) n FROM users WHERE role='admin' AND status='active'")!.n > 1,
          'last_admin',
        );
      updateVersion(db, 'users', target, version, { status: 'archived' });
      db.run('DELETE FROM sessions WHERE user_id=?', target);
      db.audit(req.user.id, 'archive', 'users', target, {}, req.requestId);
    });
    res.json({ ok: true });
  });
  router.post('/people/:id/restore', (req, res) => {
    requireRole(req.user, 'admin');
    const { version } = z.object({ version: z.number().int().positive() }).parse(req.body);
    db.transaction(() => {
      updateVersion(db, 'users', String(req.params.id), version, { status: 'active' });
      db.audit(req.user.id, 'restore', 'users', String(req.params.id), {}, req.requestId);
    });
    res.json({ ok: true });
  });
  router.get('/people/export', (req, res) => {
    requireRole(req.user, 'admin');
    const rows = db.all('SELECT name,email,role,status FROM users ORDER BY name');
    const cell = (value: string | null) => {
      const v = value || '';
      return '"' + (/^[=+\-@\t\r]/.test(v) ? "'" : '') + v.replace(/"/g, '""') + '"';
    };
    res
      .type('text/csv')
      .attachment('claso-people.csv')
      .send(
        'name,email,role,status\r\n' +
          rows.map((row) => Object.values(row).map(cell).join(',')).join('\r\n'),
      );
    db.audit(req.user.id, 'export', 'users', 'all', {}, req.requestId);
  });
  router.post('/imports/preview', async (req, res) => {
    requireRole(req.user, 'admin');
    const { csv, mapping } = z
      .object({
        csv: z.string().max(2_000_000),
        mapping: z.record(z.string(), z.string()).optional(),
      })
      .parse(req.body);
    const rows = parseCSV(csv.replace(/^\uFEFF/, ''));
    const headers = rows.shift()!;
    assert(new Set(headers).size === headers.length, 'duplicate_columns');
    if (!mapping) return res.json({ headers, sample: rows.slice(0, 5), count: rows.length });
    const seen = new Set<string>(),
      errors: { row: number; code: string }[] = [],
      safe: any[] = [],
      preview: any[] = [];
    for (const [index, row] of rows.entries()) {
      const object: Record<string, string> = {};
      for (const key of ['name', 'email', 'role', 'password'])
        object[key] = row[headers.indexOf(mapping[key])] || '';
      const parsed = personSchema.safeParse(object);
      if (!parsed.success) {
        errors.push({ row: index + 2, code: 'invalid_person' });
        continue;
      }
      const value = parsed.data;
      if (seen.has(value.email) || db.get('SELECT id FROM users WHERE email=?', value.email)) {
        errors.push({ row: index + 2, code: 'duplicate_email' });
        continue;
      }
      seen.add(value.email);
      const { password, ...person } = value;
      safe.push({ ...person, password_hash: await hashPassword(password) });
      preview.push(person);
    }
    let token: string | null = null;
    db.run('DELETE FROM imports WHERE expires_at<?', now());
    if (!errors.length) {
      const fingerprint = digest(
        req.user.id +
          JSON.stringify(safe.map(({ password_hash: _hash, ...person }) => person)) +
          csv,
      );
      const existing = db.get(
        'SELECT id,committed_at FROM imports WHERE fingerprint=?',
        fingerprint,
      );
      if (existing) token = existing.id;
      else {
        token = id();
        db.insert('imports', {
          id: token,
          actor_id: req.user.id,
          fingerprint,
          rows: JSON.stringify(safe),
          expires_at: new Date(Date.now() + 30 * 60000).toISOString(),
        });
      }
    }
    res.json({ id: token, count: rows.length, preview, errors });
  });
  router.post('/imports/:id/commit', (req, res) => {
    requireRole(req.user, 'admin');
    const result = db.transaction(() => {
      const job = db.get(
        'SELECT * FROM imports WHERE id=? AND actor_id=?',
        String(req.params.id),
        req.user.id,
      );
      assert(job && job.expires_at > now(), 'import_expired', 409);
      if (job.committed_at) return JSON.parse(job.result);
      const rows = JSON.parse(job.rows);
      for (const row of rows) {
        assert(!db.get('SELECT id FROM users WHERE email=?', row.email), 'duplicate', 409);
        db.insert('users', { id: id(), ...row, created_at: now(), must_change_password: 1 });
      }
      const report = { imported: rows.length };
      db.run(
        'UPDATE imports SET committed_at=?,result=?,rows=? WHERE id=?',
        now(),
        JSON.stringify(report),
        '[]',
        job.id,
      );
      db.audit(req.user.id, 'import', 'users', job.id, report, req.requestId);
      return report;
    });
    res.json(result);
  });
  return router;
}
