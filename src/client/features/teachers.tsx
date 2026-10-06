import { useState } from 'react';
import { useData, useDebounce, mutate } from '../api';
import { useLocale } from '../i18n/index';
import {
  Modal,
  Form,
  SearchInput,
  Loading,
  ErrorBox,
  Empty,
  Pagination,
  Button,
} from '../components/ui';

export function TeacherOnboarding({
  teacher,
  onClose,
  onDone,
}: {
  teacher?: { id: string; name: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, number } = useLocale();
  const [query, setQuery] = useState(''),
    [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const q = useDebounce(query);
  const data = useData(`/teaching-classes?q=${encodeURIComponent(q)}&page=${page}`);
  return (
    <Modal title={t(teacher ? 'assign_teaching_classes' : 'create_teacher')} onClose={onClose}>
      <p>{teacher?.name}</p>
      <p>{t('teacher_onboarding_help')}</p>
      <Form
        fields={
          teacher
            ? []
            : [
                { key: 'name', required: true, autoComplete: 'name' },
                { key: 'email', type: 'email', required: true, autoComplete: 'email' },
                { key: 'password', type: 'password', required: true },
              ]
        }
        onCancel={onClose}
        submitLabel={teacher ? 'assign_teaching_classes' : 'create_teacher'}
        onSave={async (body) => {
          if (!Object.keys(selected).length)
            throw { code: 'select_teaching_class', message: 'select_teaching_class' };
          await mutate(teacher ? `/teachers/${teacher.id}/assignments` : '/teachers', {
            ...body,
            class_ids: Object.keys(selected),
          });
          onDone();
        }}
      >
        <section className="teaching-selection" aria-label={t('teacher_assignments')}>
          <h3>{t('teacher_assignments')}</h3>
          <p className="muted">{t('teaching_class_help')}</p>
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              setPage(1);
            }}
          />
          <div className="selected-classes" aria-live="polite">
            <strong>
              {t('selected_classes')}: {number(Object.keys(selected).length)}
            </strong>
            {Object.entries(selected).map(([id, name]) => (
              <Button
                key={id}
                variant="ghost"
                type="button"
                onClick={() =>
                  setSelected((previous) => {
                    const next = { ...previous };
                    delete next[id];
                    return next;
                  })
                }
              >
                {name} · {t('remove')}
              </Button>
            ))}
          </div>
          {data.loading ? (
            <Loading />
          ) : data.error ? (
            <ErrorBox error={data.error} />
          ) : !data.data?.items.length ? (
            <>
              <Empty />
              <a href="#/academic" onClick={onClose}>
                {t('configure_academic_first')}
              </a>
            </>
          ) : (
            <div className="teaching-options">
              {data.data.items.map((row: any) => (
                <label key={row.id} className="teaching-option">
                  <input
                    type="checkbox"
                    checked={!!selected[row.id]}
                    onChange={(e) =>
                      setSelected((previous) => {
                        const next = { ...previous };
                        if (e.target.checked) next[row.id] = row.name;
                        else delete next[row.id];
                        return next;
                      })
                    }
                  />
                  <span>
                    <strong>
                      <bdi>{row.name}</bdi>
                    </strong>
                    <span>
                      <bdi>{row.grade}</bdi> · <bdi>{row.section}</bdi> ·{' '}
                      <bdi>{row.track || t('no_track')}</bdi> · <bdi>{row.subject}</bdi>
                    </span>
                    <small>
                      <bdi dir={/^\d/.test(row.academic_year) ? 'ltr' : 'auto'}>
                        {row.academic_year}
                      </bdi>{' '}
                      · <bdi>{row.term}</bdi>
                    </small>
                  </span>
                </label>
              ))}
            </div>
          )}
          {data.data && (
            <Pagination page={page} setPage={setPage} total={data.data.total} limit={25} />
          )}
        </section>
      </Form>
    </Modal>
  );
}
