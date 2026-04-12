/**
 * Ball Lock Detector — Real-time golf ball detection in camera viewfinder
 * ========================================================================
 * Analyzes a small circular region of the camera feed to determine if a
 * golf ball is present. Returns a confidence score and lock state.
 *
 * Used in the camera viewfinder to show red/yellow/green ring feedback
 * before recording starts.
 *
 * Performance: <1ms per frame (analyzes only ~80×80px region)
 */

// Lock states
export const LOCK_STATE = {
  SEARCHING: 'searching',  // 🔴 No ball detected
  ACQUIRING: 'acquiring',  // 🟡 Possible ball, building confidence
  LOCKED:    'locked',      // 🟢 Ball confirmed
};

/**
 * Create a ball lock detector instance
 * @param {Object} options
 * @param {number} options.ringRadius - Radius of the targeting ring in CSS pixels
 * @param {number} options.lockThreshold - Consecutive frames needed for LOCKED (default: 8)
 * @param {number} options.acquireThreshold - Consecutive frames needed for ACQUIRING (default: 3)
 */
export function createBallLockDetector(options = {}) {
  const {
    ringRadius = 40,
    lockThreshold = 8,
    acquireThreshold = 3,
  } = options;

  let consecutiveDetections = 0;
  let consecutiveMisses = 0;
  let state = LOCK_STATE.SEARCHING;
  let confidence = 0;
  let lastBallCenter = null; // Sub-pixel center within the ring region

  /**
   * Analyze a video frame to detect ball presence in the ring region
   * @param {HTMLVideoElement} video - Live camera feed
   * @param {HTMLCanvasElement} canvas - Scratch canvas for pixel access
   * @param {number} ringCenterX - Ring center X in video coordinates
   * @param {number} ringCenterY - Ring center Y in video coordinates
   * @param {number} videoDisplayWidth - Displayed video width (CSS pixels)
   * @param {number} videoDisplayHeight - Displayed video height (CSS pixels)
   * @returns {{ state, confidence, ballCenter }}
   */
  function analyze(video, canvas, ringCenterX, ringCenterY, videoDisplayWidth, videoDisplayHeight) {
    if (!video || !video.videoWidth || !canvas) {
      return { state, confidence, ballCenter: null };
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Map ring center from display coordinates to actual video coordinates
    const scaleX = video.videoWidth / videoDisplayWidth;
    const scaleY = video.videoHeight / videoDisplayHeight;
    const vx = Math.round(ringCenterX * scaleX);
    const vy = Math.round(ringCenterY * scaleY);
    const vRadius = Math.round(ringRadius * Math.max(scaleX, scaleY));

    // Extract the ring region (small square around center)
    const regionSize = vRadius * 2;
    const sx = Math.max(0, vx - vRadius);
    const sy = Math.max(0, vy - vRadius);
    const sw = Math.min(regionSize, video.videoWidth - sx);
    const sh = Math.min(regionSize, video.videoHeight - sy);

    if (sw < 10 || sh < 10) {
      return { state, confidence, ballCenter: null };
    }

    // Draw region to scratch canvas
    canvas.width = sw;
    canvas.height = sh;
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

    const imageData = ctx.getImageData(0, 0, sw, sh);
    const { data } = imageData;

    // Analyze: look for a bright, low-saturation cluster (white/yellow golf ball)
    const centerRegionRadius = vRadius * 0.7; // Focus on inner 70% of ring
    let brightPixels = 0;
    let totalPixels = 0;
    let sumX = 0, sumY = 0, sumW = 0;
    let maxBrightness = 0;

    // Also track the brightest connected cluster
    const brightMap = new Uint8Array(sw * sh);

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        // Check if pixel is within circular region
        const dx = x - sw / 2;
        const dy = y - sh / 2;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > centerRegionRadius) continue;

        totalPixels++;
        const idx = (y * sw + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];

        // Brightness (V in HSV)
        const brightness = Math.max(r, g, b);
        // Saturation (S in HSV)
        const min = Math.min(r, g, b);
        const saturation = brightness === 0 ? 0 : ((brightness - min) / brightness) * 255;

        // Golf ball criteria: bright + low saturation (white) OR bright + yellow-ish
        const isWhiteBall = brightness > 180 && saturation < 70;
        const isYellowBall = brightness > 160 && r > 180 && g > 160 && b < 120 && saturation > 60;
        const isBallPixel = isWhiteBall || isYellowBall;

        if (isBallPixel) {
          brightPixels++;
          brightMap[y * sw + x] = 1;
          const weight = brightness;
          sumX += x * weight;
          sumY += y * weight;
          sumW += weight;
          if (brightness > maxBrightness) maxBrightness = brightness;
        }
      }
    }

    if (totalPixels === 0) {
      return updateState(false, null);
    }

    const brightRatio = brightPixels / totalPixels;

    // Check if bright pixels form a cluster (not scattered)
    const clusterScore = measureCluster(brightMap, sw, sh);

    // Detection score: combination of brightness ratio and clustering
    // Golf ball should be: ~5-30% of the ring area (depending on zoom/distance)
    // AND clustered (not scattered bright noise)
    const isBallLikeRatio = brightRatio > 0.03 && brightRatio < 0.5;
    const isGoodCluster = clusterScore > 0.4;

    const detected = isBallLikeRatio && isGoodCluster && maxBrightness > 170;

    // Calculate sub-pixel ball center (relative to ring center)
    let ballCenter = null;
    if (detected && sumW > 0) {
      const localX = sumX / sumW;
      const localY = sumY / sumW;
      // Convert back to display coordinates
      ballCenter = {
        x: (sx + localX) / scaleX,
        y: (sy + localY) / scaleY,
      };
    }

    return updateState(detected, ballCenter);
  }

  /**
   * Measure how clustered the bright pixels are (0 = scattered, 1 = tight cluster)
   */
  function measureCluster(brightMap, w, h) {
    // Find the largest connected component
    const visited = new Uint8Array(w * h);
    let largestComponent = 0;
    let totalBright = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (brightMap[y * w + x]) totalBright++;
      }
    }

    if (totalBright < 3) return 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (!brightMap[idx] || visited[idx]) continue;

        // BFS flood fill
        let componentSize = 0;
        const queue = [[x, y]];
        visited[idx] = 1;

        while (queue.length > 0) {
          const [cx, cy] = queue.pop();
          componentSize++;

          const neighbors = [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]];
          for (const [nx, ny] of neighbors) {
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const nIdx = ny * w + nx;
            if (brightMap[nIdx] && !visited[nIdx]) {
              visited[nIdx] = 1;
              queue.push([nx, ny]);
            }
          }
        }

        if (componentSize > largestComponent) {
          largestComponent = componentSize;
        }
      }
    }

    // Cluster score = what fraction of bright pixels are in the largest cluster
    return largestComponent / totalBright;
  }

  /**
   * Update state machine based on detection result
   */
  function updateState(detected, ballCenter) {
    if (detected) {
      consecutiveDetections++;
      consecutiveMisses = 0;
      lastBallCenter = ballCenter;

      if (consecutiveDetections >= lockThreshold) {
        state = LOCK_STATE.LOCKED;
        confidence = Math.min(1, 0.8 + (consecutiveDetections - lockThreshold) * 0.04);
      } else if (consecutiveDetections >= acquireThreshold) {
        state = LOCK_STATE.ACQUIRING;
        confidence = 0.3 + (consecutiveDetections / lockThreshold) * 0.5;
      } else {
        state = LOCK_STATE.SEARCHING;
        confidence = consecutiveDetections / acquireThreshold * 0.3;
      }
    } else {
      consecutiveMisses++;
      consecutiveDetections = Math.max(0, consecutiveDetections - 2); // Decay, not instant drop

      if (consecutiveMisses > 5) {
        state = LOCK_STATE.SEARCHING;
        confidence = 0;
        lastBallCenter = null;
      } else if (state === LOCK_STATE.LOCKED) {
        // Grace period — stay locked for a few frames
        confidence = Math.max(0, confidence - 0.15);
        if (confidence < 0.3) {
          state = LOCK_STATE.ACQUIRING;
        }
      } else {
        state = LOCK_STATE.SEARCHING;
        confidence = Math.max(0, confidence - 0.2);
      }
    }

    return { state, confidence, ballCenter: lastBallCenter };
  }

  /**
   * Get the seed position for the tracker (call this when recording starts)
   * Returns the ball position in video display coordinates, or null
   */
  function getSeedPosition() {
    if (state === LOCK_STATE.LOCKED && lastBallCenter) {
      return { ...lastBallCenter };
    }
    return null;
  }

  /**
   * Reset detector state
   */
  function reset() {
    consecutiveDetections = 0;
    consecutiveMisses = 0;
    state = LOCK_STATE.SEARCHING;
    confidence = 0;
    lastBallCenter = null;
  }

  return {
    analyze,
    getSeedPosition,
    reset,
    getState: () => ({ state, confidence, ballCenter: lastBallCenter }),
  };
}
