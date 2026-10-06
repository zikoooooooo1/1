import { useState } from 'react';
import { Check, ArrowRight, ArrowLeft, BookOpen } from 'lucide-react';
import { useLocale } from '../i18n';
import { useData, mutate } from '../api';
import { Button, Loading, ErrorBox } from '../components/ui';
import '../styles/teaching-setup.css';
type Subject = { id: string; name: string; code: string };
type Group = {
  id: string;
  code: string;
  grade_level: number;
  track: string | null;
  students: number;
};
export function TeachingSetup({
  onDone,
  onLogout,
}: {
  onDone: () => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const { t, locale, setLocale, number } = useLocale();
  const data = useData<{
    batch: { id: string; label: string } | null;
    subjects: Subject[];
    groups: Group[];
  }>('/teaching-setup');
  const [step, setStep] = useState(0),
    [subjects, setSubjects] = useState<string[]>([]),
    [grades, setGrades] = useState<number[]>([]);
  const [selected, setSelected] = useState<Record<string, string[]>>({}),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<any>(null);
  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  const chosen = data.data?.subjects.filter((s) => subjects.includes(s.id)) || [];
  const groups = data.data?.groups || [];
  const validGroups = (subjectId: string) =>
    (selected[subjectId] || []).filter((gid) =>
      groups.some((g) => g.id === gid && grades.includes(g.grade_level)),
    );
  const ready =
    step === 0
      ? subjects.length > 0
      : step === 1
        ? grades.length > 0
        : chosen.every((s) => validGroups(s.id).length > 0);
  const titles = ['setup_subjects', 'setup_grades', 'setup_sections', 'setup_review'];
  const subjectName = (s: Subject) =>
    t('subject_' + s.code) === 'subject_' + s.code ? s.name : t('subject_' + s.code);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await mutate('/teaching-setup', {
        batch_id: data.data!.batch!.id,
        selections: chosen.map((s) => ({ subject_id: s.id, group_ids: validGroups(s.id) })),
      });
      await onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="teaching-setup-page">
      <header className="teaching-setup-header">
        <a className="brand" href="#/home">
          <img src="/brand/symbol.svg" alt="" />
          <strong>CLASO</strong>
        </a>
        <div>
          <Button variant="ghost" onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')}>
            {locale === 'en' ? 'العربية' : 'English'}
          </Button>
          <Button variant="ghost" onClick={onLogout}>
            {t('sign_out')}
          </Button>
        </div>
      </header>
      <section className="teaching-setup-card">
        <span className="eyebrow">{t('teacher')}</span>
        <h1>{t('complete_teaching_setup')}</h1>
        <p className="muted">{t('teaching_setup_intro')}</p>
        {data.loading ? (
          <Loading />
        ) : data.error ? (
          <ErrorBox error={data.error} retry={data.reload} />
        ) : !data.data?.batch ? (
          <div className="setup-waiting">
            <BookOpen size={32} />
            <h2>{t('setup_waiting')}</h2>
            <p>{t('setup_waiting_help')}</p>
            <Button onClick={data.reload}>{t('retry')}</Button>
          </div>
        ) : (
          <>
            <ol className="setup-progress" aria-label={t('complete_teaching_setup')}>
              {titles.map((title, i) => (
                <li key={title} aria-current={step === i ? 'step' : undefined}>
                  <span>{i < step ? <Check size={15} /> : number(i + 1)}</span>
                  {t(title)}
                </li>
              ))}
            </ol>
            <h2 tabIndex={-1} id="setup-step-heading">
              {t(titles[step])}
            </h2>
            {step === 0 && (
              <>
                <p>{t('setup_subject_help')}</p>
                <div className="setup-choice-grid">
                  {data.data.subjects.map((s) => (
                    <label className="setup-choice" key={s.id}>
                      <input
                        type="checkbox"
                        checked={subjects.includes(s.id)}
                        onChange={() => {
                          setSubjects(toggle(subjects, s.id));
                          setConfirmed(false);
                        }}
                      />
                      <span>{subjectName(s)}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
            {step === 1 && (
              <div className="setup-choice-grid">
                {[5, 6, 7, 8, 9, 10, 11, 12].map((g) => (
                  <label className="setup-choice" key={g}>
                    <input
                      type="checkbox"
                      checked={grades.includes(g)}
                      disabled={!groups.some((v) => v.grade_level === g)}
                      onChange={() => {
                        setGrades(toggle(grades, g));
                        setConfirmed(false);
                      }}
                    />
                    <span>
                      {t('grade')} {number(g)}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {step === 2 && (
              <>
                <p>{t('setup_section_help')}</p>
                {chosen.map((s) => (
                  <fieldset className="setup-subject" key={s.id}>
                    <legend>{subjectName(s)}</legend>
                    {grades
                      .slice()
                      .sort((a, b) => a - b)
                      .map((g) => (
                        <div key={g}>
                          <h3>
                            {t('grade')} {number(g)}
                          </h3>
                          <div className="setup-choice-grid">
                            {groups
                              .filter((v) => v.grade_level === g)
                              .map((group) => (
                                <label className="setup-choice" key={group.id}>
                                  <input
                                    type="checkbox"
                                    checked={validGroups(s.id).includes(group.id)}
                                    onChange={() => {
                                      setSelected({
                                        ...selected,
                                        [s.id]: toggle(selected[s.id] || [], group.id),
                                      });
                                      setConfirmed(false);
                                    }}
                                  />
                                  <span>
                                    <strong>
                                      <bdi>{group.code}</bdi> ·{' '}
                                      {t(group.track ? 'track_' + group.track : 'no_track')}
                                    </strong>
                                    <small>
                                      {number(group.students)} {t('students')}
                                    </small>
                                  </span>
                                </label>
                              ))}
                          </div>
                        </div>
                      ))}
                  </fieldset>
                ))}
              </>
            )}
            {step === 3 && (
              <>
                <div className="setup-review">
                  {chosen.map((s) => (
                    <section key={s.id}>
                      <h3>{subjectName(s)}</h3>
                      <p>
                        {groups
                          .filter((g) => validGroups(s.id).includes(g.id))
                          .map((g) => (
                            <bdi className="setup-group-chip" key={g.id}>
                              {g.code}
                            </bdi>
                          ))}
                      </p>
                    </section>
                  ))}
                </div>
                <p>
                  <strong>
                    {t('setup_class_count')}:{' '}
                    {number(chosen.reduce((n, s) => n + validGroups(s.id).length, 0))}
                  </strong>
                </p>
                <label className="setup-confirm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  {t('setup_confirm')}
                </label>
              </>
            )}
            {error && <ErrorBox error={error} />}
            <footer className="setup-actions">
              {step > 0 && (
                <Button variant="secondary" disabled={busy} onClick={() => setStep(step - 1)}>
                  <ArrowLeft size={16} />
                  {t('back')}
                </Button>
              )}
              {step < 3 ? (
                <Button
                  disabled={!ready}
                  onClick={() => {
                    setStep(step + 1);
                    requestAnimationFrame(() =>
                      document.getElementById('setup-step-heading')?.focus(),
                    );
                  }}
                >
                  {t('next')}
                  <ArrowRight size={16} />
                </Button>
              ) : (
                <Button disabled={busy || !ready || !confirmed} onClick={save}>
                  {busy ? t('saving') : t('setup_create_classes')}
                </Button>
              )}
            </footer>
          </>
        )}
      </section>
    </main>
  );
}
