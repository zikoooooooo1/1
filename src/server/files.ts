import { Router } from 'express';
import multer from 'multer';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { Store, now, id } from './db.js';
import { classAccess } from './auth.js';
import { assert } from './errors.js';
export function fileRouter(db: Store, storage: string) {
  mkdirSync(storage, { recursive: true, mode: 0o700 });
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 },
  });
  router.post('/files', upload.single('file'), (req, res) => {
    const file = req.file;
    assert(file, 'file_required');
    assert(
      db.get('SELECT coalesce(sum(size),0) bytes FROM files WHERE uploaded_by=?', req.user.id)!
        .bytes +
        file.size <=
        200 * 1024 * 1024,
      'storage_quota',
      413,
    );
    const b = file.buffer;
    let type = '';
    if (b.subarray(0, 5).toString() === '%PDF-') type = 'application/pdf';
    else if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      type = 'image/png';
    else if (b[0] === 255 && b[1] === 216 && b[2] === 255) type = 'image/jpeg';
    else if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP')
      type = 'image/webp';
    else if (file.mimetype === 'text/plain' && !b.includes(0)) type = 'text/plain';
    assert(type, 'unsupported_file');
    const fid = id(),
      path = resolve(storage, fid);
    writeFileSync(path, b, { flag: 'wx', mode: 0o600 });
    try {
      db.transaction(() => {
        db.insert('files', {
          id: fid,
          original_name: file.originalname.replace(/[\x00-\x1f/\\]/g, '_').slice(0, 180),
          storage_name: fid,
          mime_type: type,
          size: file.size,
          uploaded_by: req.user.id,
          created_at: now(),
        });
        db.audit(req.user.id, 'upload', 'files', fid, { size: file.size }, req.requestId);
      });
    } catch (e) {
      unlinkSync(path);
      throw e;
    }
    res.status(201).json({ id: fid, name: file.originalname, size: file.size });
  });
  router.get('/files/:id', (req, res) => {
    const fid = String(req.params.id),
      file = db.get('SELECT * FROM files WHERE id=?', fid);
    assert(file, 'not_found', 404);
    let allowed = file.uploaded_by === req.user.id || req.user.role === 'admin';
    const accessible = (classId: string) => {
      try {
        classAccess(db, req.user, classId);
        return true;
      } catch {
        return false;
      }
    };
    if (!allowed)
      for (const resource of db.all('SELECT class_id,status FROM resources WHERE file_id=?', fid))
        if (
          accessible(resource.class_id) &&
          (['teacher', 'school_management'].includes(req.user.role) ||
            resource.status === 'published')
        )
          allowed = true;
    if (!allowed)
      for (const assignment of db.all(
        'SELECT class_id,status FROM assignments WHERE file_id=?',
        fid,
      ))
        if (
          accessible(assignment.class_id) &&
          (['teacher', 'school_management'].includes(req.user.role) ||
            ['published', 'complete'].includes(assignment.status))
        )
          allowed = true;
    if (!allowed && ['teacher', 'school_management'].includes(req.user.role))
      for (const sub of db.all(
        'SELECT a.class_id FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE s.file_id=?',
        fid,
      ))
        if (accessible(sub.class_id)) allowed = true;
    if (!allowed)
      for (const q of db.all(
        'SELECT e.id,e.class_id,e.status FROM exam_questions q JOIN exams e ON e.id=q.exam_id WHERE q.file_id=?',
        fid,
      )) {
        if (['teacher', 'school_management'].includes(req.user.role) && accessible(q.class_id))
          allowed = true;
        else if (
          req.user.role === 'student' &&
          accessible(q.class_id) &&
          db.get(
            "SELECT id FROM attempts WHERE exam_id=? AND student_id=? AND ((status='in_progress' AND deadline>?) OR ?='results')",
            q.id,
            req.user.id,
            now(),
            q.status,
          )
        )
          allowed = true;
      }
    if (
      !allowed &&
      req.user.role === 'school_management' &&
      db.get('SELECT id FROM questions WHERE file_id=?', fid)
    )
      allowed = true;
    assert(allowed, 'not_found', 404);
    res.set('Cache-Control', 'private, no-store');
    res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    res.type(file.mime_type);
    res.download(resolve(storage, file.storage_name), file.original_name);
  });
  return router;
}
