import { Store, id, now } from './db.js';
/** Called inside a transaction so publication delivery is never partially marked complete. */
export function dispatchAnnouncements(db: Store) {
  const rows = db.all(
    "SELECT a.* FROM announcements a WHERE a.status='published' AND a.publish_at<=? AND (a.expires_at IS NULL OR a.expires_at>?) AND NOT EXISTS(SELECT 1 FROM announcement_dispatches d WHERE d.announcement_id=a.id)",
    now(),
    now(),
  );
  for (const row of rows) {
    let recipients: { id: any }[];
    if (row.audience_type === 'school')
      recipients = db.all("SELECT id FROM users WHERE status='active'") as { id: any }[];
    else if (row.audience_type === 'user')
      recipients = db.all(
        "SELECT id FROM users WHERE id=? AND status='active'",
        row.audience_id,
      ) as { id: any }[];
    else {
      const filters: Record<string, string> = {
        class: 'c.id=?',
        section: 'c.section_id=?',
        track: 'c.track_id=?',
        grade: 's.grade_id=?',
      };
      const filter = filters[row.audience_type];
      recipients = db.all(
        `SELECT DISTINCT u.id FROM users u WHERE u.status='active' AND EXISTS(SELECT 1 FROM classes c JOIN sections s ON s.id=c.section_id WHERE ${filter} AND (EXISTS(SELECT 1 FROM enrollments e WHERE e.class_id=c.id AND e.student_id=u.id) OR EXISTS(SELECT 1 FROM teacher_assignments t WHERE t.class_id=c.id AND t.teacher_id=u.id)))`,
        row.audience_id,
      ) as { id: any }[];
    }
    for (const user of recipients)
      if (user.id !== row.created_by)
        db.insert('notifications', {
          id: id(),
          user_id: user.id,
          title: row.title,
          entity_type: 'announcements',
          entity_id: row.id,
          created_at: now(),
        });
    db.insert('announcement_dispatches', { announcement_id: row.id, dispatched_at: now() });
  }
}
