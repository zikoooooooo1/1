import { useState, useCallback, useEffect, useRef } from 'react';
import { ArrowLeft, Plus, Clock, Save, Trash2 } from 'lucide-react';
import { useData, mutate, navigate, api } from '../api';
import { useLocale } from '../i18n/index';
import {
  Button,
  Loading,
  ErrorBox,
  PageHeader,
  Badge,
  Form,
  Modal,
  Table,
  Empty,
  RefSelect,
  Pagination,
} from '../components/ui';
import { catalog } from '../../shared/catalog';
import { RecordActions, type User } from './records';
export function Assessment({
  entity,
  id,
  user,
}: {
  entity: 'assignments' | 'exams';
  id: string;
  user: User;
}) {
  const { t, formatDate, number } = useLocale();
  const data = useData(`/records/${entity}/${id}`);
  const academic = useData(
    data.data?.class_id ? '/classes/' + data.data.class_id + '/summary' : null,
  );
  const [page, setPage] = useState(1);
  const work = useData(
    `/${entity}/${id}/${entity === 'assignments' ? 'submissions' : 'attempts'}?page=${page}`,
  );
  const questions = useData(
    entity === 'exams' && user.role !== 'student' ? `/exams/${id}/questions` : null,
  );
  const [editing, setEditing] = useState(false),
    [grading, setGrading] = useState<any>(null),
    [question, setQuestion] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<any>(null);
  const closeEdit = useCallback(() => setEditing(false), []),
    closeGrade = useCallback(() => setGrading(null), []);
  const reload = () => {
    data.reload();
    work.reload();
    questions.reload();
  };
  if (data.loading) return <Loading />;
  if (data.error) return <ErrorBox error={data.error} />;
  const row = data.data;
  const teacher = user.role !== 'student';
  const canManage = teacher && academic.data?.writable;
  const canSubmit =
    !!academic.data?.writable &&
    new Date().toISOString() >= row.open_at &&
    (row.allow_late || new Date().toISOString() <= row.due_at);
  return (
    <>
      <button className="text-button breadcrumb" onClick={() => navigate('/' + entity)}>
        <ArrowLeft size={15} />
        {t(entity)}
      </button>
      <PageHeader
        title={row.title}
        eyebrow={entity}
        actions={
          <>
            <Badge
              value={
                entity === 'exams' &&
                row.status === 'published' &&
                row.opens_at <= new Date().toISOString() &&
                row.closes_at > new Date().toISOString()
                  ? 'live'
                  : row.status
              }
            />
            {canManage && row.status === 'draft' && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                {t('edit')}
              </Button>
            )}
          </>
        }
      />
      {error && <ErrorBox error={error} />}
      <div className="assessment-layout">
        <div>
          <div className="panel padded">
            <h2>{t('instructions')}</h2>
            <p className="preserve-lines">{row.instructions || '—'}</p>
            {row.file_id && (
              <a className="button secondary" href={'/api/files/' + row.file_id}>
                {t('download')}
              </a>
            )}
            <div className="detail-stats">
              <div>
                <small>{t(entity === 'assignments' ? 'open_at' : 'opens_at')}</small>
                <strong>{formatDate(row.open_at || row.opens_at, true)}</strong>
              </div>
              <div>
                <small>{t(entity === 'assignments' ? 'due_at' : 'closes_at')}</small>
                <strong>{formatDate(row.due_at || row.closes_at, true)}</strong>
              </div>
              <div>
                <small>{t(entity === 'assignments' ? 'max_score' : 'duration_minutes')}</small>
                <strong>{number(row.max_score || row.duration_minutes)}</strong>
              </div>
            </div>
            {canManage && <RecordActions entity={entity} row={row} onDone={reload} />}
          </div>
          {entity === 'assignments' &&
            user.role === 'student' &&
            work.data &&
            !work.data.total &&
            row.status === 'published' &&
            canSubmit && (
              <div className="panel padded section-gap">
                <h2>{t('your_submission')}</h2>
                <Form
                  fields={[
                    { key: 'content', type: 'textarea', required: true },
                    { key: 'file_id', type: 'file' },
                  ]}
                  submitLabel="submit"
                  onSave={async (body) => {
                    if (!window.confirm(t('submitted_warning'))) return;
                    await mutate('/assignments/' + id + '/submit', {
                      ...body,
                      file_id: body.file_id || null,
                    });
                    work.reload();
                  }}
                />
              </div>
            )}
          {entity === 'exams' && teacher && (
            <div className="panel padded section-gap">
              <h2>{t('questions')}</h2>
              {questions.loading ? (
                <Loading />
              ) : questions.error ? (
                <ErrorBox error={questions.error} />
              ) : questions.data?.length ? (
                <ol className="question-list">
                  {questions.data.map((q: any) => (
                    <li key={q.id}>
                      <div>
                        <Badge value={q.type} />
                        <p className="preserve-lines">{q.prompt}</p>
                        <small>
                          {number(q.points)} {t('points')}
                        </small>
                      </div>
                      {canManage && row.status === 'draft' && (
                        <button
                          className="icon-button"
                          aria-label={t('delete_question')}
                          onClick={async () => {
                            if (!window.confirm(t('confirm_action'))) return;
                            try {
                              await api(`/exams/${id}/questions/${q.id}`, { method: 'DELETE' });
                              questions.reload();
                            } catch (e) {
                              setError(e);
                            }
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty title="questions_required" />
              )}
              {canManage && row.status === 'draft' && (
                <div className="add-question">
                  <label>{t('add_question')}</label>
                  <RefSelect
                    name="question_id"
                    entity="questions"
                    value={question}
                    onChange={setQuestion}
                  />
                  <Button
                    disabled={!question}
                    busy={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await mutate('/exams/' + id + '/questions', { question_id: question });
                        setQuestion('');
                        questions.reload();
                      } catch (e) {
                        setError(e);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Plus size={16} />
                    {t('add_question')}
                  </Button>
                </div>
              )}
            </div>
          )}
          <div className="panel section-gap">
            <div className="panel-heading">
              <h2>{t(entity === 'assignments' ? 'submissions' : 'attempts')}</h2>
            </div>
            {work.loading ? (
              <Loading />
            ) : work.error ? (
              <ErrorBox error={work.error} />
            ) : !work.data?.items.length ? (
              <Empty description="empty_student" />
            ) : entity === 'assignments' ? (
              <Table
                rows={work.data.items}
                columns={
                  teacher
                    ? ['student_name', 'submitted_at', 'score', 'status']
                    : ['submitted_at', 'score', 'feedback', 'status']
                }
                onRow={(s) => setGrading(s)}
              />
            ) : (
              <Table
                rows={work.data.items}
                columns={
                  teacher ? ['student_name', 'started_at', 'status'] : ['started_at', 'status']
                }
                onRow={(a) => navigate('/attempts/' + a.id)}
              />
            )}{' '}
            {work.data && (
              <Pagination page={page} setPage={setPage} total={work.data.total} limit={25} />
            )}
          </div>
        </div>
        <aside className="panel padded assessment-side">
          <div className="icon-tile">
            <Clock size={22} />
          </div>
          <h2>{t(entity === 'exams' ? 'exams' : 'assignments')}</h2>
          {entity === 'exams' ? (
            <>
              <p>
                {t('max_attempts')}: <strong>{number(row.max_attempts)}</strong>
              </p>
              <p>
                {t('duration_minutes')}: <strong>{number(row.duration_minutes)}</strong>
              </p>
              {user.role === 'student' && row.status === 'published' && academic.data?.writable && (
                <Button
                  disabled={
                    new Date().toISOString() < row.opens_at ||
                    new Date().toISOString() >= row.closes_at
                  }
                  busy={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      const attempt = await mutate('/exams/' + id + '/attempts');
                      navigate('/attempts/' + attempt.id);
                    } catch (e) {
                      setError(e);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {t(
                    work.data?.items.some((a: any) => a.status === 'in_progress')
                      ? 'resume_attempt'
                      : 'start_attempt',
                  )}
                </Button>
              )}
              <p className="muted">{t('exam_instructions')}</p>
            </>
          ) : (
            <p>
              {t('allow_late')}: {t(row.allow_late ? 'true' : 'false')}
            </p>
          )}
        </aside>
      </div>
      {editing && (
        <Modal wide title={t('edit')} onClose={closeEdit}>
          <Form
            fields={catalog[entity].fields}
            initial={row}
            onCancel={closeEdit}
            onSave={async (body) => {
              await mutate(`/records/${entity}/${id}`, { ...body, version: row.version }, 'PUT');
              closeEdit();
              reload();
            }}
          />
        </Modal>
      )}
      {grading && (
        <Modal
          wide
          title={t(teacher ? 'grade_submission' : 'your_submission')}
          onClose={closeGrade}
        >
          <div className="submission-content">
            <p className="preserve-lines">{grading.content}</p>
            {grading.file_id && (
              <a href={'/api/files/' + grading.file_id} className="button secondary">
                {t('download')}
              </a>
            )}
          </div>
          {canManage ? (
            <Form
              fields={[
                { key: 'score', type: 'number', min: 0, max: row.max_score, required: true },
                { key: 'feedback', type: 'textarea' },
                { key: 'return_result', type: 'checkbox' },
              ]}
              initial={{ ...grading, return_result: grading.status === 'returned' ? 1 : 0 }}
              onSave={async (body) => {
                await mutate('/submissions/' + grading.id + '/grade', {
                  ...body,
                  return_result: !!body.return_result,
                  version: grading.version,
                });
                closeGrade();
                work.reload();
              }}
            />
          ) : (
            <p>{grading.status === 'returned' ? grading.feedback : t('result_pending')}</p>
          )}
        </Modal>
      )}
    </>
  );
}
export function Attempt({ id, user }: { id: string; user: User }) {
  const data = useData('/attempts/' + id);
  if (data.loading) return <Loading />;
  if (data.error) return <ErrorBox error={data.error} />;
  return (
    <AttemptContent
      key={id + ':' + data.data.attempt.version}
      initial={data.data}
      user={user}
      reload={data.reload}
    />
  );
}
function AttemptContent({
  initial,
  user,
  reload,
}: {
  initial: any;
  user: User;
  reload: () => void;
}) {
  const { t, number } = useLocale();
  const attempt = initial.attempt;
  const active = attempt.status === 'in_progress' && user.role === 'student';
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.answers.map((a: any) => [a.question_id, a.value])),
  );
  const [grades, setGrades] = useState<Record<string, any>>(() =>
    Object.fromEntries(
      initial.answers.map((a: any) => [
        a.question_id,
        { score: a.score ?? '', feedback: a.feedback || '' },
      ]),
    ),
  );
  const [error, setError] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [saveState, setSaveState] = useState('autosaved');
  const [selected, setSelected] = useState(0),
    [time, setTime] = useState(Date.now());
  const version = useRef(attempt.version);
  const latest = useRef(values);
  latest.current = values;
  const saved = useRef(JSON.stringify(values));
  const pending = useRef<Promise<void> | null>(null);
  const offset = Date.parse(initial.server_time) - Date.now();
  const [serverOffset] = useState(offset);
  const flush = useCallback(async () => {
    if (!active) return;
    if (pending.current) return pending.current;
    const task = (async () => {
      while (saved.current !== JSON.stringify(latest.current)) {
        const snapshot = { ...latest.current };
        setSaveState('saving');
        const result = await mutate(
          '/attempts/' + attempt.id + '/answers',
          {
            version: version.current,
            answers: Object.entries(snapshot).map(([question_id, value]) => ({
              question_id,
              value,
            })),
          },
          'PUT',
        );
        version.current = result.version;
        saved.current = JSON.stringify(snapshot);
      }
      setSaveState('autosaved');
      setError(null);
    })();
    pending.current = task;
    try {
      await task;
    } catch (e) {
      setError(e);
      setSaveState('unsaved');
      throw e;
    } finally {
      pending.current = null;
    }
  }, [active, attempt.id]);
  useEffect(() => {
    if (!active) return;
    setSaveState(saved.current === JSON.stringify(values) ? 'autosaved' : 'unsaved');
    const timeout = setTimeout(() => void flush().catch(() => {}), 750);
    return () => clearTimeout(timeout);
  }, [values, active, flush]);
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => setTime(Date.now()), 1000);
    const before = (e: BeforeUnloadEvent) => {
      if (saved.current !== JSON.stringify(latest.current)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const online = () => void flush().catch(() => {});
    window.addEventListener('beforeunload', before);
    window.addEventListener('online', online);
    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', before);
      window.removeEventListener('online', online);
    };
  }, [active, flush]);
  const remaining = Math.max(
    0,
    Math.floor((Date.parse(attempt.deadline) - time - serverOffset) / 1000),
  );
  useEffect(() => {
    if (active && remaining === 0) reload();
  }, [active, remaining, reload]);
  const q = initial.questions[selected];
  return (
    <>
      <button
        className="text-button breadcrumb"
        onClick={() => {
          if (
            active &&
            saved.current !== JSON.stringify(latest.current) &&
            !window.confirm(t('unsaved'))
          )
            return;
          navigate('/exams/' + attempt.exam_id);
        }}
      >
        <ArrowLeft size={15} />
        {t('exams')}
      </button>
      <PageHeader
        title={attempt.title}
        eyebrow="exams"
        actions={<Badge value={attempt.status} />}
      />
      {error && <ErrorBox error={error} retry={() => void flush().catch(() => {})} />}
      <div className="exam-bar">
        <div className="success-inline">
          <Save size={17} />
          {t(active ? saveState : attempt.status)}
        </div>
        {active && (
          <strong className={remaining < 60 ? 'timer urgent' : 'timer'}>
            <Clock size={18} />
            {number(Math.floor(remaining / 60))}:{String(remaining % 60).padStart(2, '0')}
          </strong>
        )}
      </div>
      {!initial.questions.length ? (
        <Empty title="result_pending" description="empty_student" />
      ) : (
        <div className="exam-layout">
          <aside className="panel padded">
            <h3>{t('questions')}</h3>
            <div className="question-nav">
              {initial.questions.map((question: any, i: number) => (
                <button
                  key={question.id}
                  className={`${i === selected ? 'selected' : ''} ${values[question.id] ? 'answered' : ''}`}
                  onClick={() => setSelected(i)}
                  aria-label={`${t('questions')} ${number(i + 1)}`}
                  aria-current={selected === i ? 'step' : undefined}
                >
                  {number(i + 1)}
                </button>
              ))}
            </div>
            <p className="muted">
              {number(Object.values(values).filter(Boolean).length)} /{' '}
              {number(initial.questions.length)} {t('answered')}
            </p>
            {active && (
              <Button
                busy={busy}
                onClick={async () => {
                  if (!window.confirm(t('submitted_warning'))) return;
                  setBusy(true);
                  try {
                    await flush();
                    await mutate('/attempts/' + attempt.id + '/submit');
                    reload();
                  } catch (e) {
                    setError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t('submit_exam')}
              </Button>
            )}
          </aside>
          <main className="panel padded question-card">
            <div className="question-heading">
              <Badge value={q.type} />
              <span>
                {number(q.points)} {t('points')}
              </span>
            </div>
            <h2 className="preserve-lines">{q.prompt}</h2>
            {q.file_id && (
              <a
                className="button secondary"
                href={'/api/files/' + q.file_id}
                target="_blank"
                rel="noreferrer"
              >
                {t('download')}
              </a>
            )}
            {['multiple_choice', 'true_false'].includes(q.type) ? (
              <fieldset className="answer-options" disabled={!active}>
                <legend className="sr-only">{t('your_answer')}</legend>
                {q.options.map((option: string, i: number) => (
                  <label key={i} className={values[q.id] === option ? 'chosen' : ''}>
                    <input
                      type="radio"
                      name={q.id}
                      checked={values[q.id] === option}
                      onChange={() => setValues((v) => ({ ...v, [q.id]: option }))}
                    />
                    <span>{q.type === 'true_false' ? t(option) : option}</span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <label className="field">
                {t('your_answer')}
                <textarea
                  rows={8}
                  maxLength={10000}
                  disabled={!active}
                  value={values[q.id] || ''}
                  onChange={(e) => setValues((v) => ({ ...v, [q.id]: e.target.value }))}
                />
              </label>
            )}
            {!active && q.correct_answer !== undefined && (
              <div className="result-feedback">
                <strong>{t('correct_answer')}</strong>
                <p>{t(q.correct_answer) || '—'}</p>
                <p>{q.explanation}</p>
                <strong>
                  {t('score')}:{' '}
                  {grades[q.id]?.score === '' ? '—' : number(Number(grades[q.id]?.score))} /{' '}
                  {number(q.points)}
                </strong>
                <p>{grades[q.id]?.feedback}</p>
              </div>
            )}
            {user.role !== 'student' &&
              attempt.status !== 'in_progress' &&
              attempt.exam_status !== 'results' && (
                <div className="grading-form">
                  <label>
                    {t('score')}
                    <input
                      type="number"
                      min={0}
                      max={q.points}
                      value={grades[q.id]?.score ?? ''}
                      onChange={(e) =>
                        setGrades((g) => ({ ...g, [q.id]: { ...g[q.id], score: e.target.value } }))
                      }
                    />
                  </label>
                  <label>
                    {t('feedback')}
                    <textarea
                      value={grades[q.id]?.feedback || ''}
                      onChange={(e) =>
                        setGrades((g) => ({
                          ...g,
                          [q.id]: { ...g[q.id], feedback: e.target.value },
                        }))
                      }
                    />
                  </label>
                  <Button
                    busy={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await mutate('/attempts/' + attempt.id + '/grade', {
                          version: version.current,
                          answers: Object.entries(grades)
                            .filter(([, g]) => g.score !== '')
                            .map(([question_id, g]) => ({
                              question_id,
                              score: Number(g.score),
                              feedback: g.feedback,
                            })),
                        });
                        reload();
                      } catch (e) {
                        setError(e);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {t('save')}
                  </Button>
                </div>
              )}
            <div className="question-footer">
              <Button
                variant="secondary"
                disabled={selected === 0}
                onClick={() => setSelected((v) => v - 1)}
              >
                {t('previous')}
              </Button>
              <Button
                variant="secondary"
                disabled={selected === initial.questions.length - 1}
                onClick={() => setSelected((v) => v + 1)}
              >
                {t('next')}
              </Button>
            </div>
          </main>
        </div>
      )}
    </>
  );
}
