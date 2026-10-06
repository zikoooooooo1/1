import { Router } from 'express';
import * as oidc from 'openid-client';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Store, now } from './db.js';
import { assert } from './errors.js';
import { digest, issueSession } from './auth.js';

const guid = z.uuid();
export function microsoftConfigured() {
  return !!(
    guid.safeParse(process.env.MICROSOFT_TENANT_ID).success &&
    guid.safeParse(process.env.MICROSOFT_CLIENT_ID).success &&
    process.env.MICROSOFT_CLIENT_SECRET &&
    process.env.APP_ORIGIN?.startsWith('https://')
  );
}
function settings() {
  assert(microsoftConfigured(), 'microsoft_unconfigured', 503);
  return {
    tenant: process.env.MICROSOFT_TENANT_ID!.toLowerCase(),
    client: process.env.MICROSOFT_CLIENT_ID!,
    secret: process.env.MICROSOFT_CLIENT_SECRET!,
    origin: new URL(process.env.APP_ORIGIN!).origin,
  };
}
// Only call after openid-client has verified the signed ID token, issuer,
// audience, expiration and nonce. Email is never used to link identities.
export function resolveMicrosoftStudent(
  db: Store,
  claims: Record<string, unknown>,
  tenant: string,
  requestId?: string,
) {
  const identity = z
    .object({
      tid: guid,
      oid: guid,
      name: z.string().trim().min(1).max(200),
      preferred_username: z.email().max(254),
      acct: z.union([z.literal(0), z.literal('0')]),
    })
    .parse(claims);
  assert(identity.tid.toLowerCase() === tenant.toLowerCase(), 'microsoft_school_only', 403);
  const email = identity.preferred_username.toLowerCase();
  const tenantId = identity.tid.toLowerCase(),
    objectId = identity.oid.toLowerCase();
  return db.transaction(() => {
    const linked = db.get(
      'SELECT u.* FROM external_identities e JOIN users u ON u.id=e.user_id WHERE e.tenant_id=? AND e.object_id=?',
      tenantId,
      objectId,
    );
    assert(linked, 'account_not_provisioned', 403);
    assert(
      linked.role === 'student' &&
        linked.auth_provider === 'microsoft' &&
        linked.status === 'active',
      'forbidden',
      403,
    );
    assert(
      !db.get('SELECT id FROM users WHERE email=? AND id!=?', email, linked.id),
      'microsoft_account_conflict',
      409,
    );
    db.run(
      'UPDATE users SET name=?,email=?,version=version+1 WHERE id=?',
      identity.name,
      email,
      linked.id,
    );
    db.audit(linked.id, 'microsoft_profile_sync', 'users', linked.id, {}, requestId);
    return linked.id as string;
  });
}
export function microsoftRouter(db: Store) {
  const router = Router();
  let configuration: Promise<oidc.Configuration> | undefined;
  const config = () => {
    const s = settings();
    configuration ??= oidc
      .discovery(
        new URL(`https://login.microsoftonline.com/${s.tenant}/v2.0`),
        s.client,
        s.secret,
        undefined,
        { execute: [oidc.enableNonRepudiationChecks], timeout: 10 },
      )
      .catch((error) => {
        configuration = undefined;
        throw error;
      });
    return configuration;
  };
  const cookie = 'claso_microsoft_flow';
  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/api/auth/microsoft',
    maxAge: 10 * 60000,
  };
  router.get('/start', async (req, res) => {
    try {
      const s = settings();
      // Bound public discovery requests and short-lived transaction storage per IP.
      const key = digest(`microsoft:${req.ip}`);
      db.run('DELETE FROM login_limits WHERE expires_at<?', now());
      assert(
        (db.get('SELECT failures FROM login_limits WHERE key=?', key)?.failures || 0) < 30,
        'rate_limited',
        429,
      );
      db.run(
        'INSERT INTO login_limits(key,failures,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET failures=failures+1',
        key,
        new Date(Date.now() + 15 * 60000).toISOString(),
      );
      const conf = await config();
      const state = oidc.randomState(),
        nonce = oidc.randomNonce(),
        verifier = oidc.randomPKCECodeVerifier(),
        browser = randomBytes(32).toString('hex');
      const destination = oidc.buildAuthorizationUrl(conf, {
        redirect_uri: `${s.origin}/api/auth/microsoft/callback`,
        scope: 'openid profile email',
        response_mode: 'query',
        state,
        nonce,
        code_challenge_method: 'S256',
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
        prompt: 'select_account',
      });
      db.run('DELETE FROM oauth_requests WHERE expires_at<?', now());
      db.insert('oauth_requests', {
        state_hash: digest(state),
        browser_hash: digest(browser),
        verifier,
        nonce,
        expires_at: new Date(Date.now() + 10 * 60000).toISOString(),
      });
      res.cookie(cookie, browser, cookieOptions);
      res.redirect(destination.href);
    } catch {
      res.redirect('/?authError=microsoft_unavailable');
    }
  });
  router.get('/callback', async (req, res) => {
    try {
      const s = settings();
      const state = z.string().min(1).max(256).parse(req.query.state);
      const browser = req.headers.cookie
        ?.split(';')
        .map((v) => v.trim())
        .find((v) => v.startsWith(cookie + '='))
        ?.slice(cookie.length + 1);
      assert(browser, 'invalid_credentials', 401);
      const flow = db.transaction(() => {
        const row = db.get(
          'SELECT * FROM oauth_requests WHERE state_hash=? AND browser_hash=? AND expires_at>?',
          digest(state),
          digest(browser),
          now(),
        );
        assert(row, 'invalid_credentials', 401);
        db.run('DELETE FROM oauth_requests WHERE state_hash=?', digest(state));
        return row;
      });
      const tokens = await oidc.authorizationCodeGrant(
        await config(),
        new URL(req.originalUrl, s.origin),
        {
          expectedState: state,
          expectedNonce: flow.nonce,
          pkceCodeVerifier: flow.verifier,
          idTokenExpected: true,
        },
      );
      const uid = resolveMicrosoftStudent(db, tokens.claims()!, s.tenant, req.requestId);
      db.transaction(() => {
        issueSession(db, res, uid, 'microsoft');
        db.audit(uid, 'microsoft_login', 'users', uid, {}, req.requestId);
      });
      res.clearCookie(cookie, cookieOptions);
      res.redirect('/');
    } catch {
      res.clearCookie(cookie, cookieOptions);
      res.redirect('/?authError=microsoft_failed');
    }
  });
  return router;
}
