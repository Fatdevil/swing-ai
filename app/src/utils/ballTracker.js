/**
 * BALL FLIGHT TRACKER — v3 (Kalman + HSV + Physics)
 * ==================================================
 * State-of-the-art golf ball tracking for smartphone video.
 *
 * Improvements over v2:
 * 1. HSV color segmentation (white ball vs sky/clouds)
 * 2. Multi-channel candidate scoring (diff + HSV + brightness)
 * 3. Kalman filter tracking (predict-through missed frames)
 * 4. Mahalanobis gating (reject false positives)
 * 5. Physics-based trajectory validation
 * 6. Launch data extraction (angle, speed, apex, carry)
 *
 * Pipeline per frame:
 * ┌─────────────────────────────────────────────────────────┐
 * │ Frame → Grayscale + HSV → Global Motion Est. →          │
 * │ Compensated Diff → Blob Detection (multi-channel) →     │
 * │ Kalman Gating → Update/Predict → World-Space Trajectory │
 * └─────────────────────────────────────────────────────────┘
 */

import { createKalmanTracker, selectBestCandidate } from './kalmanTracker.js';
import { analyzeLaunchData, scoreTrajectoryQuality } from './ballPhysics.js';

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
  
  // Aspect ratio (width / height)
  minAspect: 0.5,
  maxAspect: 2.0,
  
  // Kalman
  kalmanProcessNoise: 8,
  kalmanMeasurementNoise: 3,
  kalmanGateThreshold: 4.0,  // Mahalanobis distance
  
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

  onProgress(3, 'Initializing Kalman tracker...');

  // ── Initialize Kalman tracker ──
  const kalman = createKalmanTracker({
    dt,
    processNoise: CONFIG.kalmanProcessNoise,
    measurementNoise: CONFIG.kalmanMeasurementNoise,
    gravityPixels: 0.3,
  });

  let prevGray = null;
  let accDx = 0, accDy = 0;
  const motionOffsets = [];
  const kalmanTrajectory = []; // Kalman-filtered trajectory in world-space

  onProgress(5, 'Processing frames...');

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
      // 1. Global motion estimation (camera stabilization)
      const motion = estimateGlobalMotion(prevGray, gray, pw, ph);
      accDx += motion.dx;
      accDy += motion.dy;

      // 2. Compensated frame difference
      const diff = shiftedFrameDifference(prevGray, gray, pw, ph, motion.dx, motion.dy);

      // 3. Multi-channel blob detection
      const candidates = detectCandidates(diff, hsvMask, frameData, pw, ph);

      // 4. Kalman-guided candidate selection
      const kalmanPred = kalman.predict();
      const selection = selectBestCandidate(kalman, candidates, CONFIG.kalmanGateThreshold);

      if (selection) {
        // Update Kalman with measurement
        const kState = kalman.update(selection.candidate.x, selection.candidate.y);

        // World-space coordinates
        const worldX = (kState.x + accDx) / processScale;
        const worldY = (kState.y + accDy) / processScale;

        kalmanTrajectory.push({
          x: worldX,
          y: worldY,
          time,
          frameIndex: i,
          brightness: selection.candidate.brightness,
          radius: (selection.candidate.radius || 4) / processScale,
          vx: kState.vx / processScale,
          vy: kState.vy / processScale,
          kalmanDistance: selection.distance,
          source: 'detected',
        });
      } else if (kalman.isAlive()) {
        // No detection — use Kalman prediction
        const predicted = kalman.handleMiss();
        if (predicted) {
          const worldX = (predicted.x + accDx) / processScale;
          const worldY = (predicted.y + accDy) / processScale;

          kalmanTrajectory.push({
            x: worldX,
            y: worldY,
            time,
            frameIndex: i,
            brightness: 200,
            radius: 4 / processScale,
            vx: predicted.vx / processScale,
            vy: predicted.vy / processScale,
            kalmanDistance: -1,
            source: 'predicted',
          });
        }
      }
    }

    // Store motion offset for replay renderer
    motionOffsets.push({
      time,
      frameIndex: i,
      accDx: accDx / processScale,
      accDy: accDy / processScale,
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
 * This rejects clouds (lower V), trees (high S), sky (high S).
 */
function createHSVMask(frameData, w, h) {
  const { data } = frameData;
  const mask = new Uint8Array(w * h);

  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    const r = data[idx], g = data[idx + 1], b = data[idx + 2];

    // RGB → HSV (only V and S needed)
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const v = max;                        // Value = max(R,G,B)
    const s = max === 0 ? 0 : ((max - min) / max) * 255;  // Saturation

    // Golf ball: very bright (high V) and near-white (low S)
    if (v >= CONFIG.hsvValueMin && s <= CONFIG.hsvSatMax) {
      mask[i] = 255;
    }
  }

  // Morphological clean-up: erode + dilate to remove noise
  return morphClose(mask, w, h, 1);
}

/**
 * Simple morphological closing (dilate then erode) to clean up mask.
 */
function morphClose(mask, w, h, radius) {
  // Dilate
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

  // Erode
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

function detectCandidates(diff, hsvMask, frameData, w, h) {
  const candidates = [];
  const visited = new Set();
  const { data } = frameData;

  for (let y = 5; y < h - 5; y++) {
    for (let x = 5; x < w - 5; x++) {
      const idx = y * w + x;
      if (visited.has(idx)) continue;

      // Multi-channel score: needs motion diff OR hsv match
      const hasDiff = diff[idx] >= CONFIG.diffThreshold;
      const hasHSV = hsvMask[idx] > 0;

      if (!hasDiff && !hasHSV) continue;

      // Brightness check on original frame
      const pixIdx = idx * 4;
      const r = data[pixIdx], g = data[pixIdx + 1], b = data[pixIdx + 2];
      const brightness = (r + g + b) / 3;
      if (brightness < CONFIG.brightnessMin && !hasHSV) continue;

      // Flood fill to find blob
      const blob = floodFillMulti(diff, hsvMask, data, w, h, x, y, visited);

      if (blob.size < 2) continue;

      const radius = Math.sqrt(blob.size / Math.PI);
      if (radius < CONFIG.minBlobRadius || radius > CONFIG.maxBlobRadius) continue;

      // Circularity check (real ball is round)
      const circularity = blob.size / (Math.PI * radius * radius);
      if (circularity < CONFIG.minCircularity) continue;

      // Aspect ratio check
      if (blob.w > 0 && blob.h > 0) {
        const aspect = blob.w / blob.h;
        if (aspect < CONFIG.minAspect || aspect > CONFIG.maxAspect) continue;
      }

      // Score = brightness + HSV bonus + motion bonus
      let score = brightness;
      if (hasHSV) score += 50;   // HSV match bonus
      if (hasDiff) score += 30;  // Motion detected bonus

      candidates.push({
        x: blob.cx,
        y: blob.cy,
        radius,
        brightness: score,
        size: blob.size,
        hasHSV,
        hasDiff,
      });
    }
  }

  // Sort by composite score (highest first)
  candidates.sort((a, b) => b.brightness - a.brightness);
  return candidates.slice(0, 8); // Top 8
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

    // Accept pixel if it has motion OR is HSV-white
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

// ─── Global Motion Estimation (kept from v2 — proven robust) ──

function estimateGlobalMotion(prev, curr, w, h) {
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

// ─── Trail Rendering (enhanced with speed gradient) ────────────

/**
 * Get the accumulated camera offset for a given video time.
 */
export function getCameraOffset(motionOffsets, currentTime) {
  if (!motionOffsets || motionOffsets.length === 0) return { dx: 0, dy: 0 };
  let closest = motionOffsets[0];
  for (let i = 1; i < motionOffsets.length; i++) {
    if (motionOffsets[i].time <= currentTime) {
      closest = motionOffsets[i];
    } else break;
  }
  return { dx: closest.accDx, dy: closest.accDy };
}

/**
 * Draw the ball flight trail with speed-gradient coloring.
 * Fast = warm (lime/yellow), Slow = cool (cyan/blue).
 */
export function drawBallTrail(ctx, trajectory, upToIndex, width, height, cameraOffset = { dx: 0, dy: 0 }, launchData = null) {
  if (!trajectory || trajectory.length < 2) return;

  const endIdx = Math.min(upToIndex, trajectory.length - 1);
  if (endIdx < 1) return;

  const toScreen = (point) => ({
    x: point.x - cameraOffset.dx,
    y: point.y - cameraOffset.dy,
  });

  // Calculate max speed for gradient normalization
  let maxSpeed = 1;
  for (let i = 0; i <= endIdx; i++) {
    const vx = trajectory[i].vx || 0;
    const vy = trajectory[i].vy || 0;
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > maxSpeed) maxSpeed = speed;
  }

  ctx.save();

  // ── Draw speed-gradient trail ──
  for (let i = 1; i <= endIdx; i++) {
    const p0 = toScreen(trajectory[i - 1]);
    const p1 = toScreen(trajectory[i]);

    // Speed → color (lime=fast → cyan=slow)
    const vx = trajectory[i].vx || 0;
    const vy = trajectory[i].vy || 0;
    const speed = Math.sqrt(vx * vx + vy * vy);
    const speedRatio = speed / maxSpeed;

    const hue = 80 - speedRatio * 40; // 80=green(slow) → 40=yellow-green(fast)
    const alpha = trajectory[i].source === 'predicted' ? 0.3 : 0.7;

    // Outer glow
    ctx.strokeStyle = `hsla(${hue}, 100%, 50%, ${alpha * 0.4})`;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();

    // Inner bright line
    ctx.strokeStyle = `hsla(${hue}, 100%, 60%, ${alpha})`;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }

  // ── Predicted segments: dashed ──
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = 'rgba(157, 255, 0, 0.3)';
  ctx.lineWidth = 2;
  ctx.shadowBlur = 0;
  let inPredicted = false;
  for (let i = 1; i <= endIdx; i++) {
    if (trajectory[i].source === 'predicted') {
      const p0 = toScreen(trajectory[i - 1]);
      const p1 = toScreen(trajectory[i]);
      if (!inPredicted) { ctx.beginPath(); ctx.moveTo(p0.x, p0.y); inPredicted = true; }
      ctx.lineTo(p1.x, p1.y);
    } else if (inPredicted) {
      ctx.stroke();
      inPredicted = false;
    }
  }
  if (inPredicted) ctx.stroke();
  ctx.setLineDash([]);

  // ── Ball at current position ──
  const current = toScreen(trajectory[endIdx]);
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

  // ── Apex marker ──
  if (launchData?.apex && launchData.apex.index <= endIdx) {
    const apexScreen = toScreen(trajectory[launchData.apex.index]);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#00BFFF';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);

    // Horizontal line at apex
    ctx.beginPath();
    ctx.moveTo(apexScreen.x - 30, apexScreen.y);
    ctx.lineTo(apexScreen.x + 30, apexScreen.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label
    ctx.fillStyle = '#00BFFF';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('APEX', apexScreen.x, apexScreen.y - 10);
  }

  // ── Launch angle arc ──
  if (launchData?.valid && launchData.impactIndex <= endIdx) {
    const impactScreen = toScreen(trajectory[launchData.impactIndex]);
    const angleRad = launchData.launchAngleRad;

    ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);

    // Draw arc
    ctx.beginPath();
    ctx.arc(impactScreen.x, impactScreen.y, 40, -angleRad, 0);
    ctx.stroke();

    // Angle label
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${launchData.launchAngle}°`, impactScreen.x + 44, impactScreen.y - 5);
  }

  ctx.restore();
}

// ─── Interpolation (v3: Kalman-aware) ──────────────────────────

export function interpolateTrajectory(trajectory, totalFrames, fps) {
  // v3: Kalman already fills gaps via predict-through.
  // This function now only smooths large gaps (>3 frames).
  if (trajectory.length < 2) return trajectory;

  const interpolated = [];
  for (let i = 0; i < trajectory.length - 1; i++) {
    const a = trajectory[i];
    const b = trajectory[i + 1];
    interpolated.push(a);

    const frameDiff = b.frameIndex - a.frameIndex;
    if (frameDiff > 3) {
      // Parabolic interpolation for large gaps
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
