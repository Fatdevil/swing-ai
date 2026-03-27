import { useLanguage } from '../i18n/LanguageContext';

/**
 * SequencingPanel — TPI-style kinematic sequencing visualization
 * 
 * Shows 4 velocity curves (hips, torso, arms, hands) with peak markers
 * and sequence order validation. Inspired by Titleist Performance Institute.
 */

const SEGMENT_CONFIG = {
  hips:  { color: '#9DFF00', en: 'Hips', sv: 'Höfter', icon: '🟢' },
  torso: { color: '#00BFFF', en: 'Torso', sv: 'Bål', icon: '🔵' },
  arms:  { color: '#FFB800', en: 'Arms', sv: 'Armar', icon: '🟡' },
  hands: { color: '#FF4444', en: 'Hands', sv: 'Händer', icon: '🔴' },
};

export default function SequencingPanel({ sequencing }) {
  const { language } = useLanguage();
  const sv = language === 'sv';

  if (!sequencing) return null;

  const { segments, isCorrect, grade, sequenceOrder, errors } = sequencing;

  return (
    <div className="bg-surface-container rounded-xl p-5 border border-outline-variant/10 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary-fixed text-lg">timeline</span>
          <h3 className="font-headline font-bold text-sm uppercase tracking-wider">
            {sv ? 'Sekvensering' : 'Kinematic Sequencing'}
          </h3>
          <span className="text-[8px] font-black bg-primary-fixed/10 text-primary-fixed px-2 py-0.5 rounded-full border border-primary-fixed/20">
            TPI
          </span>
        </div>
        {/* Grade badge */}
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
          grade >= 80 ? 'bg-green-500/10 text-green-400 border border-green-500/20'
          : grade >= 50 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
          : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          {isCorrect && <span className="material-symbols-outlined text-xs">check</span>}
          {grade}/100
        </div>
      </div>

      {/* SVG Graph */}
      <SequencingGraph segments={segments} />

      {/* Sequence Order Visualization */}
      <div className="space-y-2">
        <p className="text-on-surface-variant text-[10px] uppercase tracking-widest font-bold">
          {sv ? 'Topphastighetens ordning' : 'Peak velocity order'}
        </p>
        <div className="flex items-center gap-1">
          {sequenceOrder.map((peak, i) => {
            const config = SEGMENT_CONFIG[peak.segment];
            const isIdeal = sequencing.idealOrder[i] === peak.segment;
            return (
              <div key={peak.segment} className="flex items-center gap-1">
                {i > 0 && (
                  <span className="material-symbols-outlined text-on-surface-variant/30 text-sm">arrow_forward</span>
                )}
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border ${
                    isIdeal
                      ? 'border-green-500/20 bg-green-500/5'
                      : 'border-red-500/20 bg-red-500/5'
                  }`}
                  style={{ color: config.color }}
                >
                  <span className="text-sm">{config.icon}</span>
                  {sv ? config.sv : config.en}
                  {!isIdeal && <span className="material-symbols-outlined text-red-400 text-xs">warning</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ideal Order Reference */}
      <div className="flex items-center gap-1">
        <span className="text-on-surface-variant/40 text-[9px] uppercase tracking-wider mr-1">
          {sv ? 'Ideal:' : 'Ideal:'}
        </span>
        {['hips', 'torso', 'arms', 'hands'].map((seg, i) => {
          const config = SEGMENT_CONFIG[seg];
          return (
            <div key={seg} className="flex items-center gap-1">
              {i > 0 && <span className="text-on-surface-variant/20 text-[10px]">→</span>}
              <span className="text-[10px] font-bold" style={{ color: config.color, opacity: 0.5 }}>
                {sv ? config.sv : config.en}
              </span>
            </div>
          );
        })}
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {errors.map((err, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="material-symbols-outlined text-amber-400 text-sm shrink-0 mt-0.5">info</span>
              <span className="text-on-surface-variant">{sv ? err.sv : err.en}</span>
            </div>
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-on-surface-variant/30 text-[9px] leading-relaxed">
        {sv
          ? 'Baserat på 2D-analys av MediaPipe-landmarks. Approximation — inte jämförbar med 3D TPI-labb.'
          : 'Based on 2D MediaPipe landmark analysis. Approximation — not comparable to 3D TPI lab.'}
      </p>
    </div>
  );
}

/**
 * SVG Graph — 4 velocity curves with peak markers
 */
function SequencingGraph({ segments }) {
  const width = 600;
  const height = 180;
  const pad = { top: 15, right: 15, bottom: 25, left: 5 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: '180px' }}>
      {/* Background grid */}
      {[0, 25, 50, 75, 100].map(v => {
        const y = pad.top + (1 - v / 100) * chartH;
        return (
          <line key={v} x1={pad.left} y1={y} x2={width - pad.right} y2={y}
            stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        );
      })}

      {/* Phase labels */}
      <text x={pad.left + chartW * 0.15} y={height - 5} fill="rgba(255,255,255,0.2)" fontSize="9" textAnchor="middle" fontFamily="Inter, system-ui">
        Backswing
      </text>
      <text x={pad.left + chartW * 0.55} y={height - 5} fill="rgba(255,255,255,0.2)" fontSize="9" textAnchor="middle" fontFamily="Inter, system-ui">
        Downswing
      </text>
      <text x={pad.left + chartW * 0.85} y={height - 5} fill="rgba(255,255,255,0.2)" fontSize="9" textAnchor="middle" fontFamily="Inter, system-ui">
        Follow-through
      </text>

      {/* Velocity curves */}
      {Object.entries(segments).map(([key, seg]) => {
        const points = seg.velocities.map((v, i) => ({
          x: pad.left + (i / (seg.velocities.length - 1)) * chartW,
          y: pad.top + (1 - v / 100) * chartH,
        }));

        const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        const peakPoint = points[seg.peak] || points[0];

        return (
          <g key={key}>
            {/* Glow */}
            <path d={path} fill="none" stroke={seg.color} strokeWidth="5" opacity="0.1" strokeLinecap="round" strokeLinejoin="round" />
            {/* Main line */}
            <path d={path} fill="none" stroke={seg.color} strokeWidth="2" opacity="0.8" strokeLinecap="round" strokeLinejoin="round" />
            {/* Peak marker */}
            <circle cx={peakPoint.x} cy={peakPoint.y} r="5" fill="none" stroke={seg.color} strokeWidth="2" />
            <circle cx={peakPoint.x} cy={peakPoint.y} r="2" fill={seg.color} />
            {/* Peak vertical line */}
            <line x1={peakPoint.x} y1={peakPoint.y + 5} x2={peakPoint.x} y2={pad.top + chartH}
              stroke={seg.color} strokeWidth="1" strokeDasharray="3 3" opacity="0.3" />
          </g>
        );
      })}

      {/* Legend */}
      {Object.entries(segments).map(([key, seg], i) => {
        const config = SEGMENT_CONFIG[key];
        const x = pad.left + i * 140;
        return (
          <g key={`legend-${key}`}>
            <circle cx={x + 5} cy={10} r="4" fill={seg.color} />
            <text x={x + 14} y={13} fill={seg.color} fontSize="10" fontWeight="bold" fontFamily="Inter, system-ui">
              {config.en}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
