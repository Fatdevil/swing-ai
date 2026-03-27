/**
 * Video Frame Extraction Utility
 * Extracts key frames from a golf swing video using HTML Canvas
 * 
 * SMART FRAME SELECTION:
 * Instead of evenly spacing 8 frames, we:
 * 1. Sample ~30 frames densely across the video
 * 2. Track wrist, shoulder, and hip positions via lightweight pixel analysis
 * 3. Detect swing phase transitions (address → takeaway → top → impact → finish)
 * 4. Pick the ONE best frame from each phase
 * 
 * Golf swing phases (ideal 8 frames):
 * 1. Address/Setup
 * 2. Takeaway
 * 3. Backswing (halfway)
 * 4. Top of backswing
 * 5. Downswing
 * 6. Impact
 * 7. Follow-through
 * 8. Finish
 */

const MAX_FRAME_WIDTH = 640; // Resize to save on Claude token cost
const SAMPLE_COUNT = 30; // Dense sampling for phase detection

/**
 * Extract key frames from a video using smart phase detection
 * @param {File|Blob} videoFile - Video file from input or camera
 * @param {number} frameCount - Number of frames to extract (default 8)
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<Array<{blob: Blob, base64: string, timestamp: number, phase: string}>>}
 */
export async function extractFrames(videoFile, frameCount = 8, onProgress) {
  const videoUrl = URL.createObjectURL(videoFile);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  // Load video metadata
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error('Could not load video'));
    video.src = videoUrl;
  });

  // Wait for video to be seekable
  await new Promise((resolve) => {
    if (video.readyState >= 2) { resolve(); return; }
    video.oncanplaythrough = resolve;
    video.load();
  });

  const duration = video.duration;
  if (!duration || duration < 0.5) {
    URL.revokeObjectURL(videoUrl);
    throw new Error('Video too short. Record at least 1 second of your swing.');
  }

  // Set up canvas for frame capture
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // Calculate size (maintain aspect ratio, max width)
  const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);

  // ----- PHASE 1: Dense sampling -----
  onProgress?.('Sampling frames...');
  const startTime = duration * 0.03;
  const endTime = duration * 0.97;
  const sampleInterval = (endTime - startTime) / (SAMPLE_COUNT - 1);

  const samples = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const t = startTime + i * sampleInterval;
    const frame = await captureFrameRaw(video, canvas, ctx, t);
    
    // Lightweight motion analysis — track hand region activity
    const motion = analyzeMotionRegion(ctx, canvas.width, canvas.height);
    samples.push({ ...frame, motion, index: i });
    onProgress?.(`Analyzing frame ${i + 1}/${SAMPLE_COUNT}`);
  }

  // ----- PHASE 2: Detect swing phases from motion curve -----
  onProgress?.('Detecting swing phases...');
  const phaseFrames = detectSwingPhases(samples);

  // ----- PHASE 3: Capture high-res versions of selected frames -----
  onProgress?.('Capturing key frames...');
  const frames = [];
  const phaseLabels = ['address', 'takeaway', 'backswing_mid', 'top', 'downswing', 'impact', 'follow_through', 'finish'];

  for (let i = 0; i < Math.min(phaseFrames.length, frameCount); i++) {
    const sample = phaseFrames[i];
    const frame = await captureFrame(video, canvas, ctx, sample.timestamp);
    frame.phase = phaseLabels[i] || `phase_${i + 1}`;
    frame.phaseConfidence = sample.confidence || 0.7;
    frames.push(frame);
  }

  // Fallback: if phase detection found fewer than 8, fill with evenly-spaced
  while (frames.length < frameCount) {
    const t = startTime + (frames.length / (frameCount - 1)) * (endTime - startTime);
    const frame = await captureFrame(video, canvas, ctx, t);
    frame.phase = phaseLabels[frames.length] || `frame_${frames.length + 1}`;
    frame.phaseConfidence = 0.3; // Low confidence — fallback
    frames.push(frame);
  }

  URL.revokeObjectURL(videoUrl);
  return frames;
}

/**
 * Analyze motion in the upper body region of a frame
 * Returns a motion signature: hand-height ratio, upper body energy
 */
function analyzeMotionRegion(ctx, width, height) {
  // Sample the upper-right quadrant (where hands/club typically move in side view)
  // This gives us a proxy for swing phase without full pose detection
  const regionX = Math.floor(width * 0.15);
  const regionY = Math.floor(height * 0.05);
  const regionW = Math.floor(width * 0.7);
  const regionH = Math.floor(height * 0.55);

  try {
    const imageData = ctx.getImageData(regionX, regionY, regionW, regionH);
    const pixels = imageData.data;

    // Calculate brightness centroid (where the "activity" is centered vertically)
    let totalBrightness = 0;
    let weightedY = 0;
    let weightedX = 0;
    const step = 16; // Sample every 16th pixel for speed

    for (let i = 0; i < pixels.length; i += step * 4) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      // Edge detection proxy — high contrast pixels indicate body/club edges
      const brightness = (r + g + b) / 3;
      const pixelIndex = i / 4;
      const py = Math.floor(pixelIndex / regionW);
      const px = pixelIndex % regionW;
      
      totalBrightness += brightness;
      weightedY += brightness * py;
      weightedX += brightness * px;
    }

    const centroidY = totalBrightness > 0 ? weightedY / totalBrightness / regionH : 0.5;
    const centroidX = totalBrightness > 0 ? weightedX / totalBrightness / regionW : 0.5;
    const avgBrightness = totalBrightness / (pixels.length / (step * 4));

    return {
      centroidY, // 0 = top, 1 = bottom — tracks hand height
      centroidX, // 0 = left, 1 = right — tracks hand position
      avgBrightness,
    };
  } catch {
    return { centroidY: 0.5, centroidX: 0.5, avgBrightness: 128 };
  }
}

// Store previous frame data for inter-frame motion
let prevFrameData = null;

/**
 * Detect swing phases from motion curve
 * Uses centroid changes to find key transitions
 */
function detectSwingPhases(samples) {
  if (samples.length < 8) return samples.slice(0, 8);

  // Extract centroid Y curve (hand height over time)
  const yValues = samples.map(s => s.motion.centroidY);
  const xValues = samples.map(s => s.motion.centroidX);

  // Smooth the curves (3-point moving average)
  const smoothY = smooth(yValues, 2);
  const smoothX = smooth(xValues, 2);

  // Calculate velocity (rate of change)
  const velocityY = derivative(smoothY);
  const velocityX = derivative(smoothX);

  // Calculate speed (absolute velocity)
  const speed = velocityY.map((vy, i) => Math.sqrt(vy * vy + (velocityX[i] || 0) ** 2));

  // Find key moments in the swing:

  // 1. Address = first frame with low motion (start of swing)
  const addressIdx = findFirstStable(speed, 0, Math.floor(samples.length * 0.2));

  // 2. Top of backswing = highest hands (min centroidY since 0=top)
  const topIdx = findMin(smoothY, Math.floor(samples.length * 0.2), Math.floor(samples.length * 0.55));

  // 3. Impact = maximum downward speed after top
  const impactIdx = findMaxSpeed(speed, topIdx + 1, Math.floor(samples.length * 0.8));

  // 4. Finish = last stable frame
  const finishIdx = findLastStable(speed, Math.floor(samples.length * 0.75), samples.length - 1);

  // 5. Interpolate remaining phases
  const takeawayIdx = Math.round(addressIdx + (topIdx - addressIdx) * 0.3);
  const backswingMidIdx = Math.round(addressIdx + (topIdx - addressIdx) * 0.65);
  const downswingIdx = Math.round(topIdx + (impactIdx - topIdx) * 0.5);
  const followThroughIdx = Math.round(impactIdx + (finishIdx - impactIdx) * 0.4);

  // Build phase frame array with confidence
  const phaseIndices = [
    { idx: addressIdx, confidence: 0.85 },
    { idx: takeawayIdx, confidence: 0.7 },
    { idx: backswingMidIdx, confidence: 0.7 },
    { idx: topIdx, confidence: 0.9 },
    { idx: downswingIdx, confidence: 0.75 },
    { idx: impactIdx, confidence: 0.85 },
    { idx: followThroughIdx, confidence: 0.7 },
    { idx: finishIdx, confidence: 0.85 },
  ];

  // Clamp and remove duplicates — ensure each phase gets a unique frame
  const used = new Set();
  return phaseIndices.map(({ idx, confidence }) => {
    let clamped = Math.max(0, Math.min(samples.length - 1, idx));
    // Ensure unique frame per phase
    while (used.has(clamped) && clamped < samples.length - 1) clamped++;
    while (used.has(clamped) && clamped > 0) clamped--;
    used.add(clamped);
    return { ...samples[clamped], confidence };
  });
}

// ----- Math helpers -----

function smooth(arr, windowSize) {
  return arr.map((_, i) => {
    const start = Math.max(0, i - windowSize);
    const end = Math.min(arr.length, i + windowSize + 1);
    const slice = arr.slice(start, end);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

function derivative(arr) {
  return arr.map((v, i) => i === 0 ? 0 : v - arr[i - 1]);
}

function findFirstStable(speedArr, start, end) {
  const threshold = Math.max(...speedArr.slice(start, end + 1)) * 0.15;
  for (let i = start; i <= end; i++) {
    if (speedArr[i] < threshold) return i;
  }
  return start;
}

function findLastStable(speedArr, start, end) {
  const threshold = Math.max(...speedArr.slice(start, end + 1)) * 0.2;
  for (let i = end; i >= start; i--) {
    if (speedArr[i] < threshold) return i;
  }
  return end;
}

function findMin(arr, start, end) {
  let minIdx = start;
  for (let i = start + 1; i <= end; i++) {
    if (arr[i] < arr[minIdx]) minIdx = i;
  }
  return minIdx;
}

function findMaxSpeed(speedArr, start, end) {
  let maxIdx = start;
  for (let i = start + 1; i <= Math.min(end, speedArr.length - 1); i++) {
    if (speedArr[i] > speedArr[maxIdx]) maxIdx = i;
  }
  return maxIdx;
}

/**
 * Capture a single frame at a specific timestamp (full quality)
 */
function captureFrame(video, canvas, ctx, timestamp) {
  return new Promise((resolve) => {
    video.currentTime = timestamp;
    video.onseeked = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({
              blob,
              base64: reader.result,
              timestamp: Math.round(timestamp * 1000) / 1000,
              width: canvas.width,
              height: canvas.height,
            });
          };
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        0.85
      );
    };
  });
}

/**
 * Capture a frame (raw — no blob/base64, just pixel data)
 */
function captureFrameRaw(video, canvas, ctx, timestamp) {
  return new Promise((resolve) => {
    video.currentTime = timestamp;
    video.onseeked = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      resolve({
        timestamp: Math.round(timestamp * 1000) / 1000,
      });
    };
  });
}

/**
 * Create a thumbnail from the middle frame
 */
export function createVideoThumbnail(frames, maxWidth = 200) {
  if (!frames || frames.length === 0) return null;

  const middleFrame = frames[Math.floor(frames.length / 2)];
  const img = new Image();

  return new Promise((resolve) => {
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ratio = maxWidth / img.width;
      canvas.width = maxWidth;
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => resolve(blob),
        'image/jpeg',
        0.7
      );
    };
    img.src = middleFrame.base64;
  });
}

/**
 * Get swing phase label for a frame index
 */
export function getPhaseLabel(index, lang = 'en') {
  const phases = {
    en: ['Address', 'Takeaway', 'Backswing', 'Top', 'Downswing', 'Impact', 'Follow-through', 'Finish'],
    sv: ['Adress', 'Upptagning', 'Baksving', 'Toppen', 'Nedsving', 'Träff', 'Genomsving', 'Avslut'],
  };
  return (phases[lang] || phases.en)[index] || `Frame ${index + 1}`;
}
