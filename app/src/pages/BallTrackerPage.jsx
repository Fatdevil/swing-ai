import { useState, useRef, useCallback, useEffect } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { detectBallFlight, interpolateTrajectory, drawBallTrail, getCameraOffset } from '../utils/ballTracker';
import { createBallLockDetector, LOCK_STATE } from '../utils/ballLockDetector';

/**
 * BallTrackerPage — Record/upload video → detect ball flight → animated replay with trail
 * Now with real-time ball lock targeting ring in viewfinder.
 */
export default function BallTrackerPage({ onBack }) {
  const { language } = useLanguage();
  const [step, setStep] = useState('capture'); // capture | viewfinder | processing | replay
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [progress, setProgress] = useState({ percent: 0, message: '' });
  const [trackData, setTrackData] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showTrail, setShowTrail] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  // Ball Lock state
  const [lockState, setLockState] = useState(LOCK_STATE.SEARCHING);
  const [lockConfidence, setLockConfidence] = useState(0);
  const [seedPosition, setSeedPosition] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const fileInputRef = useRef(null);
  const liveVideoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  // Ball lock detector refs
  const lockDetectorRef = useRef(null);
  const lockCanvasRef = useRef(null); // Scratch canvas for pixel analysis
  const lockLoopRef = useRef(null);
  const lockOverlayCanvasRef = useRef(null); // Canvas overlay for drawing ring

  const t = (sv, en) => language === 'sv' ? sv : en;

  // Ring configuration
  const RING_RADIUS = 35; // CSS pixels
  // Ring position: slightly right of center, lower third (where ball on tee typically is)
  const getRingPosition = (containerWidth, containerHeight) => ({
    x: containerWidth * 0.5,
    y: containerHeight * 0.55,
  });


  // -- CAPTURE STEP --

  const handleFileSelect = (file) => {
    if (!file || !file.type.startsWith('video/')) return;
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
  };

  // -- CAMERA VIEWFINDER --

  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
        audio: false,
      });
      streamRef.current = stream;
      setStep('viewfinder');

      // Initialize ball lock detector
      lockDetectorRef.current = createBallLockDetector({ ringRadius: RING_RADIUS });
      if (!lockCanvasRef.current) {
        lockCanvasRef.current = document.createElement('canvas');
      }

      // Attach stream to live video element after render
      setTimeout(() => {
        if (liveVideoRef.current) {
          liveVideoRef.current.srcObject = stream;
          liveVideoRef.current.play().catch(() => {});

          // Start lock detection loop once video is playing
          liveVideoRef.current.onplaying = () => {
            startLockLoop();
          };
        }
      }, 50);
    } catch (err) {
      console.error('Camera access error:', err);
    }
  };

  // Real-time ball lock analysis loop (runs at ~20fps for efficiency)
  const startLockLoop = () => {
    if (lockLoopRef.current) cancelAnimationFrame(lockLoopRef.current);

    let frameCount = 0;
    const loop = () => {
      frameCount++;
      // Run analysis every 3rd frame (~20fps on 60fps display) for efficiency
      if (frameCount % 3 === 0 && liveVideoRef.current && lockDetectorRef.current && lockCanvasRef.current) {
        const video = liveVideoRef.current;
        const overlayCanvas = lockOverlayCanvasRef.current;

        if (video.videoWidth > 0 && overlayCanvas) {
          const displayW = overlayCanvas.clientWidth;
          const displayH = overlayCanvas.clientHeight;
          const ringPos = getRingPosition(displayW, displayH);

          const result = lockDetectorRef.current.analyze(
            video,
            lockCanvasRef.current,
            ringPos.x,
            ringPos.y,
            displayW,
            displayH
          );

          setLockState(result.state);
          setLockConfidence(result.confidence);

          if (result.state === LOCK_STATE.LOCKED && result.ballCenter) {
            setSeedPosition(result.ballCenter);
          }

          // Draw ring overlay
          drawLockRing(overlayCanvas, ringPos, result.state, result.confidence);
        }
      }

      lockLoopRef.current = requestAnimationFrame(loop);
    };
    lockLoopRef.current = requestAnimationFrame(loop);
  };

  // Draw the targeting ring with state-based styling
  const drawLockRing = (canvas, ringPos, state, confidence) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // Set canvas size to match display
    const displayW = canvas.clientWidth;
    const displayH = canvas.clientHeight;
    if (canvas.width !== displayW * dpr || canvas.height !== displayH * dpr) {
      canvas.width = displayW * dpr;
      canvas.height = displayH * dpr;
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, displayW, displayH);

    const { x, y } = ringPos;
    const r = RING_RADIUS;
    const time = performance.now() / 1000;

    // Colors based on state
    let ringColor, glowColor, glowIntensity, lineWidth;

    if (state === LOCK_STATE.LOCKED) {
      ringColor = '#00FF66';
      glowColor = 'rgba(0, 255, 102, 0.4)';
      glowIntensity = 20 + Math.sin(time * 3) * 8; // Gentle pulse
      lineWidth = 3;
    } else if (state === LOCK_STATE.ACQUIRING) {
      ringColor = '#FFD700';
      glowColor = 'rgba(255, 215, 0, 0.3)';
      glowIntensity = 12;
      lineWidth = 2.5;
    } else {
      ringColor = 'rgba(255, 80, 80, 0.7)';
      glowColor = 'rgba(255, 80, 80, 0.15)';
      glowIntensity = 6;
      lineWidth = 2;
    }

    // Outer glow
    ctx.shadowColor = ringColor;
    ctx.shadowBlur = glowIntensity;

    // Ring background fill (very subtle)
    ctx.fillStyle = glowColor;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Main ring
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    // Corner brackets (targeting reticle)
    ctx.shadowBlur = 0;
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 2.5;
    const bracketLen = 10;
    const bracketOffset = r + 6;

    // Top-left
    ctx.beginPath();
    ctx.moveTo(x - bracketOffset, y - bracketOffset + bracketLen);
    ctx.lineTo(x - bracketOffset, y - bracketOffset);
    ctx.lineTo(x - bracketOffset + bracketLen, y - bracketOffset);
    ctx.stroke();
    // Top-right
    ctx.beginPath();
    ctx.moveTo(x + bracketOffset - bracketLen, y - bracketOffset);
    ctx.lineTo(x + bracketOffset, y - bracketOffset);
    ctx.lineTo(x + bracketOffset, y - bracketOffset + bracketLen);
    ctx.stroke();
    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(x - bracketOffset, y + bracketOffset - bracketLen);
    ctx.lineTo(x - bracketOffset, y + bracketOffset);
    ctx.lineTo(x - bracketOffset + bracketLen, y + bracketOffset);
    ctx.stroke();
    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(x + bracketOffset - bracketLen, y + bracketOffset);
    ctx.lineTo(x + bracketOffset, y + bracketOffset);
    ctx.lineTo(x + bracketOffset, y + bracketOffset - bracketLen);
    ctx.stroke();

    // Confidence arc (progress indicator around ring)
    if (state !== LOCK_STATE.SEARCHING && confidence > 0) {
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.shadowColor = ringColor;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      const startAngle = -Math.PI / 2;
      const endAngle = startAngle + (Math.PI * 2 * confidence);
      ctx.arc(x, y, r + 3, startAngle, endAngle);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    // Lock text
    ctx.shadowBlur = 0;
    if (state === LOCK_STATE.LOCKED) {
      ctx.fillStyle = '#00FF66';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('● LOCKED', x, y - r - 14);
    } else if (state === LOCK_STATE.ACQUIRING) {
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ACQUIRING...', x, y - r - 14);
    }

    // Crosshair dot in center (tiny)
    ctx.fillStyle = ringColor;
    ctx.beginPath();
    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  };

  // Ref for aborting tracking
  const trackingAbortRef = useRef(null);

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];

    // Snapshot seed position from lock detector (if locked)
    const currentSeed = lockDetectorRef.current?.getSeedPosition() || null;

    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm',
    });
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      closeCamera();
      // Set video file and go DIRECTLY to processing (skip capture step)
      setVideoFile(blob);
      setVideoUrl(URL.createObjectURL(blob));
      setSeedPosition(currentSeed);
      // Start tracking immediately
      startTrackingDirect(blob, currentSeed);
    };

    recorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setIsRecording(true);
    setRecordingTime(0);

    // Timer
    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => prev + 1);
    }, 1000);

    // Safety auto-stop at 30 seconds
    setTimeout(() => {
      if (mediaRecorder.state === 'recording') {
        stopRecording();
      }
    }, 30000);
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // Stop lock detection loop
    if (lockLoopRef.current) {
      cancelAnimationFrame(lockLoopRef.current);
      lockLoopRef.current = null;
    }
    if (lockDetectorRef.current) {
      lockDetectorRef.current.reset();
    }
    setIsRecording(false);
    setRecordingTime(0);
    setLockState(LOCK_STATE.SEARCHING);
    setLockConfidence(0);
  };

  const cancelViewfinder = () => {
    closeCamera();
    setStep('capture');
  };

  // Direct-start tracking (called from recording onstop)
  const startTrackingDirect = async (blob, seed) => {
    setStep('processing');
    setProgress({ percent: 0, message: '' });

    try {
      const result = await detectBallFlight(blob, (percent, message) => {
        setProgress({ percent, message });
      });

      // Check if tracking was cancelled
      if (trackingAbortRef.current?.aborted) {
        trackingAbortRef.current = null;
        return;
      }

      const trajectory = result.trajectory.length >= 2
        ? interpolateTrajectory(result.trajectory, Math.floor(result.duration * result.fps), result.fps)
        : result.trajectory;

      setTrackData({ ...result, trajectory });
      setStep('replay');
    } catch (err) {
      if (trackingAbortRef.current?.aborted) {
        trackingAbortRef.current = null;
        return; // User cancelled — don't show error
      }
      console.error('Ball tracking error:', err);
      setStep('capture');
    }
  };

  // Manual tracking start (from upload flow or retry)
  const handleStartTracking = async () => {
    if (!videoFile) return;
    trackingAbortRef.current = new AbortController();
    await startTrackingDirect(videoFile, seedPosition);
  };

  // Cancel tracking during processing
  const cancelTracking = () => {
    if (trackingAbortRef.current) {
      trackingAbortRef.current.abort();
    }
    setStep('capture');
    setProgress({ percent: 0, message: '' });
  };

  // -- REPLAY STEP --

  const playReplay = useCallback(() => {
    if (!trackData || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    canvas.width = trackData.width;
    canvas.height = trackData.height;

    video.currentTime = 0;
    video.play();
    setIsPlaying(true);

    const animate = () => {
      if (video.paused || video.ended) {
        setIsPlaying(false);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (showTrail && trackData.trajectory.length >= 2) {
        // Find how far into the trajectory we are based on video time
        const currentTime = video.currentTime;
        let trailIdx = 0;
        for (let i = 0; i < trackData.trajectory.length; i++) {
          if (trackData.trajectory[i].time <= currentTime) {
            trailIdx = i;
          }
        }

        // Get the camera offset for the current frame so the trail stays pinned
        const offset = getCameraOffset(trackData.motionOffsets, currentTime);
        drawBallTrail(ctx, trackData.trajectory, trailIdx, canvas.width, canvas.height, offset, trackData.launchData);
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [trackData, showTrail]);

  const pauseReplay = () => {
    if (videoRef.current) videoRef.current.pause();
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    setIsPlaying(false);
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      closeCamera();
    };
  }, [videoUrl]);

  // Auto-draw final frame when replay loads
  useEffect(() => {
    if (step === 'replay' && trackData && canvasRef.current && videoRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width = trackData.width;
      canvas.height = trackData.height;

      video.onloadeddata = () => {
        const lastTime = trackData.trajectory.length > 0
          ? trackData.trajectory[trackData.trajectory.length - 1].time
          : 0;
        video.currentTime = lastTime;
        video.onseeked = () => {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          if (trackData.trajectory.length >= 2) {
            const offset = getCameraOffset(trackData.motionOffsets, lastTime);
            drawBallTrail(ctx, trackData.trajectory, trackData.trajectory.length - 1, canvas.width, canvas.height, offset, trackData.launchData);
          }
        };
      };
    }
  }, [step, trackData]);

  return (
    <div className="px-6 pt-8 pb-8 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <h1 className="font-headline text-2xl font-black text-primary-fixed">
              {t('Ball Tracker', 'Ball Tracker')}
            </h1>
            <p className="text-on-surface-variant text-[10px] uppercase tracking-widest font-bold">
              {t('Bollflygningsspårning', 'Ball Flight Tracking')}
            </p>
          </div>
        </div>
        <div className="bg-primary-fixed/10 p-2.5 rounded-full">
          <span className="material-symbols-filled text-primary-fixed text-2xl">flight</span>
        </div>
      </div>

      {/* CAPTURE STEP */}
      {step === 'capture' && (
        <div className="space-y-6">
          {/* Tips */}
          <div className="glass-panel rounded-lg p-5 space-y-3">
            <h3 className="font-headline font-bold text-sm text-primary-fixed flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">tips_and_updates</span>
              {t('Tips för bästa resultat', 'Tips for Best Results')}
            </h3>
            <ul className="text-on-surface-variant text-xs space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-primary-fixed mt-0.5">•</span>
                {t('Filma bakifrån golfaren (Down the Line)', 'Film from behind the golfer (Down the Line)')}
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-fixed mt-0.5">•</span>
                {t('Klar himmel = bäst kontrast', 'Clear sky = best contrast')}
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-fixed mt-0.5">•</span>
                {t('Du kan följa bollen med kameran — linjen stannar kvar!', 'You can follow the ball with the camera — the trail stays put!')}
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-fixed mt-0.5">•</span>
                {t('60fps eller slow-motion ger bäst spårning', '60fps or slow-motion gives best tracking')}
              </li>
            </ul>
          </div>

          {/* Video preview */}
          {videoUrl && (
            <div className="relative rounded-lg overflow-hidden border border-primary-fixed/20">
              <video
                src={videoUrl}
                className="w-full h-auto max-h-[300px] object-contain bg-black"
                controls
                playsInline
              />
              <div className="absolute top-3 right-3">
                <button
                  onClick={() => { setVideoFile(null); setVideoUrl(null); }}
                  className="bg-black/50 backdrop-blur-md p-1.5 rounded-full"
                >
                  <span className="material-symbols-outlined text-white text-sm">close</span>
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {!videoUrl ? (
            <div className="space-y-4">
              {/* Record */}
              <button
                onClick={openCamera}
                className="w-full kinetic-gradient text-on-primary-fixed h-16 rounded-full flex items-center justify-center gap-3 font-headline font-bold uppercase tracking-widest text-sm active:scale-[0.98] transition-all shadow-[0_4px_20px_rgba(157,255,0,0.2)]"
              >
                <span className="material-symbols-filled text-xl">videocam</span>
                {t('Öppna kameran', 'Open Camera')}
              </button>

              {/* Upload */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-surface-container-high h-14 rounded-full flex items-center justify-center gap-3 font-headline font-bold uppercase tracking-widest text-xs text-on-surface border border-outline-variant/15 hover:border-primary-fixed/20 transition-all"
              >
                <span className="material-symbols-outlined">upload</span>
                {t('Ladda upp video', 'Upload Video')}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
              />
            </div>
          ) : (
            <button
              onClick={handleStartTracking}
              className="w-full kinetic-gradient text-on-primary-fixed h-16 rounded-full flex items-center justify-center gap-3 font-headline font-bold uppercase tracking-widest text-sm active:scale-[0.98] transition-all shadow-[0_4px_20px_rgba(157,255,0,0.2)]"
            >
              <span className="material-symbols-filled text-xl">radar</span>
              {t('Spåra bollen', 'Track Ball')}
            </button>
          )}
        </div>
      )}

      {/* VIEWFINDER STEP */}
      {step === 'viewfinder' && (
        <div className="space-y-4">
          {/* Live camera feed with targeting ring overlay */}
          <div className="relative rounded-lg overflow-hidden border-2 bg-black"
            style={{ borderColor: lockState === LOCK_STATE.LOCKED ? 'rgba(0,255,102,0.3)' :
                                   lockState === LOCK_STATE.ACQUIRING ? 'rgba(255,215,0,0.2)' :
                                   'rgba(255,255,255,0.1)' }}
          >
            <video
              ref={liveVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-auto max-h-[400px] object-cover"
              style={{ transform: 'scaleX(1)' }}
            />

            {/* Canvas overlay for targeting ring — positioned exactly over video */}
            <canvas
              ref={lockOverlayCanvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ zIndex: 10 }}
            />

            {/* Recording indicator */}
            {isRecording && (
              <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur-md rounded-full px-3 py-1.5 border border-red-500/30" style={{ zIndex: 20 }}>
                <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(255,0,0,0.6)]" />
                <span className="text-white text-xs font-bold font-mono">
                  {String(Math.floor(recordingTime / 60)).padStart(2, '0')}:{String(recordingTime % 60).padStart(2, '0')}
                </span>
              </div>
            )}

            {/* Close button */}
            <button
              onClick={cancelViewfinder}
              className="absolute top-4 right-4 bg-black/50 backdrop-blur-md p-2 rounded-full border border-white/10 hover:bg-black/70 transition-colors"
              style={{ zIndex: 20 }}
            >
              <span className="material-symbols-outlined text-white text-xl">close</span>
            </button>

            {/* Lock status badge */}
            {!isRecording && (
              <div
                className="absolute bottom-4 left-1/2 -translate-x-1/2 backdrop-blur-md rounded-full px-4 py-2 border transition-all duration-300"
                style={{
                  zIndex: 20,
                  backgroundColor: lockState === LOCK_STATE.LOCKED ? 'rgba(0,255,102,0.15)' :
                                   lockState === LOCK_STATE.ACQUIRING ? 'rgba(255,215,0,0.1)' :
                                   'rgba(0,0,0,0.5)',
                  borderColor: lockState === LOCK_STATE.LOCKED ? 'rgba(0,255,102,0.3)' :
                               lockState === LOCK_STATE.ACQUIRING ? 'rgba(255,215,0,0.2)' :
                               'rgba(255,255,255,0.1)',
                }}
              >
                <span
                  className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"
                  style={{
                    color: lockState === LOCK_STATE.LOCKED ? '#00FF66' :
                           lockState === LOCK_STATE.ACQUIRING ? '#FFD700' :
                           'rgba(255,255,255,0.5)',
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: lockState === LOCK_STATE.LOCKED ? '#00FF66' :
                                       lockState === LOCK_STATE.ACQUIRING ? '#FFD700' :
                                       'rgba(255,80,80,0.7)',
                      boxShadow: lockState === LOCK_STATE.LOCKED ? '0 0 8px rgba(0,255,102,0.6)' :
                                 lockState === LOCK_STATE.ACQUIRING ? '0 0 6px rgba(255,215,0,0.4)' :
                                 'none',
                      animation: lockState === LOCK_STATE.LOCKED ? 'pulse 1.5s ease-in-out infinite' :
                                 lockState === LOCK_STATE.ACQUIRING ? 'pulse 2s ease-in-out infinite' :
                                 'none',
                    }}
                  />
                  {lockState === LOCK_STATE.LOCKED
                    ? t('Boll låst — Redo att spela in!', 'Ball Locked — Ready to record!')
                    : lockState === LOCK_STATE.ACQUIRING
                    ? t('Söker boll...', 'Acquiring ball...')
                    : t('Rikta ringen mot bollen', 'Aim ring at the ball')}
                </span>
              </div>
            )}
          </div>

          {/* Record / Stop buttons */}
          {!isRecording ? (
            <button
              onClick={startRecording}
              className={`w-full h-16 rounded-full flex items-center justify-center gap-3 font-headline font-bold uppercase tracking-widest text-sm active:scale-[0.98] transition-all ${
                lockState === LOCK_STATE.LOCKED
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-[0_4px_20px_rgba(0,255,102,0.3)]'
                  : 'bg-red-500 hover:bg-red-600 text-white shadow-[0_4px_20px_rgba(255,0,0,0.3)]'
              }`}
            >
              {lockState === LOCK_STATE.LOCKED ? (
                <>
                  <span className="material-symbols-filled text-xl">radio_button_checked</span>
                  {t('Spela in', 'Record')}
                </>
              ) : (
                <>
                  <span className="w-5 h-5 rounded-full bg-white" />
                  {t('Spela in', 'Record')}
                </>
              )}
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="w-full h-16 rounded-full flex items-center justify-center gap-3 font-headline font-bold uppercase tracking-widest text-sm active:scale-[0.98] transition-all bg-surface-container-high border-2 border-red-500 text-red-400 hover:bg-red-500/10"
            >
              <span className="w-5 h-5 rounded bg-red-500" />
              {t('Stoppa inspelning', 'Stop Recording')}
            </button>
          )}

          {/* Timer info */}
          <p className="text-center text-on-surface-variant text-[10px] uppercase tracking-widest">
            {t('Max 30 sek • Rikta ringen mot bollen för bäst spårning', 'Max 30 sec • Aim ring at ball for best tracking')}
          </p>
        </div>
      )}


      {/* PROCESSING STEP */}
      {step === 'processing' && (
        <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-8">
          {/* Animated radar */}
          <div className="relative w-40 h-40">
            <div className="absolute inset-0 rounded-full border-2 border-primary-fixed/20" />
            <div className="absolute inset-4 rounded-full border border-primary-fixed/10" />
            <div className="absolute inset-8 rounded-full border border-primary-fixed/5" />
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(from 0deg, transparent 0%, rgba(157,255,0,0.3) 30%, transparent 35%)`,
                animation: 'spin 2s linear infinite',
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-3xl font-black text-primary-fixed font-headline drop-shadow-[0_0_10px_rgba(157,255,0,0.5)]">
                {progress.percent}%
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full max-w-xs space-y-2">
            <div className="h-1.5 bg-surface-container-high rounded-full overflow-hidden">
              <div
                className="h-full kinetic-gradient rounded-full transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className="text-on-surface-variant text-xs text-center font-medium">
              {progress.message}
            </p>
          </div>

          {/* Cancel button */}
          <button
            onClick={cancelTracking}
            className="mt-4 px-6 py-2.5 rounded-full border border-outline-variant/30 text-on-surface-variant text-xs font-bold uppercase tracking-widest hover:text-error hover:border-error/30 transition-all"
          >
            {t('Avbryt spårning', 'Cancel Tracking')}
          </button>
        </div>
      )}

      {/* REPLAY STEP */}
      {step === 'replay' && trackData && (
        <div className="space-y-4">
          {/* Canvas overlay */}
          <div className="relative rounded-lg overflow-hidden bg-black border border-outline-variant/10">
            <video
              ref={videoRef}
              src={trackData.videoUrl}
              className="absolute inset-0 w-full h-full object-contain opacity-0"
              playsInline
              muted
            />
            <canvas
              ref={canvasRef}
              className="w-full h-auto"
              style={{ maxHeight: '450px', objectFit: 'contain' }}
            />

            {/* Overlay HUD */}
            <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md rounded-lg px-3 py-1.5 border border-white/10">
              <span className="text-[10px] font-bold text-primary-fixed uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-fixed animate-pulse shadow-[0_0_6px_#9dff00]" />
                Ball Tracker
              </span>
            </div>

            {trackData.trajectory.length >= 2 && (
              <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md rounded-lg px-3 py-1.5 border border-white/10">
                <span className="text-[10px] font-bold text-on-surface uppercase tracking-widest">
                  {trackData.trajectory.length} {t('punkter', 'points')}
                </span>
              </div>
            )}
          </div>

          {/* Status */}
          {trackData.trajectory.length < 2 && (
            <div className="bg-error/10 border border-error/20 rounded-lg p-4 text-center">
              <span className="material-symbols-outlined text-error text-xl mb-1 block">info</span>
              <p className="text-error text-sm font-medium">
                {t(
                  'Kunde inte spåra bollen tydligt. Prova med bättre kontrast (klar himmel) eller närmre vinkel.',
                  'Could not clearly track the ball. Try with better contrast (clear sky) or closer angle.'
                )}
              </p>
            </div>
          )}

          {trackData.trajectory.length >= 2 && (
            <div className="space-y-3">
              {/* Success message */}
              <div className="bg-primary-fixed/5 border border-primary-fixed/15 rounded-lg p-4 text-center">
                <span className="material-symbols-outlined text-primary-fixed text-xl mb-1 block">check_circle</span>
                <p className="text-primary-fixed text-sm font-medium">
                  {t(
                    `Bollflykt spårad! ${trackData.trajectory.filter((p) => p.source === 'detected').length} detekterade + ${trackData.trajectory.filter((p) => p.source === 'predicted').length} predikterade`,
                    `Ball flight tracked! ${trackData.trajectory.filter((p) => p.source === 'detected').length} detected + ${trackData.trajectory.filter((p) => p.source === 'predicted').length} predicted`
                  )}
                </p>
              </div>

              {/* Launch Data Card */}
              {trackData.launchData?.valid && (
                <div className="glass-panel rounded-xl p-5 space-y-4">
                  <h3 className="font-headline font-bold text-xs text-primary-fixed uppercase tracking-widest flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">speed</span>
                    {t('Flygdata', 'Flight Data')}
                  </h3>

                  {/* Stats grid */}
                  <div className="grid grid-cols-3 gap-3">
                    {/* Launch Angle */}
                    <div className="bg-surface-container rounded-lg p-3 text-center">
                      <p className="text-primary-fixed font-headline font-black text-xl">
                        {trackData.launchData.launchAngle}°
                      </p>
                      <p className="text-on-surface-variant text-[9px] uppercase tracking-widest font-bold mt-1">
                        {t('Vinkel (est)', 'Launch angle (est)')}
                      </p>
                    </div>

                    {/* Estimated Speed */}
                    <div className="bg-surface-container rounded-lg p-3 text-center">
                      <p className="text-primary-fixed font-headline font-black text-xl">
                        {trackData.launchData.estimatedSpeedKmh}
                      </p>
                      <p className="text-on-surface-variant text-[9px] uppercase tracking-widest font-bold mt-1">
                        {t('km/h (est)', 'km/h (est)')}
                      </p>
                    </div>

                    {/* Shot Shape */}
                    <div className="bg-surface-container rounded-lg p-3 text-center">
                      <p className="text-primary-fixed font-headline font-black text-lg capitalize">
                        {trackData.launchData.shotShape}
                      </p>
                      <p className="text-on-surface-variant text-[9px] uppercase tracking-widest font-bold mt-1">
                        {t('Form (est)', 'Shape (est)')}
                      </p>
                    </div>

                    {/* Apex */}
                    <div className="bg-surface-container rounded-lg p-3 text-center">
                      <p className="text-cyan-400 font-headline font-black text-xl">
                        {trackData.launchData.apex.heightPixels}
                      </p>
                      <p className="text-on-surface-variant text-[9px] uppercase tracking-widest font-bold mt-1">
                        {t('Apex (px, est)', 'Apex (px, est)')}
                      </p>
                    </div>

                    {/* Carry */}
                    <div className="bg-surface-container rounded-lg p-3 text-center">
                      <p className="text-amber-400 font-headline font-black text-xl">
                        {trackData.launchData.landing.distancePixels}
                      </p>
                      <p className="text-on-surface-variant text-[9px] uppercase tracking-widest font-bold mt-1">
                        {t('Carry (px, est)', 'Carry (px, est)')}
                      </p>
                    </div>

                    {/* Flight time */}
                    <div className="bg-surface-container rounded-lg p-3 text-center">
                      <p className="text-on-surface font-headline font-black text-xl">
                        {trackData.launchData.flightTime}s
                      </p>
                      <p className="text-on-surface-variant text-[9px] uppercase tracking-widest font-bold mt-1">
                        {t('Flygtid (est)', 'Flight time (est)')}
                      </p>
                    </div>
                  </div>

                  {/* Quality bar */}
                  {trackData.quality != null && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] uppercase tracking-widest font-bold text-on-surface-variant">
                          {t('Spårningskvalitet', 'Tracking Quality')}
                        </span>
                        <span className={`text-xs font-black font-headline ${
                          trackData.quality >= 70 ? 'text-primary-fixed' :
                          trackData.quality >= 40 ? 'text-amber-400' : 'text-error'
                        }`}>{trackData.quality}/100</span>
                      </div>
                      <div className="h-1.5 bg-surface-container rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            trackData.quality >= 70 ? 'bg-primary-fixed' :
                            trackData.quality >= 40 ? 'bg-amber-400' : 'bg-error'
                          }`}
                          style={{ width: `${trackData.quality}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <p className="text-on-surface-variant text-[9px] italic">
                    {t('Hastighet och carry är estimerade värden (ej kalibrerad kamera)', 'Speed and carry are estimated values (uncalibrated camera)')}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Controls */}
          <div className="flex gap-3">
            <button
              onClick={isPlaying ? pauseReplay : playReplay}
              disabled={trackData.trajectory.length < 2}
              className="flex-1 kinetic-gradient text-on-primary-fixed h-14 rounded-full flex items-center justify-center gap-2 font-headline font-bold uppercase tracking-widest text-sm active:scale-[0.98] disabled:opacity-30"
            >
              <span className="material-symbols-filled">
                {isPlaying ? 'pause' : 'play_arrow'}
              </span>
              {isPlaying ? t('Pausa', 'Pause') : t('Spela upp', 'Play')}
            </button>

            <button
              onClick={() => setShowTrail(!showTrail)}
              className={`h-14 px-5 rounded-full flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest border transition-all ${
                showTrail
                  ? 'border-primary-fixed/30 text-primary-fixed bg-primary-fixed/5'
                  : 'border-outline-variant/30 text-on-surface-variant'
              }`}
            >
              <span className="material-symbols-outlined text-sm">
                {showTrail ? 'visibility' : 'visibility_off'}
              </span>
              Trail
            </button>
          </div>

          {/* New tracking */}
          <button
            onClick={() => { setStep('capture'); setVideoFile(null); setVideoUrl(null); setTrackData(null); }}
            className="w-full border border-outline-variant/30 text-on-surface-variant font-bold py-3 rounded-full text-xs uppercase tracking-widest hover:text-on-surface transition-colors"
          >
            {t('Ny spårning', 'New Tracking')}
          </button>
        </div>
      )}

      {/* CSS for spinning radar */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
