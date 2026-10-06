import { isSchoolOperator } from '../shared/roles.js';
import { z } from 'zod';
import { catalog } from '../shared/catalog.js';
import { Store, type Row, now, id } from './db.js';
import { classAccess, classScope, requireRole, type User } from './auth.js';
import { assert } from './errors.js';
export function parseEntity(entity: string, input: unknown): Row {
  const def = catalog[entity];
  assert(def, 'not_found', 404);
  const shape: Record<string, z.ZodType> = {};
  for (const f of def.fields) {
    let schema: z.ZodType;
    if (f.type === 'number')
      schema = z.coerce
        .number()
        .finite()
        .min(f.min ?? 0)
        .max(f.max ?? 10000);
    else if (f.type === 'checkbox')
      schema = z
        .union([z.literal(0), z.literal(1), z.boolean()])
        .transform((v) => (v ? 1 : 0))
        .default(0);
    else if (f.ref || f.type === 'file') schema = z.string().uuid();
    else if (f.options) schema = z.enum(f.options as [string, ...string[]]);
    else if (f.type === 'date') schema = z.iso.date();
    else if (f.type === 'datetime-local')
      schema = z
        .string()
        .refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date')
        .transform((s) => new Date(s).toISOString());
    else if (f.type === 'time') schema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
    else
      schema = z
        .string()
        .trim()
        .max(f.type === 'textarea' ? 20000 : 500);
    if (
      f.required &&
      f.type !== 'number' &&
      f.type !== 'checkbox' &&
      !f.options &&
      !f.ref &&
      f.type !== 'file'
    )
      schema = schema.refine((s) => String(s).length > 0);
    if (!f.required && f.type !== 'checkbox')
      schema = schema.optional().nullable().or(z.literal(''));
    shape[f.key] = schema;
  }
  const out = z.object(shape).strict().parse(input) as Row;
  for (const f of def.fields) {
    if (out[f.key] === undefined || out[f.key] === '')
      out[f.key] = f.ref || f.type === 'file' || ['url', 'expires_at'].includes(f.key) ? null : '';
  }
  return out;
}
export function announcementScope(user: User, alias = 'e') {
  if (isSchoolOperator(user)) return { sql: '1=1', params: [] as string[] };
  const scope = classScope(user, 'ac');
  return {
    sql: `(${alias}.created_by=? OR (${alias}.status='published' AND ${alias}.publish_at<=? AND (${alias}.expires_at IS NULL OR ${alias}.expires_at>?) AND (${alias}.audience_type='school' OR (${alias}.audience_type='user' AND ${alias}.audience_id=?) OR EXISTS(SELECT 1 FROM classes ac JOIN sections sec ON sec.id=ac.section_id WHERE ${scope.sql} AND ((${alias}.audience_type='class' AND ${alias}.audience_id=ac.id) OR (${alias}.audience_type='section' AND ${alias}.audience_id=ac.section_id) OR (${alias}.audience_type='track' AND ${alias}.audience_id=ac.track_id) OR (${alias}.audience_type='grade' AND ${alias}.audience_id=sec.grade_id))))))`,
    params: [user.id, now(), now(), user.id, ...scope.params],
  };
}
export function entityScope(db: Store, user: User, entity: string) {
  const def = catalog[entity];
  assert(def, 'not_found', 404);
  if (entity === 'announcements') return announcementScope(user);
  if (entity === 'classes') return classScope(user, 'e');
  if (entity === 'question_banks' || entity === 'questions') {
    requireRole(user, 'admin', 'school_management', 'teacher');
    if (isSchoolOperator(user)) return { sql: '1=1', params: [] };
    return {
      sql:
        entity === 'question_banks'
          ? 'e.created_by=?'
          : 'e.bank_id IN (SELECT id FROM question_banks WHERE created_by=?)',
      params: [user.id],
    };
  }
  if (def.classScoped) {
    const scope = classScope(user, 'c');
    let sql = `EXISTS(SELECT 1 FROM classes c WHERE c.id=e.class_id AND ${scope.sql})`;
    if (
      user.role === 'student' &&
      ['assignments', 'exams', 'lessons', 'resources'].includes(entity)
    )
      sql +=
        entity === 'exams'
          ? " AND e.status IN ('published','closed','results')"
          : entity === 'assignments'
            ? " AND e.status IN ('published','complete')"
            : " AND e.status='published'";
    return { sql, params: scope.params };
  }
  if (def.admin && !isSchoolOperator(user)) {
    if (['teacher_assignments', 'enrollments'].includes(entity)) {
      const scope = classScope(user, 'c');
      return {
        sql: `EXISTS(SELECT 1 FROM classes c WHERE c.id=e.class_id AND ${scope.sql})${user.role === 'student' && entity === 'enrollments' ? ' AND e.student_id=?' : ''}`,
        params: [
          ...scope.params,
          ...(user.role === 'student' && entity === 'enrollments' ? [user.id] : []),
        ],
      };
    }
    const scope = classScope(user, 'c');
    const link: Record<string, string> = {
      academic_years: 'c.year_id=e.id',
      terms: 'c.term_id=e.id',
      subjects: 'c.subject_id=e.id',
      sections: 'c.section_id=e.id',
      tracks: 'c.track_id=e.id',
      grades: 'c.section_id IN (SELECT id FROM sections WHERE grade_id=e.id)',
    };
    assert(link[entity], 'forbidden', 403);
    return {
      sql: `EXISTS(SELECT 1 FROM classes c WHERE ${link[entity]} AND ${scope.sql})`,
      params: scope.params,
    };
  }
  return { sql: '1=1', params: [] };
}
export function getEntity(db: Store, user: User, entity: string, target: string) {
  const scope = entityScope(db, user, entity);
  const row = db.get(
    `SELECT e.* FROM ${entity} e WHERE e.id=? AND ${scope.sql}`,
    target,
    ...scope.params,
  );
  assert(row, 'not_found', 404);
  return row;
}
export function canWrite(db: Store, user: User, entity: string, row: Row) {
  requireRole(user, 'admin', 'school_management', 'teacher');
  if (catalog[entity].admin) requireRole(user, 'admin', 'school_management');
  if (row.class_id) classAccess(db, user, row.class_id, true);
  if (entity === 'announcements' && user.role === 'teacher') {
    assert(row.audience_type === 'class', 'forbidden', 403);
    classAccess(db, user, row.audience_id, true);
    if (row.created_by) assert(row.created_by === user.id, 'forbidden', 403);
  }
  if (entity === 'question_banks' && user.role === 'teacher') {
    if (row.created_by) assert(row.created_by === user.id, 'forbidden', 403);
    assert(
      db.get(
        "SELECT c.id FROM classes c JOIN teacher_assignments t ON t.class_id=c.id WHERE c.subject_id=? AND t.teacher_id=? AND c.status='active'",
        row.subject_id,
        user.id,
      ),
      'forbidden',
      403,
    );
  }
  if (entity === 'questions') {
    const bank = db.get('SELECT * FROM question_banks WHERE id=?', row.bank_id);
    assert(bank, 'not_found', 404);
    canWrite(db, user, 'question_banks', bank);
  }
}
export function validateRelations(db: Store, user: User, entity: string, row: Row) {
  for (const f of catalog[entity].fields)
    if (f.ref && row[f.key]) {
      const table = ['students', 'teachers'].includes(f.ref) ? 'users' : f.ref;
      const related = db.get(`SELECT * FROM ${table} WHERE id=?`, row[f.key]);
      assert(related, 'invalid_relationship');
      if (table === 'users')
        assert(
          related.status === 'active' &&
            related.role === (f.ref === 'students' ? 'student' : 'teacher'),
          'invalid_relationship',
        );
    }
  if (row.file_id)
    assert(
      db.get('SELECT id FROM files WHERE id=? AND uploaded_by=?', row.file_id, user.id),
      'invalid_file',
    );
  if (row.year_id)
    assert(
      db.get("SELECT id FROM academic_years WHERE id=? AND status!='archived'", row.year_id),
      'academic_archived',
      409,
    );
  if (entity === 'academic_years' || entity === 'terms') {
    assert(row.start_date < row.end_date, 'date_range');
    if (entity === 'terms') {
      const year = db.get('SELECT * FROM academic_years WHERE id=?', row.year_id)!;
      assert(row.start_date >= year.start_date && row.end_date <= year.end_date, 'date_range');
    }
  }
  if (entity === 'classes') {
    assert(
      db.get('SELECT id FROM terms WHERE id=? AND year_id=?', row.term_id, row.year_id),
      'invalid_relationship',
    );
  }
  if (entity === 'assignments') assert(row.open_at < row.due_at, 'date_range');
  if (entity === 'exams') {
    assert(row.opens_at < row.closes_at, 'date_range');
    assert(
      Number.isInteger(row.duration_minutes) && Number.isInteger(row.max_attempts),
      'invalid_input',
    );
  }
  if (entity === 'assignments' || entity === 'exams') {
    const term = db.get(
      'SELECT t.start_date,t.end_date FROM terms t JOIN classes c ON c.term_id=t.id WHERE c.id=?',
      row.class_id,
    )!;
    const timezone = db.get('SELECT timezone FROM school')!.timezone;
    const date = (value: string) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(value));
    const start = date(row.open_at || row.opens_at),
      end = date(row.due_at || row.closes_at);
    assert(start >= term.start_date && end <= term.end_date, 'date_range');
  }
  if (entity === 'resources') {
    assert(row.url || row.file_id, 'resource_required');
    if (row.url) {
      let url: URL;
      try {
        url = new URL(row.url);
      } catch {
        assert(false, 'invalid_url');
      }
      assert(['https:', 'http:'].includes(url.protocol), 'invalid_url');
    }
  }
  if (entity === 'questions') {
    assert(row.prompt?.trim(), 'invalid_input');
    let options: unknown;
    try {
      options = JSON.parse(row.options || '[]');
    } catch {
      assert(false, 'invalid_options');
    }
    assert(
      Array.isArray(options) &&
        options.length <= 12 &&
        options.every((o) => typeof o === 'string' && o.length > 0 && o.length <= 2000),
      'invalid_options',
    );
    if (row.type === 'true_false') options = ['true', 'false'];
    if (row.type === 'multiple_choice' || row.type === 'true_false') {
      assert(
        (options as string[]).length >= 2 &&
          new Set(options as string[]).size === (options as string[]).length,
        'invalid_options',
      );
      assert((options as string[]).includes(row.correct_answer), 'invalid_answer');
    }
    if (row.type === 'image') assert(row.file_id, 'invalid_file');
    row.options = JSON.stringify(options);
  }
  if (entity === 'announcements') {
    assert(row.content?.trim(), 'invalid_input');
    const table: Record<string, string> = {
      grade: 'grades',
      section: 'sections',
      track: 'tracks',
      class: 'classes',
      user: 'users',
    };
    if (row.audience_type !== 'school')
      assert(
        row.audience_id &&
          db.get(`SELECT id FROM ${table[row.audience_type]} WHERE id=?`, row.audience_id),
        'invalid_relationship',
      );
    else row.audience_id = null;
    if (row.expires_at) assert(row.expires_at > row.publish_at, 'date_range');
  }
  if (entity === 'schedules') {
    assert(row.starts_at < row.ends_at, 'date_range');
    checkSchedule(db, row, row.id);
  }
  if (entity === 'teacher_assignments' || entity === 'enrollments')
    checkMembershipConflict(db, entity, row);
}
export function checkSchedule(db: Store, row: Row, exclude?: string) {
  const conflicts = db.all(
    `SELECT s.*,c.term_id,t.start_date,t.end_date FROM schedules s JOIN classes c ON c.id=s.class_id JOIN terms t ON t.id=c.term_id WHERE s.day=? AND s.starts_at<? AND s.ends_at>? AND s.id!=? AND c.status='active'`,
    Number(row.day),
    row.ends_at,
    row.starts_at,
    exclude || '',
  );
  const term = db.get(
    'SELECT t.* FROM terms t JOIN classes c ON c.term_id=t.id WHERE c.id=?',
    row.class_id,
  )!;
  for (const other of conflicts) {
    if (term.start_date > other.end_date || term.end_date < other.start_date) continue;
    assert(
      !(
        other.class_id === row.class_id ||
        (row.room && row.room === other.room) ||
        sharedPeople(db, row.class_id, other.class_id)
      ),
      'schedule_conflict',
      409,
    );
  }
}
export function sharedPeople(db: Store, a: string, b: string) {
  return (
    db.get(
      'SELECT x.id FROM teacher_assignments x JOIN teacher_assignments y ON x.teacher_id=y.teacher_id WHERE x.class_id=? AND y.class_id=?',
      a,
      b,
    ) ||
    db.get(
      'SELECT x.id FROM enrollments x JOIN enrollments y ON x.student_id=y.student_id WHERE x.class_id=? AND y.class_id=?',
      a,
      b,
    )
  );
}
function checkMembershipConflict(db: Store, entity: string, row: Row) {
  const column = entity === 'enrollments' ? 'student_id' : 'teacher_id';
  const conflicts = db.get(
    `SELECT s.id FROM schedules s JOIN classes c ON c.id=s.class_id JOIN terms t ON t.id=c.term_id JOIN ${entity} m ON m.class_id=c.id JOIN schedules target ON target.class_id=? JOIN classes tc ON tc.id=target.class_id JOIN terms tt ON tt.id=tc.term_id WHERE m.${column}=? AND c.id!=? AND c.status='active' AND s.day=target.day AND s.starts_at<target.ends_at AND s.ends_at>target.starts_at AND t.start_date<=tt.end_date AND t.end_date>=tt.start_date`,
    row.class_id,
    row[column],
    row.class_id,
  );
  assert(!conflicts, 'schedule_conflict', 409);
  const examConflict = db.get(
    `SELECT e.id FROM exams e JOIN ${entity} m ON m.class_id=e.class_id JOIN exams target ON target.class_id=? WHERE m.${column}=? AND e.class_id!=? AND e.status IN ('scheduled','published') AND target.status IN ('scheduled','published') AND e.opens_at<target.closes_at AND e.closes_at>target.opens_at`,
    row.class_id,
    row[column],
    row.class_id,
  );
  assert(!examConflict, 'exam_conflict', 409);
}
export function notifyClass(
  db: Store,
  classId: string,
  title: string,
  entity: string,
  target: string,
) {
  for (const member of db.all(
    'SELECT student_id id FROM enrollments WHERE class_id=? UNION SELECT teacher_id id FROM teacher_assignments WHERE class_id=?',
    classId,
    classId,
  ))
    db.insert('notifications', {
      id: id(),
      user_id: member.id,
      title,
      entity_type: entity,
      entity_id: target,
      created_at: now(),
    });
}
export function updateVersion(
  db: Store,
  table: string,
  target: string,
  version: number,
  data: Row,
) {
  const fields = Object.keys(data);
  const result = db.run(
    `UPDATE ${table} SET ${fields.map((k) => `${k}=?`).join(',')},version=version+1 WHERE id=? AND version=?`,
    ...Object.values(data),
    target,
    version,
  );
  assert(result.changes === 1, 'conflict', 409);
}
