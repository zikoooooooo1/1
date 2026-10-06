import { roles } from './roles.js';
export type Field = {
  key: string;
  type?:
    | 'text'
    | 'textarea'
    | 'email'
    | 'password'
    | 'date'
    | 'datetime-local'
    | 'time'
    | 'number'
    | 'select'
    | 'file'
    | 'checkbox';
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  ref?: string;
  options?: string[];
  min?: number;
  max?: number;
};
export type Entity = {
  fields: Field[];
  admin?: boolean;
  classScoped?: boolean;
  title: string;
  columns: string[];
};
const name: Field = { key: 'name', required: true };
const ref = (key: string, entity: string, required = true): Field => ({
  key,
  type: 'select',
  ref: entity,
  required,
});
const text = (key: string, required = false): Field => ({ key, required });
const date = (key: string): Field => ({ key, type: 'date', required: true });
const datetime = (key: string): Field => ({ key, type: 'datetime-local', required: true });
const area = (key: string): Field => ({ key, type: 'textarea' });
const num = (key: string, min = 1, max = 10000): Field => ({
  key,
  type: 'number',
  required: true,
  min,
  max,
});
const cls = ref('class_id', 'classes');
export const catalog: Record<string, Entity> = {
  academic_years: {
    title: 'academic_years',
    admin: true,
    fields: [name, date('start_date'), date('end_date')],
    columns: ['name', 'start_date', 'end_date', 'status'],
  },
  terms: {
    title: 'terms',
    admin: true,
    fields: [name, ref('year_id', 'academic_years'), date('start_date'), date('end_date')],
    columns: ['name', 'year_id', 'start_date', 'end_date'],
  },
  grades: { title: 'grades', admin: true, fields: [name], columns: ['name'] },
  sections: {
    title: 'sections',
    admin: true,
    fields: [name, ref('grade_id', 'grades')],
    columns: ['name', 'grade_id'],
  },
  tracks: { title: 'tracks', admin: true, fields: [name], columns: ['name'] },
  subjects: {
    title: 'subjects',
    admin: true,
    fields: [name, text('code', true)],
    columns: ['name', 'code'],
  },
  classes: {
    title: 'classes',
    admin: true,
    fields: [
      name,
      ref('year_id', 'academic_years'),
      ref('term_id', 'terms'),
      ref('section_id', 'sections'),
      ref('track_id', 'tracks', false),
      ref('subject_id', 'subjects'),
    ],
    columns: ['name', 'subject_id', 'section_id', 'status'],
  },
  teacher_assignments: {
    title: 'teacher_assignments',
    admin: true,
    fields: [cls, ref('teacher_id', 'teachers')],
    columns: ['class_id', 'teacher_id'],
  },
  enrollments: {
    title: 'enrollments',
    admin: true,
    fields: [cls, ref('student_id', 'students')],
    columns: ['class_id', 'student_id', 'created_at'],
  },
  lessons: {
    title: 'lessons',
    classScoped: true,
    fields: [cls, text('title', true), area('content')],
    columns: ['title', 'class_id', 'status'],
  },
  resources: {
    title: 'resources',
    classScoped: true,
    fields: [
      cls,
      text('title', true),
      area('description'),
      text('topic'),
      text('url'),
      { key: 'file_id', type: 'file' },
    ],
    columns: ['title', 'class_id', 'topic', 'status'],
  },
  assignments: {
    title: 'assignments',
    classScoped: true,
    fields: [
      cls,
      text('title', true),
      area('instructions'),
      { key: 'file_id', type: 'file' },
      datetime('open_at'),
      datetime('due_at'),
      num('max_score'),
      { key: 'allow_late', type: 'checkbox' },
    ],
    columns: ['title', 'class_id', 'due_at', 'status'],
  },
  exams: {
    title: 'exams',
    classScoped: true,
    fields: [
      cls,
      text('title', true),
      area('instructions'),
      datetime('opens_at'),
      datetime('closes_at'),
      num('duration_minutes', 1, 480),
      num('max_attempts', 1, 10),
      { key: 'randomize_questions', type: 'checkbox' },
      { key: 'randomize_options', type: 'checkbox' },
    ],
    columns: ['title', 'class_id', 'opens_at', 'status'],
  },
  question_banks: {
    title: 'question_banks',
    fields: [text('title', true), ref('subject_id', 'subjects')],
    columns: ['title', 'subject_id', 'created_at'],
  },
  questions: {
    title: 'questions',
    fields: [
      ref('bank_id', 'question_banks'),
      {
        key: 'type',
        type: 'select',
        required: true,
        options: ['multiple_choice', 'true_false', 'short_answer', 'image', 'equation'],
      },
      area('prompt'),
      area('options'),
      text('correct_answer'),
      area('explanation'),
      text('topic'),
      text('tags'),
      { key: 'difficulty', type: 'select', required: true, options: ['easy', 'medium', 'hard'] },
      num('points'),
      { key: 'file_id', type: 'file' },
    ],
    columns: ['prompt', 'type', 'topic', 'difficulty', 'points'],
  },
  schedules: {
    title: 'schedules',
    classScoped: true,
    fields: [
      cls,
      { key: 'day', type: 'select', required: true, options: ['0', '1', '2', '3', '4', '5', '6'] },
      { key: 'starts_at', type: 'time', required: true },
      { key: 'ends_at', type: 'time', required: true },
      text('room'),
    ],
    columns: ['class_id', 'day', 'starts_at', 'ends_at', 'room'],
  },
  announcements: {
    title: 'announcements',
    fields: [
      text('title', true),
      area('content'),
      {
        key: 'audience_type',
        type: 'select',
        required: true,
        options: ['school', 'grade', 'section', 'track', 'class', 'user'],
      },
      text('audience_id'),
      datetime('publish_at'),
      { key: 'expires_at', type: 'datetime-local' },
    ],
    columns: ['title', 'audience_type', 'publish_at', 'status'],
  },
};
export const personFields: Field[] = [
  name,
  { key: 'email', type: 'email', required: true },
  { key: 'role', type: 'select', required: true, options: [...roles] },
  { key: 'password', type: 'password', required: true },
];
export const academicEntities = [
  'academic_years',
  'terms',
  'grades',
  'sections',
  'tracks',
  'subjects',
  'classes',
  'teacher_assignments',
  'enrollments',
];
