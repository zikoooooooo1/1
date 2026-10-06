import { useState } from 'react';
import { useLocale } from '../i18n';
import { mutate, useData, useDebounce } from '../api';
import {
  Button,
  Form,
  Modal,
  ErrorBox,
  Loading,
  Table,
  SearchInput,
  Pagination,
} from '../components/ui';
export function RosterManagement() {
  const { t, number } = useLocale();
  const data = useData('/rosters');
  const [selected, setSelected] = useState<any>(null),
    [credentials, setCredentials] = useState<string | null>(null);
  if (data.loading) return <Loading />;
  if (data.error) return <ErrorBox error={data.error} retry={data.reload} />;
  if (!data.data?.items.length) return null;
  return (
    <section className="panel padded section-gap">
      <h2>{t('roster_management')}</h2>
      {data.data.items.map((batch: any) => (
        <div className="roster-batch" key={batch.id}>
          <h3>{batch.label}</h3>
          <p>
            {number(batch.students)} {t('students')} · {number(batch.groups)} {t('sections')} ·{' '}
            {t(batch.status)}
          </p>
          {batch.status === 'pending' && (
            <>
              <p className="muted">{t('roster_pending_help')}</p>
              <Button
                disabled={!data.data.years.length || !data.data.terms.length}
                onClick={() => setSelected(batch)}
              >
                {t('roster_activate')}
              </Button>{' '}
              <a href="#/academic/academic_years">{t('academic')}</a>
            </>
          )}
          <p>
            <Button variant="secondary" onClick={() => setCredentials(batch.id)}>
              {t('teacher_credentials')}
            </Button>
          </p>
        </div>
      ))}
      {selected && (
        <Modal title={t('roster_activate')} onClose={() => setSelected(null)}>
          <Form
            fields={[
              {
                key: 'year_id',
                type: 'select',
                required: true,
                options: data.data.years.map((y: any) => ({ value: y.id, label: y.name })),
              },
              {
                key: 'term_id',
                type: 'select',
                required: true,
                options: data.data.terms.map((v: any) => ({ value: v.id, label: v.name })),
              },
            ]}
            onCancel={() => setSelected(null)}
            onSave={async (body) => {
              if (!window.confirm(t('roster_activation_confirm'))) return;
              await mutate(`/rosters/${selected.id}/activate`, body);
              setSelected(null);
              data.reload();
            }}
          />
        </Modal>
      )}
      {credentials && (
        <Modal title={t('teacher_credentials')} onClose={() => setCredentials(null)}>
          <p>{t('credentials_help')}</p>
          <Form
            fields={[
              {
                key: 'current_password',
                type: 'password',
                required: true,
                autoComplete: 'current-password',
              },
            ]}
            onCancel={() => setCredentials(null)}
            onSave={async (body) => {
              const result = await mutate(`/rosters/${credentials}/teacher-credentials`, body);
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(result.credentials, null, 2)], {
                  type: 'application/json',
                }),
              );
              const link = document.createElement('a');
              link.href = url;
              link.download = 'claso-teacher-access.json';
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              setCredentials(null);
            }}
          />
        </Modal>
      )}
    </section>
  );
}
export function ClassRoster({ classId }: { classId: string }) {
  const [q, setQ] = useState(''),
    [page, setPage] = useState(1);
  const query = useDebounce(q);
  const data = useData(`/classes/${classId}/roster?q=${encodeURIComponent(query)}&page=${page}`);
  return (
    <section className="panel padded">
      <SearchInput
        value={q}
        onChange={(v) => {
          setQ(v);
          setPage(1);
        }}
      />
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <ErrorBox error={data.error} retry={data.reload} />
      ) : (
        <>
          <Table rows={data.data?.items || []} columns={['student_number', 'name_en', 'name_ar']} />
          <Pagination page={page} setPage={setPage} total={data.data?.total || 0} limit={25} />
        </>
      )}
    </section>
  );
}
