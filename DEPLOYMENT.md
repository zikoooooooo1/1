# Deployment and recovery

## Supported deployment

Use a persistent Linux/Node host or container on school-approved infrastructure. CLASO currently runs as one application instance with SQLite and a local private file directory. It is not a static-only application: deploying only the Vite output on Netlify/Vercel cannot run the API. A frontend-only deployment also breaks the intended same-origin session architecture. Choose a persistent host for this version.

## Initial installation

1. Install Node 24.14.1 (pin the Node 24 runtime) and npm 11.
2. Check out the application and run `npm ci`.
3. Set `DATABASE_PATH` and `STORAGE_PATH` to private persistent directories owned by the application user. Use the same paths for bootstrap and the running server.
4. Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
5. Run `npm run admin` interactively, with the production database path. This creates exactly one initial administrator and refuses an already configured database. No public registration endpoint exists.
6. Start behind an HTTPS reverse proxy with `NODE_ENV=production` and the exact public `APP_ORIGIN`.
7. Configure school identity and academic structure in the administrator workspace.
8. Validate the three real roles, file access, backups, and restoration before importing school data.

`.env.example` contains no secrets. Environment loading is explicit. A process manager can load an environment file; alternatively:

```sh
node --env-file=.env dist/server/server/index.js
```

## Reverse proxy example

Use your approved certificate and hostname. The following describes a loopback upstream, not a complete certificate provisioning procedure:

```nginx
server {
  listen 443 ssl;
  server_name school.example;
  # Configure approved ssl_certificate and ssl_certificate_key paths.
  client_max_body_size 11m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_read_timeout 60s;
  }
}
```

Set `HOST=127.0.0.1`, `TRUST_PROXY=1`, and `APP_ORIGIN=https://school.example`. Redirect HTTP to HTTPS at the proxy. The origin must match the browser origin, including a nonstandard port if present. Do not rewrite it to an internal backend hostname. Forward only trusted proxy headers.

Use a service manager with an automatic restart policy, a non-root account, `umask 0077`, and a working directory containing `migrations/` and `dist/`. Graceful SIGTERM closes the server and database. `/readyz` confirms that the server can query the database; it does not assert that every workflow or storage service is healthy.

## Containers

`Dockerfile` builds the frontend/server and copies only production dependencies, migrations, and build output into a non-root Node image. Build with:

```sh
docker build -t claso:1.0.0 .
```

Bootstrap the database from the source checkout before mounting it into the runtime container. Ensure the volume is readable/writable by the container's `node` user (UID 1000), and that both the database and files are mounted together under `/app/data`.

```sh
docker run --name claso --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -e APP_ORIGIN=https://school.example \
  -v /srv/claso/data:/app/data \
  claso:1.0.0
```

Do not set loopback proxy trust for a proxy arriving through a non-loopback container bridge without deliberately adapting and reviewing the proxy policy. CSRF uses the explicit `APP_ORIGIN`, and production cookies remain Secure independently.

## Migrations and updates

Back up first. Stop incoming writes during deployment. Install the new release, run checks/build, and start against the same persistent paths. The server applies each unseen SQL migration in a transaction. A failed migration rolls back its transaction and prevents startup. Never edit an already applied migration; add a new version.

Database downgrades are not automatic. Roll back by restoring the previous application and its matching backup. Do not reset a production database to repair a migration.

## Backup

Use a protected new directory outside the web root:

```sh
npm run backup -- /secure/backups/claso-YYYYMMDD
```

The command uses SQLite's online backup API, then copies the private files. It refuses an existing destination and sets private directory/database modes. Because file copying and database snapshot are separate operations, place the application in a maintenance window with writes stopped for a fully coordinated backup. Files are otherwise immutable; no automatic cleanup should run during the copy.

The backup is not encrypted by this command. Encrypt it using the school's approved backup system, restrict access, store an off-host copy, and set a retention schedule. A successful copy is not proof of restorability.

## Restore drill

1. Stop CLASO and preserve the current data as a separate recovery checkpoint.
2. Restore the backup database and files into a new private directory.
3. Run `PRAGMA integrity_check` and `PRAGMA foreign_key_check` using a SQLite client or Node's database API.
4. Point a separate test instance at the restored paths and a distinct allowed origin.
5. Verify administrator login, an authorized file download, historical results, and user scoping.
6. Only after validation, switch the production service to the restored paths.

For credential recovery when no administrator can sign in, use a controlled maintenance procedure with a backup and an authorized operator. Do not delete the users table or bootstrap over existing accounts. Normal account resets are available to an authenticated administrator in People management.

Before admitting Microsoft-backed students, complete [Microsoft Entra setup](docs/MICROSOFT_SETUP.md), including the exact Web redirect URI, optional `acct` ID-token claim and student-group assignment. Provide the three `MICROSOFT_*` variables through the service/container secret environment and restart.
