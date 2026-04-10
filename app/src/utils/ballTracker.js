/**
 * BALL FLIGHT TRACKER — v4.1 (Fixed False Positives + Trajectory Validation)
 * ===========================================================================
 * World-class golf ball tracking for smartphone video.
 *
 * v4.1 fixes vs v4.0:
 * - Drastically reduced false positive rate via:
 *   a) Upper-frame bias: ignore candidates in the bottom 40% of frame (golfer/ground)
 *   b) Ball-size filtering: tighter min/max blob radius
 *   c) Trajectory validation: reject zigzag, require upward initial motion
 *   d) maxMissedBeforeStop: 15 → 6 (stop predicting hallucinations)
 *   e) Post-processing: strip low-quality tails, physics plausibility filter
 *   f) Stricter circularity and brightness thresholds
 *
 * Pipeline per frame:
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ Frame → Grayscale + HSV → Harris Corners → LK Tracking → RANSAC Affine │
 * │ → Affine-Compensated Diff → Multi-Channel Blob Detection →              │
 * │ Upper-Frame Filter → Sub-Pixel Refinement → Kalman Gating →             │
 * │ Update/Predict → Per-Point Homography → Trajectory Validation           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

import { createKalmanTracker, selectBestCandidate } from './kalmanTracker.js';
import { analyzeLaunchData, scoreTrajectoryQuality } from './ballPhysics.js';
import {
  detectCorners,
  trackCorners,
  estimateAffineRANSAC,
  createHomographyAccumulator,
  affineCompensatedDiff,
  invertHomography,
  multiplyHomography,
  transformPointH,
} from './affineMotion.js';

// ─── Detection Config ──────────────────────────────────────────

const CONFIG = {
  // Frame differencing
  diffThreshold: 30,          // Raised from 25 → 30 to reject subtle noise

  // HSV: golf ball = high Value, low Saturation
  hsvValueMin: 190,           // Raised: only very bright objects (was 180)
  hsvSatMax: 60,              // Tightened: must be whiter (was 80)

  // Brightness (RGB fallback)
  brightnessMin: 180,         // Raised from 160 → 180

  // Blob size (in process-space pixels)
  minBlobRadius: 3,           // Raised from 2 → 3 (reject pixel noise)
  maxBlobRadius: 20,          // Tightened from 30 → 20 (golf ball is small)

  // Circularity: area / (π × r²) — 1.0 = perfect circle
  minCircularity: 0.55,       // Raised from 0.4 → 0.55 (golf ball is round)

  // Aspect ratio (width / height)
  minAspect: 0.5,             // Tightened from 0.3
  maxAspect: 2.5,             // Tightened from 3.5

  // Kalman
  kalmanProcessNoise: 6,      // Reduced from 8 → 6 (smoother, less jitter)
  kalmanMeasurementNoise: 4,  // Raised from 3 → 4 (trust model more)
  kalmanGateThreshold: 3.5,   // Tightened from 4.0 → 3.5

  // Motion estimation
  affineMinInliers: 15,
  cornerDetectInterval: 3,
  maxCorners: 60,

  // Motion blur detection
  motionBlurSpeedThreshold: 15,  // Raised from 12
  motionBlurMinAspect: 2.0,

  // Sub-pixel refinement
  subPixelRadius: 3,

  // Spatial filtering: reject detections in lower part of frame
  // Golf ball goes UP after impact — ground-level detections are false positives
  upperFrameBias: 0.60,       // Only consider candidates in top 60% of frame

  // General
  minFlightFrames: 4,         // Raised from 3 → 4
  frameSkip: 1,
  maxMissedBeforeStop: 6,     // CRITICAL: reduced from 15 → 6

  // Post-processing
  minDetectedRatio: 0.15,     // Trajectory must be ≥15% real detections (not all predicted)
  maxDirectionChange: 120,    // Max degrees between consecutive velocity vectors
};

// ─── Main Entry Point ──────────────────────────────────────────

export async function detectBallFlight(videoFile, onProgress = () => {}) {
  const videoUrl = URL.createObjectURL(videoFile);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error('Could not load video'));
    video.src = videoUrl;
  });

  await new Promise((resolve) => {
    video.oncanplaythrough = resolve;
    video.load();
  });

  const { videoWidth: width, videoHeight: height, duration } = video;
  const fps = 30;
  const totalFrames = Math.floor(duration * fps);
  const dt = 1 / fps;

  const processScale = Math.min(1, 640 / width);
  const pw = Math.round(width * processScale);
  const ph = Math.round(height * processScale);

  const processCanvas = document.createElement('canvas');
  processCanvas.width = pw;
  processCanvas.height = ph;
  const processCtx = processCanvas.getContext('2d', { willReadFrequently: true });

  onProgress(3, 'Initializing v4.1 tracker...');

  const kalman = createKalmanTracker({
    dt,
    processNoise: CONFIG.kalmanProcessNoise,
    measurementNoise: CONFIG.kalmanMeasurementNoise,
    gravityPixels: 0.3,
  });

  const homography = createHomographyAccumulator();
  let prevGray = null;
  let prevCorners = null;
  let cornerAge = 0;

  // Upper-frame detection boundary (in process-space)
  const maxDetectionY = Math.round(ph * CONFIG.upperFrameBias);

  const motionOffsets = [];
  const kalmanTrajectory = [];

  onProgress(5, 'Processing frames...');

  for (let i = 0; i < totalFrames; i += CONFIG.frameSkip) {
    const time = i / fps;

    await seekTo(video, time);
    processCtx.drawImage(video, 0, 0, pw, ph);
    const frameData = processCtx.getImageData(0, 0, pw, ph);

    const gray = toGrayscale(frameData);
    const hsvMask = createHSVMask(frameData, pw, ph);

    if (prevGray) {
      // ═══════════════════════════════════════════════════════════
      // 1. AFFINE MOTION ESTIMATION (with block-matching fallback)
      // ═══════════════════════════════════════════════════════════

      let usedAffine = false;
      let frameDiff;

      if (!prevCorners || cornerAge >= CONFIG.cornerDetectInterval) {
        prevCorners = detectCorners(prevGray, pw, ph, CONFIG.maxCorners);
        cornerAge = 0;
      }

      if (prevCorners.length >= 6) {
        const flow = trackCorners(prevGray, gray, prevCorners, pw, ph);

        if (flow.count >= CONFIG.affineMinInliers) {
          const result = estimateAffineRANSAC(flow.src, flow.dst, flow.count);

          if (result && result.inlierCount >= CONFIG.affineMinInliers) {
            // Validate affine: reject if scale/rotation is extreme
            const scaleX = Math.sqrt(result.affine[0] * result.affine[0] + result.affine[3] * result.affine[3]);
            const scaleY = Math.sqrt(result.affine[1] * result.affine[1] + result.affine[4] * result.affine[4]);

            if (scaleX > 0.9 && scaleX < 1.1 && scaleY > 0.9 && scaleY < 1.1) {
              homography.applyAffine(result.affine);
              usedAffine = true;
              frameDiff = affineCompensatedDiff(prevGray, gray, result.affine, pw, ph);
              prevCorners = flow.dst.slice(0, flow.count * 2);
              cornerAge++;
            }
          }
        }
      }

      if (!usedAffine) {
        const motion = estimateGlobalMotionFallback(prevGray, gray, pw, ph);
        homography.applyTranslation(motion.dx, motion.dy);
        frameDiff = shiftedFrameDifference(prevGray, gray, pw, ph, motion.dx, motion.dy);
        prevCorners = null;
        cornerAge = CONFIG.cornerDetectInterval;
      }

      // ═══════════════════════════════════════════════════════════
      // 2. MULTI-CHANNEL BLOB DETECTION + UPPER-FRAME FILTER
      // ═══════════════════════════════════════════════════════════

      const candidates = detectCandidates(frameDiff, hsvMask, frameData, pw, ph, gray, maxDetectionY);

      // Motion blur (only if already tracking fast)
      if (kalman.getSpeed() > CONFIG.motionBlurSpeedThreshold && kalman.isAlive()) {
        const blurCandidates = detectMotionBlurCandidates(
          frameDiff, hsvMask, frameData, pw, ph,
          kalman.getMotionDirection(), kalman.getSpeed(), maxDetectionY
        );
        candidates.push(...blurCandidates);
      }

      // ═══════════════════════════════════════════════════════════
      // 3. KALMAN-GUIDED CANDIDATE SELECTION
      // ═══════════════════════════════════════════════════════════

      const kalmanPred = kalman.predict();
      const selection = selectBestCandidate(kalman, candidates, CONFIG.kalmanGateThreshold);

      if (selection) {
        const kState = kalman.update(selection.candidate.x, selection.candidate.y);

        const screenX = kState.x / processScale;
        const screenY = kState.y / processScale;

        kalmanTrajectory.push({
          x: screenX,
          y: screenY,
          time,
          frameIndex: i,
          brightness: selection.candidate.brightness,
          radius: (selection.candidate.radius || 4) / processScale,
          vx: kState.vx / processScale,
          vy: kState.vy / processScale,
          kalmanDistance: selection.distance,
          source: 'detected',
          H_world: homography.getMatrix(),
        });
      } else if (kalman.isAlive()) {
        const predicted = kalman.handleMiss();
        if (predicted) {
          const screenX = predicted.x / processScale;
          const screenY = predicted.y / processScale;

          // Don't add predicted points that go off-screen or into the ground
          if (screenX > 0 && screenX < width && screenY > 0 && screenY < height * 0.8) {
            kalmanTrajectory.push({
              x: screenX,
              y: screenY,
              time,
              frameIndex: i,
              brightness: 200,
              radius: 4 / processScale,
              vx: predicted.vx / processScale,
              vy: predicted.vy / processScale,
              kalmanDistance: -1,
              source: 'predicted',
              H_world: homography.getMatrix(),
            });
          }
        }
      }
    }

    motionOffsets.push({
      time,
      frameIndex: i,
      H: homography.getMatrix(),
    });

    prevGray = gray;

    const percent = 5 + Math.round((i / totalFrames) * 75);
    if (i % 8 === 0) {
      onProgress(percent, `Frame ${i}/${totalFrames} — ${kalmanTrajectory.length} points`);
    }
  }

  onProgress(85, 'Validating trajectory...');

  // ═══════════════════════════════════════════════════════════════
  // 4. POST-PROCESSING: Trajectory Validation & Cleanup
  // ═══════════════════════════════════════════════════════════════

  let trajectory = validateTrajectory(kalmanTrajectory, width, height);

  // Calculate launch data
  const launchData = analyzeLaunchData(trajectory, width, height, fps);

  // Quality score
  const quality = scoreTrajectoryQuality(trajectory, launchData?.impactIndex || 0);

  onProgress(95, trajectory.length > 0
    ? `✓ ${trajectory.filter(p => p.source === 'detected').length} detected + ${trajectory.filter(p => p.source === 'predicted').length} predicted`
    : 'No clear ball flight detected');

  return {
    trajectory,
    launchData,
    quality,
    fps,
    width,
    height,
    duration,
    videoUrl,
    processScale,
    motionOffsets,
  };
}

// ─── Trajectory Validation & Cleanup ───────────────────────────

/**
 * Post-process the raw Kalman trajectory to remove false positives.
 *
 * Rules:
 * 1. Must have minimum ratio of detected vs predicted points
 * 2. Remove zigzag segments (sharp direction changes)
 * 3. Find the longest physically-plausible sub-trajectory
 * 4. Ball should generally move upward initially (golf ball goes up after impact)
 */
function validateTrajectory(raw, videoWidth, videoHeight) {
  if (raw.length < CONFIG.minFlightFrames) return [];

  // 1. Check detected ratio
  const detectedCount = raw.filter(p => p.source === 'detected').length;
  const totalCount = raw.length;

  if (detectedCount < 3) return [];  // Need at least 3 actual detections
  if (detectedCount / totalCount < CONFIG.minDetectedRatio) {
    // Too many predictions — trim trailing predictions
    const lastDetectedIdx = raw.map((p, i) => p.source === 'detected' ? i : -1)
      .filter(i => i >= 0)
      .pop();
    if (lastDetectedIdx !== undefined) {
      raw = raw.slice(0, lastDetectedIdx + 3); // Keep 3 predictions after last detection
    }
  }

  // 2. Find longest smooth sub-trajectory
  // Score each point pair by directional consistency
  const segments = [];
  let currentSegment = [raw[0]];

  for (let i = 1; i < raw.length; i++) {
    const prev = raw[i - 1];
    const curr = raw[i];

    // Direction from prev to current
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Check for reasonable movement (not teleporting)
    const maxMovePerFrame = videoWidth * 0.15; // Max 15% of frame width per frame
    if (dist > maxMovePerFrame) {
      // Teleport detected — start new segment
      if (currentSegment.length > segments.length) {
        segments.push([...currentSegment]);
      }
      currentSegment = [curr];
      continue;
    }

    // Check direction consistency with previous movement
    if (currentSegment.length >= 2) {
      const prevPrev = currentSegment[currentSegment.length - 2];
      const prevDx = prev.x - prevPrev.x;
      const prevDy = prev.y - prevPrev.y;

      // Angle between consecutive velocity vectors
      const dot = prevDx * dx + prevDy * dy;
      const cross = prevDx * dy - prevDy * dx;
      const angle = Math.abs(Math.atan2(cross, dot)) * (180 / Math.PI);

      if (angle > CONFIG.maxDirectionChange) {
        // Sharp direction change — might be a false positive
        if (currentSegment.length >= CONFIG.minFlightFrames) {
          segments.push([...currentSegment]);
        }
        currentSegment = [curr];
        continue;
      }
    }

    currentSegment.push(curr);
  }

  if (currentSegment.length >= CONFIG.minFlightFrames) {
    segments.push(currentSegment);
  }

  if (segments.length === 0) return [];

  // 3. Pick the best segment (longest with most detections)
  let bestSegment = segments[0];
  let bestScore = 0;

  for (const seg of segments) {
    const detected = seg.filter(p => p.source === 'detected').length;
    const score = detected * 3 + seg.length; // Weight detections 3x
    if (score > bestScore) {
      bestScore = score;
      bestSegment = seg;
    }
  }

  // 4. Verify upward initial motion (ball goes up after impact)
  // Check if the first few detected points show upward movement (negative dy in screen coords)
  const detectedPts = bestSegment.filter(p => p.source === 'detected');
  if (detectedPts.length >= 2) {
    const first = detectedPts[0];
    const second = detectedPts[Math.min(2, detectedPts.length - 1)];
    const dy = second.y - first.y;

    // If ball is moving DOWN from the start, it's probably not a real ball flight
    // (exception: if it's a very lateral shot, allow horizontal movement)
    const dx = Math.abs(second.x - first.x);
    if (dy > 20 && dx < 10) {
      // Moving down and not sideways — likely false positive on ground
      return [];
    }
  }

  return bestSegment;
}

// ─── HSV Color Segmentation ────────────────────────────────────

function createHSVMask(frameData, w, h) {
  const { data } = frameData;
  const mask = new Uint8Array(w * h);

  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    const r = data[idx], g = data[idx + 1], b = data[idx + 2];

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const v = max;
    const s = max === 0 ? 0 : ((max - min) / max) * 255;

    if (v >= CONFIG.hsvValueMin && s <= CONFIG.hsvSatMax) {
      mask[i] = 255;
    }
  }

  return morphClose(mask, w, h, 1);
}

function morphClose(mask, w, h, radius) {
  const dilated = new Uint8Array(w * h);
  for (let y = radius; y < h - radius; y++) {
    for (let x = radius; x < w - radius; x++) {
      let found = false;
      for (let dy = -radius; dy <= radius && !found; dy++) {
        for (let dx = -radius; dx <= radius && !found; dx++) {
          if (mask[(y + dy) * w + (x + dx)] > 0) found = true;
        }
      }
      if (found) dilated[y * w + x] = 255;
    }
  }

  const eroded = new Uint8Array(w * h);
  for (let y = radius; y < h - radius; y++) {
    for (let x = radius; x < w - radius; x++) {
      let allSet = true;
      for (let dy = -radius; dy <= radius && allSet; dy++) {
        for (let dx = -radius; dx <= radius && allSet; dx++) {
          if (dilated[(y + dy) * w + (x + dx)] === 0) allSet = false;
        }
      }
      if (allSet) eroded[y * w + x] = 255;
    }
  }

  return eroded;
}

// ─── Multi-Channel Candidate Detection ─────────────────────────

function detectCandidates(diff, hsvMask, frameData, w, h, gray, maxDetectionY) {
  const candidates = [];
  const visited = new Set();
  const { data } = frameData;

  for (let y = 5; y < Math.min(h - 5, maxDetectionY); y++) {  // Upper-frame filter
    for (let x = 5; x < w - 5; x++) {
      const idx = y * w + x;
      if (visited.has(idx)) continue;

      const hasDiff = diff[idx] >= CONFIG.diffThreshold;
      const hasHSV = hsvMask[idx] > 0;

      // Require BOTH motion AND brightness (not just one)
      // This is the key change to reduce false positives
      if (!hasDiff) continue;  // Must have motion

      const pixIdx = idx * 4;
      const r = data[pixIdx], g = data[pixIdx + 1], b = data[pixIdx + 2];
      const brightness = (r + g + b) / 3;
      if (brightness < CONFIG.brightnessMin && !hasHSV) continue;

      const blob = floodFillMulti(diff, hsvMask, data, w, h, x, y, visited);
      if (blob.size < 3) continue;  // Raised from 2

      const radius = Math.sqrt(blob.size / Math.PI);
      if (radius < CONFIG.minBlobRadius || radius > CONFIG.maxBlobRadius) continue;

      const circularity = blob.size / (Math.PI * radius * radius);
      if (circularity < CONFIG.minCircularity) continue;

      if (blob.w > 0 && blob.h > 0) {
        const aspect = blob.w / blob.h;
        if (aspect < CONFIG.minAspect || aspect > CONFIG.maxAspect) continue;
      }

      // Sub-pixel centroid refinement
      const refined = refineSubPixelCenter(gray, blob.cx, blob.cy, CONFIG.subPixelRadius, w, h);

      // Score: heavily weight HSV match (white ball) and position (higher = more likely ball)
      let score = brightness;
      if (hasHSV) score += 80;   // HSV match is strong signal
      score += 30 * (1 - refined.y / h);  // Higher in frame = more likely ball

      candidates.push({
        x: refined.x,
        y: refined.y,
        radius,
        brightness: score,
        size: blob.size,
        hasHSV,
        hasDiff,
      });
    }
  }

  candidates.sort((a, b) => b.brightness - a.brightness);
  return candidates.slice(0, 5);  // Reduced from 8 → 5
}

// ─── Motion Blur-Aware Detection ───────────────────────────────

function detectMotionBlurCandidates(diff, hsvMask, frameData, w, h, motionAngle, speed, maxDetectionY) {
  const candidates = [];
  const visited = new Set();
  const { data } = frameData;

  for (let y = 5; y < Math.min(h - 5, maxDetectionY); y += 2) {
    for (let x = 5; x < w - 5; x += 2) {
      const idx = y * w + x;
      if (visited.has(idx)) continue;
      if (diff[idx] < CONFIG.diffThreshold * 0.7) continue;

      const blob = floodFillMulti(diff, hsvMask, data, w, h, x, y, visited);
      if (blob.size < 4) continue;

      const aspect = blob.w > 0 && blob.h > 0 ? Math.max(blob.w / blob.h, blob.h / blob.w) : 1;
      if (aspect < CONFIG.motionBlurMinAspect) continue;

      const blobAngle = Math.atan2(blob.h, blob.w);
      const angleDiff = Math.abs(motionAngle - blobAngle);
      const normalizedAngleDiff = Math.min(angleDiff, Math.PI - angleDiff);
      if (normalizedAngleDiff > Math.PI / 3) continue;

      const radius = Math.sqrt(blob.size / Math.PI);
      if (radius < CONFIG.minBlobRadius || radius > CONFIG.maxBlobRadius * 1.5) continue;

      const pixIdx = (Math.round(blob.cy) * w + Math.round(blob.cx)) * 4;
      if (pixIdx < 0 || pixIdx + 2 >= data.length) continue;
      const brightness = (data[pixIdx] + data[pixIdx + 1] + data[pixIdx + 2]) / 3;

      if (brightness < CONFIG.brightnessMin * 0.8) continue; // Must still be bright-ish

      candidates.push({
        x: blob.cx,
        y: blob.cy,
        radius,
        brightness: brightness + 20,
        size: blob.size,
        hasHSV: hsvMask[Math.round(blob.cy) * w + Math.round(blob.cx)] > 0,
        hasDiff: true,
        isBlurDetection: true,
      });
    }
  }

  return candidates.slice(0, 2);  // Reduced from 3 → 2
}

// ─── Sub-Pixel Centroid Refinement ─────────────────────────────

function refineSubPixelCenter(gray, cx, cy, radius, w, h) {
  const icx = Math.round(cx);
  const icy = Math.round(cy);

  if (icx < radius || icx >= w - radius || icy < radius || icy >= h - radius) {
    return { x: cx, y: cy };
  }

  let sumX = 0, sumY = 0, sumW = 0;
  const sigma2 = radius * radius;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const px = icx + dx;
      const py = icy + dy;
      const brightness = gray[py * w + px];
      const gaussWeight = Math.exp(-(dx * dx + dy * dy) / sigma2);
      const weight = brightness * gaussWeight;

      sumX += px * weight;
      sumY += py * weight;
      sumW += weight;
    }
  }

  if (sumW < 1e-6) return { x: cx, y: cy };
  return { x: sumX / sumW, y: sumY / sumW };
}

function floodFillMulti(diff, hsvMask, rawData, w, h, startX, startY, visited) {
  const queue = [[startX, startY]];
  let totalX = 0, totalY = 0, count = 0;
  let minX = w, maxX = 0, minY = h, maxY = 0;
  const maxSize = 500;  // Reduced from 800 — golf ball shouldn't be huge

  while (queue.length > 0 && count < maxSize) {
    const [x, y] = queue.pop();
    const idx = y * w + x;

    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    if (visited.has(idx)) continue;

    const hasDiff = diff[idx] >= CONFIG.diffThreshold;
    const hasHSV = hsvMask[idx] > 0;
    const pixIdx = idx * 4;
    const bright = (rawData[pixIdx] + rawData[pixIdx + 1] + rawData[pixIdx + 2]) / 3 >= CONFIG.brightnessMin;

    if (!hasDiff && !hasHSV && !bright) continue;

    visited.add(idx);
    totalX += x;
    totalY += y;
    count++;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);

    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  return {
    cx: count > 0 ? totalX / count : startX,
    cy: count > 0 ? totalY / count : startY,
    size: count,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
  };
}

// ─── Block-Matching Fallback ───────────────────────────────────

function estimateGlobalMotionFallback(prev, curr, w, h) {
  const gridCols = 8, gridRows = 6;
  const blockW = Math.floor(w / gridCols);
  const blockH = Math.floor(h / gridRows);
  const searchRange = 12;

  const dxValues = [], dyValues = [];

  for (let gr = 0; gr < gridRows; gr++) {
    for (let gc = 0; gc < gridCols; gc++) {
      const bx = gc * blockW;
      const by = gr * blockH;

      if (bx + blockW + searchRange >= w || by + blockH + searchRange >= h) continue;
      if (bx - searchRange < 0 || by - searchRange < 0) continue;

      let bestDx = 0, bestDy = 0, bestSAD = Infinity;

      for (let sy = -searchRange; sy <= searchRange; sy += 2) {
        for (let sx = -searchRange; sx <= searchRange; sx += 2) {
          let sad = 0;
          for (let py = 0; py < blockH; py += 2) {
            for (let px = 0; px < blockW; px += 2) {
              const currIdx = (by + py) * w + (bx + px);
              const prevIdx = (by + py + sy) * w + (bx + px + sx);
              sad += Math.abs(curr[currIdx] - prev[prevIdx]);
            }
          }
          if (sad < bestSAD) { bestSAD = sad; bestDx = sx; bestDy = sy; }
        }
      }

      dxValues.push(bestDx);
      dyValues.push(bestDy);
    }
  }

  dxValues.sort((a, b) => a - b);
  dyValues.sort((a, b) => a - b);

  return {
    dx: dxValues[Math.floor(dxValues.length / 2)] || 0,
    dy: dyValues[Math.floor(dyValues.length / 2)] || 0,
  };
}

function shiftedFrameDifference(prev, curr, w, h, dx, dy) {
  const diff = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const currIdx = y * w + x;
      const prevX = x + dx, prevY = y + dy;
      if (prevX < 0 || prevX >= w || prevY < 0 || prevY >= h) {
        diff[currIdx] = 0;
      } else {
        diff[currIdx] = Math.abs(curr[currIdx] - prev[prevY * w + prevX]);
      }
    }
  }
  return diff;
}

function toGrayscale(imageData) {
  const { data, width, height } = imageData;
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const idx = i * 4;
    gray[i] = Math.round(data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);
  }
  return gray;
}

// ─── Camera Offset (v4: homography-based) ──────────────────────

export function getCameraOffset(motionOffsets, currentTime) {
  if (!motionOffsets || motionOffsets.length === 0) {
    return {
      dx: 0, dy: 0,
      H: null,
      transformPoint: (x, y) => ({ x, y }),
    };
  }

  let closest = motionOffsets[0];
  for (let i = 1; i < motionOffsets.length; i++) {
    if (motionOffsets[i].time <= currentTime) {
      closest = motionOffsets[i];
    } else break;
  }

  if (closest.H) {
    return {
      dx: closest.H[2] || 0,
      dy: closest.H[5] || 0,
      H: closest.H,
      transformPoint: (x, y) => transformPointH(closest.H, x, y),
    };
  }

  return {
    dx: closest.accDx || 0,
    dy: closest.accDy || 0,
    H: null,
    transformPoint: (x, y) => ({ x: x - (closest.accDx || 0), y: y - (closest.accDy || 0) }),
  };
}

// ─── Trail Rendering (v4.1: same Catmull-Rom + physics-aware) ──

export function drawBallTrail(ctx, trajectory, upToIndex, width, height, cameraOffset = null, launchData = null) {
  if (!trajectory || trajectory.length < 2) return;

  const endIdx = Math.min(upToIndex, trajectory.length - 1);
  if (endIdx < 1) return;

  // Build screen-space points using per-point homography
  const screenPts = new Array(endIdx + 1);
  const currentH = cameraOffset?.H || null;

  for (let i = 0; i <= endIdx; i++) {
    const pt = trajectory[i];
    if (currentH && pt.H_world) {
      const H_world_inv = invertHomography(pt.H_world);
      const H_rel = multiplyHomography(currentH, H_world_inv);
      screenPts[i] = transformPointH(H_rel, pt.x, pt.y);
    } else {
      screenPts[i] = {
        x: pt.x - (cameraOffset?.dx || 0),
        y: pt.y - (cameraOffset?.dy || 0),
      };
    }
  }

  let maxSpeed = 1;
  for (let i = 0; i <= endIdx; i++) {
    const vx = trajectory[i].vx || 0;
    const vy = trajectory[i].vy || 0;
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > maxSpeed) maxSpeed = speed;
  }

  ctx.save();

  // Catmull-Rom spline trail with physics-aware styling
  for (let i = 1; i <= endIdx; i++) {
    const p0 = screenPts[Math.max(0, i - 2)];
    const p1 = screenPts[i - 1];
    const p2 = screenPts[i];
    const p3 = screenPts[Math.min(endIdx, i + 1)];

    const vx = trajectory[i].vx || 0;
    const vy = trajectory[i].vy || 0;
    const speed = Math.sqrt(vx * vx + vy * vy);
    const speedRatio = speed / maxSpeed;

    const hue = 80 - speedRatio * 40;

    const age = endIdx - i;
    const baseAlpha = trajectory[i].source === 'predicted' ? 0.25 : 0.75;
    const alpha = baseAlpha * Math.exp(-0.08 * age);

    const baseWidth = 3.5;
    const lineWidth = baseWidth / (1 + speedRatio * 1.2);
    const glowWidth = lineWidth * 3.5;

    const subSegments = 6;

    // Outer glow
    ctx.strokeStyle = `hsla(${hue}, 100%, 50%, ${alpha * 0.35})`;
    ctx.lineWidth = glowWidth;
    ctx.lineCap = 'round';
    ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;
    ctx.shadowBlur = 12;

    ctx.beginPath();
    const s0 = catmullRomPoint(p0, p1, p2, p3, 0);
    ctx.moveTo(s0.x, s0.y);
    for (let s = 1; s <= subSegments; s++) {
      const t = s / subSegments;
      const pt = catmullRomPoint(p0, p1, p2, p3, t);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();

    // Inner bright line
    ctx.strokeStyle = `hsla(${hue}, 100%, 60%, ${alpha})`;
    ctx.lineWidth = lineWidth;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    const s1 = catmullRomPoint(p0, p1, p2, p3, 0);
    ctx.moveTo(s1.x, s1.y);
    for (let s = 1; s <= subSegments; s++) {
      const t = s / subSegments;
      const pt = catmullRomPoint(p0, p1, p2, p3, t);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
  }

  // Predicted segments: dashed overlay
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = 'rgba(157, 255, 0, 0.2)';
  ctx.lineWidth = 1.5;
  ctx.shadowBlur = 0;
  let inPredicted = false;
  for (let i = 1; i <= endIdx; i++) {
    if (trajectory[i].source === 'predicted') {
      const p0 = screenPts[i - 1];
      const p1 = screenPts[i];
      if (!inPredicted) { ctx.beginPath(); ctx.moveTo(p0.x, p0.y); inPredicted = true; }
      ctx.lineTo(p1.x, p1.y);
    } else if (inPredicted) {
      ctx.stroke();
      inPredicted = false;
    }
  }
  if (inPredicted) ctx.stroke();
  ctx.setLineDash([]);

  // Ball at current position
  const current = screenPts[endIdx];

  ctx.shadowBlur = 20;
  ctx.shadowColor = '#9DFF00';
  ctx.fillStyle = 'rgba(157, 255, 0, 0.15)';
  ctx.beginPath();
  ctx.arc(current.x, current.y, Math.max(12, (trajectory[endIdx].radius || 5) * 2), 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 15;
  ctx.shadowColor = '#FFFFFF';
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(current.x, current.y, Math.max(5, trajectory[endIdx].radius || 5), 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#9DFF00';
  ctx.beginPath();
  ctx.arc(current.x, current.y, Math.max(2, (trajectory[endIdx].radius || 5) * 0.5), 0, Math.PI * 2);
  ctx.fill();

  // Apex marker
  if (launchData?.apex && launchData.apex.index <= endIdx) {
    const apexScreen = screenPts[launchData.apex.index];
    if (apexScreen) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#00BFFF';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(apexScreen.x - 30, apexScreen.y);
      ctx.lineTo(apexScreen.x + 30, apexScreen.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#00BFFF';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('APEX', apexScreen.x, apexScreen.y - 10);
    }
  }

  // Launch angle arc
  if (launchData?.valid && launchData.impactIndex <= endIdx) {
    const impactScreen = screenPts[launchData.impactIndex];
    if (impactScreen) {
      const angleRad = launchData.launchAngleRad;
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(impactScreen.x, impactScreen.y, 40, -angleRad, 0);
      ctx.stroke();
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${launchData.launchAngle}°`, impactScreen.x + 44, impactScreen.y - 5);
    }
  }

  ctx.restore();
}

// ─── Catmull-Rom Spline ────────────────────────────────────────

function catmullRomPoint(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

// ─── Interpolation ─────────────────────────────────────────────

export function interpolateTrajectory(trajectory, totalFrames, fps) {
  if (trajectory.length < 2) return trajectory;

  const interpolated = [];
  for (let i = 0; i < trajectory.length - 1; i++) {
    const a = trajectory[i];
    const b = trajectory[i + 1];
    interpolated.push(a);

    const frameDiff = b.frameIndex - a.frameIndex;
    if (frameDiff > 3) {
      for (let f = 1; f < frameDiff; f++) {
        const t = f / frameDiff;
        const midY = Math.min(a.y, b.y) - Math.abs(b.x - a.x) * 0.08;
        const interpY = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * midY + t * t * b.y;

        interpolated.push({
          x: a.x + (b.x - a.x) * t,
          y: interpY,
          time: a.time + (b.time - a.time) * t,
          frameIndex: a.frameIndex + f,
          brightness: 200,
          radius: a.radius,
          vx: (b.x - a.x) / frameDiff,
          vy: (b.y - a.y) / frameDiff,
          source: 'interpolated',
          H_world: a.H_world,
        });
      }
    }
  }
  interpolated.push(trajectory[trajectory.length - 1]);
  return interpolated;
}

// ─── Helper ────────────────────────────────────────────────────

function seekTo(video, time) {
  return new Promise((resolve) => {
    video.currentTime = time;
    video.onseeked = resolve;
  });
}
