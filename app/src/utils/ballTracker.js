/**
 * BALL FLIGHT TRACKER — v2 (Motion-Compensated)
 * ================================================
 * Detects and tracks a golf ball in flight even when the camera moves.
 *
 * Key improvement over v1: **Global Motion Compensation**
 * 1. Each frame, estimate how much the *background* moved (= camera pan/shake)
 * 2. Subtract that motion before looking for the ball
 * 3. Store trajectory in world-space so the trail stays pinned to the sky
 *
 * Algorithm:
 * 1. Grid-based block matching   → estimate camera shift (dx, dy) per frame
 * 2. Compensated frame diff      → subtract shifted previous frame from current
 * 3. Bright spot detection        → golf balls are white/bright against sky
 * 4. Size filter                  → ball is small (3-20px diameter at distance)
 * 5. Trajectory continuity        → track the most plausible upward arc
 * 6. Parabolic interpolation      → fill gaps when ball is lost
 * 7. Offset-aware trail render    → draw the flight path anchored in world-space
 */

const DETECTION_CONFIG = {
  diffThreshold: 30,       // Pixel intensity difference to count as "motion"
  brightnessThreshold: 170, // Minimum brightness for a ball candidate (0-255)
  minBlobSize: 2,          // Minimum blob radius in pixels
  maxBlobSize: 25,         // Maximum blob radius in pixels
  searchRadius: 80,        // Max pixels between consecutive detections
  minFlightFrames: 3,      // Minimum frames to count as a valid flight
  frameSkip: 1,            // Process every Nth frame (1 = all frames)
};

// ============================================================
// GLOBAL MOTION ESTIMATION — Grid-based block matching
// ============================================================

/**
 * Estimate the global camera motion (dx, dy) between two grayscale frames.
 * Uses a grid of sample blocks and finds the shift that minimises SAD
 * (Sum of Absolute Differences). The median of all block shifts is taken
 * as the global motion vector — this is robust against the small ball blob.
 *
 * @param {Uint8Array} prev  — previous frame grayscale
 * @param {Uint8Array} curr  — current frame grayscale
 * @param {number} w         — frame width
 * @param {number} h         — frame height
 * @returns {{ dx: number, dy: number }}
 */
function estimateGlobalMotion(prev, curr, w, h) {
  const gridCols = 8;
  const gridRows = 6;
  const blockW = Math.floor(w / gridCols);
  const blockH = Math.floor(h / gridRows);
  const searchRange = 12; // ±12 pixels search — covers typical handheld shake

  const dxValues = [];
  const dyValues = [];

  for (let gr = 0; gr < gridRows; gr++) {
    for (let gc = 0; gc < gridCols; gc++) {
      const bx = gc * blockW;
      const by = gr * blockH;

      // Skip blocks that are too close to the edge
      if (bx + blockW + searchRange >= w || by + blockH + searchRange >= h) continue;
      if (bx - searchRange < 0 || by - searchRange < 0) continue;

      let bestDx = 0;
      let bestDy = 0;
      let bestSAD = Infinity;

      // Brute-force search over the shift window
      for (let sy = -searchRange; sy <= searchRange; sy += 2) { // step 2 for speed
        for (let sx = -searchRange; sx <= searchRange; sx += 2) {
          let sad = 0;
          // Sample every 2nd pixel inside the block for speed
          for (let py = 0; py < blockH; py += 2) {
            for (let px = 0; px < blockW; px += 2) {
              const currIdx = (by + py) * w + (bx + px);
              const prevIdx = (by + py + sy) * w + (bx + px + sx);
              sad += Math.abs(curr[currIdx] - prev[prevIdx]);
            }
          }
          if (sad < bestSAD) {
            bestSAD = sad;
            bestDx = sx;
            bestDy = sy;
          }
        }
      }

      dxValues.push(bestDx);
      dyValues.push(bestDy);
    }
  }

  // Median is robust against outliers (the ball itself, moving objects)
  dxValues.sort((a, b) => a - b);
  dyValues.sort((a, b) => a - b);

  const medianDx = dxValues[Math.floor(dxValues.length / 2)] || 0;
  const medianDy = dyValues[Math.floor(dyValues.length / 2)] || 0;

  return { dx: medianDx, dy: medianDy };
}

// ============================================================
// COMPENSATED FRAME DIFFERENCING
// ============================================================

/**
 * Compute frame difference with the previous frame shifted by (dx, dy).
 * This cancels out camera motion, leaving only independently-moving objects.
 */
function shiftedFrameDifference(prev, curr, w, h, dx, dy) {
  const diff = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const currIdx = y * w + x;
      const prevX = x + dx;
      const prevY = y + dy;
      if (prevX < 0 || prevX >= w || prevY < 0 || prevY >= h) {
        diff[currIdx] = 0; // Out of bounds — treat as no motion
      } else {
        const prevIdx = prevY * w + prevX;
        diff[currIdx] = Math.abs(curr[currIdx] - prev[prevIdx]);
      }
    }
  }
  return diff;
}

// ============================================================
// MAIN DETECTION PIPELINE
// ============================================================

/**
 * Process a video and detect ball flight trajectory with motion compensation.
 * @param {File|Blob} videoFile — recorded/uploaded video
 * @param {function} onProgress — callback(percent, message)
 * @returns {Object} { trajectory, fps, width, height, duration, videoUrl, motionOffsets }
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
  const fps = 30; // Assume 30fps (standard mobile)
  const totalFrames = Math.floor(duration * fps);

  // Use a smaller canvas for processing (performance)
  const processScale = Math.min(1, 640 / width);
  const pw = Math.round(width * processScale);
  const ph = Math.round(height * processScale);

  const processCanvas = document.createElement('canvas');
  processCanvas.width = pw;
  processCanvas.height = ph;
  const processCtx = processCanvas.getContext('2d', { willReadFrequently: true });

  // Extract and analyze frames
  onProgress(5, 'Reading video frames...');

  let prevGray = null;
  const rawDetections = [];

  // Accumulated camera offset in process-space
  let accDx = 0;
  let accDy = 0;

  // Store per-frame camera offset (in original video pixel space)
  // so the replay renderer can look up the offset for any timestamp
  const motionOffsets = []; // { time, accDx, accDy } (in video-pixel coords)

  for (let i = 0; i < totalFrames; i += DETECTION_CONFIG.frameSkip) {
    const time = i / fps;

    // Seek to frame
    await seekTo(video, time);
    processCtx.drawImage(video, 0, 0, pw, ph);
    const frameData = processCtx.getImageData(0, 0, pw, ph);

    // Convert to grayscale
    const gray = toGrayscale(frameData);

    if (prevGray) {
      // 1. Estimate global camera motion
      const motion = estimateGlobalMotion(prevGray, gray, pw, ph);
      accDx += motion.dx;
      accDy += motion.dy;

      // 2. Compensated frame differencing
      const diff = shiftedFrameDifference(prevGray, gray, pw, ph, motion.dx, motion.dy);

      // 3. Detect bright moving spots on the compensated diff
      const candidates = detectBrightSpots(diff, frameData, pw, ph);

      if (candidates.length > 0) {
        rawDetections.push({
          frameIndex: i,
          time,
          candidates,
          accDx, // cumulative camera offset at this frame (process-space)
          accDy,
        });
      }
    } else {
      // First frame: no motion yet
      accDx = 0;
      accDy = 0;
    }

    // Store motion offset for this frame (in video-pixel space for rendering)
    motionOffsets.push({
      time,
      frameIndex: i,
      accDx: accDx / processScale,
      accDy: accDy / processScale,
    });

    prevGray = gray;

    // Progress update
    const percent = 5 + Math.round((i / totalFrames) * 70);
    if (i % 10 === 0) {
      onProgress(percent, `Processing frame ${i}/${totalFrames}...`);
    }
  }

  onProgress(80, 'Building trajectory...');

  // Build trajectory from raw detections (world-space)
  const trajectory = buildTrajectory(rawDetections, pw, ph, processScale);

  // If trajectory is too short, try with relaxed parameters
  if (trajectory.length < DETECTION_CONFIG.minFlightFrames) {
    onProgress(85, 'Refining detection...');
    const relaxedTrajectory = buildTrajectoryRelaxed(rawDetections, pw, ph, processScale);
    if (relaxedTrajectory.length > trajectory.length) {
      onProgress(95, 'Trajectory found!');
      return {
        trajectory: relaxedTrajectory,
        fps,
        width,
        height,
        duration,
        videoUrl,
        processScale,
        motionOffsets,
      };
    }
  }

  onProgress(95, trajectory.length > 0 ? 'Trajectory found!' : 'No clear ball flight detected');

  return {
    trajectory,
    fps,
    width,
    height,
    duration,
    videoUrl,
    processScale,
    motionOffsets,
  };
}

// ============================================================
// CORE ALGORITHMS
// ============================================================

function toGrayscale(imageData) {
  const { data, width, height } = imageData;
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const idx = i * 4;
    gray[i] = Math.round(data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);
  }
  return gray;
}

function detectBrightSpots(diff, frameData, w, h) {
  const { diffThreshold, brightnessThreshold, minBlobSize, maxBlobSize } = DETECTION_CONFIG;
  const candidates = [];
  const visited = new Set();

  for (let y = 5; y < h - 5; y++) {
    for (let x = 5; x < w - 5; x++) {
      const idx = y * w + x;

      if (visited.has(idx)) continue;
      if (diff[idx] < diffThreshold) continue;

      // Check brightness in original frame
      const pixIdx = idx * 4;
      const r = frameData.data[pixIdx];
      const g = frameData.data[pixIdx + 1];
      const b = frameData.data[pixIdx + 2];
      const brightness = (r + g + b) / 3;

      if (brightness < brightnessThreshold) continue;

      // Flood fill to find blob size
      const blob = floodFill(diff, w, h, x, y, diffThreshold, visited);

      if (blob.size >= minBlobSize && blob.size <= maxBlobSize * maxBlobSize) {
        const radius = Math.sqrt(blob.size / Math.PI);
        if (radius >= minBlobSize && radius <= maxBlobSize) {
          candidates.push({
            x: blob.cx,
            y: blob.cy,
            radius,
            brightness,
            size: blob.size,
          });
        }
      }
    }
  }

  // Sort by brightness (brightest first)
  candidates.sort((a, b) => b.brightness - a.brightness);
  return candidates.slice(0, 5); // Top 5 candidates per frame
}

function floodFill(data, w, h, startX, startY, threshold, visited) {
  const queue = [[startX, startY]];
  let totalX = 0, totalY = 0, count = 0;
  const maxSize = 600; // Safety limit

  while (queue.length > 0 && count < maxSize) {
    const [x, y] = queue.pop();
    const idx = y * w + x;

    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    if (visited.has(idx)) continue;
    if (data[idx] < threshold) continue;

    visited.add(idx);
    totalX += x;
    totalY += y;
    count++;

    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  return {
    cx: count > 0 ? totalX / count : startX,
    cy: count > 0 ? totalY / count : startY,
    size: count,
  };
}

// ============================================================
// TRAJECTORY BUILDING — World-space coordinates
// ============================================================

function buildTrajectory(rawDetections, pw, ph, scale) {
  if (rawDetections.length === 0) return [];

  const { searchRadius } = DETECTION_CONFIG;
  const trajectory = [];
  let lastPoint = null; // in process-space (compensated)

  for (const det of rawDetections) {
    let bestCandidate = null;
    let bestScore = -Infinity;

    for (const c of det.candidates) {
      let score = c.brightness;

      // Prefer candidates in upper half of frame (ball goes up)
      if (c.y < ph * 0.7) score += 50;

      // If we have a previous point, prefer continuity
      // Compare in world-space (pixel + accumulated offset)
      if (lastPoint) {
        const worldX = c.x + det.accDx;
        const worldY = c.y + det.accDy;
        const dist = Math.sqrt((worldX - lastPoint.worldX) ** 2 + (worldY - lastPoint.worldY) ** 2);
        if (dist > searchRadius) continue; // Too far in world-space
        score += (searchRadius - dist); // Closer = better

        // Prefer upward motion in world-space
        if (worldY < lastPoint.worldY) score += 30;
      }

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = c;
      }
    }

    if (bestCandidate) {
      const worldX = (bestCandidate.x + det.accDx) / scale;
      const worldY = (bestCandidate.y + det.accDy) / scale;

      trajectory.push({
        x: worldX,  // world-space X (video-pixel scale)
        y: worldY,  // world-space Y (video-pixel scale)
        time: det.time,
        frameIndex: det.frameIndex,
        brightness: bestCandidate.brightness,
        radius: bestCandidate.radius / scale,
      });

      lastPoint = {
        worldX: bestCandidate.x + det.accDx,
        worldY: bestCandidate.y + det.accDy,
      };
    }
  }

  return trajectory;
}

function buildTrajectoryRelaxed(rawDetections, pw, ph, scale) {
  // Try with a wider search radius and lower brightness
  const relaxed = rawDetections.map((det) => ({
    ...det,
    candidates: det.candidates.filter((c) => c.brightness > 140),
  })).filter((det) => det.candidates.length > 0);

  const oldRadius = DETECTION_CONFIG.searchRadius;
  DETECTION_CONFIG.searchRadius = 120;
  const result = buildTrajectory(relaxed, pw, ph, scale);
  DETECTION_CONFIG.searchRadius = oldRadius;
  return result;
}

// ============================================================
// INTERPOLATION — Fill gaps with parabolic curve
// ============================================================

export function interpolateTrajectory(trajectory, totalFrames, fps) {
  if (trajectory.length < 2) return trajectory;

  const interpolated = [];
  for (let i = 0; i < trajectory.length - 1; i++) {
    const a = trajectory[i];
    const b = trajectory[i + 1];
    interpolated.push(a);

    const frameDiff = b.frameIndex - a.frameIndex;
    if (frameDiff > 2) {
      // Interpolate missing frames with parabolic arc
      for (let f = 1; f < frameDiff; f++) {
        const t = f / frameDiff;
        // Parabolic y (accounting for gravity)
        const midY = Math.min(a.y, b.y) - Math.abs(b.x - a.x) * 0.1;
        const interpY = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * midY + t * t * b.y;

        interpolated.push({
          x: a.x + (b.x - a.x) * t,
          y: interpY,
          time: a.time + (b.time - a.time) * t,
          frameIndex: a.frameIndex + f,
          interpolated: true,
          brightness: 200,
          radius: a.radius,
        });
      }
    }
  }
  interpolated.push(trajectory[trajectory.length - 1]);
  return interpolated;
}

// ============================================================
// CAMERA OFFSET LOOKUP — For the replay renderer
// ============================================================

/**
 * Get the accumulated camera offset for a given video time.
 * Uses the motionOffsets array returned by detectBallFlight.
 * @param {Array} motionOffsets — [{ time, accDx, accDy }]
 * @param {number} currentTime — current video playback time
 * @returns {{ dx: number, dy: number }}
 */
export function getCameraOffset(motionOffsets, currentTime) {
  if (!motionOffsets || motionOffsets.length === 0) return { dx: 0, dy: 0 };

  // Find the closest offset entry for this time
  let closest = motionOffsets[0];
  for (let i = 1; i < motionOffsets.length; i++) {
    if (motionOffsets[i].time <= currentTime) {
      closest = motionOffsets[i];
    } else {
      break;
    }
  }
  return { dx: closest.accDx, dy: closest.accDy };
}

// ============================================================
// TRAIL RENDERING — Offset-aware glowing neon trail
// ============================================================

/**
 * Draw the ball flight trail on a canvas over a video frame.
 * Trail points are in world-space; we transform them to screen-space
 * using the camera offset for the current frame.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} trajectory — full trajectory (world-space, interpolated)
 * @param {number} upToIndex — draw trail up to this point (for animation)
 * @param {number} width — canvas width
 * @param {number} height — canvas height
 * @param {{ dx: number, dy: number }} cameraOffset — accumulated camera pan at current frame
 */
export function drawBallTrail(ctx, trajectory, upToIndex, width, height, cameraOffset = { dx: 0, dy: 0 }) {
  if (!trajectory || trajectory.length < 2) return;

  const endIdx = Math.min(upToIndex, trajectory.length - 1);
  if (endIdx < 1) return;

  // Transform trajectory points from world-space to screen-space
  const toScreen = (point) => ({
    x: point.x - cameraOffset.dx,
    y: point.y - cameraOffset.dy,
  });

  ctx.save();

  // Outer glow
  ctx.strokeStyle = 'rgba(157, 255, 0, 0.3)';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = '#9DFF00';
  ctx.shadowBlur = 20;
  drawTrailPath(ctx, trajectory, 0, endIdx, toScreen);

  // Middle line
  ctx.strokeStyle = 'rgba(157, 255, 0, 0.7)';
  ctx.lineWidth = 5;
  ctx.shadowBlur = 10;
  drawTrailPath(ctx, trajectory, 0, endIdx, toScreen);

  // Inner bright line
  ctx.strokeStyle = '#9DFF00';
  ctx.lineWidth = 2;
  ctx.shadowBlur = 5;
  drawTrailPath(ctx, trajectory, 0, endIdx, toScreen);

  // Draw ball at current position
  const current = toScreen(trajectory[endIdx]);
  ctx.shadowBlur = 15;
  ctx.shadowColor = '#FFFFFF';
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(current.x, current.y, Math.max(4, trajectory[endIdx].radius || 4), 0, Math.PI * 2);
  ctx.fill();

  // Bright center
  ctx.fillStyle = '#9DFF00';
  ctx.beginPath();
  ctx.arc(current.x, current.y, Math.max(2, (trajectory[endIdx].radius || 4) * 0.5), 0, Math.PI * 2);
  ctx.fill();

  // Draw fading dots along trail
  for (let i = Math.max(0, endIdx - 20); i < endIdx; i++) {
    const p = toScreen(trajectory[i]);
    const age = (endIdx - i) / 20;
    const alpha = Math.max(0, 1 - age);

    ctx.fillStyle = `rgba(157, 255, 0, ${alpha * 0.5})`;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawTrailPath(ctx, trajectory, startIdx, endIdx, toScreen) {
  const start = toScreen(trajectory[startIdx]);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);

  for (let i = startIdx + 1; i <= endIdx; i++) {
    const p = toScreen(trajectory[i]);
    // Use quadratic curves for smooth trail
    if (i < endIdx) {
      const next = toScreen(trajectory[i + 1]);
      const xc = (p.x + next.x) / 2;
      const yc = (p.y + next.y) / 2;
      ctx.quadraticCurveTo(p.x, p.y, xc, yc);
    } else {
      ctx.lineTo(p.x, p.y);
    }
  }
  ctx.stroke();
}

// ============================================================
// HELPER
// ============================================================

function seekTo(video, time) {
  return new Promise((resolve) => {
    video.currentTime = time;
    video.onseeked = resolve;
  });
}
