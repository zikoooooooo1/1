CREATE TABLE announcement_dispatches (
  announcement_id TEXT PRIMARY KEY REFERENCES announcements(id),
  dispatched_at TEXT NOT NULL
);
CREATE INDEX notification_entity ON notifications(entity_type,entity_id,user_id);
