/**
 * BALL FLIGHT TRACKER
 * ===================
 * Detects and tracks a golf ball in flight from a video recorded behind the golfer.
 * 
 * Algorithm:
 * 1. Frame differencing — subtract consecutive frames to isolate motion
 * 2. Bright spot detection — golf balls are white/bright against sky
 * 3. Size filter — ball is small (3-20px diameter at distance)
 * 4. Trajectory continuity — track the most plausible upward arc
 * 5. Parabolic interpolation — fill gaps when ball is lost
 * 6. Glowing trail render — draw the flight path as a neon trail
 */

const DETECTION_CONFIG = {
  diffThreshold: 30,       // Pixel intensity difference to count as "motion"
  brightnessThreshold: 180, // Minimum brightness for a ball candidate (0-255)
  minBlobSize: 2,          // Minimum blob radius in pixels
  maxBlobSize: 25,         // Maximum blob radius in pixels
  searchRadius: 80,        // Max pixels between consecutive detections
  minFlightFrames: 3,      // Minimum frames to count as a valid flight
  frameSkip: 1,            // Process every Nth frame (1 = all frames)
};

/**
 * Process a video and detect ball flight trajectory
 * @param {File|Blob} videoFile — recorded/uploaded video
 * @param {function} onProgress — callback(percent, message)
 * @returns {Object} { trajectory, fps, width, height, duration, videoUrl }
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

  for (let i = 0; i < totalFrames; i += DETECTION_CONFIG.frameSkip) {
    const time = i / fps;
    
    // Seek to frame
    await seekTo(video, time);
    processCtx.drawImage(video, 0, 0, pw, ph);
    const frameData = processCtx.getImageData(0, 0, pw, ph);
    
    // Convert to grayscale
    const gray = toGrayscale(frameData);

    if (prevGray) {
      // Frame differencing
      const diff = frameDifference(prevGray, gray, pw, ph);
      
      // Detect bright moving spots
      const candidates = detectBrightSpots(diff, frameData, pw, ph);
      
      if (candidates.length > 0) {
        rawDetections.push({
          frameIndex: i,
          time,
          candidates,
        });
      }
    }

    prevGray = gray;

    // Progress update
    const percent = 5 + Math.round((i / totalFrames) * 70);
    if (i % 10 === 0) {
      onProgress(percent, `Processing frame ${i}/${totalFrames}...`);
    }
  }

  onProgress(80, 'Building trajectory...');
  
  // Build trajectory from raw detections
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

function frameDifference(prev, curr, w, h) {
  const diff = new Uint8Array(w * h);
  for (let i = 0; i < diff.length; i++) {
    diff[i] = Math.abs(curr[i] - prev[i]);
  }
  return diff;
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
// TRAJECTORY BUILDING
// ============================================================

function buildTrajectory(rawDetections, pw, ph, scale) {
  if (rawDetections.length === 0) return [];

  const { searchRadius } = DETECTION_CONFIG;
  const trajectory = [];
  let lastPoint = null;

  for (const det of rawDetections) {
    let bestCandidate = null;
    let bestScore = -Infinity;

    for (const c of det.candidates) {
      let score = c.brightness;

      // Prefer candidates in upper half of frame (ball goes up)
      if (c.y < ph * 0.7) score += 50;

      // If we have a previous point, prefer continuity
      if (lastPoint) {
        const dist = Math.sqrt((c.x - lastPoint.x) ** 2 + (c.y - lastPoint.y) ** 2);
        if (dist > searchRadius) continue; // Too far
        score += (searchRadius - dist); // Closer = better

        // Prefer upward motion (ball goes up after impact)
        if (c.y < lastPoint.y) score += 30;
      }

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = c;
      }
    }

    if (bestCandidate) {
      trajectory.push({
        x: bestCandidate.x / scale,
        y: bestCandidate.y / scale,
        time: det.time,
        frameIndex: det.frameIndex,
        brightness: bestCandidate.brightness,
        radius: bestCandidate.radius / scale,
      });
      lastPoint = bestCandidate;
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
// TRAIL RENDERING — Draw glowing neon trail on canvas
// ============================================================

/**
 * Draw the ball flight trail on a canvas over a video frame
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} trajectory — full trajectory (interpolated)
 * @param {number} upToIndex — draw trail up to this point (for animation)
 * @param {number} width — canvas width
 * @param {number} height — canvas height
 */
export function drawBallTrail(ctx, trajectory, upToIndex, width, height) {
  if (!trajectory || trajectory.length < 2) return;

  const endIdx = Math.min(upToIndex, trajectory.length - 1);
  if (endIdx < 1) return;

  // Draw the trail line
  ctx.save();

  // Outer glow
  ctx.strokeStyle = 'rgba(157, 255, 0, 0.3)';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = '#9DFF00';
  ctx.shadowBlur = 20;
  drawTrailPath(ctx, trajectory, 0, endIdx);

  // Middle line
  ctx.strokeStyle = 'rgba(157, 255, 0, 0.7)';
  ctx.lineWidth = 5;
  ctx.shadowBlur = 10;
  drawTrailPath(ctx, trajectory, 0, endIdx);

  // Inner bright line
  ctx.strokeStyle = '#9DFF00';
  ctx.lineWidth = 2;
  ctx.shadowBlur = 5;
  drawTrailPath(ctx, trajectory, 0, endIdx);

  // Draw ball at current position
  const current = trajectory[endIdx];
  ctx.shadowBlur = 15;
  ctx.shadowColor = '#FFFFFF';
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(current.x, current.y, Math.max(4, current.radius || 4), 0, Math.PI * 2);
  ctx.fill();

  // Bright center
  ctx.fillStyle = '#9DFF00';
  ctx.beginPath();
  ctx.arc(current.x, current.y, Math.max(2, (current.radius || 4) * 0.5), 0, Math.PI * 2);
  ctx.fill();

  // Draw fading dots along trail
  for (let i = Math.max(0, endIdx - 20); i < endIdx; i++) {
    const p = trajectory[i];
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

function drawTrailPath(ctx, trajectory, startIdx, endIdx) {
  ctx.beginPath();
  ctx.moveTo(trajectory[startIdx].x, trajectory[startIdx].y);
  
  for (let i = startIdx + 1; i <= endIdx; i++) {
    // Use quadratic curves for smooth trail
    if (i < endIdx) {
      const xc = (trajectory[i].x + trajectory[i + 1].x) / 2;
      const yc = (trajectory[i].y + trajectory[i + 1].y) / 2;
      ctx.quadraticCurveTo(trajectory[i].x, trajectory[i].y, xc, yc);
    } else {
      ctx.lineTo(trajectory[i].x, trajectory[i].y);
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
