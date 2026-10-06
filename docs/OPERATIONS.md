# Operational boundaries and runbook

## Supported scope

One deployment represents one school, on one persistent Node server. There is no platform-level multi-tenant administrator, cross-school sharing, distributed job queue or automated email provider. Students can use administrator-created local accounts or an approved Microsoft Entra identity; academic data workflows remain self-hosted. Schools with those needs should extend the explicit service/policy boundaries and test the resulting deployment.

## Files and retention

Uploads are immutable and private. The logical academic location comes from a resource, assignment, question, or submission relationship; physical paths use opaque IDs. Unattached uploads remain owned by the uploader and count toward quota. The application does not expose a destructive storage cleanup UI. Review unreferenced files through an authorized maintenance procedure, preserve backups, and audit any permanent removal.

Account/year/class archive preserves history. No automatic retention purge is scheduled. A school must define retention, privacy, legal-hold, and deletion requirements for its jurisdiction before operational use; this software does not determine them.

## Monitoring

`/readyz` checks HTTP/database readiness. Administrator System Health checks SQLite integrity, filesystem read/write access, and the authenticated session, plus version and time. Filesystem access checks are not a disk-capacity forecast or restore test. Monitor free disk, service uptime, certificate expiry, request rates, and backups using the school's approved tools.

Unexpected server errors log a request ID, route template, and coarse error code. Investigate by correlating the user-visible request ID. Do not add request bodies, passwords, tokens, or student answers to production logs.

## Incident recovery

If the service is unavailable, inspect process health, database path permissions, storage permissions, disk space, proxy origin, and TLS. Restart only after addressing the cause. Preserve data; never reset the database to recover a login or migration error. Restore only from a validated backup in a controlled maintenance window.

Expired exam attempts finalize on a 15-second interval and on attempt retrieval. If the server was down, start it and allow expiration processing before releasing results. The original stored deadline still applies. Schools need their own supervised policy for restarting or accommodating an interrupted assessment; a browser cannot determine fairness automatically.

## Capacity

Paginated record/work lists and permission predicates prevent full-school downloads in normal workflows. SQLite remains a synchronous, single-writer database. Test representative concurrent exam autosave and import traffic before accepting a large school. Avoid running imports during a high-stakes examination. Horizontal scaling requires migrating the adapter and revisiting sessions, limits, jobs, and file storage.

## Deliberate implementation choices

- Fixed administrator/teacher/student roles; no configurable custom permission editor.
- CSV imports; spreadsheets export to CSV. No binary Excel parser.
- Question images are secure attachments; equations are plain Unicode notation. No remote rendering dependency.
- Read-only role navigation preview is labeled, audited, and retains admin privileges; it is not impersonation.
- No persistent browser cache of private data, background offline submission, or browser lockdown claim.
- Backup tooling creates a protected local snapshot; scheduling, encryption, offsite copies, and restore drills are operator tasks.
