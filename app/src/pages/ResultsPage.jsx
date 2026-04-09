import { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import ScoreGauge from '../components/ScoreGauge';
import { getPhaseLabel } from '../utils/videoFrames';
import MetricsPanel from '../components/MetricsPanel';
import { generateScoreCard, shareImage } from '../utils/shareCard';
import SequencingPanel from '../components/SequencingPanel';
import TempoPanel from '../components/TempoPanel';
import { getScoreGrade, TOUR_BENCHMARKS } from '../utils/swingScore';

export default function ResultsPage({ data, onBack }) {
  const { t, language } = useLanguage();
  const [activeFrame, setActiveFrame] = useState(0);
  const [expandedCategory, setExpandedCategory] = useState(null);
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

      {/* Tier Badge */}
      {data._meta?.tier && (
        <div className="flex items-center justify-center gap-4">
          {data._meta.tier === 'premium' ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-primary-fixed/10 rounded-full border border-primary-fixed/20">
              <span className="text-xs">🎬</span>
              <span className="text-primary-fixed text-[10px] font-bold uppercase tracking-widest">Gemini</span>
              <span className="text-on-surface-variant text-[10px]">+</span>
              <span className="text-xs">📐</span>
              <span className="text-primary-fixed text-[10px] font-bold uppercase tracking-widest">Claude</span>
              <span className="text-on-surface-variant/50 text-[8px] ml-1">⚡ PREMIUM</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2 bg-surface-container rounded-full border border-outline-variant/20">
              <span className="text-xs">🎬</span>
              <span className="text-on-surface text-[10px] font-bold uppercase tracking-widest">Gemini AI</span>
              <span className="text-on-surface-variant/50 text-[8px] ml-1">BASIC</span>
            </div>
          )}
        </div>
      )}

      {/* Dual Engine Insights */}
      {data.dualEngineInsights?.length > 0 && (
        <section className="bg-primary-fixed/5 border border-primary-fixed/15 rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-fixed text-lg">neurology</span>
            <h3 className="font-headline font-bold text-sm text-primary-fixed uppercase tracking-wider">
              {language === 'sv' ? 'Kombinerade insikter' : 'Combined Insights'}
            </h3>
          </div>
          {data.dualEngineInsights.map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-primary-fixed text-xs mt-0.5">🧠</span>
              <p className="text-on-surface text-sm leading-relaxed">{item.insight}</p>
            </div>
          ))}
        </section>
      )}

      {/* Coaching Summary */}
      {data.coachingSummary && (
        <div className="bg-surface-container-high/50 rounded-lg p-4 border border-outline-variant/10">
          <p className="text-on-surface text-sm leading-relaxed italic">{data.coachingSummary}</p>
        </div>
      )}

      {/* Score Gauge */}
      <div className="flex flex-col items-center">
        <div className="relative w-48 h-48 mb-4">
          <ScoreGauge score={totalScore} size={192} />
          <div className="absolute inset-0 flex items-center justify-center flex-col">
            <span className={`text-5xl font-black font-headline ${getScoreColor(totalScore)} drop-shadow-[0_0_15px_rgba(157,255,0,0.3)]`}>
              {totalScore}
            </span>
            {data.deltas?.total != null && data.deltas.total !== 0 && (
              <span className={`text-xs font-bold flex items-center gap-0.5 ${
                data.deltas.total > 0 ? 'text-primary-fixed' : 'text-red-400'
              }`}>
                <span className="material-symbols-outlined text-sm">
                  {data.deltas.total > 0 ? 'trending_up' : 'trending_down'}
                </span>
                {data.deltas.total > 0 ? '+' : ''}{data.deltas.total}
              </span>
            )}
            <span className="text-[10px] uppercase tracking-widest text-on-surface-variant mt-0.5">
              {t('swingScore')}
            </span>
          </div>
          <div className="absolute -inset-4 bg-primary-fixed/10 rounded-full blur-2xl opacity-50 -z-10" />
        </div>

        {/* Personal Best Badge */}
        {data.newRecords?.includes('total') && (
          <div className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-500/10 rounded-full border border-amber-500/20 mb-3 animate-bounce">
            <span className="text-sm">🏆</span>
            <span className="text-amber-400 text-[10px] font-bold uppercase tracking-widest">
              {language === 'sv' ? 'Nytt personbästa!' : 'New Personal Best!'}
            </span>
          </div>
        )}

        {/* Handicap Estimate */}
        {coaching.estimatedHandicap && (
          <div className="bg-surface-container-high px-5 py-2 rounded-full border border-outline-variant/15">
            <span className="text-on-surface-variant text-xs font-medium">
              {t('estimatedHandicap')}: <span className="text-on-surface font-bold">{coaching.estimatedHandicap}</span>
            </span>
          </div>
        )}
      </div>

      {/* 3-Pillar Score Breakdown */}
      {data.swingScore && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-fixed text-lg">insights</span>
            <h3 className="font-headline font-bold text-sm text-on-surface-variant uppercase tracking-wider">
              {language === 'sv' ? 'Score-analys' : 'Score Breakdown'}
            </h3>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {/* Position Pillar */}
            <PillarCard
              icon="🎯"
              label={language === 'sv' ? 'Position' : 'Position'}
              score={data.swingScore.position.score}
              weight="50%"
              delta={data.deltas?.position}
              isRecord={data.newRecords?.includes('position')}
              language={language}
            />
            {/* Motion Pillar */}
            <PillarCard
              icon="⚡"
              label={language === 'sv' ? 'Rörelse' : 'Motion'}
              score={data.swingScore.motion.score}
              weight="30%"
              delta={data.deltas?.motion}
              isRecord={data.newRecords?.includes('motion')}
              language={language}
            />
            {/* Mechanics Pillar */}
            <PillarCard
              icon="📐"
              label={language === 'sv' ? 'Mekanik' : 'Mechanics'}
              score={data.swingScore.mechanics.score}
              weight="20%"
              delta={data.deltas?.mechanics}
              isRecord={data.newRecords?.includes('mechanics')}
              language={language}
            />
          </div>

          {/* Biomechanics Sub-Scores */}
          <div className="bg-surface-container rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-primary-fixed text-sm">straighten</span>
              <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">
                {language === 'sv' ? 'Biomekanik-detaljer' : 'Biomechanics Details'}
              </span>
            </div>
            {Object.entries(data.swingScore.biomechanicsBreakdown).map(([key, metric]) => {
              if (metric.score == null) return null;
              const tour = metric.tour;
              const delta = data.deltas?.biomechanics?.[key];
              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface text-xs font-medium">
                      {tour?.label?.[language] || key}
                    </span>
                    <div className="flex items-center gap-2">
                      {metric.value != null && (
                        <span className="text-on-surface-variant text-[10px]">
                          {typeof metric.value === 'number' ? metric.value.toFixed(1) : metric.value}{tour?.unit || ''}
                        </span>
                      )}
                      <span className={`text-xs font-bold ${
                        metric.score >= 80 ? 'text-primary-fixed' : metric.score >= 60 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {Math.round(metric.score)}
                      </span>
                      {delta != null && delta !== 0 && (
                        <span className={`text-[9px] font-bold ${delta > 0 ? 'text-primary-fixed' : 'text-red-400'}`}>
                          {delta > 0 ? '+' : ''}{Math.round(delta)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-primary-fixed/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          metric.score >= 80 ? 'bg-primary-fixed' : metric.score >= 60 ? 'bg-amber-400' : 'bg-red-400'
                        }`}
                        style={{ width: `${metric.score}%` }}
                      />
                    </div>
                    {tour && (
                      <span className="text-on-surface-variant/40 text-[8px] shrink-0">
                        Tour: {tour.value}{tour.unit}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
          <div className="flex items-center justify-between">
            <h3 className="font-headline font-bold text-error flex items-center gap-2">
              <span className="material-symbols-outlined">warning</span>
              {language === 'sv' ? 'Identifierade svingfel' : 'Detected Swing Faults'}
            </h3>
            <span className="text-on-surface-variant text-[10px] font-bold">
              {faults.length} {language === 'sv' ? 'fel' : 'fault'}{faults.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2">
            {faults.map((fault, i) => {
              const severityConfig = {
                critical: { bg: 'bg-red-500/10', border: 'border-red-500/20', badge: 'bg-red-500/20 text-red-400', icon: 'error' },
                major:    { bg: 'bg-amber-500/10', border: 'border-amber-500/20', badge: 'bg-amber-500/20 text-amber-400', icon: 'warning' },
                moderate: { bg: 'bg-blue-400/10', border: 'border-blue-400/20', badge: 'bg-blue-400/20 text-blue-400', icon: 'info' },
              };
              const sev = severityConfig[fault.severity] || severityConfig.major;
              return (
                <div key={i} className={`${sev.bg} border ${sev.border} rounded-lg p-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`material-symbols-outlined text-sm ${sev.badge.split(' ')[1]}`}>{sev.icon}</span>
                      <span className="text-on-surface font-bold text-sm">
                        {fault.fault || fault.id?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${sev.badge}`}>
                        {fault.severity || 'major'}
                      </span>
                      {fault.confidence && (
                        <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          fault.confidence === 'high' ? 'bg-primary-fixed/10 text-primary-fixed' : 'bg-outline-variant/15 text-on-surface-variant'
                        }`}>
                          {fault.confidence}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-on-surface-variant text-xs leading-relaxed">{fault.evidence}</p>
                </div>
              );
            })}
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

        {coaching.causalChain && (
          <div className="bg-surface-container-high p-5 rounded-lg border border-primary-fixed/20 shadow-[0_4px_24px_rgba(157,255,0,0.05)]">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-primary-fixed text-lg">timeline</span>
              <p className="font-label text-xs font-bold uppercase tracking-widest text-primary-fixed">
                {language === 'sv' ? 'Kausal Analys' : 'Causal Analysis'}
              </p>
            </div>
            
            <div className="relative pl-6 space-y-5 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-gradient-to-b before:from-error before:via-amber-400 before:to-primary-fixed">
              <div className="relative">
                <span className="absolute -left-[29px] w-3 h-3 rounded-full bg-error ring-4 ring-surface-container-high z-10 top-1"></span>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">{language === 'sv' ? 'Rotorsak' : 'Root Cause'}</p>
                <p className="text-on-surface text-sm">{coaching.causalChain.rootCause}</p>
              </div>
              
              <div className="relative">
                <span className="absolute -left-[29px] w-3 h-3 rounded-full bg-amber-400 ring-4 ring-surface-container-high z-10 top-1"></span>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">{language === 'sv' ? 'Biomekanisk Effekt' : 'Biomechanical Effect'}</p>
                <p className="text-on-surface text-sm">{coaching.causalChain.biomechanicalEffect}</p>
              </div>

              <div className="relative">
                <span className="absolute -left-[29px] w-3 h-3 rounded-full bg-primary-fixed ring-4 ring-surface-container-high z-10 top-1"></span>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">{language === 'sv' ? 'Bollflykt' : 'Ball Flight Output'}</p>
                <p className="text-on-surface text-sm">{coaching.causalChain.ballFlight}</p>
              </div>
            </div>
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
          <div className="bg-primary-fixed/5 border border-primary-fixed/15 rounded-lg p-5 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-primary-fixed">fitness_center</span>
              <p className="font-headline font-bold text-primary-fixed">
                {drill.name || t('recommendedDrill')}
              </p>
            </div>
            {drill.videoUrl && (
              <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-outline-variant/20 shadow-md">
                <iframe
                  src={drill.videoUrl}
                  title="Drill Video"
                  className="absolute inset-0 w-full h-full object-cover"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              </div>
            )}
            {drill.reason && (
              <p className="text-on-surface-variant text-xs italic">{drill.reason}</p>
            )}
            {drill.instructions && (
              <p className="text-on-surface text-sm leading-relaxed">{drill.instructions}</p>
            )}
            <div className="flex gap-4 text-[10px] text-on-surface-variant uppercase tracking-widest mt-2">
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

      {/* TPI Kinematic Sequencing (Front camera only) */}
      {data.sequencing && data.cameraAngle === 'front' && <SequencingPanel sequencing={data.sequencing} />}

      {/* Tempo Analysis */}
      <TempoPanel frames={data.frames} />

      {/* Export PDF Report */}
      <button
        onClick={() => {
          const w = window.open('', '_blank');
          const cats = (coaching.categories || []).map(c => `<tr><td style="padding:8px;border-bottom:1px solid #222">${c.name}</td><td style="padding:8px;border-bottom:1px solid #222;text-align:center;font-weight:bold;color:${c.score >= 80 ? '#9DFF00' : c.score >= 60 ? '#FFB800' : '#FF4444'}">${c.score}</td></tr>`).join('');
          const faultsList = faults.map(f => `<li>${f.fault} (${f.severity})</li>`).join('');
          w.document.write(`<!DOCTYPE html><html><head><title>SWING_AI Report</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0A0F1C;color:#e0e0e0;font-family:system-ui;padding:40px;max-width:800px;margin:0 auto}h1{color:#9DFF00;font-size:28px;margin-bottom:4px}h2{color:#9DFF00;font-size:16px;margin:24px 0 8px;text-transform:uppercase;letter-spacing:2px}table{width:100%;border-collapse:collapse;margin:8px 0}p{line-height:1.6;margin:4px 0}.score{font-size:72px;font-weight:900;color:#9DFF00;text-align:center;margin:30px 0}.sub{text-align:center;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:3px}.hcp{text-align:center;color:#aaa;margin-bottom:20px}@media print{body{background:white;color:#333}h1,h2,.score{color:#2d7a00}}</style></head><body><h1>SWING_AI</h1><p style="color:#888">Golf Swing Analysis Report — ${new Date().toLocaleDateString()}</p><div class="score">${totalScore}</div><div class="sub">Swing Score</div>${coaching.estimatedHandicap ? '<div class="hcp">Est. Handicap: '+coaching.estimatedHandicap+'</div>' : ''}<h2>Category Scores</h2><table>${cats}</table>${coaching.causalChain ? '<h2>Causal Analysis</h2><p><strong>Root Cause:</strong> '+coaching.causalChain.rootCause+'</p><p><strong>Effect:</strong> '+coaching.causalChain.biomechanicalEffect+'</p><p><strong>Ball Flight:</strong> '+coaching.causalChain.ballFlight+'</p>' : ''}${faultsList ? '<h2>Faults Detected</h2><ul style="padding-left:20px">'+faultsList+'</ul>' : ''}${drill ? '<h2>Recommended Drill</h2><p><strong>'+( drill.name || drill.id )+'</strong></p><p>'+(drill.instructions || '')+'</p><p style="color:#888;font-size:12px">'+(drill.reps ? 'Reps: '+drill.reps : '')+(drill.equipment ? ' | Equipment: '+drill.equipment : '')+'</p>' : ''}<hr style="border:none;border-top:1px solid #333;margin:30px 0"><p style="color:#555;font-size:11px;text-align:center">Generated by SWING_AI — AI-Powered Golf Coaching</p></body></html>`);
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
        onClick={() => window.dispatchEvent(new CustomEvent('open-coach-chat', { detail: { analysisData: data } }))}
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
        className="w-full p-5 text-left hover:bg-surface-container-high/30 transition-all"
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
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <h4 className="font-headline font-bold text-on-surface text-sm">{category.name}</h4>
                {category.keyFrame && hasFrames && (
                  <span className="text-[8px] text-on-surface-variant bg-surface-container-high px-1.5 py-0.5 rounded">
                    F{category.keyFrame}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Checkpoint count */}
                <span className="text-[9px] text-on-surface-variant">
                  {checksMet.length}/{checksMet.length + checksMissed.length} ✓
                </span>
                <span className={`font-headline font-black text-xl ${isGood ? 'text-primary-fixed' : 'text-error'}`}>
                  {category.score}
                </span>
              </div>
            </div>
            {/* Score bar */}
            <div className="h-1 bg-primary-fixed/8 rounded-full overflow-hidden mb-2">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  category.score >= 80 ? 'bg-primary-fixed' : category.score >= 60 ? 'bg-amber-400' : 'bg-red-400'
                }`}
                style={{ width: `${category.score}%` }}
              />
            </div>
            <p className="text-on-surface-variant text-xs leading-relaxed line-clamp-2">{category.analysis}</p>
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
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                  {language === 'sv' ? 'Kontrollpunkter' : 'Checkpoints'}
                </p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  checksMet.length >= 4 ? 'bg-primary-fixed/10 text-primary-fixed'
                  : checksMet.length >= 3 ? 'bg-amber-400/10 text-amber-400'
                  : 'bg-red-400/10 text-red-400'
                }`}>
                  {checksMet.length}/{checksMet.length + checksMissed.length} = {checksMet.length * 20}pts
                </span>
              </div>
              {checksMet.map((cp, i) => (
                <div key={`met-${i}`} className="flex items-start gap-2 text-xs">
                  <span className="material-symbols-outlined text-primary-fixed text-sm mt-0.5 shrink-0">check_circle</span>
                  <span className="text-on-surface">{cp}</span>
                </div>
              ))}
              {checksMissed.map((cp, i) => (
                <div key={`missed-${i}`} className="flex items-start gap-2 text-xs">
                  <span className="material-symbols-outlined text-red-400 text-sm mt-0.5 shrink-0">cancel</span>
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

// ─── Pillar Score Card ───────────────────────────────────────

function PillarCard({ icon, label, score, weight, delta, isRecord, language }) {
  const sv = language === 'sv';
  const scoreColor = score >= 80 ? 'text-primary-fixed' : score >= 60 ? 'text-amber-400' : 'text-red-400';
  const barColor = score >= 80 ? 'bg-primary-fixed' : score >= 60 ? 'bg-amber-400' : 'bg-red-400';

  return (
    <div className="bg-surface-container rounded-lg p-3 text-center relative overflow-hidden">
      {isRecord && (
        <div className="absolute top-1 right-1">
          <span className="text-[10px]">🏆</span>
        </div>
      )}
      <span className="text-lg block mb-1">{icon}</span>
      <span className={`text-2xl font-black font-headline ${scoreColor} block`}>{score}</span>
      {delta != null && delta !== 0 && (
        <span className={`text-[9px] font-bold ${delta > 0 ? 'text-primary-fixed' : 'text-red-400'}`}>
          {delta > 0 ? '↑' : '↓'}{Math.abs(delta)}
        </span>
      )}
      <span className="text-on-surface-variant text-[9px] font-bold uppercase tracking-widest block mt-1">{label}</span>
      <div className="h-1 bg-primary-fixed/10 rounded-full overflow-hidden mt-2">
        <div className={`h-full ${barColor} rounded-full transition-all duration-700`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-on-surface-variant/30 text-[8px] mt-1 block">{weight}</span>
    </div>
  );
}
