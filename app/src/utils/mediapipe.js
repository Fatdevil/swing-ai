/**
 * MediaPipe Pose integration
 * Loads MediaPipe via CDN and provides pose detection + skeleton drawing
 */

let poseInstance = null;

/**
 * Load MediaPipe Pose model (lazy, cached)
 */
async function loadPose() {
  if (poseInstance) return poseInstance;

  // Dynamically load MediaPipe scripts from CDN
  await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose.js');

  const Pose = window.Pose;
  if (!Pose) throw new Error('MediaPipe Pose not available');

  poseInstance = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`,
  });

  poseInstance.setOptions({
    modelComplexity: 1, // 0=lite, 1=full, 2=heavy
    smoothLandmarks: false,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  await poseInstance.initialize();
  return poseInstance;
}

/**
 * Analyze pose from an image element
 * @param {HTMLImageElement} imgElement
 * @returns {Array|null} 33 landmarks or null if detection fails
 */
export async function analyzePose(imgElement) {
  try {
    const pose = await loadPose();

    return new Promise((resolve) => {
      pose.onResults((results) => {
        if (results.poseLandmarks && results.poseLandmarks.length > 0) {
          resolve(results.poseLandmarks);
        } else {
          resolve(null);
        }
      });

      pose.send({ image: imgElement });
    });
  } catch (err) {
    console.warn('MediaPipe pose detection failed:', err);
    return null;
  }
}

/**
 * Draw skeleton overlay on a canvas context
 * Design: green lines (#9DFF00), yellow joint dots
 */
export function drawSkeleton(ctx, landmarks, width, height) {
  if (!landmarks) return;

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
    if (landmarks[a] && landmarks[b]) {
      ctx.beginPath();
      ctx.moveTo(landmarks[a].x * width, landmarks[a].y * height);
      ctx.lineTo(landmarks[b].x * width, landmarks[b].y * height);
      ctx.stroke();
    }
  });

  // Draw joints
  ctx.shadowBlur = 0;
  const keyJoints = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
  keyJoints.forEach((i) => {
    if (landmarks[i]) {
      ctx.fillStyle = YELLOW;
      ctx.beginPath();
      ctx.arc(landmarks[i].x * width, landmarks[i].y * height, JOINT_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // Inner dot
      ctx.fillStyle = GREEN;
      ctx.beginPath();
      ctx.arc(landmarks[i].x * width, landmarks[i].y * height, JOINT_RADIUS - 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/**
 * Helper to dynamically load a script
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}
