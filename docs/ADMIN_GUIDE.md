# Administrator guide

## Set up a school

The deployment operator first creates your account with `npm run admin`. Sign in and open Settings → School. Set the school's actual name, timezone, and default language. Each user can switch their display language independently.

Open Academic structure. Create a planned year and terms within its date range. Add grades, sections, optional tracks, and subjects. Activate the intended year; only one year can be active. Create classes that link the year, matching term, section, track, and subject.

Open People → Teachers → Create teacher account. Enter the teacher’s full name, school email and a temporary password of at least 12 characters. Select teaching classes using their grade, section, track, subject, year and term. The account and assignments save atomically; conflicts reject the entire operation. Existing teachers can receive additional classes from their profile. Teachers must change their initial password. Create students from People using an initial local password, or use Create Microsoft student account with the immutable Object ID from the configured school directory. Enroll them through Academic structure → Enrollments. Choose admin or school_management when creating the corresponding staff account. Only admins can create, edit, archive, restore or reset accounts; school management handles academic operations. Finally create recurring Schedule records in school-local time. Conflicts are rejected rather than silently saved.

The School Map shows grades/sections, subjects, classes, teachers, and enrollment counts for a selected year. Clicking a class opens its connected workspace.

## Import and export

Prepare a CSV of up to 500 accounts with columns mapping to name, email, role, and password. Account imports support `admin`, `school_management`, `teacher` and `student` and require an administrator. Upload, map columns, validate, review the preview, correct any errors, then confirm. A preview is valid for 30 minutes. No account is created during preview. Duplicate emails and invalid passwords block the batch. Confirmation is atomic and repeated confirmation does not duplicate accounts.

Spreadsheet users can export their sheet as UTF-8 CSV. Raw Excel binary files are not accepted. People → Export CSV exports authorized account metadata and neutralizes spreadsheet formula prefixes. Passwords are never exported.

## Access and history

Archive an account to revoke its sessions while retaining history. Restore access deliberately when needed. Local-account password reset requires your own administrator password, confirms the affected person, revokes their sessions, and forces a replacement-password change at next login.

Complete grading and close exams before archiving a year. Archiving makes its academic work read-only. Academic memory retains the old structure and published results. Prepare next year copies terms and class structure only; review shifted dates, then reassign teachers and enroll students. The old year's grades stay in the old year.

The audit log records important changes. The roles screen describes the fixed role policy. Role navigation preview is labeled and logged; it never impersonates another account. System Health runs actual database/storage/session checks when opened or refreshed.

## Administrator control center

Open Control center for school-wide academic follow-up plus account totals by role/status, account management, imports, full audit and system settings. Create accounts as Student, Teacher, School management or Administrator. Elevated account creation shows a confirmation. Existing account → Change account role requires your administrator password and ends that account's sessions. You cannot change your own role or bypass unresolved active class memberships.

School management has a distinct academic control center and broad operational pages. It can assign existing teachers and students, but cannot create identities, reset passwords, change roles, change system settings or read account/security audit events.

## Setup progress

The dashboard shows unfinished setup steps; Control center always retains the checklist. It checks saved school identity (Settings must have been saved), an active academic year, terms belonging to that year, grade-linked sections and subjects, at least one active teacher and student, teacher/student membership in **every** active current-year class, and at least one schedule entry for each of those classes. Tracks remain optional. No classes means membership and schedule setup are incomplete. Historical years and archived accounts do not satisfy current coverage. School identity completion means settings were saved; it does not independently verify the school's identity.

Links open the relevant academic tab and adapt from creating classes to assigning teachers and enrolling students. Academic tab URLs survive refresh. Steps are configuration checks, not certification that every school workflow is ready. Counts are derived on each dashboard/control request; no manual completion flags or synthetic percentages are stored.
