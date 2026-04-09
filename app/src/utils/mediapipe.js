/**
 * MediaPipe Pose Landmarker — Modern Tasks-Vision SDK
 * =====================================================
 * Uses @mediapipe/tasks-vision PoseLandmarker for true 3D pose detection.
 *
 * Returns BOTH:
 * - landmarks (2D normalized) → for drawing skeletons on screen
 * - worldLandmarks (3D meters, origin at hip center) → for angle calculations
 * - visibility per landmark → for confidence gating
 */

import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let poseLandmarker = null;

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const MODEL_URL = isMobile 
  ? 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'
  : 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task';

/**
 * Load PoseLandmarker (lazy, cached)
 */
async function loadPoseLandmarker() {
  if (poseLandmarker) return poseLandmarker;

  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  );

  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: 'GPU', // Use GPU if available, falls back to CPU
    },
    runningMode: 'IMAGE',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  return poseLandmarker;
}

/**
 * Analyze pose from an image element
 * @param {HTMLImageElement} imgElement
 * @returns {{ landmarks: Array, worldLandmarks: Array } | null}
 *   - landmarks: 33 points, normalized (x,y) + z + visibility — for 2D drawing
 *   - worldLandmarks: 33 points, real-world 3D meters (x,y,z) + visibility — for angle math
 */
export async function analyzePose(imgElement) {
  try {
    const landmarker = await loadPoseLandmarker();
    const result = landmarker.detect(imgElement);

    if (result.landmarks && result.landmarks.length > 0 && result.worldLandmarks && result.worldLandmarks.length > 0) {
      return {
        landmarks: result.landmarks[0],       // 2D normalized — for drawing
        worldLandmarks: result.worldLandmarks[0], // 3D meters — for angles
      };
    }

    // Fallback: if worldLandmarks not available, return landmarks only
    if (result.landmarks && result.landmarks.length > 0) {
      return {
        landmarks: result.landmarks[0],
        worldLandmarks: null,
      };
    }

    return null;
  } catch (err) {
    console.warn('MediaPipe PoseLandmarker detection failed:', err);
    return null;
  }
}

/**
 * Draw skeleton overlay on a canvas context
 * Uses 2D normalized landmarks for screen-space drawing.
 * Design: green lines (#9DFF00), yellow joint dots
 */
export function drawSkeleton(ctx, landmarks, width, height) {
  // Accept both old format (array) and new format ({ landmarks, worldLandmarks })
  const lm = Array.isArray(landmarks) ? landmarks : landmarks?.landmarks || landmarks;
  if (!lm || lm.length < 33) return;

  const GREEN = '#9DFF00';
  const YELLOW = '#FFE135';
  const JOINT_RADIUS = 5;

  // Connections (MediaPipe Pose landmark indices)
  const connections = [
    // Torso
    [11, 12], // shoulders
    [11, 23], // left shoulder to hip
    [12, 24], // right shoulder to hip
    [23, 24], // hips
    // Left arm
    [11, 13], [13, 15],
    // Right arm
    [12, 14], [14, 16],
    // Left leg
    [23, 25], [25, 27],
    // Right leg
    [24, 26], [26, 28],
    // Shoulders to ears (for head position)
    [11, 0], [12, 0],
  ];

  // Draw connections
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 3;
  ctx.shadowColor = GREEN;
  ctx.shadowBlur = 8;
  ctx.lineCap = 'round';

  connections.forEach(([a, b]) => {
    if (lm[a] && lm[b]) {
      ctx.beginPath();
      ctx.moveTo(lm[a].x * width, lm[a].y * height);
      ctx.lineTo(lm[b].x * width, lm[b].y * height);
      ctx.stroke();
    }
  });

  // Draw joints
  ctx.shadowBlur = 0;
  const keyJoints = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
  keyJoints.forEach((i) => {
    if (lm[i]) {
      // Dim joints with low visibility
      const vis = lm[i].visibility ?? 1;
      const alpha = Math.max(0.3, vis);

      ctx.fillStyle = YELLOW;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(lm[i].x * width, lm[i].y * height, JOINT_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // Inner dot
      ctx.fillStyle = GREEN;
      ctx.beginPath();
      ctx.arc(lm[i].x * width, lm[i].y * height, JOINT_RADIUS - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  });
}
