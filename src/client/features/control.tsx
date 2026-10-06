import { RosterManagement } from './rosters';
import { SchoolReadiness } from '../components/school-readiness';
import {
  Users,
  Layers3,
  CalendarDays,
  ClipboardCheck,
  FolderOpen,
  Megaphone,
  Shield,
  Settings,
  ArrowUpRight,
  ChartNoAxesCombined,
} from 'lucide-react';
import type { User } from './records';
import { useLocale } from '../i18n/index';
import { useData, navigate } from '../api';
import { PageHeader, Loading, ErrorBox, Empty, Table, Button } from '../components/ui';
export function ControlCenter({ user }: { user: User }) {
  const { t, number } = useLocale();
  const { data, loading, error, reload } = useData('/control-center');
  const permissions = useData('/permissions');
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const admin = user.role === 'admin';
  const links = [
    { title: 'academic', text: 'control_academic_help', path: '/academic', icon: Layers3 },
    {
      title: 'people',
      text: admin ? 'control_accounts_help' : 'control_directory_help',
      path: '/people',
      icon: Users,
    },
    { title: 'schedules', text: 'control_schedule_help', path: '/schedules', icon: CalendarDays },
    { title: 'exams', text: 'control_assessment_help', path: '/exams', icon: ClipboardCheck },
    { title: 'resources', text: 'control_resources_help', path: '/resources', icon: FolderOpen },
    {
      title: 'announcements',
      text: 'control_announcements_help',
      path: '/announcements',
      icon: Megaphone,
    },
    {
      title: 'analytics',
      text: 'control_analytics_help',
      path: '/analytics',
      icon: ChartNoAxesCombined,
    },
    {
      title: 'audit',
      text: admin ? 'control_audit_help' : 'control_academic_audit_help',
      path: '/audit',
      icon: Shield,
    },
    ...(admin
      ? [
          { title: 'settings', text: 'control_settings_help', path: '/settings', icon: Settings },
          { title: 'imports', text: 'control_import_help', path: '/imports', icon: Users },
        ]
      : []),
  ];
  const metrics = [
    ['active_classes', data.classes, '/classes'],
    ['unassigned_classes', data.unassigned_classes, '/academic'],
    ['empty_classes', data.empty_classes, '/academic'],
    ['pending_grading', data.pending_grading, '/assignments'],
    ['unreleased_exams', data.unreleased_exams, '/exams'],
  ] as const;
  return (
    <>
      <PageHeader
        title={admin ? 'admin_control' : 'school_management_control'}
        eyebrow="control_center"
        description={admin ? 'admin_control_help' : 'management_control_help'}
      />
      <p className="year-pill control-year">
        <bdi dir={/^\d/.test(data.active_year?.name || '') ? 'ltr' : 'auto'}>
          {data.active_year?.name || t('no_active_year')}
        </bdi>
      </p>
      <SchoolReadiness data={data.readiness} administrator={admin} />
      {admin && <RosterManagement />}
      <div className="control-metrics">
        {metrics.map(([key, count, path]) => (
          <button key={key} className="metric panel" onClick={() => navigate(path)}>
            <span>{t(key)}</span>
            <strong>{number(count)}</strong>
            <span>
              {t('open')} <ArrowUpRight size={14} />
            </span>
          </button>
        ))}
      </div>
      <div className="control-links">
        {links.map((link) => (
          <button
            key={link.path}
            className="panel control-link"
            onClick={() => navigate(link.path)}
          >
            <link.icon size={21} />
            <span>
              <strong>{t(link.title)}</strong>
              <small>{t(link.text)}</small>
            </span>
            <ArrowUpRight size={17} />
          </button>
        ))}
      </div>
      <section className="panel section-gap">
        <div className="panel-heading">
          <h2>{t('academic_followup')}</h2>
          <Button variant="ghost" onClick={() => navigate('/academic')}>
            {t('academic')}
          </Button>
        </div>
        <p className="control-description">{t('academic_followup_help')}</p>
        {data.academic_alerts.length ? (
          <Table
            rows={data.academic_alerts}
            columns={['name', 'teachers', 'students']}
            onRow={(row) => navigate('/classes/' + row.id)}
          />
        ) : (
          <Empty
            title={data.classes ? 'no_academic_gaps' : 'setup_no_classes'}
            description={data.classes ? 'no_academic_gaps_help' : 'setup_no_classes_help'}
          />
        )}
      </section>
      {admin && (
        <section className="panel section-gap">
          <div className="panel-heading">
            <h2>{t('account_overview')}</h2>
            <Button onClick={() => navigate('/people')}>{t('manage_accounts')}</Button>
          </div>
          {data.accounts.length ? (
            <Table
              rows={data.accounts.map((r: any) => ({ ...r, id: r.role + r.status }))}
              columns={['role', 'status', 'count']}
            />
          ) : (
            <Empty />
          )}
        </section>
      )}
      <section className="panel section-gap">
        <div className="panel-heading">
          <h2>{t('permission_boundaries')}</h2>
        </div>
        <p className="control-description">{t('permission_boundaries_help')}</p>
        {permissions.loading ? (
          <Loading />
        ) : permissions.error ? (
          <ErrorBox error={permissions.error} />
        ) : (
          <Table
            rows={(permissions.data || []).map((p: any) => ({
              id: p.role_id + p.id,
              role: p.role_id,
              description: t('permission_' + p.id),
            }))}
            columns={['role', 'description']}
          />
        )}
      </section>
    </>
  );
}
