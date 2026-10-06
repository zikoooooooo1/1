import type { SchoolReadiness, ReadinessStep } from '../shared/readiness.js';
import { Store } from './db.js';

/** Setup checks describe stored configuration, not a guarantee of school readiness. */
export function schoolReadiness(db: Store): SchoolReadiness {
  const year = db.get("SELECT id FROM academic_years WHERE status='active'");
  const terms = !!year && !!db.get('SELECT id FROM terms WHERE year_id=? LIMIT 1', year.id);
  const sections = !!db.get('SELECT id FROM sections LIMIT 1');
  const subjects = !!db.get('SELECT id FROM subjects LIMIT 1');
  const academic = terms && sections && subjects;
  const people =
    !!db.get("SELECT id FROM users WHERE role='teacher' AND status='active' LIMIT 1") &&
    !!db.get("SELECT id FROM users WHERE role='student' AND status='active' LIMIT 1");
  const coverage = db.get(`SELECT count(*) total,
    COALESCE(sum(EXISTS(SELECT 1 FROM teacher_assignments ta JOIN users u ON u.id=ta.teacher_id WHERE ta.class_id=c.id AND u.role='teacher' AND u.status='active')),0) teachers,
    COALESCE(sum(EXISTS(SELECT 1 FROM teacher_assignments ta JOIN users u ON u.id=ta.teacher_id WHERE ta.class_id=c.id AND u.role='teacher' AND u.status='active')
      AND EXISTS(SELECT 1 FROM enrollments e JOIN users u ON u.id=e.student_id WHERE e.class_id=c.id AND u.role='student' AND u.status='active')),0) connected,
    COALESCE(sum(EXISTS(SELECT 1 FROM schedules s WHERE s.class_id=c.id)),0) scheduled
    FROM classes c JOIN academic_years y ON y.id=c.year_id WHERE c.status='active' AND y.status='active'`)!;
  const steps: ReadinessStep[] = [
    {
      key: 'setup_identity',
      description: 'setup_identity_help',
      done: db.get('SELECT version FROM school')!.version > 1,
      path: '/settings',
      administratorOnly: true,
    },
    {
      key: 'setup_year',
      description: 'setup_year_help',
      done: !!year,
      path: '/academic/academic_years',
    },
    {
      key: 'setup_academic',
      description: 'setup_academic_help',
      done: academic,
      path: !terms ? '/academic/terms' : !sections ? '/academic/sections' : '/academic/subjects',
    },
    {
      key: 'setup_people',
      description: 'setup_people_help',
      done: people,
      path: '/people',
      administratorOnly: true,
    },
    {
      key: 'setup_classes',
      description: 'setup_classes_help',
      done: coverage.total > 0 && coverage.connected === coverage.total,
      path: !coverage.total
        ? '/classes'
        : coverage.teachers < coverage.total
          ? '/academic/teacher_assignments'
          : '/academic/enrollments',
    },
    {
      key: 'setup_schedule',
      description: 'setup_schedule_help',
      done: coverage.total > 0 && coverage.scheduled === coverage.total,
      path: '/schedules',
    },
  ];
  return {
    steps,
    completed: steps.filter((s) => s.done).length,
    total: steps.length,
    activeClasses: coverage.total,
    connectedClasses: coverage.connected,
    scheduledClasses: coverage.scheduled,
  };
}
