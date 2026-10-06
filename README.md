# CLASO

**CLASS + OS · One School. One System.**

The operating system for modern schools. CLASO connects a school's academic structure, people, teaching work, assessments, resources, schedules, communication, and academic history in one self-hosted application.

## Stack

- TypeScript and React, with Vite for the browser build
- Express API with server-enforced administrator, teacher, and student access
- SQLite with foreign keys, WAL journaling, versioned migrations, and transactional workflows
- Private filesystem storage; authenticated, authorized file downloads
- English and Arabic, browser-language detection, RTL layouts, and optional dark appearance
- Node's `scrypt` password hashing and opaque, revocable server sessions

School data and academic workflows are self-hosted. Accounts are created only by the administrator. Students can use administrator-issued local credentials or an explicitly approved school Microsoft identity; staff use local sign-in. There are no default production accounts or passwords.

## Local setup

Use **Node 24.14.1 or later in the Node 24 release line**, and npm 11. The built-in `node:sqlite` driver in this runtime prints an experimental API warning; pin and validate the runtime when upgrading.

```sh
npm ci
npm run admin
npm run dev
```

`npm run admin` interactively creates the first administrator. Password input is hidden. An optional administrator login ID is separate from the contact email. The command refuses to run when any account exists. Open `http://localhost:3000` and sign in. Configure the school, year, terms, grade/section structure, subjects, people, classes, teacher assignments, enrollments, and schedule. The database is initialized automatically from `migrations/`.

### Public home and narrated tour

The public entry (`/` or `/#/home`) introduces CLASO with Arabic and English animated films. `/#/login` opens the real account sign-in; authenticated school work starts at `/#/workspace`. No demo account or seed command is offered. New installations contain no school records or users until an administrator is created.

Films, audio, captions and posters are served locally from `public/media/`. They play only after a user action, and need no third-party player or live speech service. See [Product film](docs/PRODUCT_FILM.md) for editing and regeneration.

## Workflows

| Workspace         | Implemented workflows                                                                                                                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Administrator     | School settings, academic structure, account creation/edit/archive/restore/password reset, CSV import validation/preview/confirmation, CSV people export, class memberships, year activation/archive/structural rollover, audit log, actual system checks |
| School management | School-wide academic structure, class memberships, teaching workflows, schedules, assessment results, academic analytics and academic audit; no account/security administration                                                                           |
| Teacher           | Assigned classes, students, lessons, resources, assignments, submissions, grading/return, question banks, exam review/scheduling/publication, attempts, manual grading, result release, schedules, class announcements, inbox                             |
| Student           | Enrolled classes, academic passport, published resources, assignment submission, timed/autosaved exam attempts, released results, class schedule, targeted announcements, authorized messaging                                                            |
| Shared            | Permission-aware search/command bar, School Map, historical years, notifications, English/Arabic, responsive navigation, light/dark appearance                                                                                                            |

Counts, completion figures, grades, and question performance are derived from stored records. Empty datasets produce empty states.

## Checks and build

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

CI runs these checks. Integration tests use an in-memory database and temporary file storage, and cover real HTTP requests across all four roles.

## Production

Build and run on a persistent, single-server Node host behind HTTPS. Set `NODE_ENV=production`, `APP_ORIGIN` to the exact public HTTPS origin, and private persistent database/storage paths. Load environment variables with your process manager or Node's `--env-file` option; `.env` is not automatically loaded by the application.

```sh
npm ci
npm run build
# Bootstrap BEFORE pruning development tools:
npm run admin
npm prune --omit=dev
NODE_ENV=production APP_ORIGIN=https://school.example HOST=127.0.0.1 npm start
```

Use real deployment values rather than the example hostname. See [DEPLOYMENT.md](DEPLOYMENT.md) for reverse proxy, containers, bootstrap, backups, and restoration. Do not deploy the database on ephemeral serverless storage or an NFS volume.

## Documentation

- [Architecture](ARCHITECTURE.md)
- [Data model and lifecycle](DATA_MODEL.md)
- [Permissions](PERMISSIONS.md)
- [Security](SECURITY.md)
- [Deployment and backups](DEPLOYMENT.md)
- [Environment](ENVIRONMENT.md)
- [School networking](SCHOOL_NETWORK.md)
- [Testing](TESTING.md)
- [Administrator guide](docs/ADMIN_GUIDE.md)
- [Teacher guide](docs/TEACHER_GUIDE.md)
- [Student guide](docs/STUDENT_GUIDE.md)
- [API conventions](docs/API.md)
- [Operational boundaries](docs/OPERATIONS.md)

## Deployment boundaries

This is a single-school, single-server application. It does not claim multi-region replication, full offline operation, an anti-cheating browser lockdown, external email delivery, or a managed backup service. Spreadsheet imports use CSV; image/equation questions use protected attachments and plain Unicode text, without executing embedded HTML or math scripts. Fixed roles are enforced in server policy; the permissions screen documents those roles rather than exposing an unsafe policy editor. See the operational documentation before using real school data.
