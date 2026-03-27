import { useLanguage } from '../i18n/LanguageContext';

/**
 * TempoPanel — Displays swing tempo analysis
 * Extracts backswing/downswing timing from frame data and shows ratio.
 * Tour average is approximately 3:1 (backswing 3x slower than downswing).
 */
export default function TempoPanel({ frames }) {
  const { language } = useLanguage();
  const sv = language === 'sv';

  if (!frames || frames.length < 6) return null;

  // Frame phases: 0=Address, 1=Takeaway, 2=Halfway Back, 3=Top, 4=Transition, 5=Delivery, 6=Impact, 7=Follow-through
  // Backswing = frames 0→3 (address to top)
  // Downswing = frames 3→6 (top to impact)
  
  const getTimestamp = (f) => f.timestamp || f.frameTimestamp || 0;
  
  const addressTime = getTimestamp(frames[0]);
  const topTime = getTimestamp(frames[3]);
  const impactTime = getTimestamp(frames[6] || frames[frames.length - 2]);

  if (!addressTime || !topTime || !impactTime) return null;

  let backswingMs = topTime - addressTime;
  let downswingMs = impactTime - topTime;
  
  // Handle ms vs seconds
  if (backswingMs > 100) { backswingMs /= 1000; downswingMs /= 1000; }
  
  if (backswingMs <= 0 || downswingMs <= 0) return null;
  
  const ratio = (backswingMs / downswingMs).toFixed(1);
  const totalMs = ((backswingMs + downswingMs) * 1000).toFixed(0);
  
  // Tour pro reference: ~3:1 ratio, ~1.2s total
  const idealRatio = 3.0;
  const ratioDiff = Math.abs(parseFloat(ratio) - idealRatio);
  const ratioGrade = ratioDiff < 0.3 ? 'excellent' : ratioDiff < 0.8 ? 'good' : ratioDiff < 1.5 ? 'fair' : 'poor';
  
  const gradeConfig = {
    excellent: { color: '#9DFF00', label: sv ? 'Utmärkt' : 'Excellent', icon: 'emoji_events' },
    good: { color: '#7ACC00', label: sv ? 'Bra' : 'Good', icon: 'thumb_up' },
    fair: { color: '#FFB800', label: sv ? 'Kan förbättras' : 'Needs work', icon: 'trending_flat' },
    poor: { color: '#FF4444', label: sv ? 'Jobba på tempo' : 'Work on tempo', icon: 'warning' },
  };
  
  const grade = gradeConfig[ratioGrade];

  return (
    <section className="bg-surface-container rounded-xl p-5 border border-outline-variant/10 space-y-4">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-fixed text-lg">timer</span>
        <h3 className="font-headline font-bold text-sm uppercase tracking-wider">
          {sv ? 'Tempo-analys' : 'Tempo Analysis'}
        </h3>
        <span
          className="ml-auto flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border"
          style={{ color: grade.color, borderColor: `${grade.color}33`, backgroundColor: `${grade.color}12` }}
        >
          <span className="material-symbols-outlined text-xs">{grade.icon}</span>
          {grade.label}
        </span>
      </div>

      {/* Ratio Display */}
      <div className="flex items-center justify-center gap-4 py-4">
        <div className="text-center">
          <p className="font-headline font-black text-3xl text-on-surface">
            {(backswingMs * 1000).toFixed(0)}<span className="text-lg text-on-surface-variant">ms</span>
          </p>
          <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold mt-1">
            {sv ? 'Baksving' : 'Backswing'}
          </p>
        </div>

        <div className="text-center px-4">
          <div
            className="font-headline font-black text-4xl"
            style={{ color: grade.color, textShadow: `0 0 20px ${grade.color}40` }}
          >
            {ratio}:1
          </div>
          <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold mt-1">
            {sv ? 'Ratio' : 'Ratio'}
          </p>
        </div>

        <div className="text-center">
          <p className="font-headline font-black text-3xl text-on-surface">
            {(downswingMs * 1000).toFixed(0)}<span className="text-lg text-on-surface-variant">ms</span>
          </p>
          <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold mt-1">
            {sv ? 'Nedsving' : 'Downswing'}
          </p>
        </div>
      </div>

      {/* Visual Bar */}
      <div className="flex h-3 rounded-full overflow-hidden">
        <div
          className="rounded-l-full"
          style={{
            width: `${(backswingMs / (backswingMs + downswingMs)) * 100}%`,
            background: 'linear-gradient(90deg, #3B82F6, #60A5FA)',
          }}
        />
        <div
          className="rounded-r-full"
          style={{
            width: `${(downswingMs / (backswingMs + downswingMs)) * 100}%`,
            background: 'linear-gradient(90deg, #9DFF00, #7ACC00)',
          }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-on-surface-variant uppercase tracking-widest">
        <span>{sv ? 'Baksving' : 'Backswing'}</span>
        <span>{sv ? 'Nedsving' : 'Downswing'}</span>
      </div>

      {/* Reference */}
      <div className="bg-surface-container-high/50 rounded-lg p-3 flex items-center gap-3">
        <span className="material-symbols-outlined text-on-surface-variant text-sm">info</span>
        <p className="text-on-surface-variant text-[11px] leading-relaxed">
          {sv
            ? `Tour-genomsnitt: 3:1 ratio. Din total svingtid: ${totalMs}ms. Rory McIlroy: ~750ms baksving, 250ms nedsving.`
            : `Tour average: 3:1 ratio. Your total swing time: ${totalMs}ms. Rory McIlroy: ~750ms backswing, 250ms downswing.`}
        </p>
      </div>
    </section>
  );
}
