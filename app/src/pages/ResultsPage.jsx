import { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import ScoreGauge from '../components/ScoreGauge';
import { getPhaseLabel } from '../utils/videoFrames';
import CoachChat from '../components/CoachChat';
import MetricsPanel from '../components/MetricsPanel';
import { generateScoreCard, shareImage } from '../utils/shareCard';
import SequencingPanel from '../components/SequencingPanel';
import TempoPanel from '../components/TempoPanel';

export default function ResultsPage({ data, onBack }) {
  const { t, language } = useLanguage();
  const [activeFrame, setActiveFrame] = useState(0);
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sharePreview, setSharePreview] = useState(null);

  if (!data || !data.coaching) {
    return (
      <div className="px-6 pt-8 pb-8 max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[60vh]">
        <span className="material-symbols-outlined text-outline-variant text-5xl mb-4">error</span>
        <p className="text-on-surface-variant">{t('error')}</p>
        <button onClick={onBack} className="mt-4 text-primary-fixed font-bold text-sm uppercase tracking-widest">
          ← {t('home')}
        </button>
      </div>
    );
  }

  const { coaching, totalScore, frames = [] } = data;
  const categories = coaching.categories || [];
  const faults = coaching.faultsDetected || [];
  const hasFrames = frames.length > 0;
  const drill = coaching.recommendedDrill;

  const getScoreColor = (s) => {
    if (s >= 80) return 'text-primary-fixed';
    if (s >= 70) return 'text-on-surface';
    return 'text-error';
  };

  const handleCategoryClick = (cat, index) => {
    setExpandedCategory(expandedCategory === index ? null : index);
    if (cat.keyFrame && hasFrames) {
      setActiveFrame(Math.max(0, cat.keyFrame - 1));
    }
  };

  return (
    <div className="px-6 pt-8 pb-8 max-w-2xl mx-auto space-y-8">
      {/* Back */}
      <button onClick={onBack} className="text-on-surface-variant text-sm font-bold uppercase tracking-widest hover:text-on-surface transition-colors flex items-center gap-1">
        <span className="material-symbols-outlined text-lg">arrow_back</span>
        {t('home')}
      </button>

      {/* Score Gauge */}
      <div className="flex flex-col items-center">
        <div className="relative w-48 h-48 mb-6">
          <ScoreGauge score={totalScore} size={192} />
          <div className="absolute inset-0 flex items-center justify-center flex-col">
            <span className={`text-5xl font-black font-headline ${getScoreColor(totalScore)} drop-shadow-[0_0_15px_rgba(157,255,0,0.3)]`}>
              {totalScore}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-on-surface-variant mt-1">
              {t('swingScore')}
            </span>
          </div>
          <div className="absolute -inset-4 bg-primary-fixed/10 rounded-full blur-2xl opacity-50 -z-10" />
        </div>
        {coaching.estimatedHandicap && (
          <div className="bg-surface-container-high px-5 py-2 rounded-full border border-outline-variant/15">
            <span className="text-on-surface-variant text-xs font-medium">
              {t('estimatedHandicap')}: <span className="text-on-surface font-bold">{coaching.estimatedHandicap}</span>
            </span>
          </div>
        )}
      </div>

      {/* Frame Browser */}
      {hasFrames && (
        <section className="space-y-3">
          <div className="relative rounded-lg overflow-hidden bg-surface-container border border-outline-variant/10">
            <img
              src={frames[activeFrame]?.overlayBase64 || frames[activeFrame]?.originalBase64}
              alt={`Frame ${activeFrame + 1}`}
              className="w-full h-auto max-h-[300px] object-contain"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent pointer-events-none" />
            <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-md rounded-lg px-3 py-1.5 border border-white/10">
              <span className="text-[10px] font-bold text-primary-fixed uppercase tracking-widest">
                {language === 'sv'
                  ? frames[activeFrame]?.phaseSv || getPhaseLabel(activeFrame, 'sv')
                  : frames[activeFrame]?.phase || getPhaseLabel(activeFrame, 'en')}
              </span>
            </div>
            {frames[activeFrame]?.landmarks && (
              <div className="absolute bottom-3 left-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary-fixed animate-pulse shadow-[0_0_8px_#9dff00]" />
                <span className="text-[8px] font-bold text-white uppercase tracking-widest">
                  {t('skeletalOverlayActive')}
                </span>
              </div>
            )}
          </div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {frames.map((frame, i) => (
              <button
                key={i}
                onClick={() => setActiveFrame(i)}
                className={`flex-shrink-0 relative w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                  activeFrame === i ? 'border-primary-fixed' : 'border-transparent opacity-50 hover:opacity-100'
                }`}
              >
                <img src={frame.overlayBase64 || frame.originalBase64} alt={`Frame ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Faults Detected */}
      {faults.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-headline font-bold text-error flex items-center gap-2">
            <span className="material-symbols-outlined">warning</span>
            {language === 'sv' ? 'Identifierade svingfel' : 'Detected Swing Faults'}
          </h3>
          <div className="space-y-2">
            {faults.map((fault, i) => (
              <div key={i} className="bg-error/5 border border-error/15 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-error font-bold text-sm">
                    {fault.id?.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                  </span>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    fault.confidence === 'high'
                      ? 'bg-error/20 text-error'
                      : 'bg-outline-variant/20 text-on-surface-variant'
                  }`}>
                    {fault.confidence}
                  </span>
                </div>
                <p className="text-on-surface-variant text-xs">{fault.evidence}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Priority Focus + Recommended Drill */}
      <section className="glass-panel rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-primary-fixed/10 p-2 rounded-full">
            <span className="material-symbols-filled text-primary-fixed">psychology</span>
          </div>
          <h3 className="font-headline text-lg font-bold text-primary-fixed">{t('aiAnalysis')}</h3>
        </div>

        {coaching.priorityFocus && (
          <div className="bg-surface-container-high p-4 rounded-lg border border-primary-fixed/10">
            <p className="font-label text-xs font-bold uppercase tracking-widest text-primary-fixed mb-2">
              {t('priorityFocus')}
            </p>
            <p className="text-on-surface text-sm leading-relaxed">{coaching.priorityFocus}</p>
          </div>
        )}

        {coaching.tempo && (
          <div className="bg-surface-container-high p-4 rounded-lg">
            <p className="font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">⏱ Tempo</p>
            <p className="text-on-surface text-sm leading-relaxed">{coaching.tempo}</p>
          </div>
        )}

        {/* Recommended Drill — enriched from knowledge base */}
        {drill && (
          <div className="bg-primary-fixed/5 border border-primary-fixed/15 rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-fixed">fitness_center</span>
              <p className="font-headline font-bold text-primary-fixed">
                {drill.name || t('recommendedDrill')}
              </p>
            </div>
            {drill.reason && (
              <p className="text-on-surface-variant text-xs italic">{drill.reason}</p>
            )}
            {drill.instructions && (
              <p className="text-on-surface text-sm leading-relaxed">{drill.instructions}</p>
            )}
            <div className="flex gap-4 text-[10px] text-on-surface-variant uppercase tracking-widest">
              {drill.reps && <span>📋 {drill.reps}</span>}
              {drill.equipment && <span>🏌️ {drill.equipment}</span>}
            </div>
          </div>
        )}
      </section>

      {/* Category Breakdown */}
      <section className="space-y-4">
        {categories.map((cat, i) => (
          <CategoryCard
            key={i}
            category={cat}
            index={i}
            t={t}
            language={language}
            hasFrames={hasFrames}
            expanded={expandedCategory === i}
            onClick={() => handleCategoryClick(cat, i)}
          />
        ))}
      </section>

      {/* Biomechanics Metrics */}
      <MetricsPanel biomechanics={coaching.biomechanics} language={language} />

      {/* TPI Kinematic Sequencing */}
      {data.sequencing && <SequencingPanel sequencing={data.sequencing} />}

      {/* Tempo Analysis */}
      <TempoPanel frames={data.frames} />

      {/* Export PDF Report */}
      <button
        onClick={() => {
          const w = window.open('', '_blank');
          const cats = (coaching.categories || []).map(c => `<tr><td style="padding:8px;border-bottom:1px solid #222">${c.name}</td><td style="padding:8px;border-bottom:1px solid #222;text-align:center;font-weight:bold;color:${c.score >= 80 ? '#9DFF00' : c.score >= 60 ? '#FFB800' : '#FF4444'}">${c.score}</td></tr>`).join('');
          const faultsList = faults.map(f => `<li>${f.fault} (${f.severity})</li>`).join('');
          w.document.write(`<!DOCTYPE html><html><head><title>SWING_AI Report</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0A0F1C;color:#e0e0e0;font-family:system-ui;padding:40px;max-width:800px;margin:0 auto}h1{color:#9DFF00;font-size:28px;margin-bottom:4px}h2{color:#9DFF00;font-size:16px;margin:24px 0 8px;text-transform:uppercase;letter-spacing:2px}table{width:100%;border-collapse:collapse;margin:8px 0}p{line-height:1.6;margin:4px 0}.score{font-size:72px;font-weight:900;color:#9DFF00;text-align:center;margin:30px 0}.sub{text-align:center;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:3px}.hcp{text-align:center;color:#aaa;margin-bottom:20px}@media print{body{background:white;color:#333}h1,h2,.score{color:#2d7a00}}</style></head><body><h1>SWING_AI</h1><p style="color:#888">Golf Swing Analysis Report — ${new Date().toLocaleDateString()}</p><div class="score">${totalScore}</div><div class="sub">Swing Score</div>${coaching.estimatedHandicap ? '<div class="hcp">Est. Handicap: '+coaching.estimatedHandicap+'</div>' : ''}<h2>Category Scores</h2><table>${cats}</table>${coaching.priorityFocus ? '<h2>Priority Focus</h2><p>'+coaching.priorityFocus+'</p>' : ''}${faultsList ? '<h2>Faults Detected</h2><ul style="padding-left:20px">'+faultsList+'</ul>' : ''}${drill ? '<h2>Recommended Drill</h2><p><strong>'+( drill.name || drill.id )+'</strong></p><p>'+(drill.instructions || '')+'</p><p style="color:#888;font-size:12px">'+(drill.reps ? 'Reps: '+drill.reps : '')+(drill.equipment ? ' | Equipment: '+drill.equipment : '')+'</p>' : ''}<hr style="border:none;border-top:1px solid #333;margin:30px 0"><p style="color:#555;font-size:11px;text-align:center">Generated by SWING_AI — AI-Powered Golf Coaching</p></body></html>`);
          w.document.close();
          setTimeout(() => w.print(), 500);
        }}
        className="w-full border border-outline-variant/20 text-on-surface-variant h-12 rounded-full flex items-center justify-center gap-3 font-headline font-bold uppercase tracking-widest text-xs active:scale-[0.98] transition-all hover:bg-surface-container-high"
      >
        <span className="material-symbols-outlined text-lg">description</span>
        {language === 'sv' ? 'Exportera PDF-rapport' : 'Export PDF Report'}
      </button>

      {/* Share Score Card */}
      <button
        onClick={async () => {
          setSharing(true);
          try {
            const cardDataUrl = await generateScoreCard(data, language);
            setSharePreview(cardDataUrl);
            await shareImage(cardDataUrl, 'swing_ai_score.png', `SWING_AI Score: ${data.totalScore}`);
          } catch (e) { console.error('Share failed:', e); }
          setSharing(false);
        }}
        disabled={sharing}
        className="w-full border border-primary-fixed/30 text-primary-fixed h-14 rounded-full flex items-center justify-center gap-3 font-headline font-bold uppercase tracking-widest text-xs active:scale-[0.98] transition-all hover:bg-primary-fixed/5 disabled:opacity-50"
      >
        <span className="material-symbols-outlined text-lg">{sharing ? 'hourglass_empty' : 'share'}</span>
        {sharing
          ? (language === 'sv' ? 'Genererar...' : 'Generating...')
          : (language === 'sv' ? 'Dela Score Card' : 'Share Score Card')}
      </button>

      {/* Share Preview */}
      {sharePreview && (
        <div className="relative">
          <button
            onClick={() => setSharePreview(null)}
            className="absolute top-2 right-2 z-10 bg-black/50 rounded-full p-1"
          >
            <span className="material-symbols-outlined text-white text-sm">close</span>
          </button>
          <img src={sharePreview} alt="Score Card" className="w-full rounded-lg border border-outline-variant/10" />
        </div>
      )}

      {/* Chat with Coach */}
      <button
        onClick={() => setShowChat(true)}
        className="w-full kinetic-gradient text-on-primary-fixed h-14 rounded-full flex items-center justify-center gap-3 font-headline font-bold uppercase tracking-widest text-xs active:scale-[0.98] transition-all shadow-[0_4px_20px_rgba(157,255,0,0.2)]"
      >
        <span className="material-symbols-outlined text-lg">chat</span>
        {language === 'sv' ? 'Prata med coachen' : 'Talk to Coach'}
      </button>

      {/* Back */}
      <button
        onClick={onBack}
        className="w-full border border-outline-variant/30 text-on-surface font-bold py-4 px-8 rounded-full flex items-center justify-center gap-2 hover:bg-surface-bright transition-colors active:scale-95"
      >
        <span className="material-symbols-outlined">home</span>
        {t('home')}
      </button>

      {/* Coach Chat overlay */}
      {showChat && (
        <CoachChat analysisData={data} onClose={() => setShowChat(false)} />
      )}
    </div>
  );
}

function CategoryCard({ category, index, t, language, hasFrames, expanded, onClick }) {
  const isGood = category.score >= 70;
  const iconList = ['sports_golf', 'undo', 'swap_vert', 'flash_on', 'redo'];
  const checksMet = category.checkpointsMet || [];
  const checksMissed = category.checkpointsMissed || [];

  return (
    <div className="bg-surface-container rounded-lg border border-outline-variant/10 overflow-hidden transition-all">
      <button
        onClick={onClick}
        className="w-full p-6 text-left hover:bg-surface-container-high/30 transition-all"
      >
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
            isGood ? 'bg-primary-fixed/10' : 'bg-error/10'
          }`}>
            <span className={`material-symbols-outlined ${isGood ? 'text-primary-fixed' : 'text-error'}`}>
              {iconList[index] || 'sports_golf'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h4 className="font-headline font-bold text-on-surface">{category.name}</h4>
                {category.keyFrame && hasFrames && (
                  <span className="text-[9px] text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-full">
                    Frame {category.keyFrame}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  isGood ? 'bg-primary-fixed/10 text-primary-fixed' : 'bg-error/10 text-error'
                }`}>
                  {isGood ? t('correct') : t('improve')}
                </span>
                <span className={`font-headline font-bold text-lg ${isGood ? 'text-primary-fixed' : 'text-error'}`}>
                  {category.score}
                </span>
              </div>
            </div>
            <p className="text-on-surface-variant text-sm leading-relaxed">{category.analysis}</p>
          </div>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-6 pb-6 pt-0 space-y-4 border-t border-outline-variant/10">
          {/* Tips */}
          {category.tips?.length > 0 && (
            <div className="pt-4">
              <p className="font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">Tips</p>
              <ul className="space-y-2">
                {category.tips.map((tip, i) => (
                  <li key={i} className="text-on-surface text-sm flex items-start gap-2">
                    <span className="material-symbols-outlined text-primary-fixed text-sm mt-0.5 flex-shrink-0">lightbulb</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Checkpoints */}
          {(checksMet.length > 0 || checksMissed.length > 0) && (
            <div className="space-y-3">
              <p className="font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                {language === 'sv' ? 'Kontrollpunkter' : 'Checkpoints'}
              </p>
              {checksMet.map((cp, i) => (
                <div key={`met-${i}`} className="flex items-start gap-2 text-xs">
                  <span className="material-symbols-outlined text-primary-fixed text-sm mt-0.5">check_circle</span>
                  <span className="text-on-surface-variant">{cp}</span>
                </div>
              ))}
              {checksMissed.map((cp, i) => (
                <div key={`missed-${i}`} className="flex items-start gap-2 text-xs">
                  <span className="material-symbols-outlined text-error text-sm mt-0.5">cancel</span>
                  <span className="text-on-surface-variant">{cp}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
