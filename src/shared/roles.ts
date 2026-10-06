export const roles = ['admin', 'school_management', 'teacher', 'student'] as const;
export type Role = (typeof roles)[number];
export const isSchoolOperator = (user: { role: string }) =>
  user.role === 'admin' || user.role === 'school_management';
export const academicAuditEntities = [
  'academic_years',
  'terms',
  'grades',
  'sections',
  'tracks',
  'subjects',
  'classes',
  'teacher_assignments',
  'enrollments',
  'lessons',
  'resources',
  'assignments',
  'submissions',
  'question_banks',
  'questions',
  'exams',
  'exam_questions',
  'attempts',
  'schedules',
  'announcements',
] as const;
