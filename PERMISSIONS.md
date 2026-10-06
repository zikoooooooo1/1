# Roles and permissions

CLASO has four fixed roles. Only `admin` manages account access. `school_management` operates the whole school's academic workflows without administrator security privileges. Every protected operation authenticates the session, checks its current database role and then applies resource scope.

| Action                                                             | Administrator (`admin`)         | School management (`school_management`) | Teacher                              | Student                               |
| ------------------------------------------------------------------ | ------------------------------- | --------------------------------------- | ------------------------------------ | ------------------------------------- |
| Create local accounts / choose any of four roles                   | Yes                             | No                                      | No                                   | No                                    |
| Import / export accounts                                           | Yes                             | No                                      | No                                   | No                                    |
| Edit, archive, restore, reset account passwords                    | Yes                             | No                                      | No                                   | No                                    |
| Change an account role                                             | Yes, with password confirmation | No                                      | No                                   | No                                    |
| Create approved Microsoft student identity                         | Yes                             | No                                      | No                                   | No                                    |
| Manage school identity, locale, timezone / system health           | Yes                             | No                                      | No                                   | No                                    |
| Academic years, terms, grades, sections, tracks, subjects, classes | All                             | All                                     | Read assigned context                | Read enrolled context                 |
| Assign existing teachers / enroll existing students                | Yes                             | Yes                                     | Read assigned classes                | Own enrollment                        |
| Lessons, resources, assignments, exams and grading                 | All active classes              | All active classes                      | Assigned active classes              | Submit own enrolled work              |
| Question banks                                                     | All                             | All                                     | Own banks / assigned subjects        | No                                    |
| Timetables and announcements                                       | School-wide                     | School-wide                             | Assigned classes                     | Published relevant information        |
| Results / analytics                                                | School-wide                     | School-wide                             | Assigned classes                     | Own released results                  |
| People directory / search                                          | All accounts                    | Students, teachers and own profile      | Assigned students and own profile    | Own account                           |
| Audit log                                                          | All activity                    | Academic entities only                  | No                                   | No                                    |
| Role responsibility matrix                                         | Read                            | Read                                    | No                                   | No                                    |
| Private files                                                      | All                             | Own files and academic attachments      | Own / assigned learning attachments  | Own / published permitted attachments |
| Messages                                                           | Any active account              | Any active account                      | Assigned students / school operators | Assigned teachers / school operators  |
| Archived academic history                                          | Yes                             | Yes                                     | Historical assignments               | Historical enrollments                |
| Edit archived academic work                                        | No                              | No                                      | No                                   | No                                    |

## Account lifecycle

Administrator-created local accounts, including students, must change their initial password at first sign-in. All account changes are audited. Role changes require the acting administrator's password and an optimistic version, invalidate the target's sessions, and cannot demote the current actor. The last active administrator is protected. A teacher/student with active academic memberships must finish that academic transition before changing role; historical records are retained. Microsoft identities remain student-only.

School management cannot grant itself more permissions through account endpoints, imports, generic academic record endpoints, client-supplied roles or direct URLs. Its control center returns academic indicators; administrator-only account summaries are omitted. Its audit log excludes account/security events. Unattached private uploads do not become visible merely because someone has the management role.

## Microsoft approval

Only an administrator can create a Microsoft student account, using the immutable Object ID from the configured school tenant. Verified Microsoft sign-in refreshes the full name of that existing identity; it never creates an account or links by email. Local student accounts are supported while school identity integration is being configured. No public signup route exists.

## Enforcement and navigation

The shared role definitions are in `src/shared/roles.ts`. Backend `classScope`, `classAccess`, `entityScope` and explicit administrative gates enforce permissions. Versioned role/permission rows document the same boundaries. The permission matrix is read-only; custom roles are not exposed.

The administrator's role navigation preview is labeled and audited. It changes navigation only, never backend identity. Verify actual management/teacher/student access using a separate authorized account. The administrator control center includes account, import and system controls; school management sees academic operations, follow-up and academic activity.
