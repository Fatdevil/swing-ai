/**
 * Pose Viewfinder Detector — Real-time golfer positioning validation
 * ===================================================================
 * Runs MediaPipe Pose Lite in VIDEO mode on the camera feed to:
 * 1. Detect if a golfer is visible
 * 2. Auto-detect camera angle (face-on, DTL, side)
 * 3. Validate position based on angle-specific rules
 * 4. Return skeleton landmarks for overlay rendering
 *
 * Performance: ~15-25ms per frame on modern phones (lite model @ GPU)
 */

import { loadPoseLandmarkerForVideo } from './mediapipe.js';

// Lock states (shared vocabulary with ballLockDetector)
export const POSE_STATE = {
  LOADING:   'loading',    // ⏳ MediaPipe loading
  SEARCHING: 'searching',  // 🔴 No person detected
  ADJUSTING: 'adjusting',  // 🟡 Person found but position needs fixing
  LOCKED:    'locked',     // 🟢 Perfect position — ready to record
};

// Camera angles
export const CAMERA_ANGLE = {
  UNKNOWN:  'unknown',
  FACE_ON:  'face_on',
  DTL:      'dtl',
  SIDE:     'side',
};

/**
 * Create a pose viewfinder detector instance
 */
export function createPoseViewfinderDetector() {
  let landmarker = null;
  let state = POSE_STATE.LOADING;
  let confidence = 0;
  let consecutiveGood = 0;
  let consecutiveBad = 0;
  let detectedAngle = CAMERA_ANGLE.UNKNOWN;
  let lastLandmarks = null;
  let issues = [];
  let isLoading = false;

  const LOCK_THRESHOLD = 6;   // Consecutive good frames to lock
  const UNLOCK_THRESHOLD = 4; // Consecutive bad frames to unlock

  /**
   * Initialize MediaPipe (async, call early)
   */
  async function init() {
    if (landmarker || isLoading) return;
    isLoading = true;
    try {
      landmarker = await loadPoseLandmarkerForVideo();
      state = POSE_STATE.SEARCHING;
    } catch (err) {
      console.error('Failed to load MediaPipe for viewfinder:', err);
      state = POSE_STATE.SEARCHING; // Still show UI, just no detection
    }
    isLoading = false;
  }

  /**
   * Analyze a video frame for golfer positioning
   * @param {HTMLVideoElement} video
   * @param {number} timestampMs — performance.now() value
   * @returns {{ state, confidence, detectedAngle, issues, landmarks }}
   */
  function analyze(video, timestampMs) {
    if (!landmarker || !video || video.videoWidth === 0) {
      return getResult();
    }

    try {
      const result = landmarker.detectForVideo(video, timestampMs);

      if (!result.landmarks || result.landmarks.length === 0) {
        // No person detected
        lastLandmarks = null;
        issues = ['no_person'];
        updateState(false);
        return getResult();
      }

      const lm = result.landmarks[0];
      lastLandmarks = lm;

      // Run all validation checks
      const checks = validatePose(lm);
      issues = checks.issues;
      detectedAngle = checks.angle;

      const isGood = issues.length === 0;
      updateState(isGood);

      return getResult();
    } catch (err) {
      // MediaPipe can occasionally fail on a frame — don't crash
      console.warn('Pose detection frame error:', err.message);
      return getResult();
    }
  }

  /**
   * Validate pose landmarks against angle-specific rules
   */
  function validatePose(lm) {
    const currentIssues = [];

    // 1. Check basic landmark visibility
    const visibleCount = countVisibleLandmarks(lm);
    if (visibleCount < 15) {
      currentIssues.push('low_visibility');
    }

    // 2. Auto-detect camera angle from shoulder geometry
    const angle = detectAngle(lm);

    // 3. Check full body visibility (angle-specific)
    const bodyCheck = checkFullBody(lm, angle);
    currentIssues.push(...bodyCheck);

    // 4. Check size in frame (not too close, not too far)
    const sizeCheck = checkSizeInFrame(lm, angle);
    currentIssues.push(...sizeCheck);

    // 5. Check position in frame (centered or appropriately placed)
    const posCheck = checkPosition(lm, angle);
    currentIssues.push(...posCheck);

    return { issues: currentIssues, angle };
  }

  /**
   * Count landmarks with sufficient visibility
   */
  function countVisibleLandmarks(lm) {
    let count = 0;
    for (const point of lm) {
      if ((point.visibility ?? 0) > 0.5) count++;
    }
    return count;
  }

  /**
   * Auto-detect camera angle from shoulder width ratio
   * Face-on: shoulders appear wide (both visible from front)
   * DTL: shoulders appear narrow (foreshortened from behind)
   * Side: somewhere in between
   */
  function detectAngle(lm) {
    const leftShoulder = lm[11];
    const rightShoulder = lm[12];
    const leftHip = lm[23];
    const rightHip = lm[24];

    if (!leftShoulder || !rightShoulder) return CAMERA_ANGLE.UNKNOWN;

    const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
    const hipWidth = (leftHip && rightHip) ? Math.abs(leftHip.x - rightHip.x) : shoulderWidth;

    // Use shoulder-to-hip width ratio for better angle detection
    // Face-on: shoulders and hips both wide
    // DTL: both narrow
    // Side: medium

    if (shoulderWidth > 0.13 && hipWidth > 0.08) {
      return CAMERA_ANGLE.FACE_ON;
    } else if (shoulderWidth < 0.07) {
      return CAMERA_ANGLE.DTL;
    } else {
      return CAMERA_ANGLE.SIDE;
    }
  }

  /**
   * Check if full body is visible (angle-specific requirements)
   */
  function checkFullBody(lm, angle) {
    const issues = [];
    const vis = (idx) => (lm[idx]?.visibility ?? 0) > 0.4;

    // Head (nose or ear)
    const headVisible = vis(0) || vis(7) || vis(8);
    if (!headVisible) issues.push('head_not_visible');

    // Shoulders
    const shouldersVisible = vis(11) && vis(12);
    if (!shouldersVisible) issues.push('shoulders_not_visible');

    // Hips
    const hipsVisible = vis(23) || vis(24);
    if (!hipsVisible) issues.push('hips_not_visible');

    if (angle === CAMERA_ANGLE.FACE_ON) {
      // Face-on: need both legs
      const leftLeg = vis(25) && vis(27); // left knee + ankle
      const rightLeg = vis(26) && vis(28);
      if (!leftLeg && !rightLeg) {
        issues.push('feet_not_visible');
      }
    } else if (angle === CAMERA_ANGLE.DTL) {
      // DTL: need at least one leg (near-side)
      const anyLeg = vis(25) || vis(26) || vis(27) || vis(28);
      if (!anyLeg) {
        issues.push('legs_not_visible');
      }
    } else {
      // Side: need near-side leg
      const anyLeg = vis(25) || vis(26) || vis(27) || vis(28);
      if (!anyLeg) {
        issues.push('legs_not_visible');
      }
    }

    return issues;
  }

  /**
   * Check if golfer is appropriately sized in frame
   */
  function checkSizeInFrame(lm, angle) {
    const issues = [];

    // Calculate body bounding box from visible landmarks
    let minY = 1, maxY = 0;
    const keyPoints = [0, 11, 12, 23, 24, 25, 26, 27, 28]; // head to feet
    for (const idx of keyPoints) {
      if (lm[idx] && (lm[idx].visibility ?? 0) > 0.3) {
        minY = Math.min(minY, lm[idx].y);
        maxY = Math.max(maxY, lm[idx].y);
      }
    }

    const bodyHeight = maxY - minY;

    // Acceptable range depends on angle
    const minHeight = angle === CAMERA_ANGLE.DTL ? 0.35 : 0.40;
    const maxHeight = 0.90;

    if (bodyHeight < minHeight) {
      issues.push('too_far');
    } else if (bodyHeight > maxHeight) {
      issues.push('too_close');
    }

    return issues;
  }

  /**
   * Check if golfer is well-positioned in frame
   */
  function checkPosition(lm, angle) {
    const issues = [];

    // Calculate horizontal center of body
    const centerPoints = [11, 12, 23, 24]; // shoulders + hips
    let sumX = 0, count = 0;
    for (const idx of centerPoints) {
      if (lm[idx] && (lm[idx].visibility ?? 0) > 0.3) {
        sumX += lm[idx].x;
        count++;
      }
    }
    if (count === 0) return issues;

    const bodyCenter = sumX / count;

    if (angle === CAMERA_ANGLE.FACE_ON) {
      // Face-on: golfer should be roughly centered (0.3 - 0.7)
      if (bodyCenter < 0.25) {
        issues.push('too_far_left');
      } else if (bodyCenter > 0.75) {
        issues.push('too_far_right');
      }
    } else if (angle === CAMERA_ANGLE.DTL) {
      // DTL: golfer should be in left portion, right side free for swing path
      // Acceptable range: 0.2 - 0.6
      if (bodyCenter > 0.7) {
        issues.push('too_far_right');
      }
    }
    // Side: less strict positioning

    // Check if head is cut off (too close to top edge)
    const headY = lm[0]?.y ?? 0.5;
    if (headY < 0.03 && (lm[0]?.visibility ?? 0) > 0.3) {
      issues.push('head_cut_off');
    }

    // Check if feet are cut off (too close to bottom edge)
    const feetY = Math.max(lm[27]?.y ?? 0, lm[28]?.y ?? 0);
    if (feetY > 0.97 && (lm[27]?.visibility ?? 0) > 0.3) {
      issues.push('feet_cut_off');
    }

    return issues;
  }

  /**
   * Update state machine
   */
  function updateState(isGood) {
    if (isGood) {
      consecutiveGood++;
      consecutiveBad = 0;

      if (consecutiveGood >= LOCK_THRESHOLD) {
        state = POSE_STATE.LOCKED;
        confidence = Math.min(1, 0.8 + (consecutiveGood - LOCK_THRESHOLD) * 0.04);
      } else {
        state = POSE_STATE.ADJUSTING;
        confidence = 0.3 + (consecutiveGood / LOCK_THRESHOLD) * 0.5;
      }
    } else {
      consecutiveBad++;
      consecutiveGood = Math.max(0, consecutiveGood - 2);

      if (consecutiveBad > UNLOCK_THRESHOLD) {
        if (lastLandmarks) {
          state = POSE_STATE.ADJUSTING;
        } else {
          state = POSE_STATE.SEARCHING;
        }
        confidence = Math.max(0, confidence - 0.15);
      } else if (state === POSE_STATE.LOCKED) {
        // Grace period
        confidence = Math.max(0.3, confidence - 0.1);
      }
    }
  }

  /**
   * Get current result
   */
  function getResult() {
    return {
      state,
      confidence,
      detectedAngle,
      issues: [...issues],
      landmarks: lastLandmarks,
    };
  }

  /**
   * Get human-readable issue message
   */
  function getIssueMessage(issue, lang = 'sv') {
    const messages = {
      no_person:           { sv: 'Ingen golfare synlig', en: 'No golfer visible' },
      low_visibility:      { sv: 'Golfaren syns inte tydligt', en: 'Golfer not clearly visible' },
      head_not_visible:    { sv: 'Huvudet syns inte', en: 'Head not visible' },
      shoulders_not_visible: { sv: 'Axlarna syns inte', en: 'Shoulders not visible' },
      hips_not_visible:    { sv: 'Höfterna syns inte', en: 'Hips not visible' },
      feet_not_visible:    { sv: 'Fötterna syns inte — backa kameran', en: 'Feet not visible — step back' },
      legs_not_visible:    { sv: 'Benen syns inte — backa kameran', en: 'Legs not visible — step back' },
      too_far:             { sv: 'För långt bort — gå närmare', en: 'Too far away — move closer' },
      too_close:           { sv: 'För nära — backa kameran', en: 'Too close — step back' },
      too_far_left:        { sv: 'Golfaren för långt till vänster', en: 'Golfer too far left' },
      too_far_right:       { sv: 'Golfaren för långt till höger', en: 'Golfer too far right' },
      head_cut_off:        { sv: 'Huvudet klipps av — sänk kameran', en: 'Head cut off — lower camera' },
      feet_cut_off:        { sv: 'Fötterna klipps av — höj kameran', en: 'Feet cut off — raise camera' },
    };
    return messages[issue]?.[lang] || messages[issue]?.en || issue;
  }

  /**
   * Get angle display name
   */
  function getAngleName(angle, lang = 'sv') {
    const names = {
      [CAMERA_ANGLE.FACE_ON]:  { sv: 'Face-on', en: 'Face-on' },
      [CAMERA_ANGLE.DTL]:      { sv: 'Down the Line', en: 'Down the Line' },
      [CAMERA_ANGLE.SIDE]:     { sv: 'Sida', en: 'Side' },
      [CAMERA_ANGLE.UNKNOWN]:  { sv: 'Detekterar...', en: 'Detecting...' },
    };
    return names[angle]?.[lang] || angle;
  }

  /**
   * Reset state
   */
  function reset() {
    state = landmarker ? POSE_STATE.SEARCHING : POSE_STATE.LOADING;
    confidence = 0;
    consecutiveGood = 0;
    consecutiveBad = 0;
    detectedAngle = CAMERA_ANGLE.UNKNOWN;
    lastLandmarks = null;
    issues = [];
  }

  return {
    init,
    analyze,
    reset,
    getResult,
    getIssueMessage,
    getAngleName,
  };
}
