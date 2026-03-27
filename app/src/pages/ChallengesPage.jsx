import { useState, useEffect } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import {
  getChallengesWithResults,
  saveChallengeResult,
  DIFFICULTY,
  buildChallengePrompt,
} from '../utils/challenges';
import { REFERENCE_PLAYERS } from '../utils/referencePlayers';
import { getSetting } from '../utils/storage';
import { generateChallengeCard, shareImage } from '../utils/shareCard';

/**
 * ChallengesPage — Solo swing similarity challenges
 * "Can you swing like Tiger Woods? Score 80+!"
 */

const BADGE_STYLES = {
  gold: {
    bg: 'bg-amber-400/20',
    border: 'border-amber-400/40',
    text: 'text-amber-400',
    glow: 'shadow-[0_0_15px_rgba(251,191,36,0.3)]',
    icon: 'emoji_events',
  },
  silver: {
    bg: 'bg-slate-300/20',
    border: 'border-slate-300/40',
    text: 'text-slate-300',
    glow: 'shadow-[0_0_10px_rgba(203,213,225,0.2)]',
    icon: 'workspace_premium',
  },
  bronze: {
    bg: 'bg-orange-600/20',
    border: 'border-orange-600/40',
    text: 'text-orange-500',
    glow: '',
    icon: 'military_tech',
  },
};

export default function ChallengesPage({ onBack, onNavigate }) {
  const { language } = useLanguage();
  const sv = language === 'sv';
  const [challenges, setChallenges] = useState([]);
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    setChallenges(getChallengesWithResults());
  }, []);

  const totalBadges = challenges.filter((c) => c.result?.badge).length;
  const totalGold = challenges.filter((c) => c.result?.badge === 'gold').length;

  // Handle selecting a challenge
  function handleSelect(challenge) {
    setSelected(challenge);
    setResult(null);
    setError('');
  }

  // Handle file upload for challenge
  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !selected) return;

    const apiKey = getSetting('anthropic_key');
    if (!apiKey) {
      setError(sv ? 'API-nyckel saknas. G\u00e5 till Profil → Inst\u00e4llningar.' : 'API key missing. Go to Profile → Settings.');
      return;
    }

    setAnalyzing(true);
    setError('');
    setProgress(sv ? 'Extraherar frames...' : 'Extracting frames...');

    try {
      // Extract frames from video
      const { extractKeyFrames } = await import('../utils/videoFrames.js');
      const frames = await extractKeyFrames(file, 8);

      setProgress(sv ? 'Analyserar likhet...' : 'Analyzing similarity...');

      // Build frame data for Claude
      const frameData = frames.map((frame, i) => {
        const phases = ['Setup', 'Takeaway', 'Backswing', 'Top', 'Downswing', 'Impact', 'Follow-through', 'Finish'];
        return {
          phase: phases[i] || `Frame ${i + 1}`,
          base64: frame.base64,
          measurements: null,
        };
      });

      // Call Claude with challenge-specific prompt
      const challengePrompt = buildChallengePrompt(selected.playerId, language);

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          system: challengePrompt,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: `Analyze these ${frameData.length} sequential frames from a golf swing and score the similarity to ${REFERENCE_PLAYERS[selected.playerId].name}.` },
              ...frameData.map((f) => ({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: f.base64.replace(/^data:image\/\w+;base64,/, ''),
                },
              })),
            ],
          }],
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.content?.[0]?.text || '';

      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Invalid response format');

      const challengeResult = JSON.parse(jsonMatch[0]);

      // Save result
      const saved = saveChallengeResult(selected.id, challengeResult.similarityScore);

      setResult({
        ...challengeResult,
        savedResult: saved,
      });

      // Refresh challenges list
      setChallenges(getChallengesWithResults());
      setProgress('');

    } catch (err) {
      console.error('Challenge analysis failed:', err);
      setError(err.message || 'Analysis failed');
      setProgress('');
    } finally {
      setAnalyzing(false);
    }
  }

  // ==========================================
  // RENDER — Challenge List
  // ==========================================
  if (!selected) {
    return (
      <div className="px-6 pt-8 pb-8 max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-on-surface-variant hover:text-primary-fixed transition-colors mb-4 group"
          >
            <span className="material-symbols-outlined text-lg group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
            <span className="text-xs uppercase tracking-widest font-bold">{sv ? 'Tillbaka' : 'Back'}</span>
          </button>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-headline text-3xl font-extrabold tracking-tight flex items-center gap-3">
                <span className="material-symbols-outlined text-primary-fixed text-3xl">emoji_events</span>
                {sv ? 'Utmaningar' : 'Challenges'}
              </h1>
              <p className="text-on-surface-variant text-sm mt-1">
                {sv ? 'Kan du svinga som proffsen? Visa vad du g\u00e5r f\u00f6r.' : 'Can you swing like the pros? Show what you\'ve got.'}
              </p>
            </div>
          </div>
        </div>

        {/* Badge Counter */}
        <div className="flex items-center gap-4 bg-surface-container-low p-4 rounded-lg border border-outline-variant/10">
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-amber-400 text-xl">emoji_events</span>
            <span className="text-on-surface font-headline font-bold text-lg">{totalBadges}</span>
            <span className="text-on-surface-variant text-xs">/{challenges.length}</span>
          </div>
          <div className="h-6 w-px bg-outline-variant/20" />
          {totalGold > 0 && (
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-amber-400 text-sm">star</span>
              <span className="text-amber-400 font-bold text-sm">{totalGold} {sv ? 'guld' : 'gold'}</span>
            </div>
          )}
          <div className="flex-1" />
          <span className="text-on-surface-variant text-xs">
            {sv ? `${totalBadges} av ${challenges.length} avklarade` : `${totalBadges} of ${challenges.length} completed`}
          </span>
        </div>

        {/* Challenge Cards */}
        <div className="space-y-4">
          {challenges.map((challenge) => {
            const diff = DIFFICULTY[challenge.difficulty];
            const badge = challenge.result?.badge;
            const badgeStyle = badge ? BADGE_STYLES[badge] : null;

            return (
              <button
                key={challenge.id}
                onClick={() => handleSelect(challenge)}
                className="w-full text-left bg-surface-container p-5 rounded-lg kinetic-gradient-border hover:bg-surface-container-high transition-all group active:scale-[0.99]"
              >
                <div className="flex items-start gap-4">
                  {/* Player avatar */}
                  <div className="relative shrink-0">
                    <div className="w-14 h-14 rounded-full bg-primary-fixed/10 flex items-center justify-center border border-primary-fixed/20">
                      <span className="material-symbols-outlined text-primary-fixed text-2xl">sports_golf</span>
                    </div>
                    {badgeStyle && (
                      <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full ${badgeStyle.bg} ${badgeStyle.border} border flex items-center justify-center ${badgeStyle.glow}`}>
                        <span className={`material-symbols-outlined ${badgeStyle.text} text-xs`}>{badgeStyle.icon}</span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-headline font-bold text-on-surface text-sm uppercase tracking-wider truncate">
                        {challenge.title[language]}
                      </h3>
                      <span
                        className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border shrink-0"
                        style={{
                          color: diff.color,
                          borderColor: diff.color + '40',
                          background: diff.color + '15',
                        }}
                      >
                        {diff.label[language]}
                      </span>
                    </div>
                    <p className="text-on-surface-variant text-xs leading-relaxed line-clamp-2">
                      {challenge.description[language]}
                    </p>

                    {/* Best score */}
                    {challenge.result && (
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-on-surface-variant text-[10px] uppercase tracking-widest">
                          {sv ? 'B\u00e4st' : 'Best'}: <span className="text-primary-fixed font-bold">{challenge.result.bestScore}%</span>
                        </span>
                        <span className="text-on-surface-variant text-[10px]">
                          {challenge.result.attempts} {sv ? 'f\u00f6rs\u00f6k' : 'attempts'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Arrow */}
                  <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary-fixed transition-colors mt-1 shrink-0">
                    chevron_right
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER — Challenge Detail / Results
  // ==========================================
  const player = REFERENCE_PLAYERS[selected.playerId];
  const diff = DIFFICULTY[selected.difficulty];

  return (
    <div className="px-6 pt-8 pb-8 max-w-7xl mx-auto space-y-6">
      {/* Back */}
      <button
        onClick={() => { setSelected(null); setResult(null); setError(''); }}
        className="flex items-center gap-2 text-on-surface-variant hover:text-primary-fixed transition-colors group"
      >
        <span className="material-symbols-outlined text-lg group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
        <span className="text-xs uppercase tracking-widest font-bold">{sv ? 'Alla utmaningar' : 'All Challenges'}</span>
      </button>

      {/* Challenge Header */}
      <div className="bg-surface-container p-6 rounded-lg kinetic-gradient-border relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-10"
          style={{ background: 'radial-gradient(circle at 80% 20%, #9DFF00 0%, transparent 50%)' }}
        />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-primary-fixed">emoji_events</span>
            <span
              className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border"
              style={{
                color: diff.color,
                borderColor: diff.color + '40',
                background: diff.color + '15',
              }}
            >
              {diff.label[language]}
            </span>
          </div>
          <h2 className="font-headline text-2xl font-extrabold tracking-tight mb-2">
            {selected.title[language]}
          </h2>
          <p className="text-on-surface-variant text-sm leading-relaxed">
            {selected.description[language]}
          </p>
        </div>
      </div>

      {/* Player Traits */}
      <div className="bg-surface-container p-5 rounded-lg">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-primary-fixed text-lg">sports_golf</span>
          <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest font-headline">
            {player.name} — {player.style[language]}
          </span>
        </div>
        <div className="space-y-1.5">
          {(player.traits[language] || player.traits.en).slice(0, 4).map((trait, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-primary-fixed text-xs mt-0.5">•</span>
              <span className="text-on-surface-variant text-xs leading-relaxed">{trait}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Badge thresholds */}
      <div className="grid grid-cols-3 gap-2">
        {selected.badgeThresholds.map((t) => {
          const style = BADGE_STYLES[t.badge];
          const earned = selected.result?.bestScore >= t.min;
          return (
            <div
              key={t.badge}
              className={`p-3 rounded-lg border text-center ${
                earned
                  ? `${style.bg} ${style.border} ${style.glow}`
                  : 'border-outline-variant/10 bg-surface-container-low opacity-50'
              }`}
            >
              <span className={`material-symbols-outlined text-xl ${earned ? style.text : 'text-on-surface-variant'}`}>
                {style.icon}
              </span>
              <div className={`text-[9px] font-bold uppercase tracking-widest mt-1 ${earned ? style.text : 'text-on-surface-variant'}`}>
                {t.min}%+
              </div>
              <div className={`text-[9px] mt-0.5 ${earned ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                {t.label[language]}
              </div>
            </div>
          );
        })}
      </div>

      {/* Previous best */}
      {selected.result && !result && (
        <div className="bg-surface-container-low p-4 rounded-lg border border-primary-fixed/10 flex items-center gap-3">
          <span className="material-symbols-outlined text-primary-fixed">history</span>
          <div>
            <span className="text-on-surface text-sm font-bold">{sv ? 'Ditt b\u00e4sta' : 'Your best'}: {selected.result.bestScore}%</span>
            <span className="text-on-surface-variant text-xs ml-2">
              ({selected.result.attempts} {sv ? 'f\u00f6rs\u00f6k' : 'attempts'})
            </span>
          </div>
        </div>
      )}

      {/* Upload / Analyze */}
      {!result && !analyzing && (
        <label className="block cursor-pointer">
          <div className="w-full kinetic-gradient text-on-primary-fixed h-16 rounded-full flex items-center justify-center gap-3 font-headline font-bold uppercase tracking-widest text-sm active:scale-[0.98] transition-all shadow-[0_4px_20px_rgba(157,255,0,0.2)]">
            <span className="material-symbols-outlined">upload</span>
            {sv ? 'Ladda upp video' : 'Upload Video'}
          </div>
          <input
            type="file"
            accept="video/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
      )}

      {/* Analyzing state */}
      {analyzing && (
        <div className="flex flex-col items-center py-10 gap-4">
          <div className="relative w-20 h-20">
            <svg className="w-full h-full animate-spin" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(157,255,0,0.15)" strokeWidth="4" />
              <circle
                cx="50" cy="50" r="44" fill="none"
                stroke="#9DFF00" strokeWidth="4" strokeLinecap="round"
                strokeDasharray="80 196"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary-fixed text-2xl">psychology</span>
            </div>
          </div>
          <p className="text-on-surface-variant text-sm font-medium">{progress}</p>
          <p className="text-on-surface-variant text-xs">
            {sv ? `J\u00e4mf\u00f6r med ${player.name}...` : `Comparing to ${player.name}...`}
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-red-400 text-lg">error</span>
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* RESULTS */}
      {result && (
        <div className="space-y-5 animate-[fadeIn_0.5s_ease-out]">
          {/* Score Header */}
          <div className="bg-surface-container p-6 rounded-lg kinetic-gradient-border text-center relative overflow-hidden">
            <div
              className="absolute inset-0 opacity-15"
              style={{ background: 'radial-gradient(circle at 50% 30%, #9DFF00 0%, transparent 50%)' }}
            />
            <div className="relative z-10">
              {/* Big score */}
              <div className="relative w-32 h-32 mx-auto mb-4">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(157,255,0,0.1)" strokeWidth="5" />
                  <circle
                    cx="50" cy="50" r="44" fill="none"
                    stroke="#9DFF00" strokeWidth="5" strokeLinecap="round"
                    strokeDasharray={`${result.similarityScore * 2.76} ${276 - result.similarityScore * 2.76}`}
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-primary-fixed font-headline text-4xl font-black drop-shadow-[0_0_15px_rgba(157,255,0,0.4)]">
                    {result.similarityScore}
                  </span>
                  <span className="text-on-surface-variant text-[9px] uppercase tracking-widest font-bold">
                    {sv ? 'Likhet' : 'Similarity'}
                  </span>
                </div>
              </div>

              {/* Badge earned */}
              {result.savedResult?.badge && (() => {
                const bs = BADGE_STYLES[result.savedResult.badge];
                const threshold = selected.badgeThresholds.find((t) => t.badge === result.savedResult.badge);
                return (
                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${bs.bg} ${bs.border} border ${bs.glow}`}>
                    <span className={`material-symbols-outlined ${bs.text}`}>{bs.icon}</span>
                    <span className={`${bs.text} font-headline font-bold text-sm uppercase tracking-wider`}>
                      {threshold?.label[language]}
                    </span>
                  </div>
                );
              })()}

              {/* New best? */}
              {result.savedResult && result.similarityScore >= result.savedResult.bestScore && result.savedResult.attempts > 1 && (
                <div className="mt-2 text-primary-fixed text-xs font-bold uppercase tracking-widest animate-pulse">
                  🎉 {sv ? 'Nytt personligt rekord!' : 'New personal record!'}
                </div>
              )}
            </div>
          </div>

          {/* Aspect breakdown */}
          <div className="bg-surface-container p-5 rounded-lg">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-primary-fixed text-lg">analytics</span>
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest font-headline">
                {sv ? 'Detaljerad bed\u00f6mning' : 'Detailed Assessment'}
              </span>
            </div>
            <div className="space-y-3">
              {(result.aspects || []).map((aspect, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface text-xs font-bold">{aspect.name}</span>
                    <span className={`text-sm font-headline font-bold ${
                      aspect.score >= 80 ? 'text-primary-fixed' :
                      aspect.score >= 60 ? 'text-amber-400' : 'text-red-400'
                    }`}>{aspect.score}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${aspect.score}%`,
                        background: aspect.score >= 80 ? '#9DFF00' : aspect.score >= 60 ? '#FACC15' : '#F87171',
                      }}
                    />
                  </div>
                  <p className="text-on-surface-variant text-[11px] leading-snug">{aspect.feedback}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-surface-container-low p-5 rounded-lg border border-primary-fixed/10 relative overflow-hidden">
            <div className="absolute inset-0 opacity-10" style={{ background: 'radial-gradient(circle at 70% 20%, #9DFF00 0%, transparent 60%)' }} />
            <div className="relative z-10 space-y-3">
              <p className="text-on-surface text-sm leading-relaxed">{result.summary}</p>
              {result.bestMatch && (
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-primary-fixed text-sm mt-0.5">thumb_up</span>
                  <div>
                    <span className="text-[9px] font-bold text-primary-fixed uppercase tracking-widest block">
                      {sv ? 'B\u00e4sta matchning' : 'Best Match'}
                    </span>
                    <span className="text-on-surface-variant text-xs">{result.bestMatch}</span>
                  </div>
                </div>
              )}
              {result.biggestGap && (
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-amber-400 text-sm mt-0.5">priority_high</span>
                  <div>
                    <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest block">
                      {sv ? 'St\u00f6rsta skillnaden' : 'Biggest Gap'}
                    </span>
                    <span className="text-on-surface-variant text-xs">{result.biggestGap}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Share Challenge Card */}
          <button
            onClick={async () => {
              setSharing(true);
              try {
                const title = selected.title[language];
                const cardDataUrl = await generateChallengeCard(
                  title,
                  REFERENCE_PLAYERS[selected.playerId].name,
                  result.similarityScore,
                  result.savedResult?.badge,
                  language
                );
                await shareImage(cardDataUrl, 'swing_ai_challenge.png', `SWING_AI Challenge: ${title} — ${result.similarityScore}%`);
              } catch (e) { console.error('Share failed:', e); }
              setSharing(false);
            }}
            disabled={sharing}
            className="w-full border border-primary-fixed/30 text-primary-fixed h-14 rounded-full flex items-center justify-center gap-3 font-headline font-bold uppercase tracking-widest text-xs active:scale-[0.98] transition-all hover:bg-primary-fixed/5 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-lg">{sharing ? 'hourglass_empty' : 'share'}</span>
            {sharing
              ? (sv ? 'Genererar...' : 'Generating...')
              : (sv ? 'Dela Challenge Card' : 'Share Challenge Card')}
          </button>

          {/* Try again */}
          <label className="block cursor-pointer">
            <div className="w-full kinetic-gradient text-on-primary-fixed h-14 rounded-full flex items-center justify-center gap-3 font-headline font-bold uppercase tracking-widest text-xs active:scale-[0.98] transition-all shadow-[0_4px_20px_rgba(157,255,0,0.2)]">
              <span className="material-symbols-outlined text-sm">replay</span>
              {sv ? 'Försök igen' : 'Try Again'}
            </div>
            <input
              type="file"
              accept="video/*"
              onChange={(e) => { setResult(null); handleFileUpload(e); }}
              className="hidden"
            />
          </label>
        </div>
      )}

      {/* Fade in animation */}
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
