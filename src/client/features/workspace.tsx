import { SchoolReadiness } from '../components/school-readiness';
import { isSchoolOperator } from '../../shared/roles';
import { useState, useCallback } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  CalendarDays,
  Plus,
  Check,
  Upload,
  ShieldCheck,
  Activity,
  Mail,
  CheckCircle2,
} from 'lucide-react';
import { useData, mutate, navigate } from '../api';
import { useLocale } from '../i18n/index';
import {
  Button,
  PageHeader,
  ErrorBox,
  Loading,
  Empty,
  Table,
  Badge,
  Form,
  Modal,
  Pagination,
} from '../components/ui';
import type { User } from './records';
export function Dashboard({ user }: { user: User }) {
  const { t, formatDate, number, locale } = useLocale();
  const { data, loading, error, reload } = useData('/dashboard');
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const metrics = [
    { key: 'active_classes', n: data.classes, icon: BookOpen, url: '/classes', tone: 'indigo' },
    {
      key: 'published_work',
      n: data.assignments,
      icon: ClipboardCheck,
      url: '/assignments',
      tone: 'green',
    },
    {
      key: user.role === 'student' ? 'needs_attention' : 'pending_grading',
      n: data.pending,
      icon: Activity,
      url: '/assignments',
      tone: 'amber',
    },
  ];
  return (
    <>
      <div className="dashboard-greeting">
        <span className="eyebrow">
          {new Intl.DateTimeFormat(locale, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          }).format(new Date())}
        </span>
        <span className="year-pill">
          <span className="status-dot" />
          {data.active_year?.name || t('no_active_year')}
        </span>
      </div>
      <PageHeader
        title={isSchoolOperator(user) ? 'dashboard' : 'my_day'}
        description="dashboard_intro"
        actions={
          <Button onClick={() => navigate(isSchoolOperator(user) ? '/academic' : '/classes')}>
            <Plus size={16} />
            {t(isSchoolOperator(user) ? 'setup_school' : 'my_classes')}
          </Button>
        }
      />
      {isSchoolOperator(user) && (
        <div className="panel padded section-gap">
          <h2>{t(user.role === 'admin' ? 'admin_control' : 'school_management_control')}</h2>
          <p>{t(user.role === 'admin' ? 'admin_control_help' : 'management_control_help')}</p>
          <Button onClick={() => navigate('/control')}>
            {t('open_control_center')} <ArrowUpRight size={16} />
          </Button>
        </div>
      )}
      <div className="metrics">
        {metrics.map((m) => (
          <button key={m.key} className="metric panel" onClick={() => navigate(m.url)}>
            <div className="metric-top">
              <span>{t(m.key)}</span>
              <div className={`metric-icon ${m.tone}`}>
                <m.icon size={18} />
              </div>
            </div>
            <div className="metric-bottom">
              <strong>{number(m.n)}</strong>
              <span>
                {t('view_all')} <ArrowUpRight size={14} />
              </span>
            </div>
          </button>
        ))}
      </div>
      {isSchoolOperator(user) && data.setup && data.setup.completed < data.setup.total && (
        <SchoolReadiness data={data.setup} administrator={user.role === 'admin'} />
      )}
      <div className="dashboard-columns">
        <div>
          <section className="panel">
            <div className="panel-heading">
              <h2>
                <CalendarDays size={18} />
                {t('todays_schedule')}
              </h2>
              <button className="text-button" onClick={() => navigate('/schedules')}>
                {t('view_all')}
                <ArrowRight size={14} />
              </button>
            </div>
            {data.schedule.length ? (
              <div className="timeline">
                {data.schedule.map((s: any) => (
                  <button key={s.id} onClick={() => navigate('/classes/' + s.class_id)}>
                    <time dir="ltr">
                      {s.starts_at}
                      <small>{s.ends_at}</small>
                    </time>
                    <span className="timeline-line" />
                    <div>
                      <strong>{s.class_name}</strong>
                      <small>{s.room || t('class')}</small>
                    </div>
                    <ArrowUpRight size={16} />
                  </button>
                ))}
              </div>
            ) : (
              <Empty title="no_schedule" description="empty_student" />
            )}
          </section>
          <section className="panel section-gap">
            <div className="panel-heading">
              <h2>
                <ClipboardCheck size={18} />
                {t('due_soon')}
              </h2>
              <button className="text-button" onClick={() => navigate('/assignments')}>
                {t('view_all')}
                <ArrowRight size={14} />
              </button>
            </div>
            {data.due.length ? (
              <div className="work-list">
                {data.due.map((a: any) => (
                  <button key={a.id} onClick={() => navigate('/assignments/' + a.id)}>
                    <div className="work-icon">
                      <BookOpen size={18} />
                    </div>
                    <div>
                      <strong>{a.title}</strong>
                      <small>{a.class_name}</small>
                    </div>
                    <time>{formatDate(a.due_at)}</time>
                    <ArrowUpRight size={16} />
                  </button>
                ))}
              </div>
            ) : (
              <Empty title="no_due" description="empty_student" />
            )}
          </section>
        </div>
        <aside>
          <section className="panel">
            <div className="panel-heading">
              <h2>{t('upcoming_exams')}</h2>
            </div>
            {data.upcoming.length ? (
              <div className="exam-list">
                {data.upcoming.map((e: any) => (
                  <button key={e.id} onClick={() => navigate('/exams/' + e.id)}>
                    <div className="date-tile">
                      {new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
                        new Date(e.opens_at),
                      )}
                    </div>
                    <div>
                      <strong>{e.title}</strong>
                      <small>{e.class_name}</small>
                    </div>
                    <ArrowUpRight size={15} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="small-empty">
                <CalendarDays size={26} />
                <p>{t('no_upcoming')}</p>
              </div>
            )}
          </section>
          <section className="panel section-gap">
            <div className="panel-heading">
              <h2>{t('latest_announcements')}</h2>
            </div>
            {data.announcements.length ? (
              <div className="notice-list">
                {data.announcements.map((a: any) => (
                  <article key={a.id}>
                    <small>{formatDate(a.publish_at)}</small>
                    <h3>{a.title}</h3>
                    <p>{a.content}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="small-empty">
                <Mail size={25} />
                <p>{t('no_announcements')}</p>
              </div>
            )}
          </section>
          <div className="brand-note">
            <img src="/brand/symbol.svg" alt="" />
            <p>{t('tagline')}</p>
            <small>{t('positioning')}</small>
          </div>
        </aside>
      </div>
    </>
  );
}
export function ImportCenter() {
  const { t, number } = useLocale();
  const [csv, setCsv] = useState(''),
    [headers, setHeaders] = useState<string[]>([]),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [preview, setPreview] = useState<any>(null),
    [result, setResult] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<any>(null),
    [filename, setFilename] = useState('');
  const fields = ['name', 'email', 'role', 'password'];
  async function inspect(file: File) {
    setBusy(true);
    setError(null);
    setPreview(null);
    setResult(null);
    try {
      if (file.size > 2_000_000) throw { code: 'file_too_large' };
      const text = await file.text();
      const data = await mutate('/imports/preview', { csv: text });
      setCsv(text);
      setFilename(file.name);
      setHeaders(data.headers);
      setMapping(Object.fromEntries(fields.map((f) => [f, data.headers.includes(f) ? f : ''])));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader title="imports" description="import_intro" eyebrow="administration" />
      <div className="workflow-steps">
        {['upload_csv', 'map_columns', 'preview', 'import_done'].map((s, i) => (
          <span
            key={s}
            className={(result ? 3 : preview ? 2 : headers.length ? 1 : 0) >= i ? 'current' : ''}
          >
            <b>{number(i + 1)}</b>
            {t(s)}
          </span>
        ))}
      </div>
      <div className="panel padded">
        <p>{t('import_help')}</p>
        <label className="drop-zone">
          <Upload size={28} />
          <strong>{t('upload_csv')}</strong>
          <span>{filename || 'CSV · 2 MB'}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => e.target.files?.[0] && inspect(e.target.files[0])}
          />
        </label>
        {error && <ErrorBox error={error} />}{' '}
        {!!headers.length && !result && (
          <>
            <h2>{t('map_columns')}</h2>
            <div className="form-grid">
              {fields.map((f) => (
                <label className="field" key={f}>
                  {t(f)}
                  <select
                    value={mapping[f]}
                    onChange={(e) => {
                      setMapping((m) => ({ ...m, [f]: e.target.value }));
                      setPreview(null);
                    }}
                  >
                    <option value="">{t('select')}</option>
                    {headers.map((h) => (
                      <option key={h}>{h}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="form-actions">
              <Button
                busy={busy}
                disabled={fields.some((f) => !mapping[f])}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    setPreview(await mutate('/imports/preview', { csv, mapping }));
                  } catch (e) {
                    setError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t('validate')}
              </Button>
            </div>
          </>
        )}
        {preview && !result && (
          <>
            <h2>
              {t('preview')} · {number(preview.count)} {t('records')}
            </h2>
            {preview.errors.length ? (
              <div className="alert error">
                <ul>
                  {preview.errors.map((e: any) => (
                    <li key={e.row}>
                      {t('row')} {number(e.row)}: {t(e.code)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                <Table rows={preview.preview} columns={['name', 'email', 'role']} />
                <div className="form-actions">
                  <Button
                    busy={busy}
                    onClick={async () => {
                      if (
                        !window.confirm(
                          t('import_confirm') + ' · ' + number(preview.count) + ' ' + t('records'),
                        )
                      )
                        return;
                      setBusy(true);
                      try {
                        setResult(await mutate('/imports/' + preview.id + '/commit'));
                        setCsv('');
                      } catch (e) {
                        setError(e);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {t('import_confirm')}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
        {result && (
          <div className="success-panel">
            <CheckCircle2 size={34} />
            <h2>{t('import_done')}</h2>
            <p>
              {number(result.imported)} {t('records')}
            </p>
            <Button onClick={() => navigate('/people')}>{t('people')}</Button>
          </div>
        )}
      </div>
    </>
  );
}
export function Analytics() {
  const { t, number } = useLocale();
  const data = useData('/analytics');
  return (
    <>
      <PageHeader title="analytics" description="insights_intro" eyebrow="school" />
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <ErrorBox error={data.error} />
      ) : (
        <>
          <div className="panel">
            <div className="panel-heading">
              <h2>{t('classes')}</h2>
            </div>
            {!data.data?.classes.length ? (
              <Empty title="insufficient_data" />
            ) : (
              <div className="insight-list">
                {data.data.classes.map((c: any) => (
                  <article key={c.id}>
                    <div>
                      <button className="text-button" onClick={() => navigate('/classes/' + c.id)}>
                        {c.name}
                        <ArrowUpRight size={15} />
                      </button>
                      <small>
                        {number(c.students)} {t('students')} · {number(c.pending)}{' '}
                        {t('pending_grading')}
                      </small>
                    </div>
                    <div>
                      <small>{t('completion')}</small>
                      <strong>
                        {number(c.submissions)} / {number(c.students * c.assignments)}
                      </strong>
                    </div>
                    <div>
                      <small>{t('average')}</small>
                      <strong>{c.average === null ? '—' : number(c.average) + '%'}</strong>
                      <div className="score-bar">
                        <span style={{ width: `${c.average || 0}%` }} />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
          <div className="panel section-gap">
            <div className="panel-heading">
              <h2>{t('question_performance')}</h2>
            </div>
            {data.data.questions.length ? (
              <Table
                rows={data.data.questions}
                columns={['title', 'prompt', 'answered', 'average']}
              />
            ) : (
              <Empty title="insufficient_data" />
            )}
          </div>
        </>
      )}
    </>
  );
}
export function Results({ user, passport = false }: { user: User; passport?: boolean }) {
  const { t } = useLocale();
  const [page, setPage] = useState(1);
  const data = useData('/results?page=' + page);
  const classes = useData(passport ? '/records/classes?limit=100' : null);
  return (
    <>
      <PageHeader title={passport ? 'passport' : 'results'} eyebrow="learning" />
      {passport && (
        <div className="passport panel padded">
          <div className="large-avatar">{user.name.slice(0, 1)}</div>
          <div>
            <h2>{user.name}</h2>
            <Badge value={user.role} />
            <p>{user.email}</p>
          </div>
        </div>
      )}
      {passport && (
        <div className="panel section-gap">
          <div className="panel-heading">
            <h2>{t('classes')}</h2>
          </div>
          {classes.loading ? (
            <Loading />
          ) : classes.error ? (
            <ErrorBox error={classes.error} />
          ) : classes.data?.items.length ? (
            <Table
              rows={classes.data.items}
              columns={['name', 'subject_id', 'section_id', 'year_id']}
              onRow={(row) => navigate('/classes/' + row.id)}
            />
          ) : (
            <Empty />
          )}
        </div>
      )}
      <div className="panel section-gap">
        <div className="panel-heading">
          <h2>{t('results')}</h2>
        </div>
        {data.loading ? (
          <Loading />
        ) : data.error ? (
          <ErrorBox error={data.error} />
        ) : data.data?.items.length ? (
          <Table
            rows={data.data.items}
            columns={
              user.role === 'student'
                ? ['title', 'class_name', 'type', 'score', 'max_score', 'date']
                : ['title', 'student_name', 'class_name', 'score', 'max_score', 'date']
            }
          />
        ) : (
          <Empty title="no_data" description="result_pending" />
        )}
        {data.data && (
          <Pagination page={page} setPage={setPage} total={data.data.total} limit={25} />
        )}
      </div>
    </>
  );
}
export function Settings({ onSchoolChange }: { onSchoolChange: () => void }) {
  const { t } = useLocale();
  const [tab, setTab] = useState('school');
  const data = useData('/school');
  const health = useData(tab === 'health' ? '/health' : null);
  const permissions = useData(tab === 'permissions' ? '/permissions' : null);
  const [saved, setSaved] = useState(false);
  return (
    <>
      <PageHeader title="settings" eyebrow="administration" />
      <div className="tabs">
        {['school', 'permissions', 'health'].map((v) => (
          <button key={v} className={tab === v ? 'selected' : ''} onClick={() => setTab(v)}>
            {t(v)}
          </button>
        ))}
      </div>
      <div className="panel padded">
        {tab === 'school' &&
          (data.loading ? (
            <Loading />
          ) : data.error ? (
            <ErrorBox error={data.error} />
          ) : (
            <>
              <Form
                fields={[
                  { key: 'name', required: true },
                  { key: 'timezone', required: true },
                  { key: 'locale', type: 'select', required: true, options: ['en', 'ar'] },
                ]}
                initial={data.data}
                onSave={async (body) => {
                  await mutate('/school', { ...body, version: data.data.version }, 'PUT');
                  data.reload();
                  onSchoolChange();
                  setSaved(true);
                }}
              />
              {saved && (
                <p role="status" className="success-inline">
                  <Check size={16} />
                  {t('saved')}
                </p>
              )}
            </>
          ))}
        {tab === 'health' && (
          <>
            <PageHeader
              title="health"
              description="health_intro"
              actions={
                <Button variant="secondary" onClick={health.reload}>
                  {t('refresh')}
                </Button>
              }
            />
            {health.loading ? (
              <Loading />
            ) : health.error ? (
              <ErrorBox error={health.error} />
            ) : (
              health.data && (
                <div className="health-list">
                  {['database', 'storage', 'authentication'].map((k) => (
                    <div key={k}>
                      <ShieldCheck size={20} />
                      <strong>{t(k)}</strong>
                      <Badge value={health.data[k] ? 'healthy' : 'unhealthy'} />
                    </div>
                  ))}
                  <div>
                    <strong>{t('version')}</strong>
                    <span>{health.data.version}</span>
                  </div>
                  <div>
                    <strong>{t('checked_at')}</strong>
                    <time>{health.data.checked_at}</time>
                  </div>
                </div>
              )
            )}
          </>
        )}
        {tab === 'permissions' &&
          (permissions.loading ? (
            <Loading />
          ) : permissions.error ? (
            <ErrorBox error={permissions.error} />
          ) : (
            <Table
              rows={(permissions.data || []).map((p: any) => ({
                ...p,
                id: p.role_id + ':' + p.id,
                role_id: t(p.role_id),
                description: t('permission_' + p.id),
              }))}
              columns={['role_id', 'description']}
            />
          ))}
      </div>
    </>
  );
}
export function Audit() {
  const [page, setPage] = useState(1);
  const data = useData('/audit?page=' + page);
  return (
    <>
      <PageHeader title="audit" eyebrow="administration" />
      <div className="panel">
        {data.loading ? (
          <Loading />
        ) : data.error ? (
          <ErrorBox error={data.error} />
        ) : !data.data.items.length ? (
          <Empty />
        ) : (
          <>
            <Table
              rows={data.data.items}
              columns={['created_at', 'actor_name', 'action', 'entity_type', 'entity_id']}
            />
            <Pagination page={page} total={data.data.total} limit={50} setPage={setPage} />
          </>
        )}
      </div>
    </>
  );
}
export function Communications({
  notifications = false,
  user,
}: {
  notifications?: boolean;
  user: User;
}) {
  const { t, formatDate } = useLocale();
  const [page, setPage] = useState(1);
  const [taskPage, setTaskPage] = useState(1);
  const data = useData((notifications ? '/notifications' : '/messages') + '?page=' + page);
  const tasks = useData(notifications ? null : '/inbox/tasks?page=' + taskPage);
  const [compose, setCompose] = useState(false),
    [error, setError] = useState<any>(null);
  const close = useCallback(() => setCompose(false), []);
  return (
    <>
      <PageHeader
        title={notifications ? 'notifications' : 'messages'}
        eyebrow="school"
        actions={
          !notifications && (
            <Button onClick={() => setCompose(true)}>
              <Plus size={16} />
              {t('compose')}
            </Button>
          )
        }
      />
      {error && <ErrorBox error={error} />}{' '}
      {!notifications && tasks.data?.items.length > 0 && (
        <div className="panel section-gap">
          <div className="panel-heading">
            <h2>{t('needs_attention')}</h2>
          </div>
          <Table
            rows={tasks.data.items}
            columns={['title', 'class_name', 'date']}
            onRow={(row) => navigate('/' + row.entity + '/' + row.id)}
          />
          <Pagination page={taskPage} setPage={setTaskPage} total={tasks.data.total} limit={25} />
        </div>
      )}
      <div className="panel section-gap">
        {data.loading ? (
          <Loading />
        ) : data.error ? (
          <ErrorBox error={data.error} />
        ) : !data.data?.items.length ? (
          <Empty />
        ) : (
          <div className="message-list">
            {data.data.items.map((message: any) => (
              <article key={message.id} className={!message.read_at ? 'unread' : ''}>
                <div className="message-avatar">
                  <Mail size={20} />
                </div>
                <div>
                  <div className="message-meta">
                    <strong>{notifications ? t(message.title) : message.subject}</strong>
                    <time>{formatDate(message.created_at, true)}</time>
                  </div>
                  {!notifications && (
                    <>
                      <small>
                        {message.sender_name} → {message.recipient_name}
                      </small>
                      <p className="preserve-lines">{message.content}</p>
                    </>
                  )}
                  {notifications && (
                    <button
                      className="text-button"
                      onClick={() =>
                        navigate(
                          '/' +
                            message.entity_type +
                            (['assignments', 'exams'].includes(message.entity_type)
                              ? '/' + message.entity_id
                              : ''),
                        )
                      }
                    >
                      {t('open')}
                      <ArrowUpRight size={14} />
                    </button>
                  )}
                  {!message.read_at && (notifications || message.recipient_id === user.id) && (
                    <button
                      className="text-button"
                      onClick={async () => {
                        try {
                          await mutate(
                            `/${notifications ? 'notifications' : 'messages'}/${message.id}/read`,
                          );
                          data.reload();
                        } catch (e) {
                          setError(e);
                        }
                      }}
                    >
                      {t('mark_read')}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        {data.data && (
          <Pagination page={page} setPage={setPage} total={data.data.total} limit={25} />
        )}
      </div>
      {compose && (
        <Modal title={t('compose')} onClose={close}>
          <Form
            fields={[
              { key: 'recipient_id', ref: 'contacts', type: 'select', required: true },
              { key: 'subject', required: true },
              { key: 'content', type: 'textarea', required: true },
            ]}
            submitLabel="send"
            onCancel={close}
            onSave={async (body) => {
              await mutate('/messages', body);
              close();
              data.reload();
            }}
          />
        </Modal>
      )}
    </>
  );
}
