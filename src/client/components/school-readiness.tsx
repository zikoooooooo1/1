import { ArrowUpRight, Check, LockKeyhole } from 'lucide-react';
import type { SchoolReadiness as Readiness } from '../../shared/readiness';
import { useLocale } from '../i18n';
import { navigate } from '../api';

export function SchoolReadiness({
  data,
  administrator,
}: {
  data: Readiness;
  administrator: boolean;
}) {
  const { t, number } = useLocale();
  return (
    <section className="onboarding panel readiness" aria-labelledby="readiness-heading">
      <div>
        <span className="eyebrow">{t('getting_started')}</span>
        <h2 id="readiness-heading">{t('setup_school')}</h2>
        <p>{t('setup_current_help')}</p>
        <label htmlFor="readiness-progress">
          {t('setup_completed')}{' '}
          <bdi>
            {number(data.completed)} / {number(data.total)}
          </bdi>
        </label>
        <progress id="readiness-progress" max={data.total} value={data.completed} />
        <p>
          {t('setup_class_coverage')}{' '}
          <bdi>
            {number(data.connectedClasses)} / {number(data.activeClasses)}
          </bdi>
          <br />
          {t('setup_schedule_coverage')}{' '}
          <bdi>
            {number(data.scheduledClasses)} / {number(data.activeClasses)}
          </bdi>
        </p>
      </div>
      <ol className="setup-steps">
        {data.steps.map((step, i) => {
          const restricted = step.administratorOnly && !administrator;
          const contents = (
            <>
              <span className="step-number" aria-hidden="true">
                {step.done ? <Check size={16} /> : number(i + 1)}
              </span>
              <span>
                <strong>{t(step.key)}</strong>
                <small className="readiness-status">
                  {t(step.done ? 'setup_done' : 'setup_needed')}
                </small>
                <small>{t(step.description)}</small>
                {restricted && <small>{t('setup_admin_only')}</small>}
              </span>
              {restricted ? (
                <LockKeyhole size={15} aria-hidden="true" />
              ) : (
                <ArrowUpRight size={15} aria-hidden="true" />
              )}
            </>
          );
          return (
            <li key={step.key} className={step.done ? 'done' : ''}>
              {restricted ? (
                <div className="readiness-step">{contents}</div>
              ) : (
                <button className="readiness-step" onClick={() => navigate(step.path)}>
                  {contents}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
