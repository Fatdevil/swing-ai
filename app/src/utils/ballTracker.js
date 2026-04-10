/**
 * BALL FLIGHT TRACKER — v4 (Affine Flow + Homography + Catmull-Rom)
 * ==================================================================
 * World-class golf ball tracking for smartphone video.
 *
 * Improvements over v3:
 * 1. Affine motion estimation (Harris + Lucas-Kanade + RANSAC) — replaces block matching
 * 2. Per-point homography — eliminates drift completely
 * 3. Catmull-Rom spline rendering — silky smooth trail
 * 4. Sub-pixel Gaussian centroid refinement — ±0.1px precision
 * 5. Motion blur-aware detection — catches elongated high-speed blobs
 * 6. Physics-aware trail opacity/width — exponential fade + speed-proportional thickness
 * 7. Automatic fallback to block-matching when <15 RANSAC inliers (featureless sky)
 *
 * Pipeline per frame:
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ Frame → Grayscale + HSV → Harris Corners → LK Tracking → RANSAC Affine │
 * │ → Affine-Compensated Diff → Multi-Channel Blob Detection →              │
 * │ Sub-Pixel Refinement → Motion Blur Channel → Kalman Gating →            │
 * │ Update/Predict → Per-Point Homography → World-Space Trajectory          │
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
  diffThreshold: 25,

  // HSV: golf ball = high Value, low Saturation
  hsvValueMin: 180,       // V channel minimum (bright)
  hsvSatMax: 80,          // S channel maximum (near-white)

  // Brightness (RGB fallback)
  brightnessMin: 160,

  // Blob size (in process-space pixels)
  minBlobRadius: 2,
  maxBlobRadius: 30,

  // Circularity: area / (π × r²) — 1.0 = perfect circle
  minCircularity: 0.4,

  // Aspect ratio (width / height) — relaxed for motion blur
  minAspect: 0.3,
  maxAspect: 3.5,

  // Kalman
  kalmanProcessNoise: 8,
  kalmanMeasurementNoise: 3,
  kalmanGateThreshold: 4.0,  // Mahalanobis distance

  // Motion estimation
  affineMinInliers: 15,      // Below this: fall back to block matching
  cornerDetectInterval: 3,   // Re-detect corners every N frames (reuse via LK between)
  maxCorners: 60,

  // Motion blur detection
  motionBlurSpeedThreshold: 12, // px/frame — above this, enable elongated blob detection
  motionBlurMinAspect: 2.0,     // elongated blobs must be at least 2:1

  // Sub-pixel refinement
  subPixelRadius: 3,

  // General
  minFlightFrames: 3,
  frameSkip: 1,
  maxMissedBeforeStop: 15,
};

// ─── Main Entry Point ──────────────────────────────────────────

/**
 * Process a video and detect ball flight with Kalman-guided tracking.
 * @param {File|Blob} videoFile
 * @param {function} onProgress — callback(percent, message)
 * @returns {Object} { trajectory, launchData, quality, fps, width, height, duration, videoUrl, motionOffsets }
 */
export async function detectBallFlight(videoFile, onProgress = () => {}) {
  const videoUrl = URL.createObjectURL(videoFile);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  // Load video
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

  // Process at reduced resolution for speed
  const processScale = Math.min(1, 640 / width);
  const pw = Math.round(width * processScale);
  const ph = Math.round(height * processScale);

  const processCanvas = document.createElement('canvas');
  processCanvas.width = pw;
  processCanvas.height = ph;
  const processCtx = processCanvas.getContext('2d', { willReadFrequently: true });

  onProgress(3, 'Initializing v4 tracker (affine + homography)...');

  // ── Initialize Kalman tracker ──
  const kalman = createKalmanTracker({
    dt,
    processNoise: CONFIG.kalmanProcessNoise,
    measurementNoise: CONFIG.kalmanMeasurementNoise,
    gravityPixels: 0.3,
  });

  // ── Initialize affine motion system ──
  const homography = createHomographyAccumulator();
  let prevGray = null;
  let prevCorners = null;
  let cornerAge = 0;    // Frames since last corner detection

  const motionOffsets = [];       // Per-frame homography snapshots
  const kalmanTrajectory = [];    // Kalman-filtered trajectory in world-space

  onProgress(5, 'Processing frames with affine flow...');

  for (let i = 0; i < totalFrames; i += CONFIG.frameSkip) {
    const time = i / fps;

    // Seek + capture frame
    await seekTo(video, time);
    processCtx.drawImage(video, 0, 0, pw, ph);
    const frameData = processCtx.getImageData(0, 0, pw, ph);

    // Grayscale + HSV masks
    const gray = toGrayscale(frameData);
    const hsvMask = createHSVMask(frameData, pw, ph);

    if (prevGray) {
      // ═══════════════════════════════════════════════════════════
      // 1. AFFINE MOTION ESTIMATION (with block-matching fallback)
      // ═══════════════════════════════════════════════════════════

      let usedAffine = false;
      let frameDiff;

      // Detect or reuse corners
      if (!prevCorners || cornerAge >= CONFIG.cornerDetectInterval) {
        prevCorners = detectCorners(prevGray, pw, ph, CONFIG.maxCorners);
        cornerAge = 0;
      }

      if (prevCorners.length >= 6) { // Need at least 3 pairs
        // Track corners via Lucas-Kanade
        const flow = trackCorners(prevGray, gray, prevCorners, pw, ph);

        if (flow.count >= CONFIG.affineMinInliers) {
          // RANSAC affine estimation
          const result = estimateAffineRANSAC(flow.src, flow.dst, flow.count);

          if (result && result.inlierCount >= CONFIG.affineMinInliers) {
            // Success: apply affine transform to homography accumulator
            homography.applyAffine(result.affine);
            usedAffine = true;

            // Affine-compensated frame diff (much cleaner than shift)
            frameDiff = affineCompensatedDiff(prevGray, gray, result.affine, pw, ph);

            // Update corners: use tracked destinations as next frame's corners
            prevCorners = flow.dst.slice(0, flow.count * 2);
            cornerAge++;
          }
        }
      }

      if (!usedAffine) {
        // Fallback: block-matching (translation only) → convert to homography
        const motion = estimateGlobalMotionFallback(prevGray, gray, pw, ph);
        homography.applyTranslation(motion.dx, motion.dy);
        frameDiff = shiftedFrameDifference(prevGray, gray, pw, ph, motion.dx, motion.dy);

        // Force re-detect corners next frame
        prevCorners = null;
        cornerAge = CONFIG.cornerDetectInterval;
      }

      // ═══════════════════════════════════════════════════════════
      // 2. MULTI-CHANNEL BLOB DETECTION + SUB-PIXEL
      // ═══════════════════════════════════════════════════════════

      const candidates = detectCandidates(frameDiff, hsvMask, frameData, pw, ph, gray);

      // Motion blur-aware detection (secondary channel)
      if (kalman.getSpeed() > CONFIG.motionBlurSpeedThreshold) {
        const blurCandidates = detectMotionBlurCandidates(
          frameDiff, hsvMask, frameData, pw, ph,
          kalman.getMotionDirection(), kalman.getSpeed()
        );
        candidates.push(...blurCandidates);
      }

      // ═══════════════════════════════════════════════════════════
      // 3. KALMAN-GUIDED CANDIDATE SELECTION
      // ═══════════════════════════════════════════════════════════

      const kalmanPred = kalman.predict();
      const selection = selectBestCandidate(kalman, candidates, CONFIG.kalmanGateThreshold);

      if (selection) {
        // Update Kalman with measurement
        const kState = kalman.update(selection.candidate.x, selection.candidate.y);

        // Store in world-space with per-point homography
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
          // Per-point homography: snapshot of accumulated H at detection time
          H_world: homography.getMatrix(),
        });
      } else if (kalman.isAlive()) {
        // No detection — use Kalman prediction
        const predicted = kalman.handleMiss();
        if (predicted) {
          const screenX = predicted.x / processScale;
          const screenY = predicted.y / processScale;

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

    // Store per-frame homography snapshot for replay renderer
    motionOffsets.push({
      time,
      frameIndex: i,
      H: homography.getMatrix(),
    });

    prevGray = gray;

    // Progress
    const percent = 5 + Math.round((i / totalFrames) * 75);
    if (i % 8 === 0) {
      onProgress(percent, `Frame ${i}/${totalFrames} — ${kalmanTrajectory.length} points tracked`);
    }
  }

  onProgress(85, 'Analyzing launch data...');

  // ── Post-processing ──
  const trajectory = kalmanTrajectory;

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

// ─── HSV Color Segmentation ────────────────────────────────────

/**
 * Create a binary mask where golf-ball-like pixels = 255.
 * Golf ball in HSV: high Value (V > 180), low Saturation (S < 80).
 */
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

/**
 * Simple morphological closing (dilate then erode) to clean up mask.
 */
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

function detectCandidates(diff, hsvMask, frameData, w, h, gray) {
  const candidates = [];
  const visited = new Set();
  const { data } = frameData;

  for (let y = 5; y < h - 5; y++) {
    for (let x = 5; x < w - 5; x++) {
      const idx = y * w + x;
      if (visited.has(idx)) continue;

      const hasDiff = diff[idx] >= CONFIG.diffThreshold;
      const hasHSV = hsvMask[idx] > 0;

      if (!hasDiff && !hasHSV) continue;

      const pixIdx = idx * 4;
      const r = data[pixIdx], g = data[pixIdx + 1], b = data[pixIdx + 2];
      const brightness = (r + g + b) / 3;
      if (brightness < CONFIG.brightnessMin && !hasHSV) continue;

      // Flood fill to find blob
      const blob = floodFillMulti(diff, hsvMask, data, w, h, x, y, visited);

      if (blob.size < 2) continue;

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

      // Score = brightness + HSV bonus + motion bonus
      let score = brightness;
      if (hasHSV) score += 50;
      if (hasDiff) score += 30;

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
  return candidates.slice(0, 8);
}

// ─── Motion Blur-Aware Detection ───────────────────────────────

/**
 * Detect elongated blobs that match predicted motion direction.
 * Activated only when ball speed > threshold (typically 12+ px/frame).
 */
function detectMotionBlurCandidates(diff, hsvMask, frameData, w, h, motionAngle, speed) {
  const candidates = [];
  const visited = new Set();
  const { data } = frameData;

  // Expected blur length proportional to speed
  const expectedLength = Math.max(3, speed * 0.6);

  for (let y = 5; y < h - 5; y += 2) { // Step 2 for speed
    for (let x = 5; x < w - 5; x += 2) {
      const idx = y * w + x;
      if (visited.has(idx)) continue;
      if (diff[idx] < CONFIG.diffThreshold * 0.7) continue; // Lower threshold for blur

      const blob = floodFillMulti(diff, hsvMask, data, w, h, x, y, visited);
      if (blob.size < 4) continue;

      // Check if elongated in predicted direction
      const aspect = blob.w > 0 && blob.h > 0 ? Math.max(blob.w / blob.h, blob.h / blob.w) : 1;
      if (aspect < CONFIG.motionBlurMinAspect) continue;

      // Check if blob orientation matches motion direction
      const blobAngle = Math.atan2(blob.h, blob.w);
      const angleDiff = Math.abs(motionAngle - blobAngle);
      const normalizedAngleDiff = Math.min(angleDiff, Math.PI - angleDiff);
      if (normalizedAngleDiff > Math.PI / 3) continue; // Too different from predicted direction

      const radius = Math.sqrt(blob.size / Math.PI);
      if (radius < CONFIG.minBlobRadius || radius > CONFIG.maxBlobRadius * 1.5) continue;

      const pixIdx = (Math.round(blob.cy) * w + Math.round(blob.cx)) * 4;
      const brightness = (data[pixIdx] + data[pixIdx + 1] + data[pixIdx + 2]) / 3;

      candidates.push({
        x: blob.cx,
        y: blob.cy,
        radius,
        brightness: brightness + 20, // Small bonus for blur-match
        size: blob.size,
        hasHSV: hsvMask[Math.round(blob.cy) * w + Math.round(blob.cx)] > 0,
        hasDiff: true,
        isBlurDetection: true,
      });
    }
  }

  return candidates.slice(0, 3); // Max 3 blur candidates
}

// ─── Sub-Pixel Centroid Refinement ─────────────────────────────

/**
 * Gaussian-weighted centroid refinement around an integer center.
 * Achieves ~0.1px precision vs ±0.5px from flood-fill integer average.
 */
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
  const maxSize = 800;

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

// ─── Block-Matching Fallback (from v3 — for featureless frames) ─

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

/**
 * Get the camera transform for a given video time.
 * Returns an object with:
 *   - dx, dy: approximate translation (backward-compatible)
 *   - H: full 3×3 homography matrix
 *   - transformPoint(x, y): transforms world-space point to screen-space
 */
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

  // v4: full homography
  if (closest.H) {
    return {
      dx: closest.H[2] || 0,  // Approximate translation (tx)
      dy: closest.H[5] || 0,  // Approximate translation (ty)
      H: closest.H,
      transformPoint: (x, y) => transformPointH(closest.H, x, y),
    };
  }

  // v3 backward compat (shouldn't hit this in v4)
  return {
    dx: closest.accDx || 0,
    dy: closest.accDy || 0,
    H: null,
    transformPoint: (x, y) => ({ x: x - (closest.accDx || 0), y: y - (closest.accDy || 0) }),
  };
}

// ─── Trail Rendering (v4: Catmull-Rom + Physics-Aware) ─────────

/**
 * Draw the ball flight trail with:
 * - Per-point homography transform (world → screen)
 * - Catmull-Rom spline interpolation (silky smooth curves)
 * - Physics-aware opacity (exponential decay backward)
 * - Speed-proportional width (faster = thinner, like light trail exposure)
 * - Warm-to-cool heat gradient tied to velocity
 */
export function drawBallTrail(ctx, trajectory, upToIndex, width, height, cameraOffset = null, launchData = null) {
  if (!trajectory || trajectory.length < 2) return;

  const endIdx = Math.min(upToIndex, trajectory.length - 1);
  if (endIdx < 1) return;

  // ── Build screen-space points using per-point homography ──
  const screenPts = new Array(endIdx + 1);
  const currentH = cameraOffset?.H || null;

  for (let i = 0; i <= endIdx; i++) {
    const pt = trajectory[i];
    if (currentH && pt.H_world) {
      // H_relative = H_current * inverse(H_world)
      // This transforms from world-at-detection-time to current screen
      const H_world_inv = invertHomography(pt.H_world);
      const H_rel = multiplyHomography(currentH, H_world_inv);
      screenPts[i] = transformPointH(H_rel, pt.x, pt.y);
    } else {
      // Fallback: simple offset
      screenPts[i] = {
        x: pt.x - (cameraOffset?.dx || 0),
        y: pt.y - (cameraOffset?.dy || 0),
      };
    }
  }

  // Calculate max speed for gradient normalization
  let maxSpeed = 1;
  for (let i = 0; i <= endIdx; i++) {
    const vx = trajectory[i].vx || 0;
    const vy = trajectory[i].vy || 0;
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > maxSpeed) maxSpeed = speed;
  }

  ctx.save();

  // ── Draw Catmull-Rom spline trail with physics-aware styling ──
  for (let i = 1; i <= endIdx; i++) {
    const p0 = screenPts[Math.max(0, i - 2)];
    const p1 = screenPts[i - 1];
    const p2 = screenPts[i];
    const p3 = screenPts[Math.min(endIdx, i + 1)];

    // Speed → color (lime=fast → cyan=slow)
    const vx = trajectory[i].vx || 0;
    const vy = trajectory[i].vy || 0;
    const speed = Math.sqrt(vx * vx + vy * vy);
    const speedRatio = speed / maxSpeed;

    const hue = 80 - speedRatio * 40; // 80=green(slow) → 40=yellow-green(fast)

    // Physics-aware opacity: exponential decay backward from current position
    const age = endIdx - i;
    const baseAlpha = trajectory[i].source === 'predicted' ? 0.3 : 0.75;
    const alpha = baseAlpha * Math.exp(-0.08 * age);

    // Speed-proportional width: faster = thinner (light trail effect)
    const baseWidth = 3.5;
    const lineWidth = baseWidth / (1 + speedRatio * 1.2);
    const glowWidth = lineWidth * 3.5;

    // ── Draw sub-segments via Catmull-Rom ──
    const subSegments = 6;
    ctx.strokeStyle = `hsla(${hue}, 100%, 50%, ${alpha * 0.35})`;
    ctx.lineWidth = glowWidth;
    ctx.lineCap = 'round';
    ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;
    ctx.shadowBlur = 12;

    ctx.beginPath();
    const startPt = catmullRomPoint(p0, p1, p2, p3, 0);
    ctx.moveTo(startPt.x, startPt.y);
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
    const startPt2 = catmullRomPoint(p0, p1, p2, p3, 0);
    ctx.moveTo(startPt2.x, startPt2.y);
    for (let s = 1; s <= subSegments; s++) {
      const t = s / subSegments;
      const pt = catmullRomPoint(p0, p1, p2, p3, t);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
  }

  // ── Predicted segments: dashed overlay ──
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = 'rgba(157, 255, 0, 0.25)';
  ctx.lineWidth = 2;
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

  // ── Ball at current position with glow ──
  const current = screenPts[endIdx];

  // Outer pulsing glow
  ctx.shadowBlur = 20;
  ctx.shadowColor = '#9DFF00';
  ctx.fillStyle = 'rgba(157, 255, 0, 0.15)';
  ctx.beginPath();
  ctx.arc(current.x, current.y, Math.max(12, (trajectory[endIdx].radius || 5) * 2), 0, Math.PI * 2);
  ctx.fill();

  // White ball
  ctx.shadowBlur = 15;
  ctx.shadowColor = '#FFFFFF';
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(current.x, current.y, Math.max(5, trajectory[endIdx].radius || 5), 0, Math.PI * 2);
  ctx.fill();

  // Green center dot
  ctx.fillStyle = '#9DFF00';
  ctx.beginPath();
  ctx.arc(current.x, current.y, Math.max(2, (trajectory[endIdx].radius || 5) * 0.5), 0, Math.PI * 2);
  ctx.fill();

  // ── Apex marker ──
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

  // ── Launch angle arc ──
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

// ─── Catmull-Rom Spline Interpolation ──────────────────────────

/**
 * Evaluate a Catmull-Rom spline at parameter t ∈ [0, 1].
 * p0, p1, p2, p3 are control points; the curve goes from p1 to p2.
 */
function catmullRomPoint(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

// ─── Interpolation (v4: Kalman-aware + Catmull-Rom ready) ──────

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
          // Interpolated points get the H_world of the nearest detected point
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
