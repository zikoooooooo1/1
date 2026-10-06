# School roster and first teacher sign-in

The private roster import creates local student and teacher accounts, academic grades/sections/tracks, seven initial subjects and a pending roster. It does not invent an academic calendar or create school email addresses.

## Student accounts

- The supplied student identifier is the username, including alphabetic suffixes. Identifiers are unique case-insensitively.
- Both supplied Arabic and English full names are retained.
- Initial password: identifier, `@`, uppercase initials of the first two English name tokens, then `2027`. This school-requested format is a temporary credential, enforced by the existing first-sign-in password-change gate.
- Only salted scrypt hashes are stored in the database. Students cannot read another student's roster/profile through the new endpoints.
- No student names, identifiers or passwords belong in Git, test fixtures, media, public downloads or repository documentation.

## Private import

Place the school's Markdown table and one-teacher-per-line text file outside the checkout. The table has four columns: student identifier, Arabic name, English name, class code. Class codes support grades 5–12, A/G, and numbered sections, including section 5 when supplied. Preview first:

```sh
npx tsx scripts/import-school.ts /private/students.md /private/teachers.txt "School roster"
```

Take and validate a private backup as documented in DEPLOYMENT.md. Use the existing administrator UUID for the explicit commit:

```sh
npx tsx scripts/import-school.ts /private/students.md /private/teachers.txt "School roster" ADMIN_UUID --commit
```

The CLI prints counts and batch status, never names or credentials. Malformed rows and duplicate student identifiers reject the import. It preserves existing accounts and rejects identifier collisions. An identical retry returns the existing batch without resetting passwords. All database inserts run in one transaction. A failed credential-file write rolls back the import.

Teachers receive unique first-name/last-name usernames (with a numeric suffix for collisions), random temporary passwords and mandatory password change. A private handoff JSON file is written with mode 0600 under the `account-handoffs/` directory beside `STORAGE_PATH`. It is outside the web root and ignored with the default `data/` directory. The administrator can download it from Control center → School roster after re-entering their administrator password. Downloads are audited and not cached. Distribute credentials individually using the school's approved channel, then remove the private handoff file once distribution is complete. Changed passwords cannot be recovered from this file; use the normal audited reset workflow.

## Activate the real academic context

Create the actual academic year and terms through Academic structure, activate the correct year, then select that year and term from Control center → School roster → Activate roster. The server rejects a term from another year and a second active roster. Activation is immutable for this batch; it must not silently move student records between school years.

Until activation, teachers can change their password and see a clear waiting state, but cannot access teaching APIs. Students can sign in and change their password; class lists are empty until teachers' selections create/enroll the actual subject classes.

## Required teacher steps

1. Select one or more subjects.
2. Select teaching grades 5–12.
3. For each subject, select the actual track/section combinations shown from the imported roster.
4. Review and confirm the assigned teaching scope.

The school's requested policy allows authenticated provisioned teachers to confirm their own teaching allocation from this bounded roster. No additional administrator approval is inserted. Therefore the roster and provisioning must contain only authorized school staff. Teachers cannot invent groups, access another batch, assign another teacher, create accounts or acquire administrator/management privileges.

Completion atomically creates one class for each selected subject/group, associates the teacher and enrolls that group's active students. Multiple teachers choosing the same subject/group reuse the class. Existing classes and memberships are preserved. Repeat submissions return the completed class IDs without expanding access. Subsequent assignment changes use the existing administrator/management controls.

Teachers see student number and both full names in their class's Students tab, with search and pagination. Passwords, contact email and authentication details are excluded. The endpoint verifies actual class assignment. Students are not allowed to enumerate the class roster.

## Migration and recovery

Migration 005 makes contact email nullable while preserving all user IDs, credentials and dependent relationships. The migration runner recognizes an explicit versioned rebuild marker, disables FK enforcement only outside the schema transaction, verifies every foreign key before commit and restores enforcement in `finally`. A failure rolls back and prevents startup. Back up before deploying this schema to an existing school.

The roster batch contains its academic context. Previous batches/classes remain available through their academic year; new-year roster import currently requires an operator-reviewed migration for returning existing students, because automatic overwrite/re-enrollment is intentionally rejected. The current CLI handles first provisioning, not a silent annual rollover.
