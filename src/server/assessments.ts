import { isSchoolOperator } from '../shared/roles.js';
import { paginate } from './pagination.js';
import { Router } from 'express';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { Store, now, id, type Row } from './db.js';
import { classAccess, requireRole } from './auth.js';
import { assert } from './errors.js';
import { getEntity, updateVersion } from './domain.js';
import { finalizeAttempt } from './academic.js';
const shuffle = <T>(input: T[]) => {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
export function assessmentRouter(db: Store) {
  const router = Router();
  router.get('/assignments/:id/submissions', (req, res) => {
    const row = getEntity(db, req.user, 'assignments', String(req.params.id));
    const submissions = paginate(
      db,
      req,
      `SELECT s.*,u.name student_name FROM submissions s JOIN users u ON u.id=s.student_id WHERE s.assignment_id=? ${req.user.role === 'student' ? 'AND s.student_id=?' : ''} ORDER BY s.submitted_at`,
      [row.id, ...(req.user.role === 'student' ? [req.user.id] : [])],
    );
    res.json({
      ...submissions,
      items: submissions.items.map((s) =>
        req.user.role === 'student' && s.status !== 'returned'
          ? { ...s, score: null, feedback: '', graded_by: null }
          : s,
      ),
    });
  });
  router.post('/assignments/:id/submit', (req, res) => {
    requireRole(req.user, 'student');
    const data = z
      .object({
        content: z.string().trim().min(1).max(30000),
        file_id: z.string().uuid().nullable().optional(),
      })
      .strict()
      .parse(req.body);
    const result = db.transaction(() => {
      const row = getEntity(db, req.user, 'assignments', String(req.params.id));
      const cls = classAccess(db, req.user, row.class_id);
      assert(cls.status === 'active' && cls.year_status !== 'archived', 'academic_archived', 409);
      assert(row.status === 'published' && row.open_at <= now(), 'assignment_not_open', 409);
      assert(row.allow_late || row.due_at >= now(), 'assignment_closed', 409);
      if (data.file_id)
        assert(
          db.get('SELECT id FROM files WHERE id=? AND uploaded_by=?', data.file_id, req.user.id),
          'invalid_file',
        );
      const existing = db.get(
        'SELECT id FROM submissions WHERE assignment_id=? AND student_id=?',
        row.id,
        req.user.id,
      );
      if (existing) return existing;
      const sid = id();
      db.insert('submissions', {
        id: sid,
        assignment_id: row.id,
        student_id: req.user.id,
        content: data.content,
        file_id: data.file_id || null,
        submitted_at: now(),
      });
      db.audit(req.user.id, 'submit', 'assignments', row.id, {}, req.requestId);
      return { id: sid };
    });
    res.status(201).json(result);
  });
  router.post('/submissions/:id/grade', (req, res) => {
    requireRole(req.user, 'admin', 'school_management', 'teacher');
    const data = z
      .object({
        score: z.number().finite().min(0),
        feedback: z.string().max(10000),
        version: z.number().int().positive(),
        return_result: z.boolean(),
      })
      .parse(req.body);
    db.transaction(() => {
      const submission = db.get(
        'SELECT s.*,a.class_id,a.max_score FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE s.id=?',
        String(req.params.id),
      );
      assert(submission, 'not_found', 404);
      classAccess(db, req.user, submission.class_id, true);
      assert(data.score <= submission.max_score, 'invalid_score');
      updateVersion(db, 'submissions', submission.id, data.version, {
        score: data.score,
        feedback: data.feedback,
        graded_by: req.user.id,
        status: data.return_result ? 'returned' : 'graded',
      });
      db.audit(
        req.user.id,
        data.return_result ? 'return' : 'grade',
        'submissions',
        submission.id,
        {},
        req.requestId,
      );
      if (data.return_result)
        db.insert('notifications', {
          id: id(),
          user_id: submission.student_id,
          title: 'result_returned',
          entity_type: 'assignments',
          entity_id: submission.assignment_id,
          created_at: now(),
        });
    });
    res.json({ ok: true });
  });
  router.get('/exams/:id/questions', (req, res) => {
    requireRole(req.user, 'admin', 'school_management', 'teacher');
    const exam = getEntity(db, req.user, 'exams', String(req.params.id));
    res.json(db.all('SELECT * FROM exam_questions WHERE exam_id=? ORDER BY position', exam.id));
  });
  router.post('/exams/:id/questions', (req, res) => {
    requireRole(req.user, 'admin', 'school_management', 'teacher');
    const { question_id } = z.object({ question_id: z.string().uuid() }).parse(req.body);
    const result = db.transaction(() => {
      const exam = getEntity(db, req.user, 'exams', String(req.params.id));
      classAccess(db, req.user, exam.class_id, true);
      assert(exam.status === 'draft', 'published_locked', 409);
      const q = getEntity(db, req.user, 'questions', question_id);
      const bank = db.get('SELECT subject_id FROM question_banks WHERE id=?', q.bank_id)!;
      const cls = db.get('SELECT subject_id FROM classes WHERE id=?', exam.class_id)!;
      assert(bank.subject_id === cls.subject_id, 'invalid_relationship');
      assert(
        !db.get('SELECT id FROM exam_questions WHERE exam_id=? AND source_id=?', exam.id, q.id),
        'duplicate',
        409,
      );
      const qid = id();
      const pos = db.get(
        'SELECT coalesce(max(position),0)+1 pos FROM exam_questions WHERE exam_id=?',
        exam.id,
      )!.pos;
      db.insert('exam_questions', {
        id: qid,
        exam_id: exam.id,
        source_id: q.id,
        position: pos,
        type: q.type,
        prompt: q.prompt,
        options: q.options,
        correct_answer: q.correct_answer,
        explanation: q.explanation,
        points: q.points,
        file_id: q.file_id,
      });
      db.audit(req.user.id, 'add_question', 'exams', exam.id, {}, req.requestId);
      return { id: qid };
    });
    res.status(201).json(result);
  });
  router.delete('/exams/:id/questions/:question', (req, res) => {
    requireRole(req.user, 'admin', 'school_management', 'teacher');
    db.transaction(() => {
      const exam = getEntity(db, req.user, 'exams', String(req.params.id));
      classAccess(db, req.user, exam.class_id, true);
      assert(exam.status === 'draft', 'published_locked', 409);
      assert(
        db.run(
          'DELETE FROM exam_questions WHERE id=? AND exam_id=?',
          String(req.params.question),
          exam.id,
        ).changes === 1,
        'not_found',
        404,
      );
      db.audit(req.user.id, 'remove_question', 'exams', exam.id, {}, req.requestId);
    });
    res.json({ ok: true });
  });
  router.post('/exams/:id/attempts', (req, res) => {
    requireRole(req.user, 'student');
    const result = db.transaction(() => {
      const exam = getEntity(db, req.user, 'exams', String(req.params.id));
      const cls = classAccess(db, req.user, exam.class_id);
      assert(cls.status === 'active' && cls.year_status !== 'archived', 'academic_archived', 409);
      assert(
        exam.status === 'published' && now() >= exam.opens_at && now() < exam.closes_at,
        'exam_not_open',
        409,
      );
      const existing = db.get(
        "SELECT * FROM attempts WHERE exam_id=? AND student_id=? AND status='in_progress'",
        exam.id,
        req.user.id,
      );
      if (existing && existing.deadline > now()) return { id: existing.id };
      if (existing) finalizeAttempt(db, existing.id);
      assert(
        db.get(
          'SELECT count(*) n FROM attempts WHERE exam_id=? AND student_id=?',
          exam.id,
          req.user.id,
        )!.n < exam.max_attempts,
        'attempt_limit',
        409,
      );
      let questions = db.all(
        'SELECT id,options FROM exam_questions WHERE exam_id=? ORDER BY position',
        exam.id,
      );
      assert(questions.length, 'questions_required');
      if (exam.randomize_questions) questions = shuffle(questions);
      const optionOrders: Row = {};
      for (const q of questions)
        optionOrders[q.id] = exam.randomize_options
          ? shuffle(JSON.parse(q.options))
          : JSON.parse(q.options);
      const aid = id();
      db.insert('attempts', {
        id: aid,
        exam_id: exam.id,
        student_id: req.user.id,
        started_at: now(),
        deadline: new Date(
          Math.min(Date.now() + exam.duration_minutes * 60000, Date.parse(exam.closes_at)),
        ).toISOString(),
        question_order: JSON.stringify(questions.map((q) => q.id)),
        option_orders: JSON.stringify(optionOrders),
      });
      db.audit(req.user.id, 'start_attempt', 'exams', exam.id, {}, req.requestId);
      return { id: aid };
    });
    res.status(201).json(result);
  });
  router.get('/exams/:id/attempts', (req, res) => {
    const exam = getEntity(db, req.user, 'exams', String(req.params.id));
    const rows = paginate(
      db,
      req,
      `SELECT a.id,a.student_id,u.name student_name,a.started_at,a.deadline,a.submitted_at,a.status,a.version FROM attempts a JOIN users u ON u.id=a.student_id WHERE a.exam_id=? ${req.user.role === 'student' ? 'AND a.student_id=?' : ''} ORDER BY a.started_at DESC`,
      [exam.id, ...(req.user.role === 'student' ? [req.user.id] : [])],
    );
    res.json(rows);
  });
  const getAttempt = (user: Express.Request['user'], target: string) => {
    const attempt = db.get(
      'SELECT a.*,e.class_id,e.title,e.status exam_status FROM attempts a JOIN exams e ON e.id=a.exam_id WHERE a.id=?',
      target,
    );
    assert(attempt, 'not_found', 404);
    classAccess(db, user, attempt.class_id);
    if (user.role === 'student') assert(attempt.student_id === user.id, 'forbidden', 403);
    return attempt;
  };
  router.get('/attempts/:id', (req, res) => {
    let attempt = getAttempt(req.user, String(req.params.id));
    if (attempt.status === 'in_progress' && attempt.deadline <= now()) {
      db.transaction(() => finalizeAttempt(db, attempt.id));
      attempt = getAttempt(req.user, attempt.id);
    }
    const canSeeResults = req.user.role !== 'student' || attempt.exam_status === 'results';
    const active = req.user.role === 'student' && attempt.status === 'in_progress';
    const order = JSON.parse(attempt.question_order) as string[];
    const options = JSON.parse(attempt.option_orders);
    const questions = db
      .all('SELECT * FROM exam_questions WHERE exam_id=?', attempt.exam_id)
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    res.json({
      attempt,
      server_time: now(),
      questions:
        active || canSeeResults
          ? questions.map((q) =>
              canSeeResults
                ? { ...q, options: options[q.id] }
                : {
                    id: q.id,
                    type: q.type,
                    prompt: q.prompt,
                    points: q.points,
                    file_id: q.file_id,
                    options: options[q.id],
                  },
            )
          : [],
      answers:
        active || canSeeResults
          ? db
              .all('SELECT * FROM answers WHERE attempt_id=?', attempt.id)
              .map((a) => (canSeeResults ? a : { question_id: a.question_id, value: a.value }))
          : [],
    });
  });
  router.put('/attempts/:id/answers', (req, res) => {
    requireRole(req.user, 'student');
    const data = z
      .object({
        version: z.number().int().positive(),
        answers: z
          .array(z.object({ question_id: z.string().uuid(), value: z.string().max(10000) }))
          .max(500),
      })
      .parse(req.body);
    const version = db.transaction(() => {
      const attempt = getAttempt(req.user, String(req.params.id));
      assert(
        attempt.status === 'in_progress' &&
          attempt.deadline > now() &&
          attempt.exam_status === 'published',
        'attempt_closed',
        409,
      );
      updateVersion(db, 'attempts', attempt.id, data.version, { status: 'in_progress' });
      for (const answer of data.answers) {
        const q = db.get(
          'SELECT * FROM exam_questions WHERE id=? AND exam_id=?',
          answer.question_id,
          attempt.exam_id,
        );
        assert(q, 'invalid_question');
        if (['multiple_choice', 'true_false'].includes(q.type))
          assert(
            answer.value === '' || JSON.parse(q.options).includes(answer.value),
            'invalid_answer',
          );
        db.run(
          'INSERT INTO answers(attempt_id,question_id,value) VALUES (?,?,?) ON CONFLICT(attempt_id,question_id) DO UPDATE SET value=excluded.value',
          attempt.id,
          q.id,
          answer.value,
        );
      }
      return data.version + 1;
    });
    res.json({ version, saved_at: now() });
  });
  router.post('/attempts/:id/submit', (req, res) => {
    requireRole(req.user, 'student');
    db.transaction(() => {
      const attempt = getAttempt(req.user, String(req.params.id));
      finalizeAttempt(db, attempt.id);
      db.audit(req.user.id, 'submit_attempt', 'attempts', attempt.id, {}, req.requestId);
    });
    res.json({ ok: true });
  });
  router.post('/attempts/:id/grade', (req, res) => {
    requireRole(req.user, 'admin', 'school_management', 'teacher');
    const data = z
      .object({
        version: z.number().int().positive(),
        answers: z
          .array(
            z.object({
              question_id: z.string().uuid(),
              score: z.number().finite().min(0),
              feedback: z.string().max(5000),
            }),
          )
          .max(500),
      })
      .parse(req.body);
    db.transaction(() => {
      const attempt = getAttempt(req.user, String(req.params.id));
      classAccess(db, req.user, attempt.class_id, true);
      assert(
        attempt.status !== 'in_progress' && attempt.exam_status !== 'results',
        'invalid_transition',
        409,
      );
      for (const answer of data.answers) {
        const q = db.get(
          'SELECT points FROM exam_questions WHERE id=? AND exam_id=?',
          answer.question_id,
          attempt.exam_id,
        );
        assert(q && answer.score <= q.points, 'invalid_score');
        assert(
          db.run(
            'UPDATE answers SET score=?,feedback=? WHERE attempt_id=? AND question_id=?',
            answer.score,
            answer.feedback,
            attempt.id,
            answer.question_id,
          ).changes === 1,
          'invalid_question',
        );
      }
      const pending = db.get(
        'SELECT question_id FROM answers WHERE attempt_id=? AND score IS NULL',
        attempt.id,
      );
      updateVersion(db, 'attempts', attempt.id, data.version, {
        status: pending ? 'submitted' : 'graded',
      });
      db.audit(req.user.id, 'grade', 'attempts', attempt.id, {}, req.requestId);
    });
    res.json({ ok: true });
  });
  router.get('/results', (req, res) => {
    const scope =
      req.user.role === 'student'
        ? 's.student_id=?'
        : req.user.role === 'teacher'
          ? 'EXISTS(SELECT 1 FROM teacher_assignments t WHERE t.class_id=c.id AND t.teacher_id=?)'
          : '1=1';
    const params = isSchoolOperator(req.user) ? [] : [req.user.id];
    const query = `SELECT s.id,s.student_id,u.name student_name,c.name class_name,a.title,a.max_score,s.score,s.feedback,s.submitted_at date,'assignment' type FROM submissions s JOIN assignments a ON a.id=s.assignment_id JOIN classes c ON c.id=a.class_id JOIN users u ON u.id=s.student_id WHERE ${scope} AND s.status='returned'
  UNION ALL SELECT s.id,s.student_id,u.name student_name,c.name class_name,e.title,(SELECT sum(points) FROM exam_questions WHERE exam_id=e.id) max_score,(SELECT sum(score) FROM answers WHERE attempt_id=s.id) score,'' feedback,s.submitted_at date,'exam' type FROM attempts s JOIN exams e ON e.id=s.exam_id JOIN classes c ON c.id=e.class_id JOIN users u ON u.id=s.student_id WHERE ${scope} AND e.status='results' AND s.status='graded' ORDER BY date DESC`;
    res.json(paginate(db, req, query, [...params, ...params]));
  });
  return router;
}
