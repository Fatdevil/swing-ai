import { useState, useRef, useEffect, useCallback } from 'react';
import { createPoseViewfinderDetector, POSE_STATE, CAMERA_ANGLE } from '../utils/poseViewfinderDetector';

/**
 * SwingViewfinder — Smart camera viewfinder with real-time pose detection
 * ========================================================================
 * Shows live camera feed with:
 * - Real-time skeleton overlay
 * - Auto camera angle detection
 * - Position validation (red/yellow/green)
 * - Recording with timer
 */
export default function SwingViewfinder({ onRecordingComplete, onCancel, language = 'sv' }) {
  const t = (sv, en) => language === 'sv' ? sv : en;
  const [poseState, setPoseState] = useState(POSE_STATE.LOADING);
  const [poseConfidence, setPoseConfidence] = useState(0);
  const [detectedAngle, setDetectedAngle] = useState(CAMERA_ANGLE.UNKNOWN);
  const [issueMessage, setIssueMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const videoRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const loopRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  // Initialize camera and pose detector
  useEffect(() => {
    let cancelled = false;

    async function setup() {
      // Start camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        console.error('Camera access error:', err);
        return;
      }

      // Initialize pose detector (async — might take a few seconds to load model)
      const detector = createPoseViewfinderDetector();
      detectorRef.current = detector;
      await detector.init();

      if (cancelled) return;

      startDetectionLoop();
    }

    setup();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [startDetectionLoop, cleanup]);

  // Detection loop
  const startDetectionLoop = useCallback(() => {
    if (loopRef.current) cancelAnimationFrame(loopRef.current);

    let frameCount = 0;
    const loop = () => {
      frameCount++;

      // Run pose detection every 3rd frame (~10fps on 30fps camera) for efficiency
      if (frameCount % 3 === 0 && videoRef.current && detectorRef.current && overlayCanvasRef.current) {
        const video = videoRef.current;
        const canvas = overlayCanvasRef.current;

        if (video.videoWidth > 0) {
          const result = detectorRef.current.analyze(video, performance.now());

          setPoseState(result.state);
          setPoseConfidence(result.confidence);
          setDetectedAngle(result.detectedAngle);

          // Get the most important issue message
          if (result.issues.length > 0) {
            setIssueMessage(detectorRef.current.getIssueMessage(result.issues[0], language));
          } else {
            setIssueMessage('');
          }

          // Draw overlay (skeleton + status)
          drawOverlay(canvas, video, result);
        }
      }

      loopRef.current = requestAnimationFrame(loop);
    };
    loopRef.current = requestAnimationFrame(loop);
  }, [language, drawOverlay]);

  // Draw skeleton overlay and status indicators
  const drawOverlay = useCallback((canvas, video, result) => {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const displayW = canvas.clientWidth;
    const displayH = canvas.clientHeight;

    if (canvas.width !== displayW * dpr || canvas.height !== displayH * dpr) {
      canvas.width = displayW * dpr;
      canvas.height = displayH * dpr;
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, displayW, displayH);

    // Draw skeleton if we have landmarks
    if (result.landmarks && result.landmarks.length >= 33) {
      const lm = result.landmarks;

      // Skeleton color based on state
      const isLocked = result.state === POSE_STATE.LOCKED;
      const isAdjusting = result.state === POSE_STATE.ADJUSTING;
      const skeletonColor = isLocked ? 'rgba(0, 255, 102, 0.5)' :
                             isAdjusting ? 'rgba(255, 215, 0, 0.4)' :
                             'rgba(255, 80, 80, 0.3)';
      const jointColor = isLocked ? 'rgba(0, 255, 102, 0.7)' :
                          isAdjusting ? 'rgba(255, 215, 0, 0.6)' :
                          'rgba(255, 80, 80, 0.5)';

      // Draw connections
      const connections = [
        [11, 12], [11, 23], [12, 24], [23, 24], // torso
        [11, 13], [13, 15], // left arm
        [12, 14], [14, 16], // right arm
        [23, 25], [25, 27], // left leg
        [24, 26], [26, 28], // right leg
        [11, 0], [12, 0],   // head
      ];

      ctx.strokeStyle = skeletonColor;
      ctx.lineWidth = 2;
      ctx.shadowColor = skeletonColor;
      ctx.shadowBlur = 6;
      ctx.lineCap = 'round';

      connections.forEach(([a, b]) => {
        if (lm[a] && lm[b] && (lm[a].visibility ?? 0) > 0.3 && (lm[b].visibility ?? 0) > 0.3) {
          ctx.beginPath();
          ctx.moveTo(lm[a].x * displayW, lm[a].y * displayH);
          ctx.lineTo(lm[b].x * displayW, lm[b].y * displayH);
          ctx.stroke();
        }
      });

      // Draw joints
      ctx.shadowBlur = 0;
      const keyJoints = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
      keyJoints.forEach((i) => {
        if (lm[i] && (lm[i].visibility ?? 0) > 0.3) {
          ctx.fillStyle = jointColor;
          ctx.beginPath();
          ctx.arc(lm[i].x * displayW, lm[i].y * displayH, 4, 0, Math.PI * 2);
          ctx.fill();

          // Inner dot
          ctx.fillStyle = isLocked ? '#00FF66' : isAdjusting ? '#FFD700' : '#FF5050';
          ctx.beginPath();
          ctx.arc(lm[i].x * displayW, lm[i].y * displayH, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }
  }, []);

  // Recording functions
  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    chunksRef.current = [];

    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm',
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const angle = detectedAngle !== CAMERA_ANGLE.UNKNOWN ? detectedAngle : 'auto';
      cleanup();
      onRecordingComplete?.(blob, angle);
    };

    recorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setIsRecording(true);
    setRecordingTime(0);

    timerRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);

    // Auto-stop at 30 seconds
    setTimeout(() => {
      if (mediaRecorder.state === 'recording') {
        stopRecording();
      }
    }, 30000);
  }, [detectedAngle, onRecordingComplete, stopRecording, cleanup]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Cleanup
  const cleanup = useCallback(() => {
    if (loopRef.current) {
      cancelAnimationFrame(loopRef.current);
      loopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (detectorRef.current) {
      detectorRef.current.reset();
    }
  }, []);

  const handleCancel = useCallback(() => {
    cleanup();
    onCancel?.();
  }, [cleanup, onCancel]);

  // State-based colors
  const stateColor = poseState === POSE_STATE.LOCKED ? '#00FF66' :
                     poseState === POSE_STATE.ADJUSTING ? '#FFD700' :
                     'rgba(255, 80, 80, 0.7)';

  const borderColor = poseState === POSE_STATE.LOCKED ? 'rgba(0,255,102,0.3)' :
                      poseState === POSE_STATE.ADJUSTING ? 'rgba(255,215,0,0.2)' :
                      'rgba(255,255,255,0.1)';

  // Angle display name
  const angleName = detectorRef.current
    ? detectorRef.current.getAngleName(detectedAngle, language)
    : '...';

  // Status message
  const statusMessage = poseState === POSE_STATE.LOADING
    ? t('Laddar AI-modell...', 'Loading AI model...')
    : poseState === POSE_STATE.LOCKED
    ? t('Perfekt position! Redo att filma', 'Perfect position! Ready to record')
    : poseState === POSE_STATE.ADJUSTING
    ? issueMessage || t('Justera positionen...', 'Adjust position...')
    : issueMessage || t('Rikta kameran mot golfaren', 'Point camera at golfer');

  return (
    <div className="space-y-4">
      {/* Camera feed with overlay */}
      <div
        className="relative rounded-lg overflow-hidden border-2 bg-black"
        style={{ borderColor }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-auto max-h-[450px] object-cover"
        />

        {/* Skeleton + status overlay canvas */}
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 10 }}
        />

        {/* Angle badge (top-left) */}
        {detectedAngle !== CAMERA_ANGLE.UNKNOWN && (
          <div
            className="absolute top-4 left-4 backdrop-blur-md rounded-full px-3 py-1.5 border flex items-center gap-1.5"
            style={{
              zIndex: 20,
              backgroundColor: 'rgba(0,0,0,0.5)',
              borderColor: stateColor,
            }}
          >
            <span className="material-symbols-outlined text-xs" style={{ color: stateColor }}>
              {detectedAngle === CAMERA_ANGLE.FACE_ON ? 'person' :
               detectedAngle === CAMERA_ANGLE.DTL ? 'switch_access_shortcut' :
               'person_outline'}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: stateColor }}>
              {angleName}
            </span>
          </div>
        )}

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
          onClick={handleCancel}
          className="absolute top-4 right-4 bg-black/50 backdrop-blur-md p-2 rounded-full border border-white/10 hover:bg-black/70 transition-colors"
          style={{ zIndex: 20 }}
        >
          <span className="material-symbols-outlined text-white text-xl">close</span>
        </button>

        {/* Confidence arc (subtle ring around border) */}
        {poseState !== POSE_STATE.SEARCHING && poseConfidence > 0 && !isRecording && (
          <div
            className="absolute bottom-16 right-4 w-10 h-10"
            style={{ zIndex: 20 }}
          >
            <svg width="40" height="40" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
              <circle
                cx="20" cy="20" r="16"
                fill="none"
                stroke={stateColor}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${poseConfidence * 100.5} 100.5`}
                transform="rotate(-90 20 20)"
                style={{ filter: `drop-shadow(0 0 4px ${stateColor})` }}
              />
              <text x="20" y="24" textAnchor="middle" fill={stateColor} fontSize="9" fontWeight="bold">
                {Math.round(poseConfidence * 100)}
              </text>
            </svg>
          </div>
        )}

        {/* Status badge (bottom center) */}
        {!isRecording && (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 backdrop-blur-md rounded-full px-4 py-2 border transition-all duration-300"
            style={{
              zIndex: 20,
              backgroundColor: poseState === POSE_STATE.LOCKED ? 'rgba(0,255,102,0.15)' :
                               poseState === POSE_STATE.ADJUSTING ? 'rgba(255,215,0,0.1)' :
                               'rgba(0,0,0,0.5)',
              borderColor: poseState === POSE_STATE.LOCKED ? 'rgba(0,255,102,0.3)' :
                           poseState === POSE_STATE.ADJUSTING ? 'rgba(255,215,0,0.2)' :
                           'rgba(255,255,255,0.1)',
            }}
          >
            <span
              className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"
              style={{ color: stateColor }}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: stateColor,
                  boxShadow: poseState === POSE_STATE.LOCKED ? `0 0 8px ${stateColor}` : 'none',
                  animation: poseState === POSE_STATE.LOCKED ? 'pulse 1.5s ease-in-out infinite' :
                             poseState === POSE_STATE.ADJUSTING ? 'pulse 2s ease-in-out infinite' : 'none',
                }}
              />
              {statusMessage}
            </span>
          </div>
        )}
      </div>

      {/* Record / Stop buttons */}
      {!isRecording ? (
        <button
          onClick={startRecording}
          className={`w-full h-16 rounded-full flex items-center justify-center gap-3 font-headline font-bold uppercase tracking-widest text-sm active:scale-[0.98] transition-all ${
            poseState === POSE_STATE.LOCKED
              ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-[0_4px_20px_rgba(0,255,102,0.3)]'
              : 'bg-red-500 hover:bg-red-600 text-white shadow-[0_4px_20px_rgba(255,0,0,0.3)]'
          }`}
        >
          {poseState === POSE_STATE.LOCKED ? (
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

      {/* Tip text */}
      <p className="text-center text-on-surface-variant text-[10px] uppercase tracking-widest">
        {t('Max 30 sek • AI detekterar vinkel automatiskt', 'Max 30 sec • AI detects angle automatically')}
      </p>

      {/* CSS for pulse animation */}
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}
