import { isSchoolOperator } from '../shared/roles';
import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LayoutDashboard,
  BookOpen,
  Users,
  Layers3,
  ClipboardList,
  NotebookPen,
  FolderOpen,
  CalendarDays,
  Megaphone,
  ChartNoAxesCombined,
  Mail,
  Settings as SettingsIcon,
  Search,
  Bell,
  Menu,
  X,
  LogOut,
  Globe,
  ArrowUpRight,
  Upload,
  History,
  Map,
  Shield,
  Moon,
  Sun,
  CheckSquare,
  KeyRound,
} from 'lucide-react';
import { LocaleProvider, useLocale } from './i18n/index';
import { api, mutate, setCsrf, useData, useRoute, useDebounce, navigate } from './api';
import { Form, ErrorBox, Loading, Modal, Empty } from './components/ui';
import type { User } from './features/records';

import './styles/global.css';
const TeachingSetup = lazy(() =>
  import('./features/teaching-setup').then((m) => ({ default: m.TeachingSetup })),
);
const Home = lazy(() => import('./features/home'));
const Records = lazy(() => import('./features/records').then((m) => ({ default: m.Records })));
const Academic = lazy(() => import('./features/records').then((m) => ({ default: m.Academic })));
const People = lazy(() => import('./features/records').then((m) => ({ default: m.People })));
const ClassWorkspace = lazy(() =>
  import('./features/records').then((m) => ({ default: m.ClassWorkspace })),
);
const SchoolMap = lazy(() => import('./features/records').then((m) => ({ default: m.SchoolMap })));
const Assessment = lazy(() =>
  import('./features/assessments').then((m) => ({ default: m.Assessment })),
);
const Attempt = lazy(() => import('./features/assessments').then((m) => ({ default: m.Attempt })));
const Dashboard = lazy(() =>
  import('./features/workspace').then((m) => ({ default: m.Dashboard })),
);
const ImportCenter = lazy(() =>
  import('./features/workspace').then((m) => ({ default: m.ImportCenter })),
);
const Analytics = lazy(() =>
  import('./features/workspace').then((m) => ({ default: m.Analytics })),
);
const Results = lazy(() => import('./features/workspace').then((m) => ({ default: m.Results })));
const Settings = lazy(() => import('./features/workspace').then((m) => ({ default: m.Settings })));
const Audit = lazy(() => import('./features/workspace').then((m) => ({ default: m.Audit })));
const Communications = lazy(() =>
  import('./features/workspace').then((m) => ({ default: m.Communications })),
);
const ControlCenter = lazy(() =>
  import('./features/control').then((m) => ({ default: m.ControlCenter })),
);
const navigation = [
  {
    key: 'control_center',
    path: '/control',
    icon: Shield,
    group: 'administration',
    roles: ['admin', 'school_management'],
  },
  {
    key: 'today',
    path: '/workspace',
    icon: LayoutDashboard,
    group: 'workspace',
    roles: ['admin', 'school_management', 'teacher', 'student'],
  },
  {
    key: 'classes',
    path: '/classes',
    icon: BookOpen,
    group: 'workspace',
    roles: ['admin', 'school_management', 'teacher', 'student'],
  },
  {
    key: 'people',
    path: '/people',
    icon: Users,
    group: 'workspace',
    roles: ['admin', 'school_management', 'teacher'],
  },
  { key: 'passport', path: '/passport', icon: Layers3, group: 'workspace', roles: ['student'] },
  {
    key: 'assignments',
    path: '/assignments',
    icon: ClipboardList,
    group: 'learning',
    roles: ['admin', 'school_management', 'teacher', 'student'],
  },
  {
    key: 'exams',
    path: '/exams',
    icon: NotebookPen,
    group: 'learning',
    roles: ['admin', 'school_management', 'teacher', 'student'],
  },
  {
    key: 'question_banks',
    path: '/question_banks',
    icon: Layers3,
    group: 'learning',
    roles: ['admin', 'school_management', 'teacher'],
  },
  {
    key: 'resources',
    path: '/resources',
    icon: FolderOpen,
    group: 'learning',
    roles: ['admin', 'school_management', 'teacher', 'student'],
  },
  {
    key: 'results',
    path: '/results',
    icon: CheckSquare,
    group: 'learning',
    roles: ['admin', 'school_management', 'teacher', 'student'],
  },
  {
    key: 'schedules',
    path: '/schedules',
    icon: CalendarDays,
    group: 'school',
    roles: ['admin', 'school_management', 'teacher', 'student'],
  },
  {
    key: 'announcements',
    path: '/announcements',
    icon: Megaphone,
    group: 'school',
    roles: ['admin', 'school_management', 'teacher', 'student'],
  },
  {
    key: 'messages',
    path: '/messages',
    icon: Mail,
    group: 'school',
    roles: ['admin', 'school_management', 'teacher', 'student'],
  },
  {
    key: 'analytics',
    path: '/analytics',
    icon: ChartNoAxesCombined,
    group: 'school',
    roles: ['admin', 'school_management', 'teacher'],
  },
  {
    key: 'academic',
    path: '/academic',
    icon: Layers3,
    group: 'administration',
    roles: ['admin', 'school_management'],
  },
  {
    key: 'map',
    path: '/map',
    icon: Map,
    group: 'administration',
    roles: ['admin', 'school_management', 'teacher', 'student'],
  },
  {
    key: 'memory',
    path: '/memory',
    icon: History,
    group: 'administration',
    roles: ['admin', 'school_management', 'teacher', 'student'],
  },
  { key: 'imports', path: '/imports', icon: Upload, group: 'administration', roles: ['admin'] },
  {
    key: 'audit',
    path: '/audit',
    icon: Shield,
    group: 'administration',
    roles: ['admin', 'school_management'],
  },
  {
    key: 'settings',
    path: '/settings',
    icon: SettingsIcon,
    group: 'administration',
    roles: ['admin'],
  },
];
function App() {
  const path = useRoute();
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [school, setSchool] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  const publicData = useData('/public');
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const session = await api('/auth/me');
      setCsrf(session.csrf);
      setUser(session.user);
      if (!session.user.must_change_password && !session.user.teacher_setup_required)
        setSchool(await api('/school'));
    } catch (e: any) {
      if (e.status !== 401) setError(e);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const expired = () => {
      setUser(null);
      setCsrf('');
    };
    window.addEventListener('claso-session-expired', expired);
    return () => window.removeEventListener('claso-session-expired', expired);
  }, [load]);
  return (
    <LocaleProvider timezone={school?.timezone || 'UTC'}>
      {path === '/' || path === '/home' ? (
        <Suspense fallback={<Loading />}>
          <Home signedIn={!!user} />
        </Suspense>
      ) : loading ? (
        <div className="boot">
          <img src="/brand/symbol.svg" alt="CLASO" />
          <Loading />
        </div>
      ) : error ? (
        <div className="boot">
          <ErrorBox error={error} retry={load} />
        </div>
      ) : !user ? (
        <Login
          configured={publicData.data?.configured}
          microsoft={publicData.data?.microsoft}
          onLogin={async () => {
            await load();
            navigate('/workspace');
          }}
        />
      ) : user.must_change_password ? (
        <PasswordChange onDone={load} />
      ) : user.role === 'teacher' && user.teacher_setup_required ? (
        <Suspense fallback={<Loading />}>
          <TeachingSetup
            onDone={async () => {
              await load();
              navigate('/classes');
            }}
            onLogout={async () => {
              await mutate('/auth/logout');
              setUser(null);
              setCsrf('');
              navigate('/login');
            }}
          />
        </Suspense>
      ) : (
        <Shell
          user={user}
          school={school}
          onSchoolChange={() => void api('/school').then(setSchool)}
          onLogout={async () => {
            await mutate('/auth/logout');
            setUser(null);
            setSchool(null);
            setCsrf('');
            navigate('/');
          }}
        />
      )}
    </LocaleProvider>
  );
}
function Language() {
  const { locale, setLocale, t } = useLocale();
  return (
    <button
      className="language-button"
      aria-label={t('language')}
      onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')}
    >
      <Globe size={16} />
      {locale === 'en' ? 'العربية' : 'English'}
    </button>
  );
}
function Login({
  configured,
  microsoft,
  onLogin,
}: {
  configured: boolean | undefined;
  microsoft?: boolean;
  onLogin: () => Promise<void>;
}) {
  const { t } = useLocale();
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <a className="brand" href="#/">
          <img src="/brand/symbol.svg" alt="" />
          <strong>
            CLASO<span>CLASS + OS</span>
          </strong>
        </a>
        <div className="brand-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <div className="orbit-core">
            <img src="/brand/symbol.svg" alt="" />
          </div>
          <div className="orbit-node node-one">
            <BookOpen />
          </div>
          <div className="orbit-node node-two">
            <Users />
          </div>
          <div className="orbit-node node-three">
            <CalendarDays />
          </div>
        </div>
        <div>
          <span className="eyebrow">{t('positioning')}</span>
          <h1>{t('tagline')}</h1>
          <p>{t('brand_copy')}</p>
        </div>
        <small>© {new Date().getFullYear()} CLASO</small>
      </section>
      <section className="auth-main">
        <div className="auth-language">
          <a href="#/home">{t('home')}</a>
          <Language />
        </div>
        <div className="auth-form">
          <div className="mobile-brand">
            <img src="/brand/symbol.svg" alt="" />
            CLASO
          </div>
          <div className="icon-tile">
            <KeyRound size={22} />
          </div>
          <h2>{t(configured === false ? 'setup_required' : 'login_intro')}</h2>
          <p>{t(configured === false ? 'setup_instructions' : 'login_subtitle')}</p>
          {configured !== false && (
            <Form
              fields={[
                { key: 'login_identifier', required: true, autoComplete: 'username' },
                {
                  key: 'password',
                  type: 'password',
                  required: true,
                  minLength: 1,
                  autoComplete: 'current-password',
                },
              ]}
              submitLabel="sign_in"
              onSave={async (body) => {
                await mutate('/auth/login', {
                  email: body.login_identifier,
                  password: body.password,
                });
                await onLogin();
              }}
            />
          )}
          <section className="microsoft-signin" aria-label={t('student_sign_in')}>
            <h3>{t('student_sign_in')}</h3>
            <p>{t('microsoft_intro')}</p>
            {microsoft ? (
              <a className="button secondary" href="/api/auth/microsoft/start">
                {t('microsoft_sign_in')}
              </a>
            ) : (
              <p className="muted">{t('microsoft_unconfigured')}</p>
            )}
            <small>{t('local_student_login')}</small>
          </section>
          {new URLSearchParams(window.location.search).has('authError') && (
            <div role="alert" className="error-box">
              {t('microsoft_failed')}
            </div>
          )}
          <p className="account-help">{t('account_help')}</p>
        </div>
        <small className="auth-footer">{t('footer')}</small>
      </section>
    </main>
  );
}
function PasswordChange({ onDone }: { onDone: () => Promise<void> }) {
  const { t } = useLocale();
  return (
    <main className="password-page">
      <Language />
      <section className="panel padded">
        <img width={40} src="/brand/symbol.svg" alt="CLASO" />
        <h1>{t('password_change')}</h1>
        <p>{t('password_change_intro')}</p>
        <Form
          fields={[
            { key: 'current_password', type: 'password', required: true },
            { key: 'password', type: 'password', required: true },
          ]}
          onSave={async (body) => {
            await mutate('/auth/password', body);
            await onDone();
          }}
        />
      </section>
    </main>
  );
}
function Shell({
  user,
  school,
  onSchoolChange,
  onLogout,
}: {
  user: User;
  school: any;
  onSchoolChange: () => void;
  onLogout: () => Promise<void>;
}) {
  const { t } = useLocale();
  const path = useRoute();
  const [mobile, setMobile] = useState(false),
    [command, setCommand] = useState(false),
    [role, setRole] = useState(user.role),
    [online, setOnline] = useState(navigator.onLine),
    [error, setError] = useState<any>(null);
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem('claso-theme') === 'dark';
    } catch {
      return false;
    }
  });
  const closeCommand = useCallback(() => setCommand(false), []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try {
      localStorage.setItem('claso-theme', dark ? 'dark' : 'light');
    } catch {
      /* preference stays in memory */
    }
  }, [dark]);
  useEffect(() => {
    setMobile(false);
    window.scrollTo(0, 0);
  }, [path]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommand((v) => !v);
      }
      if (e.key === 'Escape') setMobile(false);
    };
    const connected = () => setOnline(true),
      disconnected = () => setOnline(false);
    window.addEventListener('keydown', key);
    window.addEventListener('online', connected);
    window.addEventListener('offline', disconnected);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('online', connected);
      window.removeEventListener('offline', disconnected);
    };
  }, []);
  const items = navigation.filter((n) => n.roles.includes(role));
  const current =
    navigation.find((n) => n.path !== '/' && path.startsWith(n.path)) || navigation[1];
  function content() {
    const parts = path.split('/').filter(Boolean);
    const route = parts[0] || '';
    const id = parts[1];
    if (!route || route === 'workspace' || route === 'login') return <Dashboard user={user} />;
    if (route === 'control')
      return isSchoolOperator(user) ? (
        <ControlCenter user={user} />
      ) : (
        <ErrorBox error={{ code: 'forbidden' }} />
      );
    if (route === 'classes' && id) return <ClassWorkspace id={id} user={user} />;
    if (['assignments', 'exams'].includes(route) && id)
      return <Assessment entity={route as 'assignments' | 'exams'} id={id} user={user} />;
    if (route === 'attempts' && id) return <Attempt id={id} user={user} />;
    if (route === 'banks' && id) return <Records entity="questions" bankId={id} user={user} />;
    if (
      [
        'classes',
        'assignments',
        'exams',
        'resources',
        'question_banks',
        'announcements',
        'schedules',
        'lessons',
      ].includes(route)
    )
      return <Records key={route} entity={route} user={user} />;
    if (route === 'academic')
      return isSchoolOperator(user) ? (
        <Academic user={user} entity={id} />
      ) : (
        <ErrorBox error={{ code: 'forbidden' }} />
      );
    if (route === 'people') return <People user={user} />;
    if (route === 'imports')
      return user.role === 'admin' ? <ImportCenter /> : <ErrorBox error={{ code: 'forbidden' }} />;
    if (route === 'analytics') return <Analytics />;
    if (route === 'results' || route === 'passport')
      return <Results user={user} passport={route === 'passport'} />;
    if (route === 'map' || route === 'memory')
      return <SchoolMap key={route} user={user} memory={route === 'memory'} />;
    if (route === 'settings')
      return user.role === 'admin' ? (
        <Settings onSchoolChange={onSchoolChange} />
      ) : (
        <ErrorBox error={{ code: 'forbidden' }} />
      );
    if (route === 'audit') return <Audit />;
    if (route === 'messages' || route === 'notifications')
      return <Communications key={route} user={user} notifications={route === 'notifications'} />;
    if (route === 'password')
      return user.auth_provider === 'microsoft' ? (
        <p className="panel padded">{t('microsoft_password_help')}</p>
      ) : (
        <PasswordChange onDone={async () => navigate('/workspace')} />
      );
    return <ErrorBox error={{ code: 'not_found' }} />;
  }
  return (
    <div className="app">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        {t('workspace')}
      </a>
      {mobile && (
        <button className="mobile-scrim" aria-label={t('close')} onClick={() => setMobile(false)} />
      )}
      <aside aria-label={t('workspace')} className={`sidebar ${mobile ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <a className="brand" href="#/">
            <img src="/brand/symbol.svg" alt="" />
            <strong>
              CLASO<span>CLASS + OS</span>
            </strong>
          </a>
          <button
            className="icon-button mobile-close"
            onClick={() => setMobile(false)}
            aria-label={t('close')}
          >
            <X size={20} />
          </button>
        </div>
        <div className="school-switch">
          <div className="school-initial">{(school?.name || 'C').slice(0, 1)}</div>
          <div>
            <strong>{school?.name || 'CLASO'}</strong>
            <small>{t(user.role)}</small>
          </div>
          <Shield size={15} />
        </div>
        <nav aria-label={t('workspace')}>
          {['workspace', 'learning', 'school', 'administration'].map((group) => (
            <div className="nav-group" key={group}>
              <h2>{t(group)}</h2>
              {items
                .filter((n) => n.group === group)
                .map((n) => (
                  <a
                    href={'#' + n.path}
                    key={n.key}
                    className={
                      (n.path === '/' ? path === '/' : path.startsWith(n.path)) ? 'active' : ''
                    }
                    aria-current={
                      (n.path === '/' ? path === '/' : path.startsWith(n.path)) ? 'page' : undefined
                    }
                  >
                    <n.icon size={18} />
                    <span>{t(n.key)}</span>
                    {n.path === '/' && <span className="nav-dot" />}
                  </a>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile">
            <div className="avatar">
              {user.name
                .split(' ')
                .map((p) => p[0])
                .slice(0, 2)
                .join('')}
            </div>
            <div>
              <strong>{user.name}</strong>
              <small>{t(user.role)}</small>
            </div>
            <button
              className="icon-button"
              aria-label={t('sign_out')}
              onClick={() => void onLogout().catch(setError)}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-location">
            <button
              className="icon-button mobile-menu"
              aria-label={t('menu')}
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb-root">{t('workspace')}</span>
            <span className="divider">/</span>
            <strong>{t(current.key)}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="command-trigger"
              aria-label={t('search')}
              onClick={() => setCommand(true)}
            >
              <Search size={17} />
              <span>{t('search_hint')}</span>
              <kbd>⌘ K</kbd>
            </button>
            <Language />
            <button
              className="icon-button"
              onClick={() => setDark((v) => !v)}
              aria-label={t('theme')}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className="icon-button"
              onClick={() => navigate('/notifications')}
              aria-label={t('notifications')}
            >
              <Bell size={19} />
            </button>
            <button
              className="avatar small"
              onClick={() => navigate('/password')}
              aria-label={t(
                user.auth_provider === 'microsoft' ? 'microsoft_password_help' : 'password_change',
              )}
            >
              {user.name.slice(0, 1)}
            </button>
          </div>
        </header>
        {!online && (
          <div className="alert offline" role="status">
            {t('offline')}
          </div>
        )}
        {role !== user.role && (
          <div role="status" className="environment-banner">
            {t('view_as_notice')}
            <button onClick={() => setRole(user.role)}>{t('exit_preview')}</button>
          </div>
        )}
        <main id="main-content" tabIndex={-1} className="content" key={path}>
          {error && <ErrorBox error={error} />}
          <Boundary>
            <Suspense fallback={<Loading />}>{content()}</Suspense>
          </Boundary>
        </main>
        <footer className="app-footer">
          <a href="#/home">{t('home')}</a>
          <span>{t('tagline')}</span>
          {user.role === 'admin' && (
            <select
              aria-label={t('view_as')}
              value={role}
              onChange={async (e) => {
                const next = e.target.value as typeof role;
                if (next === 'admin') {
                  setRole(next);
                  return;
                }
                try {
                  await mutate('/view-as', { role: next });
                  setRole(next);
                } catch (e) {
                  setError(e);
                }
              }}
            >
              <option value="admin">{t('admin')}</option>
              <option value="school_management">
                {t('view_as')} · {t('school_management')}
              </option>
              <option value="teacher">
                {t('view_as')} · {t('teacher')}
              </option>
              <option value="student">
                {t('view_as')} · {t('student')}
              </option>
            </select>
          )}
        </footer>
      </div>
      {command && <CommandBar items={items} onClose={closeCommand} />}
    </div>
  );
}
function CommandBar({ items, onClose }: { items: typeof navigation; onClose: () => void }) {
  const { t } = useLocale();
  const [q, setQ] = useState('');
  const query = useDebounce(q);
  const data = useData(query.length >= 2 ? '/search?q=' + encodeURIComponent(query) : null);
  const filtered = items.filter((i) => t(i.key).toLowerCase().includes(q.toLowerCase()));
  const options = [
    ...(data.data || []).map((r: any) => ({
      title: r.title,
      entity: r.entity,
      path:
        '/' + r.entity + (['classes', 'assignments', 'exams'].includes(r.entity) ? '/' + r.id : ''),
    })),
    ...filtered.map((i) => ({ title: t(i.key), entity: 'navigate', path: i.path })),
  ];
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [q]);
  const go = (path: string) => {
    navigate(path);
    onClose();
  };
  return (
    <Modal title={t('search')} onClose={onClose}>
      <div className="command-search">
        <Search size={20} />
        <input
          autoFocus
          value={q}
          placeholder={t('search_hint')}
          aria-label={t('search')}
          aria-controls="command-results"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIndex((i) => Math.min(options.length - 1, i + 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndex((i) => Math.max(0, i - 1));
            }
            if (e.key === 'Enter' && options[index]) go(options[index].path);
          }}
        />
      </div>
      <div className="command-results" id="command-results">
        {data.loading && <Loading />}
        {data.error && <ErrorBox error={data.error} />}{' '}
        {!options.length && <Empty title="no_results" />}
        {options.map((o, i) => (
          <button
            key={o.path + o.title}
            className={i === index ? 'selected' : ''}
            onMouseEnter={() => setIndex(i)}
            onClick={() => go(o.path)}
          >
            <span>
              <small>{t(o.entity)}</small>
              <strong>{o.title}</strong>
            </span>
            <ArrowUpRight size={17} />
          </button>
        ))}
      </div>
    </Modal>
  );
}
class Boundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <ErrorBox error={{ code: 'server_error' }} retry={() => window.location.reload()} />
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
