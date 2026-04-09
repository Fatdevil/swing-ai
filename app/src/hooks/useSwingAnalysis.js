import { useState, useCallback } from 'react';
import { getSetting } from './storage';
import { analyzeSwing, fileToBase64 } from './api';
import { getPhaseLabel } from './videoFrames';

export function useSwingAnalysis({ language, onAnalysisComplete }) {
  const [step, setStep] = useState('upload'); // extract -> analyzing -> ready -> coaching -> coaching_error
  const [progress, setProgress] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [error, setError] = useState(null);

  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [frames, setFrames] = useState(null);
  const [poseResults, setPoseResults] = useState(null);
  const [sequencingData, setSequencingData] = useState(null);

  const [cameraAngle, setCameraAngle] = useState('side');
  const [tier, setTier] = useState('premium');
  const [guestMode, setGuestMode] = useState(false);

  const extractVideoFrames = async (file) => {
    setStep('extracting');
    setProgress(language === 'sv' ? 'Extraherar nyckelframes...' : 'Extracting key frames...');
    try {
      const { extractFrames } = await import('./videoFrames.js');
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

  const handleFileSelect = useCallback((file) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setError(language === 'sv' ? 'Välj en videofil.' : 'Please select a video file.');
      return;
    }
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setError(null);
    extractVideoFrames(file);
  }, [language]);

  const handleAnalyzePose = async () => {
    if (!frames) return;
    setStep('analyzing');
    try {
      const { analyzePose, drawSkeleton } = await import('./mediapipe.js');
      const { calculateAllAngles } = await import('./angles.js');
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

        const poseResult = await analyzePose(img);
        const landmarks2D = poseResult?.landmarks || null;
        const worldLandmarks = poseResult?.worldLandmarks || null;

        const angleInput = worldLandmarks || landmarks2D;
        const measurements = angleInput ? calculateAllAngles(angleInput) : null;

        let overlayBase64 = null;
        if (landmarks2D) {
          const { drawAnnotations } = await import('./swingAnnotations.js');
          const canvas = document.createElement('canvas');
          canvas.width = frames[i].width;
          canvas.height = frames[i].height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          drawSkeleton(ctx, landmarks2D, canvas.width, canvas.height);
          if (measurements) {
            const phase = frames[i].phase || getPhaseLabel(i, 'en');
            drawAnnotations(ctx, landmarks2D, measurements, canvas.width, canvas.height, phase);
          }
          overlayBase64 = canvas.toDataURL('image/jpeg', 0.85);
        }

        results.push({
          frameIndex: i,
          phase: frames[i].phase || getPhaseLabel(i, 'en'),
          phaseSv: getPhaseLabel(i, 'sv'),
          phaseConfidence: frames[i].phaseConfidence || null,
          landmarks: landmarks2D,
          measurements,
          overlayBase64,
          originalBase64: frames[i].base64,
          timestamp: frames[i].timestamp,
        });
      }

      let seqData = null;
      try {
        const { analyzeSequencing } = await import('./kinematicSequencing.js');
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

    if (tier === 'basic' && !videoFile) {
      setError(language === 'sv'
        ? 'Videon saknas — spela in eller ladda upp en ny video innan analys.'
        : 'Video missing — record or upload a new video before analysis.');
      setStep('coaching_error');
      return;
    }

    const progressSteps = tier === 'premium'
      ? [
          { pct: 5,  msg: language === 'sv' ? 'Konverterar video...' : 'Converting video...' },
          { pct: 20, msg: language === 'sv' ? '📤 Laddar upp till API...' : '📤 Uploading to API...' },
          { pct: 35, msg: language === 'sv' ? '🎬 Gemini analyserar rörelse...' : '🎬 Gemini analyzing motion...' },
          { pct: 55, msg: language === 'sv' ? '📐 Claude analyserar positioner...' : '📐 Claude analyzing positions...' },
          { pct: 75, msg: language === 'sv' ? '🧠 Sammanfattar coaching-rapport...' : '🧠 Building coaching report...' },
          { pct: 90, msg: language === 'sv' ? '✨ Bygger resultat...' : '✨ Building results...' },
        ]
      : [
          { pct: 5,  msg: language === 'sv' ? 'Konverterar video...' : 'Converting video...' },
          { pct: 20, msg: language === 'sv' ? '📤 Laddar upp till API...' : '📤 Uploading to API...' },
          { pct: 45, msg: language === 'sv' ? '🎬 Gemini analyserar din sving...' : '🎬 Gemini analyzing your swing...' },
          { pct: 75, msg: language === 'sv' ? '🎬 Bygger coaching-rapport...' : '🎬 Building coaching report...' },
          { pct: 90, msg: language === 'sv' ? '✨ Bygger resultat...' : '✨ Building results...' },
        ];

    let stepIdx = 0;
    setProgress(progressSteps[0].msg);
    setProgressPercent(progressSteps[0].pct);
    const progressTimer = setInterval(() => {
      stepIdx++;
      if (stepIdx < progressSteps.length) {
        setProgress(progressSteps[stepIdx].msg);
        setProgressPercent(progressSteps[stepIdx].pct);
      }
    }, 5000);

    try {
      const { createVideoThumbnail } = await import('./videoFrames.js');

      let videoBase64 = null;
      // We still map file to base64 for fallback or direct upload formats depending on backend needs.
      // Note: backend api.js handles converting Blob to FormData now.
      if (videoFile) {
        videoBase64 = videoFile; // api.js supports accepting a File object natively now!
      }

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

      let knowledgeBase = '';
      let coachingProfile = '';
      let coachingHistory = '';
      try {
        const { buildKnowledgeBasePrompt } = await import('./golfKnowledge.js');
        knowledgeBase = buildKnowledgeBasePrompt(language);
      } catch { /* optional */ }
      if (!guestMode) {
        try {
          const profileStr = getSetting('coaching_profile');
          if (profileStr) coachingProfile = profileStr;
        } catch { /* optional */ }
        try {
          const { getCoachingHistory, buildCoachingHistoryPrompt } = await import('./coachingHistory.js');
          const history = await getCoachingHistory();
          coachingHistory = buildCoachingHistoryPrompt(history, language);
        } catch { /* optional */ }
      }

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
      setProgressPercent(95);

      const thumbnail = await createVideoThumbnail(frames);

      const analysisData = {
        videoFile: null, 
        imageThumbnail: thumbnail,
        frames: poseResults || [],
        measurements: poseResults?.[0]?.measurements,
        coaching: result,
        totalScore: result.totalScore, // Claude/Gemini totalScore
        cameraAngle,
        sequencing: sequencingData || null,
        timestamp: Date.now(),
      };

      if (!guestMode) {
        const { saveAnalysis } = await import('./storage.js');
        await saveAnalysis(analysisData);

        // Calculate Swing Score v2 but don't blindly overwrite Claude totalScore (Point 8)
        try {
          const { calculateSwingScore, checkPersonalBests, calculateDeltas } = await import('./swingScore.js');
          const mediapipeData = poseResults?.[0]?.measurements || null;
          const swingScoreV2 = calculateSwingScore(result, mediapipeData, sequencingData);
          const { newRecords, personalBests } = checkPersonalBests(swingScoreV2);
          const deltas = await calculateDeltas(swingScoreV2);

          analysisData.swingScore = swingScoreV2;
          analysisData.newRecords = newRecords;
          analysisData.personalBests = personalBests;
          analysisData.deltas = deltas;
          
          if (!analysisData.totalScore && swingScoreV2.totalScore) {
             analysisData.totalScore = swingScoreV2.totalScore;
          }
        } catch (scoreErr) {
          console.warn('Swing Score v2 calculation skipped:', scoreErr.message);
        }

        // Only generate plans and add drills if not guest mode!
        if (result.recommendedDrill?.id) {
          const { addDrill } = await import('./coachingHistory.js');
          addDrill(result.recommendedDrill.id, result.recommendedDrill.reason || '');
        }

        try {
          const { generatePlan } = await import('./trainingPlan.js');
          const profile = getSetting('coaching_profile') || {};
          generatePlan(result, profile, language);
        } catch (planErr) {
          console.warn('Training plan generation skipped:', planErr.message);
        }
      }

      onAnalysisComplete(analysisData);
    } catch (err) {
      clearInterval(progressTimer);
      console.error('Coaching failed:', err);

      if (err.message?.includes('429') && retryAttempt < 1) {
        setProgress(language === 'sv' ? 'Rate limit — försöker igen om 3s...' : 'Rate limited — retrying in 3s...');
        setTimeout(() => handleGetCoaching(retryAttempt + 1), 3000);
        return;
      }

      setError(err.message || 'Ett fel uppstod');
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
    setSequencingData(null);
    setCameraAngle('side');
    setStep('upload');
    setError(null);
    setProgress('');
    setGuestMode(false);
  };

  return {
    step,
    setStep,
    progress,
    progressPercent,
    error,
    videoFile,
    videoUrl,
    frames,
    poseResults,
    sequencingData,
    tier,
    setTier,
    cameraAngle,
    setCameraAngle,
    guestMode,
    setGuestMode,
    handleFileSelect,
    handleAnalyzePose,
    handleGetCoaching,
    resetAll,
  };
}
