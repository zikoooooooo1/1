# API conventions

All routes below use `/api`. Requests/responses are JSON except multipart file uploads and CSV/file downloads. Protected routes require the session cookie. Mutations require the `X-CSRF-Token` returned by `GET /auth/me`. The browser wrapper maintains it in memory.

| Route family                                                                                      | Purpose                                                               |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `GET /public`                                                                                     | School display name and whether initial setup exists; no private data |
| `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`, `POST /auth/password`                    | Session lifecycle                                                     |
| `GET/POST /records/:entity`, `GET/PUT /records/:entity/:id`                                       | Catalog-whitelisted, validated, scoped records                        |
| `POST /records/:entity/:id/transition`                                                            | Explicit lifecycle action plus optimistic version                     |
| `POST /years/:id/rollover`                                                                        | Planned structural copy of a year                                     |
| `/people`, `/people/:id/archive`, `/people/:id/restore`, `/people/:id/password`, `/people/export` | Account administration                                                |
| `POST /imports/preview`, `POST /imports/:id/commit`                                               | CSV inspection/mapping/preview and atomic confirmation                |
| `POST /files`, `GET /files/:id`                                                                   | Upload and protected download                                         |
| `/assignments/:id/submissions`, `/assignments/:id/submit`, `/submissions/:id/grade`               | Assignment lifecycle                                                  |
| `/exams/:id/questions`, `/exams/:id/attempts`                                                     | Snapshot questions and start/list attempts                            |
| `/attempts/:id`, `/attempts/:id/answers`, `/attempts/:id/submit`, `/attempts/:id/grade`           | Attempt lifecycle                                                     |
| `/results`, `/dashboard`, `/analytics`, `/school-map`, `/classes/:id/summary`                     | Scoped data-derived views                                             |
| `/announcements` via records, `/notifications`, `/messages`, `/contacts`, `/inbox/tasks`          | Communication and work queue                                          |
| `/school`, `/permissions`, `/audit`, `/health`, `/view-as`                                        | School administration                                                 |
| `GET /search?q=`                                                                                  | Permission-aware grouped search; minimum two characters               |

Record lists accept `page`, `limit` (maximum 100), `q`, catalog-approved `sort`, and `order=asc|desc`. Class-context lists accept `class_id`; classes also accept `year_id`, questions `bank_id`. Results, submissions, attempts, notifications, messages, and audit use paginated responses with `items`, `total`, `page`, `limit`. Search returns a small bounded grouped result set. Reference selectors request small pages instead of downloading every account.

Updates include the current positive integer `version`. A stale version returns 409 `conflict`. Transitions use `{ "action": "publish", "version": 1 }`, with only entity-valid actions accepted. Public/draft/result visibility is checked again at the server, independently of frontend state.

Errors use `{ "error": "stable_translation_key", "request_id": "uuid" }`. Standard classes are 400 validation, 401 session, 403 permission/CSRF, 404 unavailable record, 409 conflict/lifecycle, 413 size, 429 rate limit, 500 generic internal failure. Private API responses send `Cache-Control: no-store`.

The server source and integration tests are the executable contract. Endpoints do not accept table names outside the shared catalog, raw SQL, arbitrary roles, or arbitrary filesystem paths.

School identity: `GET /auth/microsoft/start` starts the server-owned OIDC flow; `GET /auth/microsoft/callback` consumes a browser-bound transaction. Both are public authentication endpoints, with no client-selected role or callback destination. `/public` reports only whether the provider is configured.

Teacher onboarding: administrator-only `GET /teaching-classes?q=...&page=...` returns paginated, searchable academic context; `POST /teachers` accepts `{name,email,password,class_ids}` and creates the teacher and assignments atomically; `POST /teachers/:id/assignments` accepts `{class_ids}` and adds assignments idempotently while preserving history. Invalid/archived classes and timetable/exam conflicts reject the whole transaction.

`GET /control-center` is available to admin and school_management. It returns actual active-year academic follow-up; only admin receives the account summary. School management gets a filtered academic view from `/audit` and read-only role responsibilities from `/permissions`.

`POST /people/:id/role` is admin-only and requires `{role,version,current_password}`. It checks active-account/history rules, prevents self-demotion, invalidates target sessions and records old/new roles. `POST /people/microsoft` is admin-only, taking `{name,email,object_id}` against the configured school tenant; Microsoft callback authentication can only resolve a previously created identity. Local `POST /people` and CSV imports support all four roles. All identity mutations/export remain admin-only.

School setup: `/dashboard` returns `setup` only for administrators and school management (null for teachers/students). `/control-center` returns the same typed `readiness` object: `steps`, `completed`, `total`, `activeClasses`, `connectedClasses`, `scheduledClasses`. Step metadata includes localized-copy keys, completion, destination and optional `administratorOnly`. These flags guide navigation; backend role enforcement on each destination remains authoritative. Coverage excludes archived years/classes/accounts and requires every active current-year class to have an active teacher, an active enrolled student, and a schedule entry for the respective steps.

## School roster and teaching setup

- `GET /rosters`: administrator-only batch counts and available academic context.
- `POST /rosters/:id/activate`: administrator selects `{year_id, term_id}`; both must refer to an active, valid academic context.
- `POST /rosters/:id/teacher-credentials`: administrator reauthentication with `{current_password}`; private credential handoff, audited and no-store.
- `GET /teaching-setup`: provisioned teacher's active roster groups/counts and subjects; contains no student identities.
- `POST /teaching-setup`: `{batch_id, selections: [{subject_id, group_ids}]}`. Required once for imported/new unconfigured teachers. Atomic and idempotent; server verifies roles, active batch, subjects and every group.
- `GET /classes/:id/roster?q=&page=&limit=`: assigned teacher or school operator; paginated student identifiers and bilingual names only. Students cannot access this directory.

Pending teaching setup is enforced by authentication middleware, allowing only password change, session/logout and teaching-setup endpoints until completion. Private operational imports are described in [School roster](SCHOOL_ROSTER.md).
