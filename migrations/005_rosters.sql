-- claso:rebuild-foreign-keys
-- Contact email is optional for local school-number accounts. Preserve all identities and references.
CREATE TABLE users_new (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT COLLATE NOCASE UNIQUE,
 role TEXT NOT NULL REFERENCES roles(id), password_hash TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 must_change_password INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 login_id TEXT COLLATE NOCASE, auth_provider TEXT NOT NULL DEFAULT 'password' CHECK(auth_provider IN ('password','microsoft')),
 name_ar TEXT, name_en TEXT, student_number TEXT UNIQUE,
 teacher_setup_required INTEGER NOT NULL DEFAULT 0 CHECK(teacher_setup_required IN (0,1))
);
INSERT INTO users_new(id,name,email,role,password_hash,status,must_change_password,created_at,version,login_id,auth_provider)
 SELECT id,name,email,role,password_hash,status,must_change_password,created_at,version,login_id,auth_provider FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
CREATE UNIQUE INDEX users_login_id ON users(login_id) WHERE login_id IS NOT NULL;
CREATE INDEX users_role ON users(role,status);
CREATE TABLE roster_batches (
 id TEXT PRIMARY KEY, label TEXT NOT NULL, fingerprint TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','archived')),
 year_id TEXT REFERENCES academic_years(id), term_id TEXT REFERENCES terms(id),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 CHECK(status!='active' OR (year_id IS NOT NULL AND term_id IS NOT NULL))
);
CREATE UNIQUE INDEX one_active_roster ON roster_batches(status) WHERE status='active';
CREATE TABLE roster_groups (
 id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES roster_batches(id), code TEXT NOT NULL,
 grade_level INTEGER NOT NULL CHECK(grade_level BETWEEN 5 AND 12),
 section_id TEXT NOT NULL REFERENCES sections(id), track_id TEXT REFERENCES tracks(id),
 UNIQUE(batch_id,code)
);
CREATE TABLE roster_memberships (
 student_id TEXT NOT NULL REFERENCES users(id), batch_id TEXT NOT NULL REFERENCES roster_batches(id),
 group_id TEXT NOT NULL REFERENCES roster_groups(id), PRIMARY KEY(student_id,batch_id)
);
CREATE INDEX roster_memberships_group ON roster_memberships(group_id,student_id);
CREATE TABLE teaching_setup_completions (
 teacher_id TEXT PRIMARY KEY REFERENCES users(id), batch_id TEXT NOT NULL REFERENCES roster_batches(id),
 class_ids TEXT NOT NULL, completed_at TEXT NOT NULL
);
CREATE TABLE roster_classes (
 group_id TEXT NOT NULL REFERENCES roster_groups(id), subject_id TEXT NOT NULL REFERENCES subjects(id),
 class_id TEXT NOT NULL UNIQUE REFERENCES classes(id), PRIMARY KEY(group_id,subject_id)
);
