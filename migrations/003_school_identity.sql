ALTER TABLE users ADD COLUMN login_id TEXT COLLATE NOCASE;
CREATE UNIQUE INDEX users_login_id ON users(login_id) WHERE login_id IS NOT NULL;
ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'password' CHECK(auth_provider IN ('password','microsoft'));
ALTER TABLE sessions ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'password' CHECK(auth_provider IN ('password','microsoft'));
CREATE TABLE external_identities (
  tenant_id TEXT NOT NULL,
  object_id TEXT NOT NULL,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,object_id)
);
CREATE TABLE oauth_requests (
  state_hash TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX oauth_requests_expiry ON oauth_requests(expires_at);
