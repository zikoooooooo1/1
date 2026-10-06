# Testing

## Automated checks

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

`npm run typecheck` separately checks browser and server TypeScript. ESLint checks the application, scripts, and tests. The Node test runner uses `tsx` and Supertest against the real Express middleware and an isolated SQLite database. Authorization always runs against the real middleware and SQLite. OIDC tests intercept only HTTPS transport, signing fixture ID tokens with ephemeral RSA keys so the real OpenID library verifies claims and signatures.

The workflow suite covers:

- Anonymous request rejection, CSRF, foreign Origin, role escalation, generic credential errors
- Academic hierarchy, role-valid teacher/student assignments, unique enrollments
- Private file storage, unpublished resource denial, enrolled publication access, search leakage
- Assignment publication, immutable/idempotent submission, private grading, optimistic conflicts, returned results, completion
- Teacher-owned question banks and immutable exam question snapshots
- Exam review/schedule/publication, randomized attempts, answer persistence, stale saves, IDOR rejection, attempt limits
- Server-enforced expiration, automatic grading, manual grading, close/release gates, published results
- Room/timetable conflicts and new-membership conflicts
- Class audience restrictions and teacher/student messaging relationships
- CSV parsing/mapping/preview, duplicate detection, atomic and idempotent imports, first-login password rotation
- Archived academic data, write prevention, structure-only year rollover, audit and health authorization

Fixtures are synthetic and use random passwords. Tests remove temporary file storage. A test failure should be fixed rather than weakening authorization assertions.

## Browser acceptance

Use a dedicated test database with synthetic fixtures, separate from school accounts. The public product film does not create or sign into demonstration accounts.

1. Administrator: configure a school, build a year/term/grade/section/subject/class, create teachers with class assignments, create local students or preapprove Microsoft student identities, enroll, and create a timetable.
2. Teacher: create bank questions, build and review an exam, publish an assignment/resource, and publish a class announcement.
3. Student: confirm only enrolled work appears; submit an assignment, start an exam, save answers, refresh, and submit.
4. Teacher: grade/return the submission, close the exam, complete manual grading, and release results.
5. Student: verify result visibility changes only after return/release.
6. Administrator: inspect audit history and import a valid CSV after preview. Repeat a confirmation and verify it does not create duplicate accounts.
7. Try unauthorized direct URLs using a different teacher/student account. Do not rely on missing navigation links alone.

Repeat essential screens at 1440px desktop, 768px tablet, and 390px mobile widths; review both English/LTR and Arabic/RTL. Check keyboard dialog focus, command-bar keyboard navigation, form labels, color contrast, and page overflow. Switch offline during a form and during an exam; verify saved and unsaved state is truthful.

## Runtime and production

Build before starting `NODE_ENV=production`. Check `/readyz`, the actual app entry point, private-cache/security headers, and authenticated health. Check backup integrity and a restoration drill. Validate the exact production reverse-proxy origin before accepting live credentials.

The repository supplies CI checks, but does not claim that every browser engine or hosting platform has been tested. Chromium browser validation and any packaging limitations are reported by the implementation task. Safari/Firefox coverage and realistic load testing remain deployment acceptance activities.

School identity tests also cover member/guest/foreign-tenant rejection, full-name synchronization, no email takeover, archived identities, administrator-created local student access and unapproved Microsoft signup rejection, administrator login IDs, transactional teacher onboarding, academic context search, conflict rollback and password rotation. `tests/microsoft-oidc.test.ts` checks the actual OIDC library's signed-token validation with ephemeral RSA keys and an isolated HTTPS transport fixture. Real Entra acceptance requires school configuration; see `docs/MICROSOFT_SETUP.md`.

Home acceptance: verify anonymous home and transcript, both language films, audio, caption loading, pause/seek, language switching during playback, download, login/dashboard/home navigation, phone/tablet layout and reduced-motion behavior. Video should not download on initial page load (`preload="none"`).
