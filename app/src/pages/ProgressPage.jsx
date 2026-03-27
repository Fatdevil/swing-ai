import { useState, useEffect } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { getCoachingHistory, getDrillLog } from '../utils/coachingHistory';

/**
 * ProgressPage — Visualize swing improvement over time
 * 
 * Sections:
 * 1. Score Trend Chart (SVG line chart)
 * 2. Category Breakdown (heatmap)
 * 3. Milestones & Achievements
 * 4. Faults Resolved Tracker
 * 5. Drill Progress
 */

// Category names used in coaching analysis
const CATEGORY_NAMES = ['Setup', 'Backswing', 'Downswing', 'Impact', 'Follow-through'];

// Milestone definitions
const MILESTONES = [
  { id: 'first_analysis', icon: '🏌️', check: (h) => h.totalSessions >= 1, en: 'First Swing Analyzed', sv: 'Första svingen analyserad' },
  { id: '5_sessions', icon: '🔥', check: (h) => h.totalSessions >= 5, en: '5 Sessions Completed', sv: '5 sessioner avklarade' },
  { id: '10_sessions', icon: '⚡', check: (h) => h.totalSessions >= 10, en: '10 Sessions — Dedicated!', sv: '10 sessioner — Engagerad!' },
  { id: 'score_70', icon: '📈', check: (h) => h.scores.some(s => s.score >= 70), en: 'First 70+ Score', sv: 'Första 70+ poäng' },
  { id: 'score_80', icon: '🎯', check: (h) => h.scores.some(s => s.score >= 80), en: 'First 80+ Score', sv: 'Första 80+ poäng' },
  { id: 'score_90', icon: '🏆', check: (h) => h.scores.some(s => s.score >= 90), en: 'First 90+ Score — Elite!', sv: 'Första 90+ poäng — Elit!' },
  { id: 'improving', icon: '📊', check: (h) => h.trend === 'improving', en: 'Trending Upward', sv: 'Uppåtgående trend' },
  { id: 'drill_done', icon: '✅', check: (h) => getDrillLog().some(d => d.status === 'completed'), en: 'First Drill Completed', sv: 'Första övningen avklarad' },
];

export default function ProgressPage({ onBack }) {
  const { language } = useLanguage();
  const sv = language === 'sv';
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const h = await getCoachingHistory();
        setHistory(h);
      } catch (err) {
        console.error('Failed to load coaching history:', err);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined text-primary-fixed text-3xl animate-spin">progress_activity</span>
      </div>
    );
  }

  if (!history || history.totalSessions === 0) {
    return (
      <div className="px-6 pt-8 pb-8 max-w-2xl mx-auto">
        <button onClick={onBack} className="flex items-center gap-2 text-on-surface-variant hover:text-primary-fixed transition-colors mb-8 group">
          <span className="material-symbols-outlined text-lg group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
          <span className="text-xs uppercase tracking-widest font-bold">{sv ? 'Tillbaka' : 'Back'}</span>
        </button>
        <div className="text-center space-y-4 py-16">
          <span className="material-symbols-outlined text-on-surface-variant/30 text-6xl">query_stats</span>
          <h2 className="font-headline text-2xl font-bold">{sv ? 'Inga sessioner ännu' : 'No sessions yet'}</h2>
          <p className="text-on-surface-variant text-sm">
            {sv ? 'Analysera din första sving för att börja spåra din progress!' : 'Analyze your first swing to start tracking your progress!'}
          </p>
        </div>
      </div>
    );
  }

  const { scores, sessions, trend, totalSessions } = history;
  const latestScore = scores.length > 0 ? scores[scores.length - 1].score : 0;
  const bestScore = scores.length > 0 ? Math.max(...scores.map(s => s.score)) : 0;
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, s) => a + s.score, 0) / scores.length) : 0;

  // Build category trend data
  const categoryTrends = {};
  CATEGORY_NAMES.forEach(name => { categoryTrends[name] = []; });
  // sessions are newest first, reverse for chronological
  [...sessions].reverse().forEach(s => {
    (s.categories || []).forEach(cat => {
      if (categoryTrends[cat.name] !== undefined) {
        categoryTrends[cat.name].push(cat.score);
      }
    });
  });

  // Collect all faults across sessions
  const faultMap = {};
  [...sessions].reverse().forEach((s, idx) => {
    (s.faults || []).forEach(f => {
      if (!faultMap[f.id]) {
        faultMap[f.id] = { firstSeen: idx, lastSeen: idx, count: 1 };
      } else {
        faultMap[f.id].lastSeen = idx;
        faultMap[f.id].count++;
      }
    });
  });
  const totalSessionCount = sessions.length;
  const resolvedFaults = Object.entries(faultMap).filter(([, v]) => v.lastSeen < totalSessionCount - 1 && totalSessionCount > 2);
  const activeFaults = Object.entries(faultMap).filter(([, v]) => v.lastSeen >= totalSessionCount - 1);

  // Unlocked milestones
  const unlockedMilestones = MILESTONES.filter(m => m.check(history));

  return (
    <div className="px-6 pt-8 pb-8 max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <button onClick={onBack} className="flex items-center gap-2 text-on-surface-variant hover:text-primary-fixed transition-colors mb-6 group">
          <span className="material-symbols-outlined text-lg group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
          <span className="text-xs uppercase tracking-widest font-bold">{sv ? 'Tillbaka' : 'Back'}</span>
        </button>
        <h2 className="font-headline text-3xl font-extrabold tracking-tight mb-1">
          {sv ? 'Din progress' : 'Your Progress'}
        </h2>
        <p className="text-on-surface-variant text-sm">
          {totalSessions} {sv ? 'sessioner analyserade' : 'sessions analyzed'}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label={sv ? 'Senaste' : 'Latest'} value={latestScore} icon="speed" trend={trend} />
        <StatCard label={sv ? 'Bästa' : 'Best'} value={bestScore} icon="emoji_events" highlight />
        <StatCard label={sv ? 'Snitt' : 'Average'} value={avgScore} icon="analytics" />
      </div>

      {/* Score Trend Chart */}
      <section className="bg-surface-container rounded-xl p-5 border border-outline-variant/10">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-primary-fixed text-lg">show_chart</span>
          <h3 className="font-headline font-bold text-sm uppercase tracking-wider">
            {sv ? 'Poängtrend' : 'Score Trend'}
          </h3>
          <TrendBadge trend={trend} sv={sv} />
        </div>
        <ScoreTrendChart scores={scores} />
      </section>

      {/* Category Heatmap */}
      {Object.values(categoryTrends).some(arr => arr.length > 0) && (
        <section className="bg-surface-container rounded-xl p-5 border border-outline-variant/10">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary-fixed text-lg">grid_view</span>
            <h3 className="font-headline font-bold text-sm uppercase tracking-wider">
              {sv ? 'Kategorier över tid' : 'Categories Over Time'}
            </h3>
          </div>
          <CategoryHeatmap trends={categoryTrends} sv={sv} />
        </section>
      )}

      {/* Faults Tracker */}
      {(resolvedFaults.length > 0 || activeFaults.length > 0) && (
        <section className="bg-surface-container rounded-xl p-5 border border-outline-variant/10">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary-fixed text-lg">bug_report</span>
            <h3 className="font-headline font-bold text-sm uppercase tracking-wider">
              {sv ? 'Felspårning' : 'Fault Tracker'}
            </h3>
          </div>
          <FaultTracker resolved={resolvedFaults} active={activeFaults} sv={sv} />
        </section>
      )}

      {/* Milestones */}
      <section className="bg-surface-container rounded-xl p-5 border border-outline-variant/10">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-primary-fixed text-lg">workspace_premium</span>
          <h3 className="font-headline font-bold text-sm uppercase tracking-wider">
            {sv ? 'Milstolpar' : 'Milestones'}
          </h3>
          <span className="text-on-surface-variant text-xs ml-auto">
            {unlockedMilestones.length}/{MILESTONES.length}
          </span>
        </div>
        <MilestonesGrid milestones={MILESTONES} unlocked={unlockedMilestones} sv={sv} />
      </section>

      {/* Drill Progress */}
      <DrillProgress sv={sv} />
    </div>
  );
}

// ===================== SUB-COMPONENTS =====================

function StatCard({ label, value, icon, trend, highlight }) {
  const trendColor = trend === 'improving' ? 'text-green-400' : trend === 'declining' ? 'text-red-400' : '';
  return (
    <div className={`rounded-xl p-4 border ${highlight ? 'bg-primary-fixed/10 border-primary-fixed/20' : 'bg-surface-container border-outline-variant/10'}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`material-symbols-outlined text-sm ${highlight ? 'text-primary-fixed' : 'text-on-surface-variant'}`}>{icon}</span>
        <span className="text-on-surface-variant text-[10px] uppercase tracking-widest font-bold">{label}</span>
      </div>
      <p className={`font-headline text-2xl font-black ${trendColor || 'text-on-surface'}`}>{value}</p>
    </div>
  );
}

function TrendBadge({ trend, sv }) {
  const config = {
    improving: { icon: 'trending_up', text: sv ? 'Förbättras' : 'Improving', color: 'text-green-400 bg-green-400/10 border-green-400/20' },
    declining: { icon: 'trending_down', text: sv ? 'Nedåt' : 'Declining', color: 'text-red-400 bg-red-400/10 border-red-400/20' },
    stable: { icon: 'trending_flat', text: sv ? 'Stabil' : 'Stable', color: 'text-on-surface-variant bg-surface-container-high border-outline-variant/20' },
  }[trend] || { icon: 'trending_flat', text: 'Stable', color: 'text-on-surface-variant bg-surface-container-high border-outline-variant/20' };

  return (
    <span className={`ml-auto flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${config.color}`}>
      <span className="material-symbols-outlined text-xs">{config.icon}</span>
      {config.text}
    </span>
  );
}

function ScoreTrendChart({ scores }) {
  if (scores.length < 2) {
    return <div className="text-on-surface-variant text-xs text-center py-8">Need at least 2 sessions to show trend</div>;
  }

  const width = 600;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 35 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const minScore = Math.max(0, Math.min(...scores.map(s => s.score)) - 10);
  const maxScore = Math.min(100, Math.max(...scores.map(s => s.score)) + 10);
  const range = maxScore - minScore || 1;

  const points = scores.map((s, i) => ({
    x: padding.left + (i / (scores.length - 1)) * chartW,
    y: padding.top + (1 - (s.score - minScore) / range) * chartH,
    score: s.score,
    date: new Date(s.timestamp).toLocaleDateString(),
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`;

  // Y-axis labels
  const yLabels = [minScore, Math.round((minScore + maxScore) / 2), maxScore];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: '200px' }}>
      {/* Grid lines */}
      {yLabels.map(v => {
        const y = padding.top + (1 - (v - minScore) / range) * chartH;
        return (
          <g key={v}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x={padding.left - 8} y={y + 4} fill="rgba(255,255,255,0.3)" fontSize="10" textAnchor="end" fontFamily="Inter, system-ui">{v}</text>
          </g>
        );
      })}

      {/* Area fill */}
      <defs>
        <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9DFF00" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#9DFF00" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#scoreGrad)" />

      {/* Line */}
      <path d={linePath} fill="none" stroke="#9DFF00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Glow line */}
      <path d={linePath} fill="none" stroke="#9DFF00" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.15" />

      {/* Data points */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="#0F1A0A" stroke="#9DFF00" strokeWidth="2" />
          {/* Score label on last point */}
          {i === points.length - 1 && (
            <text x={p.x} y={p.y - 10} fill="#9DFF00" fontSize="11" textAnchor="middle" fontWeight="bold" fontFamily="Inter, system-ui">{p.score}</text>
          )}
        </g>
      ))}

      {/* X-axis date labels (first and last) */}
      <text x={points[0].x} y={height - 5} fill="rgba(255,255,255,0.3)" fontSize="9" textAnchor="start" fontFamily="Inter, system-ui">{points[0].date}</text>
      <text x={points[points.length - 1].x} y={height - 5} fill="rgba(255,255,255,0.3)" fontSize="9" textAnchor="end" fontFamily="Inter, system-ui">{points[points.length - 1].date}</text>
    </svg>
  );
}

function CategoryHeatmap({ trends, sv }) {
  const categoryLabels = {
    'Setup': sv ? 'Setup' : 'Setup',
    'Backswing': sv ? 'Baksving' : 'Backswing',
    'Downswing': sv ? 'Nedsving' : 'Downswing',
    'Impact': sv ? 'Träff' : 'Impact',
    'Follow-through': sv ? 'Genomsving' : 'Follow-through',
  };

  return (
    <div className="space-y-2">
      {Object.entries(trends).map(([name, values]) => {
        if (values.length === 0) return null;
        const latest = values[values.length - 1];
        const first = values[0];
        const delta = latest - first;

        return (
          <div key={name} className="flex items-center gap-3">
            <span className="text-on-surface-variant text-xs font-bold w-24 shrink-0 uppercase tracking-wider">
              {categoryLabels[name] || name}
            </span>
            {/* Mini sparkline heatmap cells */}
            <div className="flex-1 flex gap-0.5">
              {values.map((v, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm"
                  style={{
                    height: '24px',
                    backgroundColor: scoreToColor(v),
                    minWidth: '8px',
                    maxWidth: '40px',
                  }}
                  title={`Session ${i + 1}: ${v}`}
                />
              ))}
            </div>
            {/* Delta badge */}
            <span className={`text-xs font-bold w-12 text-right ${delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-on-surface-variant'}`}>
              {delta > 0 ? '+' : ''}{delta}
            </span>
          </div>
        );
      })}
      {/* Legend */}
      <div className="flex items-center justify-end gap-2 mt-2">
        <span className="text-on-surface-variant/40 text-[9px] uppercase tracking-wider">{sv ? 'Låg' : 'Low'}</span>
        <div className="flex gap-0.5">
          {[30, 50, 65, 75, 85, 95].map(v => (
            <div key={v} className="w-3 h-3 rounded-sm" style={{ backgroundColor: scoreToColor(v) }} />
          ))}
        </div>
        <span className="text-on-surface-variant/40 text-[9px] uppercase tracking-wider">{sv ? 'Hög' : 'High'}</span>
      </div>
    </div>
  );
}

function FaultTracker({ resolved, active, sv }) {
  return (
    <div className="space-y-3">
      {resolved.length > 0 && (
        <div>
          <p className="text-green-400 text-[10px] uppercase tracking-widest font-bold mb-2">
            {sv ? '✅ Lösta fel' : '✅ Resolved Faults'}
          </p>
          <div className="space-y-1.5">
            {resolved.map(([id, data]) => (
              <div key={id} className="flex items-center gap-2 text-sm">
                <span className="material-symbols-outlined text-green-400 text-sm">check_circle</span>
                <span className="text-on-surface-variant line-through">{formatFaultId(id)}</span>
                <span className="text-on-surface-variant/40 text-xs ml-auto">
                  {data.count}x {sv ? 'detekterat' : 'detected'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {active.length > 0 && (
        <div>
          <p className="text-amber-400 text-[10px] uppercase tracking-widest font-bold mb-2">
            {sv ? '⚠️ Aktiva fel' : '⚠️ Active Faults'}
          </p>
          <div className="space-y-1.5">
            {active.map(([id, data]) => (
              <div key={id} className="flex items-center gap-2 text-sm">
                <span className="material-symbols-outlined text-amber-400 text-sm">warning</span>
                <span className="text-on-surface">{formatFaultId(id)}</span>
                <span className="text-on-surface-variant/40 text-xs ml-auto">
                  {data.count}x
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MilestonesGrid({ milestones, unlocked, sv }) {
  const unlockedIds = new Set(unlocked.map(m => m.id));
  return (
    <div className="grid grid-cols-2 gap-2">
      {milestones.map(m => {
        const isUnlocked = unlockedIds.has(m.id);
        return (
          <div
            key={m.id}
            className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
              isUnlocked
                ? 'bg-primary-fixed/5 border-primary-fixed/20'
                : 'bg-surface-container-low border-outline-variant/10 opacity-40'
            }`}
          >
            <span className={`text-lg ${isUnlocked ? '' : 'grayscale'}`}>{m.icon}</span>
            <span className={`text-xs font-bold ${isUnlocked ? 'text-on-surface' : 'text-on-surface-variant'}`}>
              {sv ? m.sv : m.en}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DrillProgress({ sv }) {
  const drills = getDrillLog();
  if (drills.length === 0) return null;

  const active = drills.filter(d => d.status === 'active');
  const completed = drills.filter(d => d.status === 'completed');

  return (
    <section className="bg-surface-container rounded-xl p-5 border border-outline-variant/10">
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-primary-fixed text-lg">fitness_center</span>
        <h3 className="font-headline font-bold text-sm uppercase tracking-wider">
          {sv ? 'Övningar' : 'Drills'}
        </h3>
        <span className="text-on-surface-variant text-xs ml-auto">
          {completed.length}/{drills.length} {sv ? 'avklarade' : 'completed'}
        </span>
      </div>
      {/* Progress bar */}
      <div className="w-full h-2 bg-surface-container-low rounded-full overflow-hidden mb-4">
        <div
          className="h-full rounded-full"
          style={{
            width: `${drills.length > 0 ? (completed.length / drills.length) * 100 : 0}%`,
            background: 'linear-gradient(90deg, #9DFF00, #7ACC00)',
          }}
        />
      </div>
      <div className="space-y-2">
        {active.slice(0, 3).map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="material-symbols-outlined text-amber-400 text-sm">pending</span>
            <span className="text-on-surface text-xs">{d.drillId.replace(/_/g, ' ')}</span>
          </div>
        ))}
        {completed.slice(-2).map((d, i) => (
          <div key={`c-${i}`} className="flex items-center gap-2 text-sm">
            <span className="material-symbols-outlined text-green-400 text-sm">check_circle</span>
            <span className="text-on-surface-variant text-xs line-through">{d.drillId.replace(/_/g, ' ')}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ===================== HELPERS =====================

function scoreToColor(score) {
  if (score >= 85) return '#9DFF00';       // Green
  if (score >= 70) return '#7ACC00';       // Dark green
  if (score >= 55) return '#FFB800';       // Amber
  if (score >= 40) return '#FF8C00';       // Orange
  return '#FF4444';                         // Red
}

function formatFaultId(id) {
  return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
