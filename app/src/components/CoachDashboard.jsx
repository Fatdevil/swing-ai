import { useState, useEffect, useMemo } from 'react';
import { DRILL_LIBRARY } from '../utils/golfKnowledge';
import { getCoachingHistory, completeDrill, reactivateDrill, getDrillLog } from '../utils/coachingHistory';
import { COACHING_APPROACHES, REFERENCE_PLAYERS, COACH_PERSONALITIES } from '../utils/referencePlayers';
import { setSetting } from '../utils/storage';
import CoachChat from './CoachChat';

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
  const [loading, setLoading] = useState(true);
  const [showChat, setShowChat] = useState(false);
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
    } catch (e) {
      console.error('Coach history load failed:', e);
    }
    setLoading(false);
  }

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
        onClick={() => setShowChat(true)}
        className="w-full kinetic-gradient text-on-primary-fixed h-14 rounded-full flex items-center justify-center gap-3 font-headline font-bold uppercase tracking-widest text-xs active:scale-[0.98] transition-all shadow-[0_4px_20px_rgba(157,255,0,0.2)]"
      >
        <span className="material-symbols-outlined text-lg">chat</span>
        {sv ? 'Prata med coachen' : 'Talk to Coach'}
      </button>

      {/* Coach Chat overlay */}
      {showChat && (
        <CoachChat onClose={() => setShowChat(false)} />
      )}
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
