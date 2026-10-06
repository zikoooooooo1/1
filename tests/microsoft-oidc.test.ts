import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, generateKeyPairSync, sign, createHash } from 'node:crypto';
import request from 'supertest';
import { Store } from '../src/server/db.js';
import { createApp } from '../src/server/app.js';

// Deterministic HTTPS transport fixture: the real OIDC library validates every
// signed token. Only Microsoft requests are intercepted; there is no production bypass.
test('OIDC round-trip validates signature, audience, issuer, nonce, expiry, PKCE, browser binding and replay', async () => {
  const tenant = randomUUID(),
    clientId = randomUUID(),
    secret = randomBytes(32).toString('hex');
  const issuer = `https://login.microsoftonline.com/${tenant}/v2.0`;
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const wrongKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const key = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
  Object.assign(process.env, {
    MICROSOFT_TENANT_ID: tenant,
    MICROSOFT_CLIENT_ID: clientId,
    MICROSOFT_CLIENT_SECRET: secret,
    APP_ORIGIN: 'https://school.example',
  });
  const db = new Store(':memory:');
  let mode = 'valid',
    nonce = '',
    challenge = '',
    exchanges = 0;
  const fetchMock = mock.method(
    globalThis,
    'fetch',
    async (input: string | URL, options: RequestInit = {}) => {
      const url = new URL(String(input));
      assert.equal(url.origin, 'https://login.microsoftonline.com');
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
      if (url.pathname.endsWith('/.well-known/openid-configuration'))
        return json({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/keys`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          token_endpoint_auth_methods_supported: ['client_secret_post'],
          code_challenge_methods_supported: ['S256'],
        });
      if (url.pathname.endsWith('/keys')) return json({ keys: [key] });
      assert(url.pathname.endsWith('/token'));
      exchanges++;
      const body = new URLSearchParams(String(options.body));
      assert.equal(body.get('client_secret'), secret);
      assert.equal(body.get('redirect_uri'), 'https://school.example/api/auth/microsoft/callback');
      assert.equal(
        createHash('sha256').update(body.get('code_verifier')!).digest('base64url'),
        challenge,
      );
      const now = Math.floor(Date.now() / 1000);
      const claims = {
        iss: mode === 'issuer' ? 'https://foreign.example' : issuer,
        aud: mode === 'audience' ? randomUUID() : clientId,
        sub: 'subject',
        tid: tenant,
        oid: '473e785e-1b79-4dc6-bdc2-ea4a04ed9798',
        name: 'الاسم الكامل للطالب',
        preferred_username: 'student@school.example',
        acct: 0,
        nonce: mode === 'nonce' ? 'wrong-nonce' : nonce,
        iat: now,
        exp: mode === 'expiry' ? now - 300 : now + 300,
      };
      const payload = [
        Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })).toString('base64url'),
        Buffer.from(JSON.stringify(claims)).toString('base64url'),
      ].join('.');
      const signature = sign(
        'RSA-SHA256',
        Buffer.from(payload),
        mode === 'signature' ? wrongKey : privateKey,
      ).toString('base64url');
      return json({
        access_token: 'unused-synthetic-token',
        token_type: 'Bearer',
        expires_in: 300,
        id_token: `${payload}.${signature}`,
      });
    },
  );
  try {
    const app = await createApp(db, { frontend: false });
    for (const kind of [
      'signature',
      'audience',
      'issuer',
      'nonce',
      'expiry',
      'browser',
      'state',
      'unapproved',
      'valid',
    ]) {
      if (kind === 'valid') {
        const uid = randomUUID();
        db.insert('users', {
          id: uid,
          name: 'Approved name',
          email: 'student@school.example',
          role: 'student',
          auth_provider: 'microsoft',
          password_hash: '',
          must_change_password: 0,
          created_at: new Date().toISOString(),
        });
        db.insert('external_identities', {
          tenant_id: tenant,
          object_id: '473e785e-1b79-4dc6-bdc2-ea4a04ed9798',
          user_id: uid,
          created_at: new Date().toISOString(),
        });
      }
      mode = kind;
      const start = await request(app).get('/api/auth/microsoft/start').expect(302);
      const authorization = new URL(start.headers.location);
      assert.equal(authorization.origin, 'https://login.microsoftonline.com');
      const state = authorization.searchParams.get('state')!;
      nonce = authorization.searchParams.get('nonce')!;
      challenge = authorization.searchParams.get('code_challenge')!;
      const cookies = start.headers['set-cookie'] as unknown as string[];
      assert(
        cookies[0].includes('HttpOnly') &&
          cookies[0].includes('Secure') &&
          cookies[0].includes('SameSite=Lax'),
      );
      const cookie = cookies[0].split(';')[0];
      const callback = `/api/auth/microsoft/callback?state=${kind === 'state' ? 'tampered' : state}&code=synthetic-code`;
      const before = exchanges;
      const response = await request(app)
        .get(callback)
        .set('Cookie', kind === 'browser' ? 'claso_microsoft_flow=other-browser' : cookie)
        .expect(302);
      assert.equal(
        response.headers.location,
        kind === 'valid' ? '/' : '/?authError=microsoft_failed',
      );
      if (['browser', 'state'].includes(kind)) assert.equal(exchanges, before);
      if (kind !== 'valid') {
        assert.equal(db.get('SELECT count(*) n FROM sessions')!.n, 0);
        assert.equal(db.get('SELECT count(*) n FROM users')!.n, 0);
      } else {
        assert.equal(db.get('SELECT name FROM users')!.name, 'الاسم الكامل للطالب');
        const session = (response.headers['set-cookie'] as unknown as string[])
          .find((c) => c.startsWith('claso_session='))!
          .split(';')[0];
        const me = await request(app).get('/api/auth/me').set('Cookie', session).expect(200);
        assert.equal(me.body.user.role, 'student');
        assert.equal(me.body.user.auth_provider, 'microsoft');
        const count = exchanges;
        await request(app)
          .get(callback)
          .set('Cookie', cookie)
          .expect(302)
          .expect('Location', '/?authError=microsoft_failed');
        assert.equal(exchanges, count);
        assert.equal(db.get('SELECT count(*) n FROM sessions')!.n, 1);
      }
    }
  } finally {
    fetchMock.mock.restore();
    db.db.close();
    for (const key of [
      'MICROSOFT_TENANT_ID',
      'MICROSOFT_CLIENT_ID',
      'MICROSOFT_CLIENT_SECRET',
      'APP_ORIGIN',
    ])
      delete process.env[key];
  }
});
