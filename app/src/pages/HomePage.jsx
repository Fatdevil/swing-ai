import { useState, useEffect } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { getHistory } from '../utils/storage';
import ScoreGauge from '../components/ScoreGauge';

export default function HomePage({ onNavigate, onViewAnalysis }) {
  const { t, language } = useLanguage();
  const sv = language === 'sv';
  const [history, setHistory] = useState([]);
  const [reminderDismissed, setReminderDismissed] = useState(false);

  useEffect(() => {
    getHistory().then(setHistory).catch(() => setHistory([]));
  }, []);

  const lastScore = history.length > 0 ? history[0].totalScore : null;

  // Calculate days since last analysis for return reminder
  const daysSinceLastAnalysis = history.length > 0
    ? Math.floor((Date.now() - history[0].timestamp) / (1000 * 60 * 60 * 24))
    : null;

  const reminderConfig = daysSinceLastAnalysis === null ? null
    : daysSinceLastAnalysis >= 7 ? {
        icon: '🔥', color: '#FF6B35',
        title: sv ? 'Dags att komma tillbaka!' : 'Time to get back!',
        text: sv ? `${daysSinceLastAnalysis} dagar sedan din senaste analys — din sving väntar` : `${daysSinceLastAnalysis} days since your last analysis — your swing is waiting`,
      }
    : daysSinceLastAnalysis >= 3 ? {
        icon: '💪', color: '#9DFF00',
        title: sv ? 'Dags för nästa sving?' : 'Ready for your next swing?',
        text: sv ? 'Regelbunden träning ger bäst resultat' : 'Consistent practice yields the best results',
      }
    : daysSinceLastAnalysis >= 1 ? {
        icon: '👋', color: '#60A5FA',
        title: sv ? 'Välkommen tillbaka!' : 'Welcome back!',
        text: sv ? 'Filma en sving idag för att spåra din utveckling' : 'Record a swing today to track your progress',
      }
    : null;

  return (
    <div className="px-6 pt-8 pb-8 max-w-7xl mx-auto space-y-10">

      {/* Return Reminder */}
      {reminderConfig && !reminderDismissed && (
        <section
          className="relative rounded-lg p-5 border overflow-hidden"
          style={{ borderColor: `${reminderConfig.color}25`, background: `${reminderConfig.color}08` }}
        >
          <button
            onClick={() => setReminderDismissed(true)}
            className="absolute top-3 right-3 text-on-surface-variant/40 hover:text-on-surface-variant"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{reminderConfig.icon}</span>
            <div>
              <p className="font-headline font-bold text-sm" style={{ color: reminderConfig.color }}>
                {reminderConfig.title}
              </p>
              <p className="text-on-surface-variant text-xs mt-0.5">{reminderConfig.text}</p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('record')}
            className="mt-3 text-xs font-bold uppercase tracking-widest flex items-center gap-1 transition-colors"
            style={{ color: reminderConfig.color }}
          >
            {sv ? 'Filma nu' : 'Record now'}
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </section>
      )}

      {/* Hero Section: Kinetic Score */}
      <section className="relative group">
        <div className="absolute -inset-1 bg-primary-fixed/10 blur-3xl rounded-lg opacity-50" />
        <div className="relative bg-surface-container-low p-8 rounded-lg border border-outline-variant/10 overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2">
              <span className="font-label text-primary-fixed uppercase tracking-[0.2em] text-xs font-bold">
                {t('performanceSummary')}
              </span>
              <h2 className="font-headline text-4xl sm:text-5xl md:text-7xl font-bold tracking-tighter text-on-surface">
                {t('lastSwingScore')}:{' '}
                <span className="text-primary-fixed drop-shadow-[0_0_15px_rgba(157,255,0,0.4)]">
                  {lastScore ?? '—'}
                </span>
              </h2>
            </div>
            {lastScore && (
              <div className="flex items-center gap-4 bg-surface-container-high p-4 rounded-full border border-outline-variant/15">
                <div className="flex -space-x-2">
                  <div className="w-8 h-8 rounded-full border-2 border-surface bg-error" />
                  <div className="w-8 h-8 rounded-full border-2 border-surface bg-primary-fixed" />
                  <div className="w-8 h-8 rounded-full border-2 border-surface bg-secondary" />
                </div>
                <span className="text-on-surface-variant text-sm font-medium tracking-tight">
                  {t('topInRegion', { percent: '12' })}
                </span>
              </div>
            )}
          </div>
          {/* Decorative blob */}
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-primary-fixed/5 rounded-full blur-3xl" />
        </div>
      </section>

      {/* Quick Actions: Asymmetric Layout */}
      <section className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Start New Analysis — large card */}
        <div className="md:col-span-8 group relative kinetic-gradient p-[1px] rounded-lg">
          <div className="bg-surface-container h-full w-full rounded-[calc(2rem-1px)] p-8 flex flex-col justify-between transition-all group-hover:bg-surface-container-high">
            <div className="flex justify-between items-start">
              <div className="space-y-4">
                <h3 className="font-headline text-3xl font-bold leading-none">
                  {t('startNewAnalysis').split(' ').slice(0, 2).join(' ')}<br />
                  {t('startNewAnalysis').split(' ').slice(2).join(' ')}
                </h3>
                <p className="text-on-surface-variant max-w-[240px] text-sm leading-relaxed">
                  {t('startNewAnalysisDesc')}
                </p>
              </div>
              <div className="bg-primary-fixed/10 p-4 rounded-full">
                <span className="material-symbols-filled text-primary-fixed text-4xl">
                  videocam
                </span>
              </div>
            </div>
            <button
              onClick={() => onNavigate('record')}
              className="mt-8 bg-primary-fixed text-on-primary-fixed font-bold py-4 px-8 rounded-full flex items-center justify-center gap-2 active:scale-95 duration-200 w-fit shadow-[0_4px_20px_rgba(157,255,0,0.2)]"
            >
              {t('launchCamera')}
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>
        </div>

        {/* Upload Video — smaller card */}
        <div className="md:col-span-4 bg-surface-container-high p-8 rounded-lg flex flex-col justify-between border border-outline-variant/10 hover:border-primary-fixed/30 transition-all">
          <div className="space-y-4">
            <div className="text-on-surface-variant">
              <span className="material-symbols-outlined text-3xl">cloud_upload</span>
            </div>
            <h3 className="font-headline text-2xl font-bold">{t('uploadVideo')}</h3>
            <p className="text-on-surface-variant text-sm">{t('uploadVideoDesc')}</p>
          </div>
          <button
            onClick={() => onNavigate('record')}
            className="mt-6 border border-outline-variant/30 text-on-surface font-bold py-3 px-6 rounded-[1rem] hover:bg-surface-bright transition-colors active:scale-95"
          >
            {t('browseFiles')}
          </button>
        </div>
      </section>

      {/* Coach Mode — Premium CTA */}
      <section>
        <button
          onClick={() => onNavigate('coach')}
          className="w-full group relative bg-surface-container-low rounded-lg p-6 border border-outline-variant/10 hover:border-primary-fixed/20 transition-all text-left overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-40 h-40 bg-primary-fixed/5 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-primary-fixed/10 transition-colors" />
          <div className="flex items-center gap-4 relative">
            <div className="bg-primary-fixed/10 p-3 rounded-full">
              <span className="material-symbols-filled text-primary-fixed text-2xl">psychology</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-headline text-lg font-bold text-on-surface">
                  {t('coachMode') || (language === 'sv' ? 'Coach-läge' : 'Coach Mode')}
                </h3>
                <span className="text-[9px] font-black bg-primary-fixed text-on-primary-fixed px-2 py-0.5 rounded-full">PREMIUM</span>
              </div>
              <p className="text-on-surface-variant text-xs mt-1">
                {language === 'sv'
                  ? 'Personlig AI-coach som anpassar sin coaching efter dina mål'
                  : 'Personal AI coach that adapts coaching to your goals'}
              </p>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary-fixed transition-colors">arrow_forward</span>
          </div>
        </button>
      </section>

      {/* Progress Dashboard */}
      <section>
        <button
          onClick={() => onNavigate('progress')}
          className="w-full group relative bg-surface-container-low rounded-lg p-6 border border-outline-variant/10 hover:border-primary-fixed/20 transition-all text-left overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/5 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-blue-500/10 transition-colors" />
          <div className="flex items-center gap-4 relative">
            <div className="bg-blue-500/10 p-3 rounded-full">
              <span className="material-symbols-filled text-blue-400 text-2xl">query_stats</span>
            </div>
            <div className="flex-1">
              <h3 className="font-headline text-lg font-bold text-on-surface">
                {language === 'sv' ? 'Progress' : 'Progress'}
              </h3>
              <p className="text-on-surface-variant text-xs mt-1">
                {language === 'sv'
                  ? 'Se din utveckling, trender och milstolpar'
                  : 'View your trends, milestones, and improvement'}
              </p>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant group-hover:text-blue-400 transition-colors">arrow_forward</span>
          </div>
        </button>
      </section>

      {/* Challenges CTA */}
      <section>
        <button
          onClick={() => onNavigate('challenges')}
          className="w-full text-left bg-surface-container rounded-lg p-5 border border-outline-variant/10 hover:border-primary-fixed/20 transition-all group active:scale-[0.99] relative overflow-hidden"
        >
          <div className="absolute inset-0 opacity-5" style={{ background: 'radial-gradient(circle at 90% 30%, #FACC15 0%, transparent 50%)' }} />
          <div className="flex items-center gap-4 relative z-10">
            <div className="bg-amber-400/10 p-3 rounded-full">
              <span className="material-symbols-outlined text-amber-400 text-2xl">emoji_events</span>
            </div>
            <div className="flex-1">
              <h3 className="font-headline text-lg font-bold text-on-surface">
                {language === 'sv' ? 'Utmaningar' : 'Challenges'}
              </h3>
              <p className="text-on-surface-variant text-xs mt-1">
                {language === 'sv'
                  ? 'Kan du svinga som Tiger Woods? Tävla mot proffsen!'
                  : 'Can you swing like Tiger Woods? Compete against the pros!'}
              </p>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant group-hover:text-amber-400 transition-colors">arrow_forward</span>
          </div>
        </button>
      </section>

      {/* Recent Swings */}
      <section className="space-y-6">
        <div className="flex items-end justify-between">
          <h3 className="font-headline text-2xl font-bold tracking-tight">
            {t('recentSwings')}
          </h3>
          <button
            onClick={() => onNavigate('library')}
            className="text-primary-fixed text-sm font-bold uppercase tracking-widest hover:underline decoration-2 underline-offset-8"
          >
            {t('viewLibrary')}
          </button>
        </div>

        {history.length === 0 ? (
          <div className="bg-surface-container rounded-lg p-12 flex flex-col items-center justify-center text-center">
            <span className="material-symbols-outlined text-outline-variant text-5xl mb-4">sports_golf</span>
            <p className="text-on-surface-variant font-label text-sm">{t('noAnalysesYet')}</p>
            <p className="text-on-surface-variant/60 font-label text-xs mt-1">{t('startFirstAnalysis')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {history.slice(0, 3).map((item, i) => (
              <SwingCard key={item.id || i} item={item} onClick={() => onViewAnalysis(item)} />
            ))}
          </div>
        )}
      </section>

      {/* AI Coach Recommendation */}
      {history.length > 0 && history[0].coaching && (
        <section className="bg-surface-container-highest/30 rounded-lg p-8 border border-white/5 backdrop-blur-sm">
          <div className="flex flex-col md:flex-row gap-8 items-center">
            <div className="relative w-32 h-32 flex-shrink-0">
              <ScoreGauge score={lastScore || 0} size={128} />
              <div className="absolute inset-0 flex items-center justify-center flex-col">
                <span className="text-2xl font-black text-on-surface">{lastScore}%</span>
                <span className="text-[8px] uppercase tracking-widest text-on-surface-variant">
                  {t('consistency')}
                </span>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="font-headline text-xl font-bold text-primary-fixed">
                {t('aiCoachRecommendation')}
              </h4>
              <p className="text-on-surface-variant text-sm max-w-2xl leading-relaxed">
                {history[0].coaching?.priorityFocus || t('startFirstAnalysis')}
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

/* Swing Card sub-component */
function SwingCard({ item, onClick }) {
  const score = item.totalScore || 0;
  const date = new Date(item.timestamp);
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = date.toLocaleDateString();

  const getScoreColor = (s) => {
    if (s >= 80) return 'text-primary-fixed';
    if (s >= 70) return 'text-on-surface';
    return 'text-error';
  };

  const getBadge = (s) => {
    if (s >= 85) return { label: 'PRO', bg: 'bg-primary-fixed', text: 'text-on-primary-fixed' };
    if (s >= 70) return { label: 'STABLE', bg: 'bg-secondary', text: 'text-on-secondary' };
    return { label: 'ALERT', bg: 'bg-error', text: 'text-on-error' };
  };

  const badge = getBadge(score);

  return (
    <button
      onClick={onClick}
      className="group bg-surface-container rounded-lg overflow-hidden border border-outline-variant/10 hover:shadow-[0_10px_30px_rgba(0,0,0,0.4)] transition-all text-left w-full"
    >
      {/* Thumbnail area */}
      <div className="relative h-48 overflow-hidden bg-surface-container-high">
        {item.imageThumbnail ? (
          <img
            src={URL.createObjectURL(item.imageThumbnail)}
            alt="Swing"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="material-symbols-outlined text-outline-variant text-5xl">sports_golf</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
        <div className="absolute bottom-4 left-4 flex items-center gap-2">
          <span className={`${badge.bg} ${badge.text} text-[10px] font-black px-2 py-0.5 rounded-full`}>
            {badge.label}
          </span>
          <span className="text-on-surface text-xs font-medium">{timeStr}</span>
        </div>
      </div>

      {/* Info */}
      <div className="p-6 flex justify-between items-center">
        <div className="space-y-1">
          <p className="text-on-surface font-bold">{item.coaching?.categories?.[0]?.name || 'Analysis'}</p>
          <p className="text-on-surface-variant text-xs font-medium">{dateStr}</p>
        </div>
        <div className="text-right">
          <span className={`${getScoreColor(score)} font-headline text-2xl font-bold`}>
            {score}
          </span>
        </div>
      </div>
    </button>
  );
}
