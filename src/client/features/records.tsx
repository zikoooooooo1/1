import { isSchoolOperator, type Role } from '../../shared/roles';
import { RoleChange, MicrosoftAccount } from './accounts';
import { TeacherOnboarding } from './teachers';
import { useState, useCallback, useEffect } from 'react';
import { Plus, ArrowUpRight, BookOpen, Layers3, ArrowLeft, ExternalLink } from 'lucide-react';
import { catalog, academicEntities, personFields } from '../../shared/catalog';
import { useData, useDebounce, mutate, navigate } from '../api';
import { useLocale } from '../i18n/index';
import {
  Button,
  ErrorBox,
  Loading,
  Empty,
  PageHeader,
  Table,
  Pagination,
  SearchInput,
  Modal,
  Form,
  Badge,
  entityFields,
} from '../components/ui';
export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  must_change_password: number;
  auth_provider?: 'password' | 'microsoft';
};
export function transitionActions(entity: string, status: string): string[] {
  if (entity === 'academic_years')
    return status === 'planned' ? ['activate', 'archive'] : status === 'active' ? ['archive'] : [];
  if (entity === 'classes') return status === 'active' ? ['archive'] : [];
  if (['lessons', 'resources', 'assignments', 'announcements'].includes(entity)) {
    if (status === 'draft') return ['publish'];
    if (entity === 'assignments' && status === 'published') return ['complete'];
    if (['resources', 'announcements'].includes(entity) && status === 'published')
      return ['archive'];
  }
  if (entity === 'exams')
    return (
      (
        {
          draft: ['review'],
          review: ['revise', 'schedule', 'publish'],
          scheduled: ['revise', 'publish'],
          published: ['close'],
          closed: ['release'],
        } as Record<string, string[]>
      )[status] || []
    );
  return [];
}
export function RecordActions({
  entity,
  row,
  onDone,
}: {
  entity: string;
  row: any;
  onDone: () => void;
}) {
  const { t } = useLocale();
  const [error, setError] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <div className="action-group">
        {transitionActions(entity, row.status).map((action) => (
          <Button
            key={action}
            variant={action === 'archive' ? 'danger' : 'secondary'}
            busy={busy}
            onClick={async () => {
              if (
                !window.confirm(
                  t('confirm_action') +
                    '\n\n' +
                    t(
                      action === 'archive'
                        ? 'archive_warning'
                        : action === 'release'
                          ? 'release_warning'
                          : 'publish_warning',
                    ),
                )
              )
                return;
              setBusy(true);
              setError(null);
              try {
                await mutate(`/records/${entity}/${row.id}/transition`, {
                  action,
                  version: row.version,
                });
                onDone();
              } catch (e) {
                setError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t(action)}
          </Button>
        ))}
      </div>
      {error && <ErrorBox error={error} />}
    </>
  );
}
export function Records({
  entity,
  user,
  classId,
  bankId,
  yearId,
  compact = false,
  readOnly = false,
}: {
  entity: string;
  user: User;
  classId?: string;
  bankId?: string;
  yearId?: string;
  compact?: boolean;
  readOnly?: boolean;
}) {
  const { t } = useLocale();
  const [q, setQ] = useState('');
  const query = useDebounce(q);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const close = useCallback(() => setEditing(null), []);
  const def = catalog[entity];
  const data = useData(
    `/records/${entity}?q=${encodeURIComponent(query)}&page=${page}&sort=${sort}${classId ? '&class_id=' + classId : ''}${bankId ? '&bank_id=' + bankId : ''}${yearId ? '&year_id=' + yearId : ''}`,
  );
  const writable = !readOnly && user.role !== 'student' && (!def.admin || isSchoolOperator(user));
  const open = (row: any) => {
    if (entity === 'classes') navigate('/classes/' + row.id);
    else if (['assignments', 'exams'].includes(entity)) navigate('/' + entity + '/' + row.id);
    else if (entity === 'question_banks') navigate('/banks/' + row.id);
    else setEditing(row);
  };
  return (
    <section>
      {!compact && (
        <PageHeader
          title={entity}
          eyebrow={def.admin ? 'administration' : 'learning'}
          actions={
            writable && (
              <Button onClick={() => setEditing({})}>
                <Plus size={16} />
                {t('create')} {t(entity)}
              </Button>
            )
          }
        />
      )}
      <div className="panel">
        <div className="table-toolbar">
          <SearchInput
            value={q}
            onChange={(s) => {
              setQ(s);
              setPage(1);
            }}
          />
          <div className="toolbar-end">
            <select aria-label={t('filter')} value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="">{t('name')}</option>
              {def.columns.map((c) => (
                <option key={c} value={c}>
                  {t(c)}
                </option>
              ))}
            </select>
            {compact && writable && (
              <Button onClick={() => setEditing({})}>
                <Plus size={16} />
                {t('create')}
              </Button>
            )}
          </div>
        </div>
        {data.loading ? (
          <Loading />
        ) : data.error ? (
          <ErrorBox error={data.error} retry={data.reload} />
        ) : !data.data?.items.length ? (
          <Empty
            description={user.role === 'student' ? 'empty_student' : 'empty_description'}
            action={
              writable && (
                <Button variant="secondary" onClick={() => setEditing({})}>
                  <Plus size={16} />
                  {t('create')} {t(entity)}
                </Button>
              )
            }
          />
        ) : (
          <>
            <Table
              rows={data.data.items}
              columns={def.columns}
              onRow={open}
              actions={(row) => (
                <button className="icon-button" aria-label={t('open')} onClick={() => open(row)}>
                  <ArrowUpRight size={16} />
                </button>
              )}
            />
            <Pagination page={page} total={data.data.total} limit={25} setPage={setPage} />
          </>
        )}
      </div>
      {editing && (
        <Modal
          wide
          title={t(editing.id ? 'details' : 'create') + ' · ' + t(entity)}
          onClose={close}
        >
          {writable &&
          (!editing.status || ['draft', 'active', 'planned'].includes(editing.status)) ? (
            <Form
              fields={entityFields(entity, user.role)}
              initial={{
                ...(classId
                  ? entity === 'announcements'
                    ? { audience_type: 'class', audience_id: classId }
                    : { class_id: classId }
                  : {}),
                ...(bankId ? { bank_id: bankId } : {}),
                ...editing,
              }}
              onCancel={close}
              onSave={async (body) => {
                await mutate(
                  `/records/${entity}${editing.id ? '/' + editing.id : ''}`,
                  editing.id ? { ...body, version: editing.version } : body,
                  editing.id ? 'PUT' : 'POST',
                );
                close();
                data.reload();
              }}
            />
          ) : (
            <div className="record-description">
              {def.fields
                .filter((f) => editing[f.key] && !['file_id', 'url', 'options'].includes(f.key))
                .map((f) => (
                  <div key={f.key}>
                    <small>{t(f.key)}</small>
                    <p>{editing[f.key + '_label'] || t(String(editing[f.key]))}</p>
                  </div>
                ))}
            </div>
          )}
          {editing.file_id && (
            <a className="button secondary" href={'/api/files/' + editing.file_id}>
              {t('download')}
            </a>
          )}
          {editing.url && (
            <a
              className="button secondary"
              href={editing.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={16} />
              {t('url')}
            </a>
          )}
          {editing.id && writable && (
            <RecordActions
              entity={entity}
              row={editing}
              onDone={() => {
                close();
                data.reload();
              }}
            />
          )}
          {editing.id && entity === 'academic_years' && isSchoolOperator(user) && (
            <Rollover
              year={editing}
              onDone={() => {
                close();
                data.reload();
              }}
            />
          )}
        </Modal>
      )}
    </section>
  );
}
function Rollover({ year, onDone }: { year: any; onDone: () => void }) {
  const { t } = useLocale();
  const [open, set] = useState(false);
  return (
    <div className="rollover">
      <Button variant="secondary" onClick={() => set(!open)}>
        {t('rollover')}
      </Button>
      {open && (
        <>
          <p>{t('rollover_help')}</p>
          <Form
            fields={catalog.academic_years.fields}
            onSave={async (data) => {
              await mutate('/years/' + year.id + '/rollover', data);
              onDone();
            }}
          />
        </>
      )}
    </div>
  );
}
export function Academic({ user, entity = 'academic_years' }: { user: User; entity?: string }) {
  const { t } = useLocale();
  const tab = academicEntities.includes(entity) ? entity : 'academic_years';
  return (
    <>
      <PageHeader title="academic" description="setup_intro" eyebrow="administration" />
      <div className="tabs" role="tablist">
        {academicEntities.map((e) => (
          <button
            key={e}
            role="tab"
            aria-selected={tab === e}
            onClick={() => navigate('/academic/' + e)}
          >
            {t(e)}
          </button>
        ))}
      </div>
      <Records key={tab} entity={tab} user={user} compact />
    </>
  );
}
export function People({ user }: { user: User }) {
  const { t } = useLocale();
  const [role, setRole] = useState('student'),
    [q, setQ] = useState(''),
    [page, setPage] = useState(1),
    [status, setStatus] = useState('active');
  const query = useDebounce(q);
  const [editing, setEditing] = useState<any>(null);
  const [teacherSetup, setTeacherSetup] = useState<any>(null);
  const schoolAuth = useData('/public');
  const [microsoftAccount, setMicrosoftAccount] = useState(false);
  const [error, setError] = useState<any>(null);
  const close = useCallback(() => setEditing(null), []);
  const data = useData(
    `/people?role=${role}&q=${encodeURIComponent(query)}&page=${page}&status=${status}`,
  );
  return (
    <>
      <PageHeader
        title="people"
        eyebrow="school"
        actions={
          user.role === 'admin' && (
            <>
              <a className="button secondary" href="/api/people/export">
                {t('export')}
              </a>
              {role === 'student' && schoolAuth.data?.microsoft && (
                <Button variant="secondary" onClick={() => setMicrosoftAccount(true)}>
                  {t('create_microsoft_student')}
                </Button>
              )}
              {
                <Button
                  onClick={() => (role === 'teacher' ? setTeacherSetup({}) : setEditing({ role }))}
                >
                  <Plus size={16} />
                  {t(role === 'teacher' ? 'create_teacher' : 'create_account')}
                </Button>
              }
            </>
          )
        }
      />
      <div className="tabs">
        {['student', 'teacher', 'school_management', 'admin']
          .filter(
            (r) =>
              user.role === 'admin' ||
              r === 'student' ||
              (user.role === 'school_management' && r === 'teacher'),
          )
          .map((r) => (
            <button
              key={r}
              className={role === r ? 'selected' : ''}
              onClick={() => {
                setRole(r);
                setPage(1);
              }}
            >
              {t(
                r === 'student'
                  ? 'students'
                  : r === 'teacher'
                    ? 'teachers'
                    : r === 'school_management'
                      ? 'school_management'
                      : 'administrators',
              )}
            </button>
          ))}
      </div>
      {role === 'student' && <p className="panel padded">{t('student_account_help')}</p>}
      {error && <ErrorBox error={error} />}
      <div className="panel">
        <div className="table-toolbar">
          <SearchInput
            value={q}
            onChange={(s) => {
              setQ(s);
              setPage(1);
            }}
          />
          {isSchoolOperator(user) && (
            <select
              aria-label={t('status')}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="active">{t('active')}</option>
              <option value="archived">{t('archived')}</option>
            </select>
          )}
        </div>
        {data.loading ? (
          <Loading />
        ) : data.error ? (
          <ErrorBox error={data.error} />
        ) : !data.data?.items.length ? (
          <Empty />
        ) : (
          <>
            <Table
              rows={data.data.items}
              columns={
                isSchoolOperator(user)
                  ? ['name', 'email', 'role', 'status']
                  : ['name', 'role', 'status']
              }
              onRow={user.role === 'admin' ? setEditing : undefined}
              actions={
                user.role === 'admin'
                  ? (row) => (
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          if (!window.confirm(t('confirm_action') + '\n' + t('archive_warning')))
                            return;
                          try {
                            await mutate(
                              `/people/${row.id}/${row.status === 'active' ? 'archive' : 'restore'}`,
                              { version: row.version },
                            );
                            data.reload();
                          } catch (e) {
                            setError(e);
                          }
                        }}
                      >
                        {t(row.status === 'active' ? 'archive' : 'restore')}
                      </Button>
                    )
                  : undefined
              }
            />
            <Pagination page={page} setPage={setPage} total={data.data.total} limit={25} />
          </>
        )}
      </div>
      {editing && (
        <Modal
          title={t(editing.id ? 'edit' : 'create_account') + ' · ' + t('people')}
          onClose={close}
        >
          <Form
            fields={
              editing.id
                ? personFields.filter((f) => ['name', 'email'].includes(f.key))
                : personFields
            }
            initial={editing}
            onCancel={close}
            onSave={async (body) => {
              if (
                !editing.id &&
                ['admin', 'school_management'].includes(body.role) &&
                !window.confirm(t('confirm_privileged_account') + '\n' + t(body.role))
              )
                return;
              await mutate(
                '/people' + (editing.id ? '/' + editing.id : ''),
                editing.id ? { ...body, version: editing.version } : body,
                editing.id ? 'PUT' : 'POST',
              );
              close();
              data.reload();
            }}
          />
          {editing.id && editing.id !== user.id && editing.status === 'active' && (
            <RoleChange
              person={editing}
              onDone={() => {
                close();
                data.reload();
              }}
            />
          )}
          {editing.id && editing.role === 'teacher' && (
            <Button
              variant="secondary"
              onClick={() => {
                setTeacherSetup(editing);
                close();
              }}
            >
              {t('assign_teaching_classes')}
            </Button>
          )}
          {editing.id && editing.id !== user.id && editing.auth_provider !== 'microsoft' && (
            <PasswordReset
              person={editing}
              onDone={() => {
                close();
                data.reload();
              }}
            />
          )}
        </Modal>
      )}
      {microsoftAccount && (
        <MicrosoftAccount
          onClose={() => setMicrosoftAccount(false)}
          onDone={() => {
            setMicrosoftAccount(false);
            data.reload();
          }}
        />
      )}
      {teacherSetup && (
        <TeacherOnboarding
          teacher={teacherSetup.id ? teacherSetup : undefined}
          onClose={() => setTeacherSetup(null)}
          onDone={() => {
            setTeacherSetup(null);
            data.reload();
          }}
        />
      )}
    </>
  );
}
export function ClassWorkspace({ id, user }: { id: string; user: User }) {
  const { t } = useLocale();
  const data = useData('/records/classes/' + id);
  const summary = useData('/classes/' + id + '/summary');
  const [tab, setTab] = useState('overview');
  const members = useData(`/records/enrollments?class_id=${id}&limit=100`);
  const teachers = useData(`/records/teacher_assignments?class_id=${id}&limit=100`);
  if (data.loading) return <Loading />;
  if (data.error) return <ErrorBox error={data.error} />;
  const row = data.data;
  return (
    <>
      <button className="text-button breadcrumb" onClick={() => navigate('/classes')}>
        <ArrowLeft size={15} />
        {t('classes')}
      </button>
      <PageHeader title={row.name} eyebrow="class" actions={<Badge value={row.status} />} />
      <div className="tabs">
        {[
          'overview',
          'enrollments',
          'assignments',
          'exams',
          'lessons',
          'resources',
          'announcements',
          'schedules',
        ].map((v) => (
          <button className={tab === v ? 'selected' : ''} key={v} onClick={() => setTab(v)}>
            {t(v === 'enrollments' ? 'students' : v)}
          </button>
        ))}
      </div>
      {tab === 'overview' ? (
        <div className="grid-2">
          <div className="panel padded">
            <BookOpen className="accent" />
            <h2>{t('class')}</h2>
            <p>{row.name}</p>
            <div className="metric-inline">
              <span>{t('students')}</span>
              <strong>{summary.data?.students ?? members.data?.total ?? '—'}</strong>
            </div>
            <div className="metric-inline">
              <span>{t('teachers')}</span>
              <strong>{teachers.data?.total ?? '—'}</strong>
            </div>
            {summary.data && (
              <div className="metric-inline">
                <span>{t('completion')}</span>
                <strong>
                  {summary.data.submissions} / {summary.data.expected}
                </strong>
              </div>
            )}
            {teachers.data?.items.map((teacher: any) => (
              <p key={teacher.id}>{teacher.teacher_id_label}</p>
            ))}
          </div>
          <div className="panel padded">
            <Layers3 className="accent" />
            <h2>{t('quick_actions')}</h2>
            {['assignments', 'exams', 'resources', 'schedules'].map((v) => (
              <button className="action-tile" key={v} onClick={() => setTab(v)}>
                {t(v)}
                <ArrowUpRight size={16} />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <Records
          entity={tab}
          classId={id}
          user={user}
          compact
          readOnly={row.status === 'archived' || summary.data?.year_status === 'archived'}
          key={tab}
        />
      )}
    </>
  );
}
export function SchoolMap({ user, memory = false }: { user: User; memory?: boolean }) {
  const { formatDate } = useLocale();
  const years = useData('/records/academic_years?limit=100');
  const [year, setYear] = useState('');
  useEffect(() => {
    if (!year && years.data?.items.length) {
      const available = years.data.items.filter((y: any) => !memory || y.status === 'archived');
      if (available.length)
        setYear((available.find((y: any) => y.status === 'active') || available[0]).id);
    }
  }, [years.data, year, memory]);
  return (
    <>
      <PageHeader
        title={memory ? 'memory' : 'map'}
        description={memory ? 'memory_intro' : 'map_intro'}
        eyebrow="academic"
      />
      {years.loading ? (
        <Loading />
      ) : years.error ? (
        <ErrorBox error={years.error} />
      ) : (
        <>
          <div className="year-selector">
            {years.data?.items
              .filter((y: any) => !memory || y.status === 'archived')
              .map((y: any) => (
                <button
                  key={y.id}
                  className={`year-card ${year === y.id ? 'selected' : ''}`}
                  onClick={() => setYear(y.id)}
                >
                  <Layers3 size={20} />
                  <strong>{y.name}</strong>
                  <Badge value={y.status} />
                  <small>
                    {formatDate(y.start_date)} — {formatDate(y.end_date)}
                  </small>
                </button>
              ))}
          </div>
          {!years.data?.items.filter((y: any) => !memory || y.status === 'archived').length && (
            <Empty />
          )}
          {year &&
            (memory ? (
              <Records entity="classes" yearId={year} user={user} compact key={year} />
            ) : (
              <Hierarchy year={year} key={year} />
            ))}
        </>
      )}
    </>
  );
}

function Hierarchy({ year }: { year: string }) {
  const { t, number } = useLocale();
  const [page, setPage] = useState(1);
  const data = useData('/school-map?year_id=' + year + '&page=' + page);
  if (data.loading) return <Loading />;
  if (data.error) return <ErrorBox error={data.error} />;
  if (!data.data.items.length) return <Empty />;
  const groups = data.data.items.reduce((groups: Record<string, any[]>, row: any) => {
    const key = row.grade_name + ' · ' + row.section_name;
    (groups[key] ??= []).push(row);
    return groups;
  }, {});
  return (
    <div className="hierarchy">
      <div className="hierarchy-root">
        <Layers3 size={22} />
        <strong>{t('school')}</strong>
      </div>
      {Object.entries(groups).map(([name, rows]) => (
        <section className="hierarchy-section" key={name}>
          <header>
            <Layers3 size={18} />
            <h2>{name}</h2>
          </header>
          <div className="hierarchy-classes">
            {(rows as any[]).map((row) => (
              <button
                key={row.id}
                className="panel padded"
                onClick={() => navigate('/classes/' + row.id)}
              >
                <small>
                  {row.term_name}
                  {row.track_name ? ' · ' + row.track_name : ''}
                </small>
                <h3>{row.subject_name}</h3>
                <p>{row.name}</p>
                <div>
                  <BookOpen size={15} />
                  {row.teachers || t('not_configured')}
                </div>
                <span>
                  {number(row.students)} {t('students')}
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))}
          </div>
        </section>
      ))}
      <Pagination page={page} setPage={setPage} total={data.data.total} limit={50} />
    </div>
  );
}

function PasswordReset({ person, onDone }: { person: any; onDone: () => void }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <section className="rollover">
      <Button variant="danger" onClick={() => setOpen(!open)}>
        {t('reset_password')}
      </Button>
      {open && (
        <>
          <p>{t('reset_password_help')}</p>
          <Form
            fields={[
              { key: 'current_password', type: 'password', required: true },
              { key: 'password', type: 'password', required: true },
            ]}
            idPrefix="password-reset"
            submitLabel="reset_password"
            onSave={async (data) => {
              if (
                !window.confirm(
                  t('confirm_action') + ' ' + person.name + '\n' + t('reset_password_help'),
                )
              )
                return;
              await mutate('/people/' + person.id + '/password', data);
              onDone();
            }}
          />
        </>
      )}
    </section>
  );
}
