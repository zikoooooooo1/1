import { randomBytes } from 'node:crypto';
import { Store, id, now } from './db.js';
import { assert } from './errors.js';
import { digest, hashPassword } from './auth.js';

export type RosterStudent = { number: string; name_ar: string; name_en: string; code: string };
export const schoolSubjects = [
  ['PHY', 'Physics'],
  ['CHEM', 'Chemistry'],
  ['AR', 'Arabic'],
  ['EN', 'English'],
  ['MATH', 'Mathematics'],
  ['ISLAM', 'Islamic Studies'],
  ['SOCIAL', 'Social Studies'],
] as const;
export function parseSchoolRoster(markdown: string): RosterStudent[] {
  assert(markdown.length <= 2_000_000, 'file_too_large');
  const lines = markdown
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim());
  assert(lines.length >= 3 && lines.length <= 5002, 'invalid_roster');
  const separator = lines[1]
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((v) => v.trim());
  assert(
    separator.length === 4 && separator.every((v) => /^:?-{2,}:?$/.test(v)),
    'invalid_roster_header',
  );
  const seen = new Set<string>();
  return lines.slice(2).map((line, i) => {
    const fields = line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((value) => value.replace(/\s+/g, ' ').trim());
    assert(fields.length === 4, `invalid_roster_row_${i + 3}`);
    const [number, name_ar, name_en, code] = fields;
    assert(
      /^[A-Za-z0-9]{5,32}$/.test(number) &&
        name_ar.length > 0 &&
        name_ar.length <= 200 &&
        name_en.length <= 200 &&
        /^[A-Za-z]/.test(name_en) &&
        name_en.split(' ').length >= 2 &&
        /^(?:[5-9]|1[0-2])[AG][1-9]$/.test(code),
      `invalid_roster_row_${i + 3}`,
    );
    assert(!seen.has(number.toLowerCase()), 'duplicate_student_number');
    seen.add(number.toLowerCase());
    return { number, name_ar, name_en, code };
  });
}
export function initialStudentPassword(student: RosterStudent) {
  const parts = student.name_en.split(/\s+/);
  const initials = parts
    .slice(0, 2)
    .map((s) => s.match(/[a-z]/i)?.[0] || '')
    .join('')
    .toUpperCase();
  assert(initials.length === 2, 'invalid_initials');
  return `${student.number}@${initials}2027`;
}
export function parseTeacherNames(text: string) {
  const names = text
    .split(/\r?\n/)
    .map((v) => v.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  assert(
    names.length > 0 &&
      names.length <= 500 &&
      names.every((v) => /^[A-Za-z][A-Za-z .'-]{2,199}$/.test(v)),
    'invalid_teacher_names',
  );
  assert(
    new Set(names.map((v) => v.toLowerCase())).size === names.length,
    'duplicate_teacher_name',
  );
  return names;
}
export async function importSchoolRoster(
  db: Store,
  actorId: string,
  label: string,
  students: RosterStudent[],
  teachers: string[],
  handoff?: (
    batchId: string,
    credentials: { name: string; username: string; password: string }[],
  ) => void,
) {
  assert(label.trim().length > 0 && label.length <= 120, 'invalid_roster');
  assert(
    db.get("SELECT id FROM users WHERE id=? AND role='admin' AND status='active'", actorId),
    'forbidden',
    403,
  );
  const fingerprint = digest(JSON.stringify({ students, teachers }));
  const existing = db.get('SELECT id FROM roster_batches WHERE fingerprint=?', fingerprint);
  if (existing)
    return {
      batch_id: existing.id as string,
      imported: false,
      students: students.length,
      teachers: teachers.length,
      credentials: [],
    };
  const records: Record<string, any>[] = [],
    credentials: { name: string; username: string; password: string }[] = [];
  const used = new Set(
    db
      .all('SELECT login_id FROM users WHERE login_id IS NOT NULL')
      .map((r) => r.login_id.toLowerCase()),
  );
  for (const s of students) {
    assert(
      !used.has(s.number.toLowerCase()) &&
        !db.get('SELECT id FROM users WHERE student_number=? OR email=?', s.number, s.number),
      'student_already_exists',
      409,
    );
    used.add(s.number.toLowerCase());
    records.push({
      id: id(),
      name: s.name_en,
      name_en: s.name_en,
      name_ar: s.name_ar,
      student_number: s.number,
      login_id: s.number,
      email: null,
      role: 'student',
      password_hash: await hashPassword(initialStudentPassword(s)),
      created_at: now(),
      must_change_password: 1,
    });
  }
  for (const name of teachers) {
    const parts = name.toLowerCase().match(/[a-z]+/g)!;
    const base = `${parts[0]}.${parts.at(-1)}`.slice(0, 55);
    let username = base,
      suffix = 1;
    while (used.has(username)) username = base + ++suffix;
    used.add(username);
    const password = randomBytes(18).toString('base64url');
    records.push({
      id: id(),
      name,
      name_en: name,
      email: null,
      login_id: username,
      role: 'teacher',
      password_hash: await hashPassword(password),
      created_at: now(),
      must_change_password: 1,
      teacher_setup_required: 1,
    });
    credentials.push({ name, username, password });
  }
  const batchId = id();
  db.transaction(() => {
    // Recheck after hashing, before any records are written.
    assert(
      db.get("SELECT id FROM users WHERE id=? AND role='admin' AND status='active'", actorId),
      'forbidden',
      403,
    );
    assert(
      !db.get('SELECT id FROM roster_batches WHERE fingerprint=?', fingerprint),
      'duplicate',
      409,
    );
    db.insert('roster_batches', {
      id: batchId,
      label: label.trim(),
      fingerprint,
      created_by: actorId,
      created_at: now(),
    });
    for (const row of records) db.insert('users', row);
    for (const [code, name] of schoolSubjects)
      if (!db.get('SELECT id FROM subjects WHERE code=?', code))
        db.insert('subjects', { id: id(), name, code });
    for (const code of new Set(students.map((s) => s.code))) {
      const [, gradeNumber, trackCode] = /^(\d+)([AG])\d+$/.exec(code)!;
      let grade = db.get('SELECT id FROM grades WHERE name=?', `Grade ${gradeNumber}`);
      if (!grade) {
        grade = { id: id() };
        db.insert('grades', { ...grade, name: `Grade ${gradeNumber}` });
      }
      let section = db.get('SELECT id FROM sections WHERE grade_id=? AND name=?', grade.id, code);
      if (!section) {
        section = { id: id() };
        db.insert('sections', { ...section, grade_id: grade.id, name: code });
      }
      let track = null;
      if (Number(gradeNumber) >= 9) {
        const name = trackCode === 'A' ? 'Advanced' : 'General';
        track = db.get('SELECT id FROM tracks WHERE name=?', name);
        if (!track) {
          track = { id: id() };
          db.insert('tracks', { ...track, name });
        }
      }
      const groupId = id();
      db.insert('roster_groups', {
        id: groupId,
        batch_id: batchId,
        code,
        grade_level: Number(gradeNumber),
        section_id: section.id,
        track_id: track?.id || null,
      });
      for (const student of students.filter((s) => s.code === code))
        db.insert('roster_memberships', {
          student_id: records.find((r) => r.student_number === student.number)!.id,
          batch_id: batchId,
          group_id: groupId,
        });
    }
    handoff?.(batchId, credentials);
    db.audit(actorId, 'school_roster_import', 'roster_batches', batchId, {
      students: students.length,
      teachers: teachers.length,
      groups: new Set(students.map((s) => s.code)).size,
    });
  });
  return {
    batch_id: batchId,
    imported: true,
    students: students.length,
    teachers: teachers.length,
    credentials,
  };
}
