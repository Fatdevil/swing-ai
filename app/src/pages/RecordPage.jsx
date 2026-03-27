import { useState, useRef, useCallback } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { getPhaseLabel } from '../utils/videoFrames';
import { analyzeSwing, fileToBase64 } from '../utils/api';

export default function RecordPage({ onAnalysisComplete, onNavigate }) {
  const { t, language } = useLanguage();
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [frames, setFrames] = useState(null);
  const [cameraAngle, setCameraAngle] = useState('side');
  const [step, setStep] = useState('upload'); // upload | extracting | preview | analyzing | coaching
  const [poseResults, setPoseResults] = useState(null);
  const [sequencingData, setSequencingData] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [activeFrame, setActiveFrame] = useState(0);
  const [guestMode, setGuestMode] = useState(false);

  const handleFileSelect = useCallback((file) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setError(language === 'sv' ? 'Välj en videofil.' : 'Please select a video file.');
      return;
    }
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setError(null);
    // Immediately start frame extraction
    extractVideoFrames(file);
  }, [language]);

  const extractVideoFrames = async (file) => {
    setStep('extracting');
    setProgress(language === 'sv' ? 'Extraherar nyckelframes...' : 'Extracting key frames...');
    try {
      const { extractFrames } = await import('../utils/videoFrames.js');
      const extracted = await extractFrames(file, 8);
      setFrames(extracted);
      setStep('preview');
      setProgress('');
    } catch (err) {
      console.error('Frame extraction failed:', err);
      setError(err.message);
      setStep('upload');
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    handleFileSelect(file);
  }, [handleFileSelect]);

  const handleAnalyzePose = async () => {
    if (!frames) return;
    setStep('analyzing');
    try {
      const { analyzePose, drawSkeleton } = await import('../utils/mediapipe.js');
      const { calculateAllAngles } = await import('../utils/angles.js');
      const results = [];

      for (let i = 0; i < frames.length; i++) {
        setProgress(
          language === 'sv'
            ? `Analyserar frame ${i + 1}/${frames.length}: ${getPhaseLabel(i, 'sv')}...`
            : `Analyzing frame ${i + 1}/${frames.length}: ${getPhaseLabel(i, 'en')}...`
        );

        const img = new Image();
        img.src = frames[i].base64;
        await new Promise((resolve) => { img.onload = resolve; });

        const landmarks = await analyzePose(img);
        const measurements = landmarks ? calculateAllAngles(landmarks) : null;

        // Draw skeleton + annotation overlay on frame
        let overlayBase64 = null;
        if (landmarks) {
          const { drawAnnotations } = await import('../utils/swingAnnotations.js');
          const canvas = document.createElement('canvas');
          canvas.width = frames[i].width;
          canvas.height = frames[i].height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          drawSkeleton(ctx, landmarks, canvas.width, canvas.height);
          if (measurements) {
            const phase = frames[i].phase || getPhaseLabel(i, 'en');
            drawAnnotations(ctx, landmarks, measurements, canvas.width, canvas.height, phase);
          }
          overlayBase64 = canvas.toDataURL('image/jpeg', 0.85);
        }

        results.push({
          frameIndex: i,
          phase: frames[i].phase || getPhaseLabel(i, 'en'),
          phaseSv: getPhaseLabel(i, 'sv'),
          phaseConfidence: frames[i].phaseConfidence || null,
          landmarks,
          measurements,
          overlayBase64,
          originalBase64: frames[i].base64,
          timestamp: frames[i].timestamp,
        });
      }

      let seqData = null;
      try {
        const { analyzeSequencing } = await import('../utils/kinematicSequencing.js');
        seqData = analyzeSequencing(results);
      } catch (err) {
        console.warn('Sequencing analysis failed:', err);
      }
      setSequencingData(seqData);

      setPoseResults(results);
      setStep('preview');
      setProgress('');
    } catch (err) {
      console.error('Pose analysis failed:', err);
      // Fallback — continue without pose data
      setPoseResults(frames.map((f, i) => ({
        frameIndex: i,
        phase: getPhaseLabel(i, 'en'),
        phaseSv: getPhaseLabel(i, 'sv'),
        landmarks: null,
        measurements: null,
        overlayBase64: null,
        originalBase64: f.base64,
        timestamp: f.timestamp,
      })));
      setStep('preview');
      setProgress('');
    }
  };

  const handleGetCoaching = async (retryAttempt = 0) => {
    setStep('coaching');
    setError(null);

    // Multi-step progress messages (dual engine)
    const progressSteps = language === 'sv'
      ? ['Konverterar video...', '🎬 Gemini analyserar rörelse...', '📐 Claude analyserar positioner...', '🧠 Sammanfattar coaching-rapport...']
      : ['Converting video...', '🎬 Gemini analyzing motion...', '📐 Claude analyzing positions...', '🧠 Building coaching report...'];

    setProgress(progressSteps[0]);
    const progressTimer = setInterval(() => {
      setProgress(prev => {
        const idx = progressSteps.indexOf(prev);
        return idx < progressSteps.length - 1 ? progressSteps[idx + 1] : prev;
      });
    }, 4000);

    try {
      const { createVideoThumbnail } = await import('../utils/videoFrames.js');

      // Convert video to base64 for Gemini
      let videoBase64 = null;
      if (videoFile) {
        try {
          videoBase64 = await fileToBase64(videoFile);
        } catch (e) {
          console.warn('Video base64 conversion failed:', e);
        }
      }

      // Build frame data
      const frameData = (poseResults || frames.map((f, i) => ({
        frameIndex: i,
        phase: getPhaseLabel(i, 'en'),
        measurements: null,
        originalBase64: f.base64,
      }))).map((r) => ({
        phase: r.phase,
        base64: r.originalBase64,
        measurements: r.measurements,
      }));

      // Build knowledge base and coaching context
      let knowledgeBase = '';
      let coachingProfile = '';
      let coachingHistory = '';
      try {
        const { buildKnowledgeBasePrompt } = await import('../utils/golfKnowledge.js');
        knowledgeBase = buildKnowledgeBasePrompt(language);
      } catch { /* optional */ }
      if (!guestMode) {
        try {
          const { getSetting } = await import('../utils/storage.js');
          const profileStr = getSetting('coaching_profile');
          if (profileStr) coachingProfile = profileStr;
        } catch { /* optional */ }
        try {
          const { getCoachingHistory, buildCoachingHistoryPrompt } = await import('../utils/coachingHistory.js');
          const history = await getCoachingHistory();
          coachingHistory = buildCoachingHistoryPrompt(history, language);
        } catch { /* optional */ }
      }

      // Call backend API (handles both engines + summarizer)
      const result = await analyzeSwing({
        video: videoBase64,
        frames: frameData,
        cameraAngle,
        language,
        guestMode,
        sequencing: sequencingData,
        knowledgeBase,
        coachingProfile,
        coachingHistory,
      });

      clearInterval(progressTimer);

      // Create thumbnail for history
      const thumbnail = await createVideoThumbnail(frames);

      const analysisData = {
        videoFile: null, // Don't store full video in IndexedDB
        imageThumbnail: thumbnail,
        frames: poseResults || [],
        measurements: poseResults?.[0]?.measurements,
        coaching: result,
        totalScore: result.totalScore,
        cameraAngle,
        sequencing: sequencingData || null,
        timestamp: Date.now(),
      };

      // Save to IndexedDB — skip in guest mode
      if (!guestMode) {
        const { saveAnalysis } = await import('../utils/storage.js');
        await saveAnalysis(analysisData);

        // Auto-register drill into persistent drill log
        if (result.recommendedDrill?.id) {
          const { addDrill } = await import('../utils/coachingHistory.js');
          addDrill(result.recommendedDrill.id, result.recommendedDrill.reason || '');
        }
      }

      onAnalysisComplete(analysisData);
    } catch (err) {
      clearInterval(progressTimer);
      console.error('Coaching failed:', err);

      // Rate limit → auto-retry once after 3s
      if (err.message?.includes('429') && retryAttempt < 1) {
        setProgress(language === 'sv' ? 'Rate limit — försöker igen om 3s...' : 'Rate limited — retrying in 3s...');
        setTimeout(() => handleGetCoaching(retryAttempt + 1), 3000);
        return;
      }

      // Show error with retry button — stay in 'coaching' step so retry button shows
      setError(err.message || t('error'));
      setStep('coaching_error');
      setProgress('');
    }
  };

  const resetAll = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(null);
    setVideoUrl(null);
    setFrames(null);
    setPoseResults(null);
    setCameraAngle('side');
    setStep('upload');
    setError(null);
    setProgress('');
    setActiveFrame(0);
    setGuestMode(false);
  };

  const angles = [
    { id: 'side', icon: '🏌️', label: t('angleSide') },
    { id: 'front', icon: '🧍', label: t('angleFront') },
    { id: 'dtl', icon: '🎯', label: t('angleDownTheLine') },
  ];

  return (
    <div className="px-6 pt-8 pb-8 max-w-2xl mx-auto">

      {/* STEP 1: Upload / Record */}
      {step === 'upload' && (
        <div className="space-y-8">
          {/* Guest Mode Toggle */}
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setGuestMode(false)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${
                !guestMode
                  ? 'bg-primary-fixed text-on-primary-fixed'
                  : 'bg-surface-container-high text-on-surface-variant border border-outline-variant/15 hover:border-primary-fixed/30'
              }`}
            >
              <span className="material-symbols-outlined text-sm">person</span>
              {language === 'sv' ? 'Min sving' : 'My Swing'}
            </button>
            <button
              onClick={() => setGuestMode(true)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${
                guestMode
                  ? 'bg-amber-500 text-black'
                  : 'bg-surface-container-high text-on-surface-variant border border-outline-variant/15 hover:border-amber-500/30'
              }`}
            >
              <span className="material-symbols-outlined text-sm">group</span>
              {language === 'sv' ? 'Kompis' : 'Friend'}
            </button>
          </div>

          {/* Guest Mode Info */}
          {guestMode && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 flex items-center gap-3">
              <span className="material-symbols-outlined text-amber-400 text-lg">group</span>
              <div className="flex-1">
                <p className="text-amber-300 text-xs font-bold uppercase tracking-widest">
                  {language === 'sv' ? 'Gästläge aktivt' : 'Guest Mode Active'}
                </p>
                <p className="text-amber-200/60 text-[10px] mt-0.5">
                  {language === 'sv'
                    ? 'Analysen sparas INTE i din historik eller coaching'
                    : 'Analysis will NOT be saved to your history or coaching'}
                </p>
              </div>
            </div>
          )}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`relative rounded-lg border-2 border-dashed p-12 flex flex-col items-center justify-center text-center transition-all min-h-[300px] ${
              isDragging
                ? 'border-primary-fixed bg-primary-fixed/5'
                : 'border-outline-variant/30 bg-surface-container'
            }`}
          >
            <div className="bg-primary-fixed/10 p-6 rounded-full mb-6">
              <span className="material-symbols-outlined text-primary-fixed text-5xl">videocam</span>
            </div>

            <h3 className="font-headline text-xl font-bold mb-2">
              {language === 'sv' ? 'Filma din sving' : 'Record Your Swing'}
            </h3>
            <p className="text-on-surface-variant text-sm mb-6 max-w-xs">
              {language === 'sv'
                ? 'Spela in en video av din golfsving eller ladda upp en befintlig video.'
                : 'Record a video of your golf swing or upload an existing video.'}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              {/* Record video — label+input for mobile */}
              <label className="kinetic-gradient text-on-primary-fixed font-bold py-4 px-8 rounded-full flex items-center justify-center gap-2 active:scale-95 duration-200 cursor-pointer shadow-[0_4px_20px_rgba(157,255,0,0.2)]">
                <span className="material-symbols-outlined">videocam</span>
                {language === 'sv' ? 'Spela in' : 'Record'}
                <input
                  type="file"
                  accept="video/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files?.[0])}
                />
              </label>

              {/* Upload from gallery */}
              <label className="border border-outline-variant/30 text-on-surface font-bold py-4 px-8 rounded-full flex items-center justify-center gap-2 hover:bg-surface-bright transition-colors active:scale-95 cursor-pointer">
                <span className="material-symbols-outlined">upload</span>
                {language === 'sv' ? 'Ladda upp video' : 'Upload Video'}
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files?.[0])}
                />
              </label>
            </div>

            <p className="text-on-surface-variant/50 text-xs hidden sm:block">
              {language === 'sv' ? 'eller dra och släpp en video här' : 'or drag & drop a video here'}
            </p>
          </div>

          {error && (
            <div className="bg-error-container/20 text-error rounded-lg p-4 text-sm">{error}</div>
          )}

          {/* Ball Tracker Mode */}
          <button
            onClick={() => onNavigate?.('balltracker')}
            className="w-full group relative bg-surface-container-low rounded-lg p-5 border border-outline-variant/10 hover:border-primary-fixed/20 transition-all text-left overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary-fixed/5 rounded-full blur-3xl -mr-8 -mt-8 group-hover:bg-primary-fixed/10 transition-colors" />
            <div className="flex items-center gap-4 relative">
              <div className="bg-primary-fixed/10 p-2.5 rounded-full">
                <span className="material-symbols-filled text-primary-fixed text-xl">flight</span>
              </div>
              <div className="flex-1">
                <h4 className="font-headline font-bold text-on-surface text-sm">
                  {language === 'sv' ? 'Ball Tracker' : 'Ball Tracker'}
                </h4>
                <p className="text-on-surface-variant text-xs">
                  {language === 'sv'
                    ? 'Spåra bollens flygbana med neon-spårlinje'
                    : 'Track ball flight with neon trail line'}
                </p>
              </div>
              <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary-fixed transition-colors">arrow_forward</span>
            </div>
          </button>
        </div>
      )}

      {/* STEP 2: Extracting frames (loading state) */}
      {step === 'extracting' && (
        <div className="flex flex-col items-center justify-center min-h-[400px] space-y-6">
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 bg-primary-fixed/20 rounded-full blur-xl animate-pulse" />
            <div className="relative w-full h-full border-2 border-primary-fixed rounded-full flex items-center justify-center">
              <span className="material-symbols-outlined text-primary-fixed text-3xl animate-spin">
                progress_activity
              </span>
            </div>
          </div>
          <div className="text-center">
            <p className="font-headline font-bold text-on-surface">{progress}</p>
            <p className="text-on-surface-variant text-sm mt-2">
              {language === 'sv' ? 'Identifierar 8 svingfaser...' : 'Identifying 8 swing phases...'}
            </p>
          </div>
        </div>
      )}

      {/* STEP 3: Preview frames & analyze */}
      {(step === 'preview' || step === 'analyzing' || step === 'coaching' || step === 'coaching_error') && frames && (
        <div className="space-y-6">
          {/* Guest Mode Banner — persistent during analysis */}
          {guestMode && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2.5 flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-400 text-sm animate-pulse">group</span>
              <span className="text-amber-300 text-xs font-bold uppercase tracking-widest">
                {language === 'sv' ? 'Gästläge — sparas ej' : 'Guest Mode — not saved'}
              </span>
            </div>
          )}

          {/* Active frame display */}
          <div className="relative rounded-lg overflow-hidden bg-surface-container border border-outline-variant/10">
            <img
              src={poseResults?.[activeFrame]?.overlayBase64 || frames[activeFrame]?.base64}
              alt={`Frame ${activeFrame + 1}`}
              className="w-full h-auto max-h-[50vh] object-contain"
            />
            {/* HUD overlay */}
            <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-md rounded-lg px-3 py-2 border border-white/10">
              <div className="flex items-center gap-2">
                {poseResults?.[activeFrame]?.landmarks && (
                  <span className="w-2 h-2 rounded-full bg-primary-fixed animate-pulse shadow-[0_0_8px_#9dff00]" />
                )}
                <span className="text-[10px] font-bold uppercase tracking-widest text-primary-fixed font-headline">
                  {language === 'sv'
                    ? poseResults?.[activeFrame]?.phaseSv || getPhaseLabel(activeFrame, 'sv')
                    : poseResults?.[activeFrame]?.phase || getPhaseLabel(activeFrame, 'en')}
                </span>
              </div>
            </div>
            <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-md rounded-lg px-3 py-2 border border-white/10">
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                {activeFrame + 1} / {frames.length}
              </span>
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent pointer-events-none" />
          </div>

          {/* Frame timeline strip */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar py-2">
            {frames.map((frame, i) => (
              <button
                key={i}
                onClick={() => setActiveFrame(i)}
                className={`flex-shrink-0 relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                  activeFrame === i
                    ? 'border-primary-fixed shadow-[0_0_10px_rgba(157,255,0,0.3)]'
                    : 'border-transparent opacity-60 hover:opacity-100'
                }`}
              >
                <img
                  src={poseResults?.[i]?.overlayBase64 || frame.base64}
                  alt={`Frame ${i + 1}`}
                  className="w-full h-full object-cover"
                />
                {poseResults?.[i]?.landmarks && (
                  <div className="absolute bottom-0 inset-x-0 bg-primary-fixed/80 text-on-primary-fixed text-[8px] text-center font-bold py-0.5">
                    ✓
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Measurements for active frame (if available) */}
          {poseResults?.[activeFrame]?.measurements && (
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(poseResults[activeFrame].measurements).slice(0, 3).map(([key, m]) => (
                <div key={key} className="bg-surface-container/60 backdrop-blur-md p-3 rounded-lg border border-white/5 flex flex-col items-center">
                  <span className="text-[10px] text-on-surface-variant uppercase tracking-wider">
                    {t(key) || key}
                  </span>
                  <span className={`text-sm font-headline font-bold ${
                    m.status === 'good' ? 'text-primary-fixed' : m.status === 'warning' ? 'text-secondary' : 'text-error'
                  }`}>
                    {m.value.toFixed(1)}°
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Camera Angle Selector */}
          <div className="space-y-3">
            <p className="font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              {t('cameraAngle')}
            </p>
            <div className="flex gap-3">
              {angles.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setCameraAngle(a.id)}
                  className={`flex-1 py-3 px-2 rounded-full font-label text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
                    cameraAngle === a.id
                      ? 'bg-primary-fixed text-on-primary-fixed'
                      : 'bg-surface-container-high border border-outline-variant/20 text-on-surface hover:border-primary-fixed'
                  }`}
                >
                  <span>{a.icon}</span>
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-error-container/20 text-error rounded-lg p-4 text-sm">{error}</div>
          )}

          {/* Progress */}
          {progress && (step === 'analyzing' || step === 'coaching') && (
            <div className="bg-surface-container rounded-lg p-4 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary-fixed animate-spin">progress_activity</span>
              <span className="text-on-surface text-sm font-medium">{progress}</span>
            </div>
          )}

          {/* Coaching Error + Retry */}
          {step === 'coaching_error' && (
            <div className="bg-error-container/20 rounded-lg p-5 space-y-3">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-error mt-0.5">error</span>
                <div>
                  <p className="text-error font-bold text-sm">
                    {language === 'sv' ? 'AI-coaching misslyckades' : 'AI coaching failed'}
                  </p>
                  <p className="text-error/70 text-xs mt-1">{error}</p>
                  <p className="text-on-surface-variant text-xs mt-2">
                    {language === 'sv'
                      ? 'Din pose-analys finns kvar. Tryck nedan för att försöka igen.'
                      : 'Your pose analysis is preserved. Press below to try again.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleGetCoaching(0)}
                className="w-full kinetic-gradient text-on-primary-fixed h-12 rounded-full flex items-center justify-center gap-2 font-headline font-bold uppercase tracking-widest text-xs active:scale-[0.98] transition-all"
              >
                <span className="material-symbols-outlined text-sm">refresh</span>
                {language === 'sv' ? 'Försök igen' : 'Retry'}
              </button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-4">
            {!poseResults && step !== 'analyzing' && (
              <button
                onClick={handleAnalyzePose}
                className="w-full bg-primary-fixed text-on-primary-fixed h-16 rounded-full flex items-center justify-center gap-3 active:scale-[0.98] transition-all shadow-[0_10px_30px_rgba(157,255,0,0.2)] font-headline font-bold uppercase tracking-widest text-sm"
              >
                <span className="material-symbols-outlined">body_system</span>
                {t('analyzePose')}
              </button>
            )}

            {poseResults && step !== 'coaching' && step !== 'coaching_error' && (
              <button
                onClick={handleGetCoaching}
                className="w-full kinetic-gradient text-on-primary-fixed h-16 rounded-full flex items-center justify-center gap-3 active:scale-[0.98] transition-all shadow-[0_10px_30px_rgba(157,255,0,0.2)] font-headline font-bold uppercase tracking-widest text-sm"
              >
                <span className="material-symbols-filled">psychology</span>
                {t('getCoaching')}
              </button>
            )}

            <button
              onClick={resetAll}
              disabled={step === 'analyzing' || step === 'coaching'}
              className="text-on-surface-variant text-sm font-bold uppercase tracking-widest hover:text-on-surface transition-colors disabled:opacity-30"
            >
              ← {language === 'sv' ? 'Ny video' : 'New Video'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
