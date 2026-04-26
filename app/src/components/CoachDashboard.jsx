import { useState, useEffect, useMemo } from 'react';
import { DRILL_LIBRARY } from '../utils/golfKnowledge';
import { getCoachingHistory, completeDrill, reactivateDrill, getDrillLog } from '../utils/coachingHistory';
import { COACHING_APPROACHES, REFERENCE_PLAYERS, COACH_PERSONALITIES } from '../utils/referencePlayers';
import { getActivePlan, toggleDrillDone, advanceWeek, goToWeek } from '../utils/trainingPlan';
import {
  getSwingThought, setSwingThought as saveSwingThought, clearSwingThought,
  getJournalEntries, addJournalEntry, updateJournalEntry, deleteJournalEntry, togglePinEntry,
} from '../utils/swingJournal';
import { setSetting } from '../utils/storage';

/**
 * CoachDashboard — living coaching summary
 * Shows progress, drills, focus areas, and coaching history
 * Rendered inside CoachModePage when a profile is completed
 */

const APPROACH_ICONS = {
  minimal_fix: 'target',
  rebuild: 'construction',
  consistency: 'bar_chart',
  distance: 'fitness_center',
  shot_fix: 'medication',
};

export default function CoachDashboard({ profile, language, onReset, onNavigate, onProfileUpdate }) {
  const [history, setHistory] = useState(null);
  const [drills, setDrills] = useState([]);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showOptional, setShowOptional] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const sv = language === 'sv';

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const h = await getCoachingHistory();
      setHistory(h);
      setDrills(getDrillLog());
      setPlan(getActivePlan());
    } catch (e) {
      console.error('Coach history load failed:', e);
    }
    setLoading(false);
  }

  // Journal reload helper
  const [journalKey, setJournalKey] = useState(0);
  const reloadJournal = () => setJournalKey(k => k + 1);

  function handleToggleDrill(drillId, currentStatus) {
    if (currentStatus === 'active') {
      completeDrill(drillId);
    } else {
      reactivateDrill(drillId);
    }
    setDrills(getDrillLog());
  }

  // Derive data
  const approach = profile.approach ? COACHING_APPROACHES[profile.approach] : null;
  const player = profile.referencePlayer ? REFERENCE_PLAYERS[profile.referencePlayer] : null;
  const approachIcon = profile.approach ? (APPROACH_ICONS[profile.approach] || 'psychology') : 'psychology';

  const activeDrills = drills.filter((d) => d.status === 'active');
  const completedDrills = drills.filter((d) => d.status === 'completed');
  const hasSessions = history && history.totalSessions > 0;

  // Sparkline data (last 10 scores)
  const sparklineData = useMemo(() => {
    if (!history?.scores?.length) return [];
    return history.scores.slice(-10);
  }, [history]);

  // Latest score
  const latestScore = history?.latest?.score || null;
  const trendIcon = history?.trend === 'improving' ? 'trending_up'
    : history?.trend === 'declining' ? 'trending_down' : 'trending_flat';
  const trendColor = history?.trend === 'improving' ? 'text-primary-fixed'
    : history?.trend === 'declining' ? 'text-red-400' : 'text-on-surface-variant';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="material-symbols-outlined text-primary-fixed animate-spin text-3xl">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header: Profile summary + trend */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-headline text-2xl font-extrabold tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-fixed">verified</span>
            {sv ? 'Coach Dashboard' : 'Coach Dashboard'}
          </h2>
          <p className="text-on-surface-variant text-sm mt-1">
            {sv ? 'Din coaching-resa \u2014 alltid uppdaterad.' : 'Your coaching journey \u2014 always up to date.'}
          </p>
        </div>
        <button
          onClick={onReset}
          className="text-on-surface-variant hover:text-on-surface text-xs uppercase tracking-widest font-bold transition-colors flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-sm">edit</span>
          {sv ? '\u00c4ndra' : 'Edit'}
        </button>
      </div>

      {/* Baseline Swing CTA — shown when no sessions */}
      {!hasSessions && onNavigate && (
        <button
          onClick={() => onNavigate('record')}
          className="w-full p-6 rounded-lg bg-primary-fixed/5 border-2 border-dashed border-primary-fixed/30 hover:border-primary-fixed/60 hover:bg-primary-fixed/10 transition-all active:scale-[0.98] group"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary-fixed/10 rounded-full group-hover:bg-primary-fixed/20 transition-colors">
              <span className="material-symbols-outlined text-primary-fixed text-3xl">videocam</span>
            </div>
            <div className="text-left flex-1">
              <p className="text-primary-fixed font-headline font-bold text-sm uppercase tracking-wider">
                {sv ? 'Filma din baseline-sving' : 'Film Your Baseline Swing'}
              </p>
              <p className="text-on-surface-variant text-xs mt-1">
                {sv
                  ? 'Coachen behöver se din nuvarande sving för att ge personlig feedback.'
                  : 'Your coach needs to see your current swing to give personalized feedback.'}
              </p>
            </div>
            <span className="material-symbols-outlined text-primary-fixed group-hover:translate-x-1 transition-transform">arrow_forward</span>
          </div>
        </button>
      )}

      {/* Row 1: Score ring + Profile chips */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Score Ring */}
        <div className="md:col-span-2 p-6 rounded-lg bg-surface-container relative overflow-hidden flex flex-col items-center justify-center kinetic-gradient-border">
          <div
            className="absolute inset-0 opacity-15"
            style={{ background: `radial-gradient(circle at 50% 30%, #9DFF00 0%, transparent ${hasSessions ? '50' : '30'}%)` }}
          />
          <div className="relative w-36 h-36">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(157,255,0,0.1)" strokeWidth="5" />
              <circle
                cx="50" cy="50" r="44" fill="none"
                stroke="#9DFF00" strokeWidth="5" strokeLinecap="round"
                strokeDasharray={`${(latestScore || 0) * 2.76} ${276 - (latestScore || 0) * 2.76}`}
                className="transition-all duration-1000"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-primary-fixed font-headline text-4xl font-black drop-shadow-[0_0_15px_rgba(157,255,0,0.4)]">
                {latestScore || '\u2014'}
              </span>
              <span className="text-on-surface-variant text-[9px] uppercase tracking-widest font-bold mt-0.5">
                {sv ? 'Senaste' : 'Latest'}
              </span>
            </div>
          </div>
          {hasSessions && (
            <div className={`flex items-center gap-1 mt-3 ${trendColor}`}>
              <span className="material-symbols-outlined text-sm">{trendIcon}</span>
              <span className="text-xs font-bold uppercase tracking-wider">
                {history.trend === 'improving' ? (sv ? 'F\u00f6rb\u00e4ttras' : 'Improving') :
                 history.trend === 'declining' ? (sv ? 'F\u00f6rs\u00e4mras' : 'Declining') :
                 (sv ? 'Stabil' : 'Stable')}
              </span>
              <span className="text-on-surface-variant text-[10px] ml-1">
                ({history.totalSessions} {sv ? 'sessioner' : 'sessions'})
              </span>
            </div>
          )}
          {!hasSessions && (
            <p className="text-on-surface-variant text-xs mt-3 text-center">
              {sv ? 'Gör en analys för att se din score' : 'Run an analysis to see your score'}
            </p>
          )}
        </div>

        {/* Profile cards */}
        <div className="md:col-span-3 space-y-3">
          {/* Approach */}
          {approach && (
            <div className="bg-surface-container p-4 rounded-lg kinetic-gradient-border flex items-center gap-3">
              <div className="p-2 bg-primary-fixed/10 rounded-full shrink-0">
                <span className="material-symbols-outlined text-primary-fixed text-lg">{approachIcon}</span>
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest block">
                  {sv ? 'Approach' : 'Approach'}
                </span>
                <span className="text-on-surface font-headline font-bold uppercase text-sm truncate block">
                  {approach.name[language]}
                </span>
              </div>
            </div>
          )}
          {/* Reference player */}
          {player && (
            <div className="bg-surface-container p-4 rounded-lg kinetic-gradient-border flex items-center gap-3">
              <div className="p-2 bg-primary-fixed/10 rounded-full shrink-0">
                <span className="material-symbols-outlined text-primary-fixed text-lg">sports_golf</span>
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest block">
                  {sv ? 'Referensspelare' : 'Reference'}
                </span>
                <span className="text-on-surface font-headline font-bold text-sm truncate block">
                  {player.name}
                </span>
              </div>
            </div>
          )}
          {/* Goal */}
          {profile.specificGoal && (
            <div className="bg-surface-container p-4 rounded-lg kinetic-gradient-border flex items-start gap-3">
              <div className="p-2 bg-primary-fixed/10 rounded-full shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-primary-fixed text-lg">flag</span>
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest block">
                  {sv ? 'M\u00e5l' : 'Goal'}
                </span>
                <p className="text-on-surface text-sm leading-relaxed line-clamp-2">
                  {profile.specificGoal}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sparkline — Score Trend */}
      {sparklineData.length >= 2 && (
        <div className="bg-surface-container p-5 rounded-lg kinetic-gradient-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-fixed text-lg">show_chart</span>
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest font-headline">
                {sv ? 'Score-utveckling' : 'Score Trend'}
              </span>
            </div>
            <span className="text-on-surface-variant text-[10px]">
              {sv ? `Senaste ${sparklineData.length} sessioner` : `Last ${sparklineData.length} sessions`}
            </span>
          </div>
          <Sparkline data={sparklineData} language={language} />
        </div>
      )}

      {/* Focus Areas — from latest analysis */}
      {history?.latest && (
        <div className="bg-surface-container p-5 rounded-lg kinetic-gradient-border">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary-fixed text-lg">center_focus_strong</span>
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest font-headline">
              {sv ? 'Fokusomr\u00e5den' : 'Focus Areas'}
            </span>
          </div>
          {/* Priority focus banner */}
          {history.latest.priorityFocus && (
            <div className="bg-primary-fixed/5 border border-primary-fixed/15 rounded-lg p-4 mb-4 flex items-start gap-3">
              <span className="material-symbols-outlined text-primary-fixed text-lg mt-0.5">priority_high</span>
              <div>
                <span className="text-[9px] font-bold text-primary-fixed uppercase tracking-widest block mb-1">
                  {sv ? 'Prioritet #1' : 'Priority #1'}
                </span>
                <p className="text-on-surface text-sm font-medium">{history.latest.priorityFocus}</p>
              </div>
            </div>
          )}
          {/* Category scores */}
          <div className="grid grid-cols-2 gap-2">
            {history.latest.categories.map((cat) => (
              <div
                key={cat.name}
                className={`p-3 rounded-lg border ${
                  cat.status === 'improve'
                    ? 'border-amber-500/20 bg-amber-500/5'
                    : 'border-primary-fixed/10 bg-primary-fixed/5'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-on-surface text-xs font-bold truncate">{cat.name}</span>
                  <span className={`text-sm font-headline font-bold ${
                    cat.score >= 80 ? 'text-primary-fixed' :
                    cat.score >= 60 ? 'text-amber-400' : 'text-red-400'
                  }`}>{cat.score}</span>
                </div>
                {cat.tips && cat.tips.length > 0 && (
                  <p className="text-on-surface-variant text-[11px] leading-snug line-clamp-2">
                    {cat.tips[0]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Training Plan */}
      {plan && plan.weeks && (
        <TrainingPlanCard
          plan={plan}
          sv={sv}
          language={language}
          onToggleDrill={(weekIdx, drillIdx) => {
            const updated = toggleDrillDone(weekIdx, drillIdx);
            if (updated) setPlan({ ...updated });
          }}
          onAdvanceWeek={() => {
            const updated = advanceWeek();
            if (updated) setPlan({ ...updated });
          }}
          onGoToWeek={(idx) => {
            const updated = goToWeek(idx);
            if (updated) setPlan({ ...updated });
          }}
        />
      )}

      {/* Swing Journal — Player's own notes */}
      <SwingJournalCard
        sv={sv}
        language={language}
        key={`journal-${journalKey}`}
        onUpdate={reloadJournal}
      />

      {/* Drill Log */}
      {(activeDrills.length > 0 || completedDrills.length > 0) && (
        <div className="bg-surface-container p-5 rounded-lg kinetic-gradient-border">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary-fixed text-lg">fitness_center</span>
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest font-headline">
              {sv ? '\u00d6vningslogg' : 'Drill Log'}
            </span>
            <span className="text-on-surface-variant text-[10px] ml-auto">
              {activeDrills.length} {sv ? 'aktiva' : 'active'}
            </span>
          </div>

          <div className="space-y-2">
            {activeDrills.map((drill) => {
              const drillInfo = DRILL_LIBRARY[drill.drillId];
              const name = drillInfo?.name?.[language] || drill.drillId;
              return (
                <button
                  key={drill.drillId + drill.assignedAt}
                  onClick={() => handleToggleDrill(drill.drillId, 'active')}
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-surface-container-high hover:bg-surface-container-low transition-colors text-left group"
                >
                  <div className="w-5 h-5 rounded border-2 border-primary-fixed/40 flex items-center justify-center shrink-0 group-hover:border-primary-fixed transition-colors">
                    {/* Empty checkbox */}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-on-surface text-sm font-medium block truncate">{name}</span>
                    <span className="text-on-surface-variant text-[10px]">
                      {drill.reason ? drill.reason.slice(0, 60) + (drill.reason.length > 60 ? '...' : '') : ''}
                    </span>
                  </div>
                  <span className="text-primary-fixed text-[9px] uppercase tracking-widest font-bold shrink-0">
                    {sv ? 'Aktiv' : 'Active'}
                  </span>
                </button>
              );
            })}

            {completedDrills.length > 0 && (
              <>
                <div className="text-on-surface-variant text-[10px] uppercase tracking-widest font-bold pt-2">
                  {sv ? 'Avklarade' : 'Completed'}
                </div>
                {completedDrills.slice(0, 3).map((drill) => {
                  const drillInfo = DRILL_LIBRARY[drill.drillId];
                  const name = drillInfo?.name?.[language] || drill.drillId;
                  return (
                    <button
                      key={drill.drillId + drill.assignedAt}
                      onClick={() => handleToggleDrill(drill.drillId, 'completed')}
                      className="w-full flex items-center gap-3 p-3 rounded-lg bg-surface-container-high/50 hover:bg-surface-container-high transition-colors text-left group opacity-60"
                    >
                      <div className="w-5 h-5 rounded border-2 border-primary-fixed/20 bg-primary-fixed/10 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-primary-fixed text-xs">check</span>
                      </div>
                      <span className="text-on-surface-variant text-sm line-through truncate flex-1">{name}</span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}

      {/* Coach's Latest Words */}
      {history?.latest?.categories?.some((c) => c.tips?.length > 0) && (
        <div className="bg-surface-container-low p-5 rounded-lg relative overflow-hidden border border-primary-fixed/10">
          <div className="absolute inset-0 opacity-10" style={{ background: 'radial-gradient(circle at 70% 20%, #9DFF00 0%, transparent 60%)' }} />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-primary-fixed text-lg">record_voice_over</span>
              <span className="text-xs font-bold text-primary-fixed uppercase tracking-widest font-headline">
                {sv ? 'Coachens senaste tips' : 'Coach\'s Latest Tips'}
              </span>
            </div>
            <div className="space-y-2">
              {history.latest.categories
                .filter((c) => c.status === 'improve' && c.tips?.length > 0)
                .slice(0, 3)
                .map((cat, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-primary-fixed font-headline font-bold text-sm mt-0.5">{i + 1}.</span>
                    <div>
                      <span className="text-on-surface text-xs font-bold">{cat.name}:</span>
                      <span className="text-on-surface-variant text-xs ml-1">{cat.tips[0]}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Optional Settings — Reference Player + Personality */}
      <div className="bg-surface-container rounded-lg border border-outline-variant/10 overflow-hidden">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="w-full flex items-center justify-between p-4 hover:bg-surface-container-high transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-on-surface-variant text-lg">tune</span>
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
              {sv ? 'Valfria inställningar' : 'Optional Settings'}
            </span>
          </div>
          <span className={`material-symbols-outlined text-on-surface-variant text-sm transition-transform ${showSettings ? 'rotate-180' : ''}`}>
            expand_more
          </span>
        </button>

        {showSettings && (
          <div className="p-4 pt-0 space-y-4">
            {/* Reference Player */}
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                {sv ? 'Referensspelare (valfritt)' : 'Reference Player (optional)'}
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(REFERENCE_PLAYERS).map(([id, p]) => (
                  <button
                    key={id}
                    onClick={() => {
                      const updated = { referencePlayer: profile.referencePlayer === id ? null : id };
                      setSetting('coaching_profile', JSON.stringify({ ...profile, ...updated }));
                      if (onProfileUpdate) onProfileUpdate(updated);
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                      profile.referencePlayer === id
                        ? 'bg-primary-fixed/10 border-primary-fixed/30 text-primary-fixed'
                        : 'bg-surface-container-high border-outline-variant/15 text-on-surface-variant hover:border-primary-fixed/20'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Coach Personality */}
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                {sv ? 'Coach-personlighet (valfritt)' : 'Coach Personality (optional)'}
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(COACH_PERSONALITIES).map(([id, p]) => (
                  <button
                    key={id}
                    onClick={() => {
                      const updated = { personality: profile.personality === id ? null : id };
                      setSetting('coaching_profile', JSON.stringify({ ...profile, ...updated }));
                      if (onProfileUpdate) onProfileUpdate(updated);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                      profile.personality === id
                        ? 'bg-primary-fixed/10 border-primary-fixed/30 text-primary-fixed'
                        : 'bg-surface-container-high border-outline-variant/15 text-on-surface-variant hover:border-primary-fixed/20'
                    }`}
                  >
                    <span>{p.icon}</span>
                    {p.name[language]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Talk to Coach button */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('open-coach-chat'))}
        className="w-full kinetic-gradient text-on-primary-fixed h-14 rounded-full flex items-center justify-center gap-3 font-headline font-bold uppercase tracking-widest text-xs active:scale-[0.98] transition-all shadow-[0_4px_20px_rgba(157,255,0,0.2)]"
      >
        <span className="material-symbols-outlined text-lg">chat</span>
        {sv ? 'Prata med coachen' : 'Talk to Coach'}
      </button>
    </div>
  );
}

/**
 * Sparkline — minimal score trend chart
 */
function Sparkline({ data, language }) {
  if (!data || data.length < 2) return null;
  const sv = language === 'sv';

  const scores = data.map((d) => d.score);
  const min = Math.max(0, Math.min(...scores) - 5);
  const max = Math.min(100, Math.max(...scores) + 5);
  const range = max - min || 1;

  const W = 100;
  const H = 35;
  const points = scores.map((s, i) => ({
    x: (i / (scores.length - 1)) * W,
    y: H - ((s - min) / range) * H,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaD = pathD + ` L ${W} ${H} L 0 ${H} Z`;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" preserveAspectRatio="none">
        <defs>
          <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9DFF00" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#9DFF00" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#spark-fill)" />
        <path d={pathD} fill="none" stroke="#9DFF00" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Last point dot */}
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2.5" fill="#9DFF00" />
      </svg>
      {/* Labels */}
      <div className="flex justify-between mt-1">
        <span className="text-on-surface-variant text-[9px]">
          {new Date(data[0].timestamp).toLocaleDateString(sv ? 'sv-SE' : 'en-US', { month: 'short', day: 'numeric' })}
        </span>
        <span className="text-primary-fixed text-[9px] font-bold">
          {scores[scores.length - 1]}
        </span>
        <span className="text-on-surface-variant text-[9px]">
          {new Date(data[data.length - 1].timestamp).toLocaleDateString(sv ? 'sv-SE' : 'en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>
    </div>
  );
}

// ─── Training Plan Card ──────────────────────────────────────

function TrainingPlanCard({ plan, sv, language, onToggleDrill, onAdvanceWeek, onGoToWeek }) {
  const currentWeek = plan.weeks[plan.currentWeek];
  if (!currentWeek) return null;

  const completedCount = currentWeek.drills.filter(d => d.done).length;
  const totalCount = currentWeek.drills.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const weekComplete = completedCount === totalCount && totalCount > 0;

  const intensityLabel = {
    slow: sv ? 'Långsam' : 'Slow',
    medium: sv ? 'Medium' : 'Medium',
    full: sv ? 'Full fart' : 'Full speed',
    test: sv ? 'Test' : 'Test',
    warmup: sv ? 'Uppvärmning' : 'Warm-up',
  };

  const intensityColor = {
    slow: 'text-blue-400',
    medium: 'text-amber-400',
    full: 'text-primary-fixed',
    test: 'text-purple-400',
    warmup: 'text-cyan-400',
  };

  return (
    <div className="bg-surface-container p-5 rounded-lg kinetic-gradient-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary-fixed text-lg">calendar_month</span>
          <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest font-headline">
            {sv ? 'Träningsplan' : 'Training Plan'}
          </span>
        </div>
        <span className="text-primary-fixed text-[10px] font-bold uppercase tracking-wider">
          {sv ? `Vecka ${plan.currentWeek + 1}/4` : `Week ${plan.currentWeek + 1}/4`}
        </span>
      </div>

      {/* Week selector dots */}
      <div className="flex items-center gap-2 mb-4">
        {plan.weeks.map((w, i) => (
          <button
            key={i}
            onClick={() => onGoToWeek(i)}
            className={`flex-1 h-1.5 rounded-full transition-all ${
              i === plan.currentWeek
                ? 'bg-primary-fixed'
                : i < plan.currentWeek
                ? 'bg-primary-fixed/40'
                : 'bg-primary-fixed/10'
            }`}
          />
        ))}
      </div>

      {/* Current week theme */}
      <div className="mb-4">
        <h4 className="text-on-surface font-headline font-bold text-sm mb-1">
          {currentWeek.theme}
        </h4>
        <p className="text-on-surface-variant text-xs leading-relaxed">
          {currentWeek.description}
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between mb-1">
          <span className="text-on-surface-variant text-[10px] uppercase tracking-widest font-bold">
            {sv ? 'Framsteg' : 'Progress'}
          </span>
          <span className="text-primary-fixed text-[10px] font-bold">
            {completedCount}/{totalCount}
          </span>
        </div>
        <div className="h-1.5 bg-primary-fixed/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-fixed rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Drills */}
      <div className="space-y-2 mb-4">
        {currentWeek.drills.map((drill, i) => (
          <button
            key={drill.id + i}
            onClick={() => onToggleDrill(plan.currentWeek, i)}
            className={`w-full flex items-start gap-3 p-3 rounded-lg transition-colors text-left group ${
              drill.done
                ? 'bg-primary-fixed/5 border border-primary-fixed/15'
                : 'bg-surface-container-high hover:bg-surface-container-low border border-transparent'
            }`}
          >
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
              drill.done
                ? 'border-primary-fixed bg-primary-fixed'
                : 'border-primary-fixed/40 group-hover:border-primary-fixed'
            }`}>
              {drill.done && (
                <span className="material-symbols-outlined text-on-primary-fixed text-xs">check</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <span className={`text-sm font-medium block ${
                drill.done ? 'text-primary-fixed line-through opacity-60' : 'text-on-surface'
              }`}>
                {drill.name}
              </span>
              {drill.reps && (
                <span className="text-on-surface-variant text-[10px] block mt-0.5">{drill.reps}</span>
              )}
            </div>
            {drill.intensity && (
              <span className={`text-[9px] uppercase tracking-widest font-bold shrink-0 ${
                intensityColor[drill.intensity] || 'text-on-surface-variant'
              }`}>
                {intensityLabel[drill.intensity] || drill.intensity}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Milestone */}
      {currentWeek.milestone && (
        <div className="bg-primary-fixed/5 border border-primary-fixed/15 rounded-lg p-3 mb-4 flex items-start gap-2">
          <span className="material-symbols-outlined text-primary-fixed text-sm mt-0.5">flag</span>
          <div>
            <span className="text-[9px] font-bold text-primary-fixed uppercase tracking-widest block mb-0.5">
              {sv ? 'Milstolpe' : 'Milestone'}
            </span>
            <p className="text-on-surface text-xs">{currentWeek.milestone.text}</p>
          </div>
        </div>
      )}

      {/* Advance button */}
      {weekComplete && plan.currentWeek < plan.weeks.length - 1 && (
        <button
          onClick={onAdvanceWeek}
          className="w-full py-3 rounded-lg kinetic-gradient text-on-primary-fixed font-headline font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          <span className="material-symbols-outlined text-lg">arrow_forward</span>
          {sv ? `Gå till Vecka ${plan.currentWeek + 2}` : `Go to Week ${plan.currentWeek + 2}`}
        </button>
      )}

      {/* Plan info */}
      <div className="flex items-center justify-between mt-3">
        <span className="text-on-surface-variant text-[9px]">
          {sv ? `Primärt fokus: ${plan.primaryFocus}` : `Primary focus: ${plan.primaryFocus}`}
        </span>
        <span className="text-on-surface-variant text-[9px]">
          {sv ? `Baseline: ${plan.baselineScore}p` : `Baseline: ${plan.baselineScore}pts`}
        </span>
      </div>
    </div>
  );
}

// ─── Swing Journal Card ──────────────────────────────────────

function SwingJournalCard({ sv, language, onUpdate }) {
  const [thought, setThought] = useState(getSwingThought());
  const [entries, setEntries] = useState(getJournalEntries());
  const [thoughtInput, setThoughtInput] = useState(thought?.text || '');
  const [editingThought, setEditingThought] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState('note');
  const [showAll, setShowAll] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  const reload = () => {
    setThought(getSwingThought());
    setEntries(getJournalEntries());
    onUpdate?.();
  };

  const handleSaveThought = () => {
    if (thoughtInput.trim()) {
      saveSwingThought(thoughtInput.trim());
    } else {
      clearSwingThought();
    }
    setEditingThought(false);
    reload();
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    addJournalEntry(newNote, { type: noteType });
    setNewNote('');
    reload();
  };

  const handleDelete = (id) => {
    deleteJournalEntry(id);
    reload();
  };

  const handlePin = (id) => {
    togglePinEntry(id);
    reload();
  };

  const handleEditSave = (id) => {
    if (editText.trim()) {
      updateJournalEntry(id, editText);
    }
    setEditingId(null);
    setEditText('');
    reload();
  };

  const typeEmoji = { note: '📝', feel: '💭', insight: '💡' };
  const typeLabel = {
    note: sv ? 'Notering' : 'Note',
    feel: sv ? 'Känsla' : 'Feel',
    insight: sv ? 'Insikt' : 'Insight',
  };

  const visibleEntries = showAll ? entries : entries.slice(0, 3);

  return (
    <div className="bg-surface-container p-5 rounded-lg kinetic-gradient-border">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-primary-fixed text-lg">edit_note</span>
        <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest font-headline">
          {sv ? 'Swing Journal' : 'Swing Journal'}
        </span>
        <span className="text-on-surface-variant/40 text-[9px] ml-auto italic">
          {sv ? '"Feel vs Real"' : '"Feel vs Real"'}
        </span>
      </div>

      {/* Active Swing Thought — the mantra */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[9px] font-bold text-primary-fixed uppercase tracking-widest">
            🎯 {sv ? 'Aktiv svingtanke' : 'Active swing thought'}
          </span>
        </div>

        {editingThought ? (
          <div className="flex gap-2">
            <input
              value={thoughtInput}
              onChange={e => setThoughtInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveThought()}
              placeholder={sv ? 'T.ex. "Långsam takeaway, känn lagen"' : 'E.g. "Slow takeaway, feel the lag"'}
              className="flex-1 bg-surface-container-highest text-on-surface text-xs rounded-lg px-3 py-2.5 outline-none placeholder:text-on-surface-variant/40 border border-primary-fixed/20 focus:border-primary-fixed/50 transition-colors"
              autoFocus
            />
            <button
              onClick={handleSaveThought}
              className="px-3 py-2 rounded-lg bg-primary-fixed text-on-primary-fixed text-xs font-bold active:scale-95 transition-transform"
            >
              {sv ? 'Spara' : 'Save'}
            </button>
            <button
              onClick={() => { setEditingThought(false); setThoughtInput(thought?.text || ''); }}
              className="px-2 py-2 rounded-lg text-on-surface-variant hover:bg-surface-container-highest text-xs transition-colors"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditingThought(true)}
            className="w-full text-left p-3 rounded-lg border border-dashed border-primary-fixed/20 hover:border-primary-fixed/40 hover:bg-primary-fixed/5 transition-all group"
          >
            {thought ? (
              <div className="flex items-center justify-between">
                <span className="text-on-surface text-sm font-medium italic">"{thought.text}"</span>
                <span className="material-symbols-outlined text-on-surface-variant text-sm opacity-0 group-hover:opacity-100 transition-opacity">edit</span>
              </div>
            ) : (
              <span className="text-on-surface-variant/40 text-xs">
                {sv ? 'Tryck för att sätta din svingtanke...' : 'Tap to set your swing thought...'}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Add new note */}
      <div className="mb-4">
        <div className="flex gap-2 mb-2">
          {Object.entries(typeLabel).map(([type, label]) => (
            <button
              key={type}
              onClick={() => setNoteType(type)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors ${
                noteType === type
                  ? 'bg-primary-fixed text-on-primary-fixed'
                  : 'bg-primary-fixed/8 text-on-surface-variant hover:bg-primary-fixed/15'
              }`}
            >
              {typeEmoji[type]} {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddNote()}
            placeholder={
              noteType === 'feel'
                ? (sv ? 'Vad kände du? T.ex. "Känslan av att trycka ner vänster fot"' : 'What did you feel?')
                : noteType === 'insight'
                ? (sv ? 'Din insikt... T.ex. "Pumpövningen fixade min transition"' : 'Your insight...')
                : (sv ? 'Notera något... T.ex. "7-järnet drar åt vänster idag"' : 'Write a note...')
            }
            className="flex-1 bg-surface-container-highest text-on-surface text-xs rounded-lg px-3 py-2.5 outline-none placeholder:text-on-surface-variant/40 border border-outline-variant/10 focus:border-primary-fixed/30 transition-colors"
          />
          <button
            onClick={handleAddNote}
            disabled={!newNote.trim()}
            className="w-9 h-9 rounded-lg bg-primary-fixed text-on-primary-fixed flex items-center justify-center disabled:opacity-30 active:scale-90 transition-all shrink-0"
          >
            <span className="material-symbols-outlined text-base">add</span>
          </button>
        </div>
      </div>

      {/* Journal entries */}
      {entries.length > 0 ? (
        <div className="space-y-2">
          {visibleEntries.map(entry => (
            <div
              key={entry.id}
              className={`p-3 rounded-lg border transition-colors ${
                entry.pinned
                  ? 'border-amber-500/20 bg-amber-500/5'
                  : 'border-outline-variant/5 bg-surface-container-high'
              }`}
            >
              {editingId === entry.id ? (
                <div className="flex gap-2">
                  <input
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleEditSave(entry.id)}
                    className="flex-1 bg-surface-container-highest text-on-surface text-xs rounded-lg px-3 py-2 outline-none border border-primary-fixed/20"
                    autoFocus
                  />
                  <button onClick={() => handleEditSave(entry.id)} className="text-primary-fixed text-xs font-bold">
                    {sv ? 'Spara' : 'Save'}
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-on-surface-variant text-xs">✕</button>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-2">
                    <span className="text-sm shrink-0 mt-0.5">{typeEmoji[entry.type] || '📝'}</span>
                    <p className="text-on-surface text-xs leading-relaxed flex-1">{entry.text}</p>
                    {entry.pinned && <span className="text-amber-400 text-xs shrink-0">⭐</span>}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-on-surface-variant text-[9px]">
                      {new Date(entry.timestamp).toLocaleDateString(sv ? 'sv-SE' : 'en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handlePin(entry.id)}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-surface-container-highest transition-colors"
                        title={entry.pinned ? (sv ? 'Avfäst' : 'Unpin') : (sv ? 'Fäst' : 'Pin')}
                      >
                        <span className={`material-symbols-outlined text-xs ${entry.pinned ? 'text-amber-400' : 'text-on-surface-variant/40'}`}>
                          push_pin
                        </span>
                      </button>
                      <button
                        onClick={() => { setEditingId(entry.id); setEditText(entry.text); }}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-surface-container-highest transition-colors"
                      >
                        <span className="material-symbols-outlined text-xs text-on-surface-variant/40">edit</span>
                      </button>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/10 transition-colors"
                      >
                        <span className="material-symbols-outlined text-xs text-on-surface-variant/40 hover:text-red-400">delete</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}

          {entries.length > 3 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full text-center text-primary-fixed text-[10px] font-bold uppercase tracking-widest py-2 hover:bg-primary-fixed/5 rounded-lg transition-colors"
            >
              {showAll
                ? (sv ? 'Visa färre' : 'Show less')
                : (sv ? `Visa alla (${entries.length})` : `Show all (${entries.length})`)
              }
            </button>
          )}
        </div>
      ) : (
        <p className="text-on-surface-variant/40 text-xs text-center py-2">
          {sv ? 'Inga noteringar ännu. Börja dokumentera din resa!' : 'No notes yet. Start documenting your journey!'}
        </p>
      )}
    </div>
  );
}
