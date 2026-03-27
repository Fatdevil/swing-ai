import { REFERENCE_PLAYERS } from '../utils/referencePlayers';
import { getSetting } from '../utils/storage';

/**
 * MetricsPanel — Biomechanics comparison bars
 * Shows: Your estimate vs Tour average vs Reference player
 *
 * Data comes from Claude's "biomechanics" field in the analysis response.
 */

// PGA Tour averages (sourced from biomechanics research)
const TOUR_AVERAGES = {
  hipOpenAtImpact: { value: 42, unit: '°', label: { en: 'Hip Rotation at Impact', sv: 'Höftrotation vid träff' } },
  shoulderTurnAtTop: { value: 90, unit: '°', label: { en: 'Shoulder Turn at Top', sv: 'Axelrotation vid toppen' } },
  xFactor: { value: 38, unit: '°', label: { en: 'X-Factor (Hip-Shoulder Gap)', sv: 'X-Faktor (höft-axel gap)' } },
  tempoRatio: { value: 3.0, unit: ':1', label: { en: 'Tempo Ratio (Back:Down)', sv: 'Tempo-kvot (bak:ned)' } },
  shaftLeanAtImpact: { value: 4, unit: '°', label: { en: 'Shaft Lean at Impact', sv: 'Skaftlutning vid träff' } },
  spineAngleChange: { value: 2, unit: '°', label: { en: 'Spine Angle Change', sv: 'Ryggvinkelförändring' } },
};

// Parse a range string like "40-45°" → midpoint number
function parseMidpoint(str) {
  if (!str) return null;
  const nums = str.replace(/[^\d.-]/g, ' ').trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
  if (nums.length === 0) return null;
  if (nums.length === 1) return nums[0];
  return (nums[0] + nums[1]) / 2;
}

// Get reference player metric value
function getPlayerMetric(playerId, metricKey) {
  const player = REFERENCE_PLAYERS[playerId];
  if (!player?.keyMetrics?.[metricKey]) return null;
  return parseMidpoint(player.keyMetrics[metricKey]);
}

// Map for bar visualization (max range for each metric)
const METRIC_RANGES = {
  hipOpenAtImpact: { min: 0, max: 65 },
  shoulderTurnAtTop: { min: 60, max: 110 },
  xFactor: { min: 20, max: 60 },
  tempoRatio: { min: 1, max: 5 },
  shaftLeanAtImpact: { min: -5, max: 12 },
  spineAngleChange: { min: 0, max: 15 },
};

function getBarPercent(value, metricKey) {
  const range = METRIC_RANGES[metricKey] || { min: 0, max: 100 };
  return Math.max(0, Math.min(100, ((value - range.min) / (range.max - range.min)) * 100));
}

export default function MetricsPanel({ biomechanics, language }) {
  const sv = language === 'sv';

  // Get reference player from coaching profile
  const profile = getSetting('coaching_profile') || {};
  const playerId = profile.referencePlayer;
  const player = playerId ? REFERENCE_PLAYERS[playerId] : null;

  if (!biomechanics || Object.keys(biomechanics).length === 0) return null;

  // Metrics to display (only those estimated by Claude)
  const metricsToShow = Object.keys(TOUR_AVERAGES).filter(key => biomechanics[key] != null);

  if (metricsToShow.length === 0) return null;

  return (
    <section className="bg-surface-container p-5 rounded-lg kinetic-gradient-border">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <span className="material-symbols-outlined text-primary-fixed text-lg">straighten</span>
        <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest font-headline">
          {sv ? 'Biomekanik' : 'Biomechanics'}
        </span>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-5 text-[10px] uppercase tracking-widest font-bold">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-primary-fixed" />
          <span className="text-on-surface">{sv ? 'Du' : 'You'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-blue-400/60" />
          <span className="text-on-surface-variant">{sv ? 'Tour-snitt' : 'Tour Avg'}</span>
        </div>
        {player && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-amber-400/60" />
            <span className="text-on-surface-variant">{player.name}</span>
          </div>
        )}
      </div>

      {/* Metric bars */}
      <div className="space-y-5">
        {metricsToShow.map(key => {
          const meta = TOUR_AVERAGES[key];
          const userVal = biomechanics[key];
          const tourVal = meta.value;
          const playerVal = player ? getPlayerMetric(playerId, key) : null;

          const userPct = getBarPercent(userVal, key);
          const tourPct = getBarPercent(tourVal, key);
          const playerPct = playerVal != null ? getBarPercent(playerVal, key) : null;

          // Color user bar based on closeness to tour avg
          const diff = Math.abs(userVal - tourVal);
          const tourRange = METRIC_RANGES[key].max - METRIC_RANGES[key].min;
          const closeness = 1 - (diff / tourRange);
          const userColor = closeness >= 0.85 ? '#9DFF00' : closeness >= 0.7 ? '#FACC15' : '#F87171';

          return (
            <div key={key}>
              {/* Label + values */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-on-surface text-xs font-bold">
                  {meta.label[language]}
                </span>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="text-primary-fixed font-bold font-headline">
                    {key === 'tempoRatio' ? `${userVal.toFixed(1)}:1` : `${userVal}${meta.unit}`}
                  </span>
                </div>
              </div>

              {/* Bar container */}
              <div className="space-y-1.5">
                {/* User bar */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-on-surface-variant w-10 text-right shrink-0">
                    {sv ? 'Du' : 'You'}
                  </span>
                  <div className="flex-1 h-2.5 bg-surface-container-high rounded-full overflow-hidden relative">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${userPct}%`, background: userColor }}
                    />
                  </div>
                  <span className="text-[10px] font-bold w-10 text-left shrink-0" style={{ color: userColor }}>
                    {key === 'tempoRatio' ? `${userVal.toFixed(1)}` : `${userVal}${meta.unit}`}
                  </span>
                </div>

                {/* Tour bar */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-on-surface-variant/50 w-10 text-right shrink-0">Tour</span>
                  <div className="flex-1 h-2 bg-surface-container-high rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-400/50 transition-all duration-700"
                      style={{ width: `${tourPct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-blue-400/60 w-10 text-left shrink-0">
                    {key === 'tempoRatio' ? `${tourVal.toFixed(1)}` : `${tourVal}${meta.unit}`}
                  </span>
                </div>

                {/* Player bar (if selected) */}
                {playerPct != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-on-surface-variant/50 w-10 text-right shrink-0 truncate">
                      {player.name.split(' ')[1] || player.name.split(' ')[0]}
                    </span>
                    <div className="flex-1 h-2 bg-surface-container-high rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-400/50 transition-all duration-700"
                        style={{ width: `${playerPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-amber-400/60 w-10 text-left shrink-0">
                      {key === 'tempoRatio' ? `${playerVal.toFixed(1)}` : `${playerVal}${meta.unit}`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Insight footer */}
      <div className="mt-5 pt-4 border-t border-outline-variant/10">
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-primary-fixed text-sm mt-0.5">info</span>
          <p className="text-on-surface-variant text-[11px] leading-relaxed">
            {sv
              ? 'Värdena är AI-estimeringar baserade på videoanalys. Faktiska metriker kan variera beroende på kameravinkel och bildkvalitet.'
              : 'Values are AI estimates based on video analysis. Actual metrics may vary depending on camera angle and image quality.'}
          </p>
        </div>
      </div>
    </section>
  );
}
