import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Play,
  Globe,
  Layers3,
  Users,
  BookOpen,
  ChartNoAxesCombined,
  Shield,
  CalendarDays,
  Check,
  ArrowDown,
  Pause,
} from 'lucide-react';
import { useLocale } from '../i18n';
import tour from '../../shared/tour-content.json';
import timeline from '../../shared/tour-timeline.json';
import '../styles/home.css';

const nodes = [Layers3, Users, BookOpen, ChartNoAxesCombined];
const nodeKeys = ['home_structure', 'home_people', 'home_learning', 'home_history'];
export default function Home({ signedIn }: { signedIn: boolean }) {
  const { locale, setLocale, t } = useLocale();
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [chapter, setChapter] = useState('');
  const pendingSeek = useRef<number | null>(null);
  const [motion, setMotion] = useState(false);
  const entry = signedIn ? '#/workspace' : '#/login';
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    setMotion(!preference.matches);
    const change = () => setMotion(!preference.matches);
    preference.addEventListener('change', change);
    return () => preference.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    setFailed(false);
    setChapter('');
    pendingSeek.current = null;
  }, [locale]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    document.querySelectorAll('.home-reveal').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  const watch = () => {
    document
      .getElementById('product-film')
      ?.scrollIntoView({ behavior: motion ? 'smooth' : 'instant' });
    video.current?.focus({ preventScroll: true });
    void video.current?.play().catch(() => {
      /* Native controls remain available to retry playback. */
    });
  };
  const film = tour[locale];
  const timing = timeline[locale];
  const media = (suffix: string) => `/media/tour-${locale}${suffix}?v=${timing.revision}`;
  const seek = (seconds: number) => {
    const player = video.current;
    if (!player) return;
    pendingSeek.current = seconds;
    if (player.readyState >= 1) {
      player.currentTime = seconds;
      pendingSeek.current = null;
    }
    void player.play().catch(() => {
      /* Source failures display the localized recovery state. */
    });
  };
  return (
    <div className={`home-page ${motion ? 'motion-on' : 'motion-off'}`}>
      <a
        className="skip-link"
        href="#home-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('home-content')?.focus();
        }}
      >
        {t('home')}
      </a>
      <header className="home-header home-width">
        <a className="brand" href="#/home" aria-label="CLASO">
          <img src="/brand/symbol.svg" alt="" />
          <strong>
            CLASO<span>CLASS + OS</span>
          </strong>
        </a>
        <nav aria-label={t('home')}>
          <a
            href="#platform"
            onClick={(e) => {
              e.preventDefault();
              document
                .getElementById('platform')
                ?.scrollIntoView({ behavior: motion ? 'smooth' : 'instant' });
            }}
          >
            {t('home_platform')}
          </a>
          <a
            href="#workspaces"
            onClick={(e) => {
              e.preventDefault();
              document
                .getElementById('workspaces')
                ?.scrollIntoView({ behavior: motion ? 'smooth' : 'instant' });
            }}
          >
            {t('home_workspaces')}
          </a>
          <button className="home-nav-film" onClick={watch}>
            {t('home_tour')}
          </button>
        </nav>
        <div className="home-header-actions">
          <button
            className="language-button"
            aria-label={t('language')}
            onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
          >
            <Globe size={16} />
            {locale === 'ar' ? 'English' : 'العربية'}
          </button>
          <a href={entry} className="button primary">
            {t(signedIn ? 'workspace' : 'sign_in')}
            <ArrowUpRight size={16} />
          </a>
        </div>
      </header>
      <main id="home-content" tabIndex={-1}>
        <section className="home-hero home-width">
          <div className="home-hero-copy">
            <div className="home-eyebrow">
              <span />
              {t('home_kicker')}
            </div>
            <h1>
              {t('home_title')}
              <br />
              <span>{t('home_title_accent')}</span>
            </h1>
            <p className="home-lead">{t('home_intro')}</p>
            <div className="home-cta">
              <a className="button primary" href={entry}>
                {t(signedIn ? 'home_enter' : 'sign_in')}
                <ArrowUpRight size={19} />
              </a>
              <button className="button secondary" onClick={watch}>
                <Play size={17} />
                {t('home_watch')}
              </button>
            </div>
            <p className="home-note">{t('home_watch_note')}</p>
          </div>
          <div className="home-diagram" role="group" aria-label={t('home_system')}>
            <div className="diagram-heading">
              <span className="diagram-indicator" />
              <span>{t('home_system')}</span>
              <span className="diagram-index" dir="ltr">
                CLASS + OS
              </span>
            </div>
            <div className="diagram-grid" aria-hidden="true" />
            <div className="diagram-ring ring-outer" />
            <div className="diagram-ring ring-inner" />
            <div className="diagram-center">
              <img src="/brand/symbol.svg" alt="" />
              <strong>CLASO</strong>
            </div>
            {nodes.map((Icon, i) => (
              <div className={`diagram-node diagram-node-${i}`} key={nodeKeys[i]}>
                <span>
                  <Icon size={20} />
                </span>
                <strong>{t(nodeKeys[i])}</strong>
                <i>
                  <Check size={12} />
                </i>
              </div>
            ))}
            <div className="diagram-foot">
              <span>{t('home_system_hint')}</span>
              <button
                className="icon-button"
                aria-label={t(motion ? 'home_motion' : 'home_resume_motion')}
                onClick={() => setMotion(!motion)}
              >
                {motion ? <Pause size={14} /> : <Play size={14} />}
              </button>
            </div>
          </div>
        </section>
        <div className="home-principles home-width">
          {[
            ['home_language', Globe],
            ['home_access', Shield],
            ['home_connected', Layers3],
          ].map(([key, Icon]) => {
            const Symbol = Icon as typeof Globe;
            return (
              <span key={String(key)}>
                <Symbol size={17} />
                {t(String(key))}
              </span>
            );
          })}
        </div>
        <section className="home-section home-width home-reveal" id="platform">
          <div className="home-section-heading">
            <div>
              <span className="home-eyebrow">01 / {t('home_platform')}</span>
              <h2>{t('home_flow')}</h2>
            </div>
            <p>{t('home_flow_copy')}</p>
          </div>
          <div className="home-feature-grid">
            {[
              [Layers3, 'home_structure', 'home_structure_copy'],
              [BookOpen, 'home_learning', 'home_learning_copy'],
              [ChartNoAxesCombined, 'home_history', 'home_history_copy'],
            ].map(([Icon, key, desc], i) => {
              const Symbol = Icon as typeof Globe;
              return (
                <article key={String(key)}>
                  <div className="home-feature-top">
                    <Symbol size={25} />
                    <span dir="ltr">0{i + 1}</span>
                  </div>
                  <h3>{t(String(key))}</h3>
                  <p>{t(String(desc))}</p>
                </article>
              );
            })}
          </div>
        </section>
        <section
          id="product-film"
          className="home-film-section home-reveal"
          aria-labelledby="film-heading"
        >
          <div className="home-width">
            <div className="home-section-heading">
              <div>
                <span className="home-eyebrow">02 / {t('home_tour')}</span>
                <h2 id="film-heading">{t('home_film_title')}</h2>
              </div>
              <p>{t('home_film_copy')}</p>
            </div>
            <div className="home-film-frame">
              <video
                key={locale}
                ref={video}
                controls
                playsInline
                preload="none"
                poster={media('-poster.jpg')}
                aria-label={t('home_film_label')}
                onError={() => setFailed(true)}
                onLoadedData={() => setFailed(false)}
                onLoadedMetadata={(event) => {
                  if (pendingSeek.current !== null) {
                    event.currentTarget.currentTime = pendingSeek.current;
                    pendingSeek.current = null;
                  }
                }}
                onTimeUpdate={(event) =>
                  setChapter(
                    timing.chapters
                      .filter((item) => item.start <= event.currentTarget.currentTime)
                      .at(-1)?.id || '',
                  )
                }
              >
                <source src={media('.webm')} type="video/webm" />
                <source src={media('.mp4')} type="video/mp4" onError={() => setFailed(true)} />
                <track
                  kind="captions"
                  src={media('.vtt')}
                  srcLang={locale}
                  label={locale === 'ar' ? 'العربية' : 'English'}
                />
                {t('home_video_fallback')}
              </video>
            </div>
            <nav className="film-chapters" aria-label={t('home_chapters')}>
              {timing.chapters.map((item, index) => (
                <button
                  key={item.id}
                  aria-current={chapter === item.id ? 'step' : undefined}
                  onClick={() => seek(item.start)}
                >
                  <span className="film-chapter-index" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <strong>{item.title}</strong>
                  <bdi dir="ltr">
                    {Math.floor(item.start / 60)}:
                    {String(Math.floor(item.start % 60)).padStart(2, '0')}
                  </bdi>
                </button>
              ))}
            </nav>
            {failed && (
              <div className="error-box" role="alert">
                <p>{t('home_video_error')}</p>
                <button
                  className="button secondary"
                  onClick={() => {
                    setFailed(false);
                    video.current?.load();
                  }}
                >
                  {t('retry')}
                </button>
              </div>
            )}
            <div className="home-film-meta">
              <span>{t('home_film_voice')}</span>
              <a href={media('.mp4')} download>
                {t('home_download')}
                <ArrowDown size={15} />
              </a>
            </div>
            <details className="home-transcript">
              <summary>{t('home_transcript')}</summary>
              {film.scenes.map((scene) => (
                <p key={scene.title}>
                  <strong>{scene.title}. </strong>
                  {scene.beats.map((beat) => beat.narration).join(' ')}
                </p>
              ))}
            </details>
          </div>
        </section>
        <section id="workspaces" className="home-section home-width home-reveal">
          <div className="home-section-heading">
            <div>
              <span className="home-eyebrow">03 / {t('home_workspaces')}</span>
              <h2>{t('home_role_title')}</h2>
            </div>
            <p>{t('home_role_copy')}</p>
          </div>
          <div className="home-role-grid">
            {[
              [Shield, 'admin', 'home_admin_copy'],
              [CalendarDays, 'school_management', 'home_management_copy'],
              [BookOpen, 'teacher', 'home_teacher_copy'],
              [Users, 'student', 'home_student_copy'],
            ].map(([Icon, key, desc]) => {
              const Symbol = Icon as typeof Globe;
              return (
                <article key={String(key)}>
                  <Symbol size={23} />
                  <h3>{t(String(key))}</h3>
                  <p>{t(String(desc))}</p>
                </article>
              );
            })}
          </div>
        </section>
        <section className="home-closing home-width home-reveal">
          <img src="/brand/symbol-monochrome.svg" alt="" />
          <h2>{t('home_closing')}</h2>
          <p>{t('home_closing_copy')}</p>
          <a href={entry} className="button primary">
            {t(signedIn ? 'home_enter' : 'sign_in')}
            <ArrowUpRight size={18} />
          </a>
        </section>
      </main>
      <footer className="home-footer home-width">
        <strong>
          CLASO <span>CLASS + OS</span>
        </strong>
        <span>{t('tagline')}</span>
        <span>© {new Date().getFullYear()} CLASO</span>
      </footer>
    </div>
  );
}
