# Environment

| Variable        | Default                       | Meaning                                                                                           |
| --------------- | ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `NODE_ENV`      | unset/development             | `production` serves compiled static files, enables Secure cookies and production security headers |
| `HOST`          | `0.0.0.0`                     | Listen interface; use `127.0.0.1` behind a local reverse proxy                                    |
| `PORT`          | `3000`                        | HTTP listen port                                                                                  |
| `APP_ORIGIN`    | request origin in development | Required exact HTTPS browser origin in production; used for mutation Origin checks                |
| `DATABASE_PATH` | `./data/claso.sqlite`         | Private local SQLite path; `:memory:` is reserved for tests                                       |
| `STORAGE_PATH`  | `./data/files`                | Private upload directory, outside static assets                                                   |
| `TRUST_PROXY`   | `0`                           | Set `1` only for a trusted loopback reverse proxy                                                 |

There is no application signing secret to hardcode: opaque session tokens are random, and their server-side records are stored in the database. Database and file access are controlled by operating-system permissions. No provider API credentials are required.

Relative paths resolve from the process working directory. Keep the working directory fixed across bootstrap, migration, runtime, and backup commands. `.env` is ignored by Git but is not automatically loaded; use a process manager or `node --env-file=.env`.

## Development

`npm run dev` starts one Express/Vite process on port 3000. The first sign-in needs `npm run admin`. Development does not set Secure cookies or HSTS because localhost HTTP is used. Never expose this development server as the production service.

## Testing

`npm test` creates an in-memory SQLite database, a temporary private upload directory, synthetic test accounts with random passwords, and a Supertest HTTP client. No production database/environment is required. Tests remove their temporary files afterward.

## Public product tour

The public home serves pre-rendered Arabic/English video, narration and captions from local static assets. There is no runtime demo mode, shared demo account, or automatic academic-data seeding. Media generation is a separate authoring step described in [Product film](docs/PRODUCT_FILM.md).

## Production

Set the production environment before starting `npm start`. The server rejects production startup without an HTTPS `APP_ORIGIN`. Set an OS umask of 0077, mount persistent local storage, run as a non-root user, and terminate TLS at the school's approved reverse proxy. Do not put real values into `.env.example`.

## Microsoft student identity

Microsoft-backed student access requires `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, and server-only `MICROSOFT_CLIENT_SECRET`, plus the HTTPS `APP_ORIGIN`. Values must belong to the same school Entra application. Missing configuration is shown honestly on the sign-in screen; local staff accounts continue working. See [Microsoft setup](docs/MICROSOFT_SETUP.md) for redirect URI, member claim and group assignment. No provider token is persisted. Local student accounts created by an administrator are supported without Microsoft configuration.
