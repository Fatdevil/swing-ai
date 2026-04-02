import { useState, useRef, useCallback } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { getPhaseLabel } from '../utils/videoFrames';
import { analyzeSwing, fileToBase64 } from '../utils/api';

export default function RecordPage({ onAnalysisComplete, onNavigate }) {
  const { t, language } = useLanguage();
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [frames, setFrames] = useState(null);
  const [cameraAngle, setCameraAngle] = useState('auto');
  const [step, setStep] = useState('upload'); // upload | extracting | ready | preview | analyzing | coaching
  const [poseResults, setPoseResults] = useState(null);
  const [sequencingData, setSequencingData] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [activeFrame, setActiveFrame] = useState(0);
  const [guestMode, setGuestMode] = useState(false);
  const [tier, setTier] = useState('basic'); // 'basic' | 'premium'
  const [showAdvanced, setShowAdvanced] = useState(false);

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
      setStep('ready');
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
      setStep('ready');
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
      setStep('ready');
      setProgress('');
    }
  };

  const handleGetCoaching = async (retryAttempt = 0) => {
    setStep('coaching');
    setError(null);

    // Tier-aware progress messages
    const progressSteps = tier === 'premium'
      ? (language === 'sv'
        ? ['Konverterar video...', '🎬 Gemini analyserar rörelse...', '📐 Claude analyserar positioner...', '🧠 Sammanfattar coaching-rapport...']
        : ['Converting video...', '🎬 Gemini analyzing motion...', '📐 Claude analyzing positions...', '🧠 Building coaching report...'])
      : (language === 'sv'
        ? ['Konverterar video...', '🎬 Gemini analyserar din sving...', '🎬 Bygger coaching-rapport...']
        : ['Converting video...', '🎬 Gemini analyzing your swing...', '🎬 Building coaching report...']);

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

      // Call backend API (tier determines which engines run)
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
        tier,
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
                ? 'Filma din golfsving direkt eller välj en video från galleriet.'
                : 'Record your golf swing or choose a video from your gallery.'}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              {/* Record video — label+input for mobile */}
              <label className="kinetic-gradient text-on-primary-fixed font-bold py-4 px-8 rounded-full flex items-center justify-center gap-2 active:scale-95 duration-200 cursor-pointer shadow-[0_4px_20px_rgba(157,255,0,0.2)]">
                <span className="material-symbols-outlined">videocam</span>
                {language === 'sv' ? 'Filma din sving' : 'Record Swing'}
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
                {language === 'sv' ? 'Välj från galleri' : 'Choose from Gallery'}
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
          <div className="relative rounded-lg border-2 border-dashed border-outline-variant/30 bg-surface-container p-12 flex flex-col items-center justify-center text-center transition-all hover:border-primary-fixed/50 group mt-4">
            <div className="bg-primary-fixed/10 p-6 rounded-full mb-6 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-primary-fixed text-5xl">flight</span>
            </div>

            <h3 className="font-headline text-xl font-bold mb-2">
              {language === 'sv' ? 'Ball Tracker' : 'Ball Tracker'}
            </h3>
            <p className="text-on-surface-variant text-sm mb-6 max-w-xs">
              {language === 'sv'
                ? 'Spåra bollens flygbana med en neon-spårlinje. Spela in slaget bakifrån (Down the line).'
                : 'Track ball flight with a neon trail line. Record the shot from behind (Down the line).'}
            </p>

            <button
              onClick={() => onNavigate?.('balltracker')}
              className="border border-primary-fixed text-primary-fixed hover:bg-primary-fixed hover:text-on-primary-fixed font-bold py-4 px-8 rounded-full flex items-center justify-center gap-2 active:scale-95 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined">motion_sensor_active</span>
              {language === 'sv' ? 'Starta Ball Tracker' : 'Start Ball Tracker'}
            </button>
          </div>
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

      {/* STEP 3: Ready — video preview + tier + analyze */}
      {(step === 'ready' || step === 'analyzing' || step === 'coaching' || step === 'coaching_error') && frames && (
        <div className="space-y-5">
          {/* Guest Mode Banner */}
          {guestMode && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2.5 flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-400 text-sm animate-pulse">group</span>
              <span className="text-amber-300 text-xs font-bold uppercase tracking-widest">
                {language === 'sv' ? 'Gästläge — sparas ej' : 'Guest Mode — not saved'}
              </span>
            </div>
          )}

          {/* Video Preview */}
          {videoUrl && (
            <div className="relative rounded-xl overflow-hidden bg-surface-container border border-outline-variant/10">
              <video
                src={videoUrl}
                controls
                playsInline
                className="w-full max-h-[50vh] object-contain bg-black"
              />
              <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md rounded-lg px-3 py-1.5 border border-white/10">
                <span className="text-[10px] font-bold uppercase tracking-widest text-primary-fixed font-headline">
                  {language === 'sv' ? '✓ Video redo' : '✓ Video ready'}
                </span>
              </div>
            </div>
          )}

          {/* Tier Selector */}
          <div className="space-y-3">
            <p className="font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              {language === 'sv' ? 'Analystyp' : 'Analysis Type'}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {/* Basic */}
              <button
                onClick={() => setTier('basic')}
                className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                  tier === 'basic'
                    ? 'border-primary-fixed bg-primary-fixed/10'
                    : 'border-outline-variant/15 bg-surface-container hover:border-outline-variant/30'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🎬</span>
                  <span className="font-headline font-bold text-sm text-on-surface">
                    Basic
                  </span>
                </div>
                <p className="text-on-surface-variant text-[10px] leading-tight">
                  {language === 'sv' ? 'Gemini AI — videoanalys' : 'Gemini AI — video analysis'}
                </p>
                {tier === 'basic' && (
                  <span className="absolute top-2 right-2 material-symbols-filled text-primary-fixed text-sm">check_circle</span>
                )}
              </button>
              {/* Premium */}
              <button
                onClick={() => setTier('premium')}
                className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                  tier === 'premium'
                    ? 'border-secondary bg-secondary/10'
                    : 'border-outline-variant/15 bg-surface-container hover:border-outline-variant/30'
                }`}
              >
                <div className="absolute -top-2 right-3 px-2 py-0.5 bg-secondary text-on-secondary text-[8px] font-bold uppercase tracking-widest rounded-full">
                  PRO
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">⚡</span>
                  <span className="font-headline font-bold text-sm text-on-surface">
                    Premium
                  </span>
                </div>
                <p className="text-on-surface-variant text-[10px] leading-tight">
                  {language === 'sv' ? 'Dual Engine — Gemini + Claude' : 'Dual Engine — Gemini + Claude'}
                </p>
                {tier === 'premium' && (
                  <span className="absolute top-2 right-2 material-symbols-filled text-secondary text-sm">check_circle</span>
                )}
              </button>
            </div>
          </div>

          {/* Advanced Options (expandable) */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between text-on-surface-variant text-xs font-bold uppercase tracking-widest py-2 hover:text-on-surface transition-colors"
          >
            <span>{language === 'sv' ? 'Avancerat' : 'Advanced'}</span>
            <span className={`material-symbols-outlined text-sm transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>
              expand_more
            </span>
          </button>

          {showAdvanced && (
            <div className="space-y-5 bg-surface-container/50 rounded-xl p-4 border border-outline-variant/10">
              {/* Camera Angle Selector */}
              <div className="space-y-2">
                <p className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  {language === 'sv' ? 'Kameravinkel (auto-detect som standard)' : 'Camera Angle (auto-detect by default)'}
                </p>
                <div className="flex gap-2">
                  {[
                    { id: 'auto', label: 'Auto', icon: '🤖' },
                    { id: 'side', label: 'Side', icon: '👤' },
                    { id: 'front', label: 'Front', icon: '🧑' },
                    { id: 'dtl', label: 'DTL', icon: '🔄' },
                  ].map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setCameraAngle(a.id)}
                      className={`flex-1 py-2 px-1 rounded-full font-label text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
                        cameraAngle === a.id
                          ? 'bg-primary-fixed text-on-primary-fixed'
                          : 'bg-surface-container-high border border-outline-variant/20 text-on-surface-variant hover:border-primary-fixed'
                      }`}
                    >
                      <span className="text-xs">{a.icon}</span>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Frame Preview */}
              <div className="space-y-2">
                <p className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  {language === 'sv' ? 'Extraherade frames' : 'Extracted Frames'}
                </p>
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
                  {frames.map((frame, i) => (
                    <div key={i} className="flex-shrink-0 relative w-14 h-14 rounded-lg overflow-hidden border border-outline-variant/10">
                      <img
                        src={poseResults?.[i]?.overlayBase64 || frame.base64}
                        alt={`Frame ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[7px] text-center py-0.5 font-bold">
                        {getPhaseLabel(i, language === 'sv' ? 'sv' : 'en').split(' ')[0]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pose Analysis Button */}
              {!poseResults && step !== 'analyzing' && (
                <button
                  onClick={handleAnalyzePose}
                  className="w-full bg-surface-container-high text-on-surface h-10 rounded-full flex items-center justify-center gap-2 font-headline font-bold uppercase tracking-widest text-[10px] border border-outline-variant/20 hover:border-primary-fixed transition-all"
                >
                  <span className="material-symbols-outlined text-sm">body_system</span>
                  {language === 'sv' ? 'Kör lokal pose-analys (valfritt)' : 'Run local pose analysis (optional)'}
                </button>
              )}
              {poseResults && (
                <div className="flex items-center gap-2 text-primary-fixed text-xs">
                  <span className="material-symbols-filled text-sm">check_circle</span>
                  {language === 'sv' ? 'Pose-analys klar' : 'Pose analysis complete'}
                </div>
              )}
            </div>
          )}

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
                    {language === 'sv' ? 'Tryck nedan för att försöka igen.' : 'Press below to try again.'}
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

          {/* Main Action Buttons */}
          <div className="flex flex-col gap-4">
            {step !== 'coaching' && step !== 'coaching_error' && (
              <button
                onClick={handleGetCoaching}
                disabled={step === 'analyzing'}
                className="w-full kinetic-gradient text-on-primary-fixed h-16 rounded-full flex items-center justify-center gap-3 active:scale-[0.98] transition-all shadow-[0_10px_30px_rgba(157,255,0,0.2)] font-headline font-bold uppercase tracking-widest text-sm disabled:opacity-50"
              >
                <span className="material-symbols-filled">psychology</span>
                {tier === 'premium'
                  ? (language === 'sv' ? 'Analysera (Dual Engine)' : 'Analyze (Dual Engine)')
                  : (language === 'sv' ? 'Analysera sving' : 'Analyze Swing')}
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
