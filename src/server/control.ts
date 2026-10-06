import { schoolReadiness } from './readiness.js';
import { Router } from 'express';
import { Store } from './db.js';
import { requireRole } from './auth.js';
export function controlRouter(db: Store) {
  const router = Router();
  router.get('/control-center', (req, res) => {
    requireRole(req.user, 'admin', 'school_management');
    const active = "c.status='active' AND y.status='active'";
    const classes = db.get(
      `SELECT count(*) n FROM classes c JOIN academic_years y ON y.id=c.year_id WHERE ${active}`,
    )!.n;
    const unassigned = db.get(
      `SELECT count(*) n FROM classes c JOIN academic_years y ON y.id=c.year_id WHERE ${active} AND NOT EXISTS(SELECT 1 FROM teacher_assignments t JOIN users u ON u.id=t.teacher_id WHERE t.class_id=c.id AND u.status='active')`,
    )!.n;
    const empty = db.get(
      `SELECT count(*) n FROM classes c JOIN academic_years y ON y.id=c.year_id WHERE ${active} AND NOT EXISTS(SELECT 1 FROM enrollments e JOIN users u ON u.id=e.student_id WHERE e.class_id=c.id AND u.status='active')`,
    )!.n;
    const grading = db.get(
      `SELECT count(*) n FROM submissions s JOIN assignments a ON a.id=s.assignment_id JOIN classes c ON c.id=a.class_id JOIN academic_years y ON y.id=c.year_id WHERE ${active} AND s.status='submitted'`,
    )!.n;
    const exams = db.get(
      `SELECT count(*) n FROM exams e JOIN classes c ON c.id=e.class_id JOIN academic_years y ON y.id=c.year_id WHERE ${active} AND e.status='closed'`,
    )!.n;
    const accounts =
      req.user.role === 'admin'
        ? db.all(
            'SELECT role,status,count(*) count FROM users GROUP BY role,status ORDER BY role,status',
          )
        : null;
    res.json({
      readiness: schoolReadiness(db),
      active_year: db.get("SELECT id,name FROM academic_years WHERE status='active'") || null,
      classes,
      unassigned_classes: unassigned,
      empty_classes: empty,
      pending_grading: grading,
      unreleased_exams: exams,
      accounts,
      academic_alerts: db.all(`SELECT c.id,c.name,
       (SELECT count(*) FROM teacher_assignments t JOIN users u ON u.id=t.teacher_id WHERE t.class_id=c.id AND u.status='active') teachers,
       (SELECT count(*) FROM enrollments e JOIN users u ON u.id=e.student_id WHERE e.class_id=c.id AND u.status='active') students
       FROM classes c JOIN academic_years y ON y.id=c.year_id WHERE ${active} AND (NOT EXISTS(SELECT 1 FROM teacher_assignments t JOIN users u ON u.id=t.teacher_id WHERE t.class_id=c.id AND u.status='active') OR NOT EXISTS(SELECT 1 FROM enrollments e JOIN users u ON u.id=e.student_id WHERE e.class_id=c.id AND u.status='active')) ORDER BY c.name,c.id LIMIT 25`),
    });
  });
  return router;
}
