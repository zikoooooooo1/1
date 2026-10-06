import { teachingSetupRouter } from './teaching-setup.js';
import { accountsRouter } from './accounts.js';
import { controlRouter } from './control.js';
import { teachersRouter } from './teachers.js';
import { microsoftRouter, microsoftConfigured } from './microsoft.js';
import { dispatchAnnouncements } from './notifications.js';
import express from 'express';
import helmet from 'helmet';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { z, ZodError } from 'zod';
import { Store, now } from './db.js';
import { AppError, assert } from './errors.js';
import {
  authenticate,
  digest,
  verifyPassword,
  issueSession,
  cookieName,
  hashPassword,
} from './auth.js';
import { academicRouter, finalizeAttempt } from './academic.js';
import { assessmentRouter } from './assessments.js';
import { peopleRouter } from './people.js';
import { fileRouter } from './files.js';
import { operationsRouter } from './operations.js';
export async function createApp(db: Store, options: { storage?: string; frontend?: boolean } = {}) {
  const app = express();
  const production = process.env.NODE_ENV === 'production';
  const storage = resolve(options.storage || process.env.STORAGE_PATH || 'data/files');
  if (production)
    assert(process.env.APP_ORIGIN?.startsWith('https://'), 'production_origin_required');
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 'loopback');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", ...(!production ? ["'unsafe-inline'"] : [])],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", ...(!production ? ['ws:'] : [])],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: production ? [] : null,
        },
      },
      strictTransportSecurity: production ? undefined : false,
    }),
  );
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.set('X-Request-Id', req.requestId);
    if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin && origin !== (process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`))
        return next(new AppError(403, 'origin_failed'));
    }
    next();
  });
  app.use(express.json({ limit: '3mb' }));
  const dummyHash = await hashPassword(randomBytes(24).toString('hex'));
  app.get('/api/public', (_req, res) =>
    res.json({
      configured: !!db.get('SELECT id FROM users LIMIT 1'),
      microsoft: microsoftConfigured(),
      name: db.get('SELECT name FROM school')!.name,
    }),
  );
  app.get('/readyz', (_req, res) => {
    db.get('SELECT 1');
    res.json({ ready: true });
  });
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = z
      .object({ email: z.string().trim().min(1).max(254), password: z.string().min(1).max(128) })
      .parse(req.body);
    const key = digest(`${req.ip}:${email.toLowerCase()}`);
    const ipKey = digest(`ip:${req.ip}`);
    db.run('DELETE FROM login_limits WHERE expires_at<?', now());
    for (const k of [key, ipKey])
      assert(
        (db.get('SELECT failures FROM login_limits WHERE key=?', k)?.failures || 0) <
          (k === key ? 10 : 100),
        'rate_limited',
        429,
      );
    for (const k of [key, ipKey])
      db.run(
        'INSERT INTO login_limits(key,failures,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET failures=failures+1',
        k,
        new Date(Date.now() + 15 * 60000).toISOString(),
      );
    const column = z.email().safeParse(email).success ? 'email' : 'login_id';
    const user = db.get(`SELECT * FROM users WHERE ${column}=?`, email.toLowerCase());
    const valid = await verifyPassword(password, user?.password_hash || dummyHash);
    assert(
      user && valid && user.status === 'active' && user.auth_provider === 'password',
      'invalid_credentials',
      401,
    );
    db.transaction(() => {
      db.run('DELETE FROM login_limits WHERE key=?', key);
      issueSession(db, res, user.id);
      db.audit(user.id, 'login', 'users', user.id, {}, req.requestId);
    });
    res.json({ ok: true });
  });
  app.use('/api/auth/microsoft', microsoftRouter(db));
  app.use('/api', authenticate(db));
  app.get('/api/auth/me', (req, res) => {
    const { csrf: _csrf, ...user } = req.user as any;
    res.json({ user, csrf: req.csrf });
  });
  app.post('/api/auth/logout', (req, res) => {
    db.run('DELETE FROM sessions WHERE token_hash=?', req.sessionHash);
    res.clearCookie(cookieName, { path: '/' });
    res.json({ ok: true });
  });
  app.post('/api/auth/password', async (req, res) => {
    const { current_password, password } = z
      .object({ current_password: z.string().max(128), password: z.string().min(12).max(128) })
      .parse(req.body);
    const user = db.get('SELECT password_hash,auth_provider FROM users WHERE id=?', req.user.id)!;
    assert(user.auth_provider === 'password', 'microsoft_required', 403);
    assert(await verifyPassword(current_password, user.password_hash), 'invalid_credentials', 400);
    const hash = await hashPassword(password);
    db.transaction(() => {
      db.run(
        'UPDATE users SET password_hash=?,must_change_password=0,version=version+1 WHERE id=?',
        hash,
        req.user.id,
      );
      db.run(
        'DELETE FROM sessions WHERE user_id=? AND token_hash!=?',
        req.user.id,
        req.sessionHash,
      );
      db.audit(req.user.id, 'password_changed', 'users', req.user.id, {}, req.requestId);
    });
    res.json({ ok: true });
  });
  app.use(
    '/api',
    peopleRouter(db),
    accountsRouter(db),
    controlRouter(db),
    teachersRouter(db),
    teachingSetupRouter(db),
    academicRouter(db),
    assessmentRouter(db),
    fileRouter(db, storage),
    operationsRouter(db, storage),
  );
  app.use('/api', (_req, _res, next) => next(new AppError(404, 'not_found')));
  if (options.frontend !== false) {
    if (production) {
      app.use(express.static(resolve('dist/client'), { index: false, maxAge: '1h' }));
      app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/client/index.html')));
    } else {
      const { createServer } = await import('vite');
      const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
      app.use(vite.middlewares);
    }
  }
  app.use(
    (error: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
      let status = 500,
        code = 'server_error';
      if (error instanceof AppError) {
        status = error.status;
        code = error.code;
      } else if (error instanceof ZodError) {
        status = 400;
        code = 'invalid_input';
      } else if (error.code === 'LIMIT_FILE_SIZE') {
        status = 413;
        code = 'file_too_large';
      } else if (error.message?.includes('UNIQUE constraint')) {
        status = 409;
        code = 'duplicate';
      } else if (error.message?.includes('FOREIGN KEY constraint')) {
        status = 400;
        code = 'invalid_relationship';
      } else if (error.type === 'entity.too.large') {
        status = 413;
        code = 'file_too_large';
      } else if (error instanceof SyntaxError && 'body' in error) {
        status = 400;
        code = 'invalid_input';
      }
      if (status === 500)
        console.error(
          JSON.stringify({
            level: 'error',
            requestId: req.requestId,
            code: error.code || 'unknown',
            route: req.route?.path || 'unknown',
          }),
        );
      res.status(status).json({ error: code, request_id: req.requestId });
    },
  );
  return app;
}
export function expireAttempts(db: Store) {
  db.transaction(() => {
    dispatchAnnouncements(db);
    for (const attempt of db.all(
      "SELECT id FROM attempts WHERE status='in_progress' AND deadline<=?",
      now(),
    ))
      finalizeAttempt(db, attempt.id);
    db.run('DELETE FROM sessions WHERE expires_at<?', now());
    db.run('DELETE FROM imports WHERE expires_at<?', now());
    db.run('DELETE FROM oauth_requests WHERE expires_at<?', now());
  });
}
