import { isSchoolOperator, type Role } from '../shared/roles.js';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { Request, Response, NextFunction } from 'express';
import { Store, now, id } from './db.js';
import { assert, AppError } from './errors.js';
const scrypt = promisify(scryptCallback);
export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  must_change_password: number;
};
// Express request augmentation follows the framework namespace contract.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: User;
      csrf: string;
      requestId: string;
      sessionHash: string;
    }
  }
}
export const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export async function hashPassword(password: string) {
  assert(password.length >= 12 && password.length <= 128, 'password_length');
  const salt = randomBytes(16).toString('hex');
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, hash: string) {
  const [salt, key] = hash.split(':');
  if (!salt || !key) return false;
  const candidate = (await scrypt(password, salt, 64)) as Buffer;
  const stored = Buffer.from(key, 'hex');
  return stored.length === candidate.length && timingSafeEqual(candidate, stored);
}
export async function createUser(
  db: Store,
  data: { name: string; email: string; role: string; password: string },
  change = true,
) {
  const uid = id();
  const hash = await hashPassword(data.password);
  db.insert('users', {
    id: uid,
    name: data.name,
    email: data.email.toLowerCase(),
    role: data.role,
    password_hash: hash,
    created_at: now(),
    must_change_password: change ? 1 : 0,
  });
  return uid;
}
export function issueSession(db: Store, res: Response, userId: string, provider = 'password') {
  const token = randomBytes(32).toString('hex');
  db.run('DELETE FROM sessions WHERE expires_at<?', now());
  db.insert('sessions', {
    token_hash: digest(token),
    user_id: userId,
    csrf: randomBytes(32).toString('hex'),
    expires_at: new Date(Date.now() + 8 * 3600000).toISOString(),
    created_at: now(),
    auth_provider: provider,
  });
  sessionCookie(res, token);
}
export const cookieName = 'claso_session';
export function sessionCookie(res: Response, token: string) {
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });
}
export function authenticate(db: Store) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = req.headers.cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName + '='))
      ?.slice(cookieName.length + 1);
    const row =
      token &&
      db.get(
        "SELECT u.id,u.name,u.email,u.role,u.must_change_password,u.auth_provider,s.auth_provider session_provider,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'",
        digest(token),
        now(),
      );
    if (!row) return next(new AppError(401, 'login_required'));
    req.user = row as User;
    req.csrf = row.csrf;
    req.sessionHash = digest(token!);
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers['x-csrf-token'] !== row.csrf
    )
      return next(new AppError(403, 'csrf_failed'));
    if (
      row.must_change_password &&
      !['/auth/me', '/auth/password', '/auth/logout'].includes(req.path)
    )
      return next(new AppError(403, 'password_change_required'));
    next();
  };
}
export function requireRole(user: User, ...roles: string[]) {
  assert(roles.includes(user.role), 'forbidden', 403);
}
export function classAccess(db: Store, user: User, classId: string, write = false) {
  const cls = db.get(
    'SELECT c.*,y.status year_status FROM classes c JOIN academic_years y ON y.id=c.year_id WHERE c.id=?',
    classId,
  );
  assert(cls, 'not_found', 404);
  if (!isSchoolOperator(user)) {
    const table = user.role === 'teacher' ? 'teacher_assignments' : 'enrollments';
    const column = user.role === 'teacher' ? 'teacher_id' : 'student_id';
    assert(
      db.get(`SELECT id FROM ${table} WHERE class_id=? AND ${column}=?`, classId, user.id),
      'forbidden',
      403,
    );
  }
  if (write) {
    requireRole(user, 'admin', 'school_management', 'teacher');
    assert(cls.status === 'active' && cls.year_status !== 'archived', 'academic_archived', 409);
  }
  return cls;
}
export function classScope(user: User, alias = 'c'): { sql: string; params: string[] } {
  if (isSchoolOperator(user)) return { sql: '1=1', params: [] };
  return {
    sql: `EXISTS (SELECT 1 FROM ${user.role === 'teacher' ? 'teacher_assignments' : 'enrollments'} membership WHERE membership.class_id=${alias}.id AND membership.${user.role === 'teacher' ? 'teacher_id' : 'student_id'}=?)`,
    params: [user.id],
  };
}
