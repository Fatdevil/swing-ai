import { useState, useEffect } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../auth/AuthContext';
import { clearHistory, getSetting, setSetting, getHistory } from '../utils/storage';

export default function ProfilePage() {
  const { t, language, setLanguage } = useLanguage();
  const sv = language === 'sv';
  const { user, logout } = useAuth();
  const [apiKey, setApiKey] = useState(''); // legacy, not used
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [stats, setStats] = useState(null);
  const [engines, setEngines] = useState(null);

  useEffect(() => {
    getHistory().then(history => {
      if (history.length === 0) return;
      const scores = history.map(h => h.totalScore).filter(Boolean);
      setStats({
        total: history.length,
        avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        bestScore: scores.length ? Math.max(...scores) : null,
        latestScore: scores[0] || null,
        oldest: new Date(history[history.length - 1].timestamp),
        newest: new Date(history[0].timestamp),
      });
    }).catch(() => {});

    // Check engine status
    fetch('/api/engines').then(r => r.json()).then(setEngines).catch(() => {});
  }, [cleared]);

  const handleApiKeyChange = (e) => {
    const key = e.target.value;
    setApiKey(key);
    setSetting('anthropic_key', key);
  };

  const handleClearHistory = async () => {
    await clearHistory();
    setShowClearConfirm(false);
    setCleared(true);
    setStats(null);
    setTimeout(() => setCleared(false), 2000);
  };

  return (
    <div className="px-6 pt-8 pb-8 max-w-2xl mx-auto space-y-8">
      <h2 className="font-headline text-3xl font-bold tracking-tight">{t('settings')}</h2>

      {/* App Stats */}
      {stats && (
        <section className="bg-surface-container rounded-lg p-6 border border-outline-variant/10">
          <div className="flex items-center gap-3 mb-4">
            <span className="material-symbols-outlined text-primary-fixed">analytics</span>
            <h3 className="font-headline font-bold">{sv ? 'Din statistik' : 'Your Stats'}</h3>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="font-headline font-black text-3xl text-primary-fixed">{stats.total}</p>
              <p className="text-on-surface-variant text-[10px] uppercase tracking-widest font-bold mt-1">
                {sv ? 'Analyser' : 'Analyses'}
              </p>
            </div>
            <div className="text-center">
              <p className="font-headline font-black text-3xl text-on-surface">{stats.avgScore || '—'}</p>
              <p className="text-on-surface-variant text-[10px] uppercase tracking-widest font-bold mt-1">
                {sv ? 'Snitt' : 'Avg Score'}
              </p>
            </div>
            <div className="text-center">
              <p className="font-headline font-black text-3xl text-primary-fixed drop-shadow-[0_0_10px_rgba(157,255,0,0.3)]">{stats.bestScore || '—'}</p>
              <p className="text-on-surface-variant text-[10px] uppercase tracking-widest font-bold mt-1">
                {sv ? 'Bäst' : 'Best'}
              </p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-outline-variant/10 flex justify-between">
            <span className="text-on-surface-variant text-xs">
              {sv ? 'Sedan' : 'Since'} {stats.oldest.toLocaleDateString(sv ? 'sv-SE' : 'en-US', { month: 'short', day: 'numeric' })}
            </span>
            <span className="text-on-surface-variant text-xs">
              {sv ? 'Max 50 sessioner' : 'Max 50 sessions'}
            </span>
          </div>
        </section>
      )}

      {/* Account */}
      {user && (
        <section className="bg-surface-container rounded-lg p-6 border border-outline-variant/10 space-y-4">
          <div className="flex items-center gap-4">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="w-12 h-12 rounded-full border-2 border-primary-fixed/30" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-primary-fixed/15 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary-fixed text-xl">person</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-headline font-bold text-on-surface truncate">{user.displayName || 'Golfer'}</p>
              <p className="text-on-surface-variant text-xs truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full border border-outline-variant/20 text-on-surface-variant font-bold py-3 px-6 rounded-full hover:bg-surface-container-high transition-colors active:scale-95 text-sm flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">logout</span>
            {language === 'sv' ? 'Logga ut' : 'Sign out'}
          </button>
        </section>
      )}

      {/* AI Engines */}
      <section className="bg-surface-container rounded-lg p-6 border border-outline-variant/10 space-y-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary-fixed">smart_toy</span>
          <h3 className="font-headline font-bold">{sv ? 'AI-motorer' : 'AI Engines'}</h3>
          {engines?.dualEngine && (
            <span className="ml-auto px-2 py-0.5 bg-primary-fixed/15 text-primary-fixed text-[10px] font-bold uppercase tracking-widest rounded-full border border-primary-fixed/20">
              Dual Engine ⚡
            </span>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <span className="text-sm">🎬</span>
              <span className="text-sm text-on-surface">Gemini 2.5 Pro</span>
              <span className="text-[10px] text-on-surface-variant uppercase tracking-widest">{sv ? 'Rörelseanalys' : 'Motion'}</span>
            </div>
            <span className={`text-xs font-bold ${engines?.gemini ? 'text-primary-fixed' : 'text-on-surface-variant/40'}`}>
              {engines?.gemini ? '✅' : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <span className="text-sm">📐</span>
              <span className="text-sm text-on-surface">Claude Sonnet</span>
              <span className="text-[10px] text-on-surface-variant uppercase tracking-widest">{sv ? 'Positionsanalys' : 'Position'}</span>
            </div>
            <span className={`text-xs font-bold ${engines?.claude ? 'text-primary-fixed' : 'text-on-surface-variant/40'}`}>
              {engines?.claude ? '✅' : '—'}
            </span>
          </div>
        </div>
        <p className="text-on-surface-variant text-[10px]">
          {sv ? 'AI-nycklar hanteras av servern — ingen konfiguration behövs' : 'API keys are managed server-side — no configuration needed'}
        </p>
      </section>

      {/* Language */}
      <section className="bg-surface-container rounded-lg p-6 border border-outline-variant/10 space-y-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary-fixed">translate</span>
          <h3 className="font-headline font-bold">{t('language')}</h3>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setLanguage('sv')}
            className={`flex-1 py-3 px-4 rounded-full font-label text-sm font-bold uppercase tracking-widest transition-all ${
              language === 'sv'
                ? 'bg-primary-fixed text-on-primary-fixed'
                : 'bg-surface-container-high text-on-surface border border-outline-variant/15'
            }`}
          >
            🇸🇪 Svenska
          </button>
          <button
            onClick={() => setLanguage('en')}
            className={`flex-1 py-3 px-4 rounded-full font-label text-sm font-bold uppercase tracking-widest transition-all ${
              language === 'en'
                ? 'bg-primary-fixed text-on-primary-fixed'
                : 'bg-surface-container-high text-on-surface border border-outline-variant/15'
            }`}
          >
            🇬🇧 English
          </button>
        </div>
      </section>

      {/* Clear History */}
      <section className="bg-surface-container rounded-lg p-6 border border-outline-variant/10 space-y-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-error">delete</span>
          <h3 className="font-headline font-bold">{t('clearHistory')}</h3>
        </div>
        {showClearConfirm ? (
          <div className="space-y-4">
             <div className="p-4 bg-error/10 border border-error/20 rounded-lg text-sm text-error">
                <p className="font-bold mb-1">⚠️ {sv ? 'Är du helt säker?' : 'Are you completely sure?'}</p>
                <p className="opacity-90">{sv ? 'Detta kommer att permanent radera alla dina sparade videos, analyser och din prestations-statistik. Det går inte att ångra.' : 'This will permanently delete all your saved videos, analyses, and performance stats. This cannot be undone.'}</p>
             </div>
             <div className="flex gap-3">
               <button
                 onClick={handleClearHistory}
                 className="flex-1 bg-error text-on-error font-bold py-3 px-6 rounded-full active:scale-95 transition-all text-sm"
               >
                 {t('clearHistoryConfirm')}
               </button>
               <button
                 onClick={() => setShowClearConfirm(false)}
                 className="flex-1 bg-surface-container-high border border-outline-variant/30 text-on-surface font-bold py-3 px-6 rounded-full hover:bg-surface-bright text-sm"
               >
                 {sv ? 'Avbryt' : 'Cancel'}
               </button>
             </div>
          </div>
        ) : cleared ? (
          <div className="py-3 text-center text-primary-fixed font-bold text-sm">✓ {sv ? 'Alla analyser raderade' : 'All analyses deleted'}</div>
        ) : (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="border border-error/30 text-error font-bold py-3 px-6 rounded-full hover:bg-error/10 transition-colors active:scale-95 text-sm"
          >
            {t('clearHistory')}
          </button>
        )}
      </section>

      {/* Version */}
      <div className="text-center text-on-surface-variant/40 text-xs font-label tracking-widest uppercase">
        {t('appVersion')} 1.0.0 — MVP
      </div>
    </div>
  );
}
