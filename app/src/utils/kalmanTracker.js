/**
 * KALMAN TRACKER — 6-State Constant-Acceleration Model
 * =====================================================
 * State vector: [x, y, vx, vy, ax, ay]
 * 
 * Purpose: Track a golf ball in flight with physics-aware prediction.
 * When detection fails (blur, occlusion), the filter continues to
 * predict the ball's position using its kinematic model + gravity.
 *
 * Based on standard Kalman filter theory + golf-specific tuning:
 * - Gravity bias on ay (~9.81 m/s² in pixel-space, calibrated per video)
 * - Mahalanobis gating to reject false-positive detections
 * - Automatic initialization from first 2 detections
 *
 * References:
 * - Welch & Bishop, "An Introduction to the Kalman Filter" (UNC)
 * - Ultralytics YOLO + Kalman tracking pipeline
 * - npm kalman-filter constant-acceleration examples
 */

// ─── Matrix Utilities (tiny, no dependencies) ──────────────────
// We only need 6×6 matrices so no need for a full linear algebra lib.

function matCreate(rows, cols, fill = 0) {
  return Array.from({ length: rows }, () => new Float64Array(cols).fill(fill));
}

function matIdentity(n) {
  const m = matCreate(n, n);
  for (let i = 0; i < n; i++) m[i][i] = 1;
  return m;
}

function matCopy(m) {
  return m.map(row => Float64Array.from(row));
}

function matMul(a, b) {
  const rows = a.length, cols = b[0].length, inner = b.length;
  const result = matCreate(rows, cols);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      let sum = 0;
      for (let k = 0; k < inner; k++) sum += a[i][k] * b[k][j];
      result[i][j] = sum;
    }
  }
  return result;
}

function matTranspose(m) {
  const rows = m.length, cols = m[0].length;
  const result = matCreate(cols, rows);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) result[j][i] = m[i][j];
  }
  return result;
}

function matAdd(a, b) {
  return a.map((row, i) => Float64Array.from(row.map((v, j) => v + b[i][j])));
}

function matSub(a, b) {
  return a.map((row, i) => Float64Array.from(row.map((v, j) => v - b[i][j])));
}

function matScale(m, s) {
  return m.map(row => Float64Array.from(row.map(v => v * s)));
}

/** Invert a small matrix using Gauss-Jordan elimination. Works for 2×2 and 6×6. */
function matInverse(m) {
  const n = m.length;
  const aug = m.map((row, i) => {
    const r = new Float64Array(2 * n);
    for (let j = 0; j < n; j++) r[j] = row[j];
    r[n + i] = 1;
    return r;
  });

  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-12) return matIdentity(n); // Singular — return identity fallback

    for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j];
    }
  }

  return aug.map(row => Float64Array.from(row.slice(n)));
}

// ─── Kalman Filter ─────────────────────────────────────────────

const STATE_DIM = 6; // [x, y, vx, vy, ax, ay]
const MEAS_DIM = 2;  // [x, y] — we only measure position

/**
 * Create a new Kalman tracker for a golf ball.
 *
 * @param {Object} options
 * @param {number} options.dt — time step between frames (1/fps)
 * @param {number} options.processNoise — process noise scaling (higher = more responsive, less smooth)
 * @param {number} options.measurementNoise — measurement noise (higher = trusts model more)
 * @param {number} options.gravityPixels — gravity in pixel-space per dt² (tuned per video)
 * @returns {Object} Kalman tracker instance
 */
export function createKalmanTracker({
  dt = 1 / 30,
  processNoise = 5,
  measurementNoise = 4,
  gravityPixels = 0.5, // Gravity pull in pixels per frame (tuned empirically)
} = {}) {
  // State: [x, y, vx, vy, ax, ay]
  const state = new Float64Array(STATE_DIM);

  // State transition matrix F
  const F = buildTransitionMatrix(dt);

  // Measurement matrix H: we observe [x, y] from state [x, y, vx, vy, ax, ay]
  const H = matCreate(MEAS_DIM, STATE_DIM);
  H[0][0] = 1; // x
  H[1][1] = 1; // y

  // Process noise Q (constant acceleration model)
  const Q = buildProcessNoise(dt, processNoise);

  // Measurement noise R
  const R = matCreate(MEAS_DIM, MEAS_DIM);
  R[0][0] = measurementNoise * measurementNoise;
  R[1][1] = measurementNoise * measurementNoise;

  // Covariance matrix P (initialized high = uncertain)
  const P = matScale(matIdentity(STATE_DIM), 1000);

  // Control vector: gravity acts on ay
  const gravityControl = new Float64Array(STATE_DIM);
  // We bake gravity into the acceleration state during init, not as control input

  let initialized = false;
  let initPoints = [];
  let missedFrames = 0;
  const MAX_MISS = 15; // Stop predicting after 15 missed frames
  let age = 0;

  // ── Public API ───────────────────────────────────────

  function predict() {
    if (!initialized) return null;
    age++;

    // x_pred = F * x
    const xPred = matVecMul(F, state);

    // P_pred = F * P * F' + Q
    const FP = matMul(F, wrapState(P));
    const Ft = matTranspose(F);
    const pPred = matAdd(matMul(FP, Ft), Q);

    // Update internal state
    vecCopy(state, xPred);
    matCopyInto(P, pPred);

    return { x: state[0], y: state[1], vx: state[2], vy: state[3], ax: state[4], ay: state[5] };
  }

  function update(measX, measY) {
    if (!initialized) {
      initPoints.push({ x: measX, y: measY });
      if (initPoints.length >= 2) {
        initializeFromDetections(initPoints);
        initialized = true;
      }
      return { x: measX, y: measY, vx: 0, vy: 0, ax: 0, ay: 0 };
    }

    age++;
    missedFrames = 0;

    // Innovation: y = z - H * x
    const z = [measX, measY];
    const Hx = [H[0][0] * state[0] + H[0][1] * state[1], H[1][0] * state[0] + H[1][1] * state[1]];
    const innovation = [z[0] - Hx[0], z[1] - Hx[1]];

    // Innovation covariance: S = H * P * H' + R
    const HP = matMul(H, wrapState(P));
    const Ht = matTranspose(H);
    const S = matAdd(matMul(HP, Ht), R);

    // Kalman gain: K = P * H' * S⁻¹
    const PHt = matMul(wrapState(P), Ht);
    const Sinv = matInverse(S);
    const K = matMul(PHt, Sinv);

    // State update: x = x + K * innovation
    for (let i = 0; i < STATE_DIM; i++) {
      state[i] += K[i][0] * innovation[0] + K[i][1] * innovation[1];
    }

    // Covariance update: P = (I - K*H) * P
    const KH = matMul(K, H);
    const IKH = matSub(matIdentity(STATE_DIM), KH);
    const pNew = matMul(IKH, wrapState(P));
    matCopyInto(P, pNew);

    return { x: state[0], y: state[1], vx: state[2], vy: state[3], ax: state[4], ay: state[5] };
  }

  /**
   * Get the Mahalanobis distance from a measurement to the predicted state.
   * Used for gating — reject detections that are too far from prediction.
   */
  function mahalanobisDistance(measX, measY) {
    if (!initialized) return 0;

    const Hx = [H[0][0] * state[0] + H[0][1] * state[1], H[1][0] * state[0] + H[1][1] * state[1]];
    const dx = measX - Hx[0];
    const dy = measY - Hx[1];

    const HP = matMul(H, wrapState(P));
    const Ht = matTranspose(H);
    const S = matAdd(matMul(HP, Ht), R);
    const Sinv = matInverse(S);

    // d² = [dx, dy] * S⁻¹ * [dx, dy]'
    return Math.sqrt(
      (dx * Sinv[0][0] + dy * Sinv[1][0]) * dx +
      (dx * Sinv[0][1] + dy * Sinv[1][1]) * dy
    );
  }

  function handleMiss() {
    missedFrames++;
    if (missedFrames > MAX_MISS) return null;
    return predict();
  }

  function getState() {
    return {
      x: state[0], y: state[1],
      vx: state[2], vy: state[3],
      ax: state[4], ay: state[5],
      initialized, age, missedFrames,
    };
  }

  function isAlive() {
    return initialized && missedFrames <= MAX_MISS;
  }

  // ── Initialization ─────────────────────────────────

  function initializeFromDetections(points) {
    const p0 = points[0];
    const p1 = points[points.length - 1];
    const n = points.length - 1;

    state[0] = p1.x;               // x
    state[1] = p1.y;               // y
    state[2] = (p1.x - p0.x) / n;  // vx (pixels/frame)
    state[3] = (p1.y - p0.y) / n;  // vy (pixels/frame)
    state[4] = 0;                   // ax
    state[5] = gravityPixels;       // ay (gravity pulls down in pixel space)
  }

  // ── Internal helpers ───────────────────────────────

  function wrapState(p) {
    // P is stored as our internal 2D array; wrap if needed
    return Array.isArray(p) ? p : matIdentity(STATE_DIM);
  }

  function matCopyInto(dest, src) {
    for (let i = 0; i < dest.length; i++) {
      for (let j = 0; j < dest[i].length; j++) {
        dest[i][j] = src[i][j];
      }
    }
  }

  function vecCopy(dest, src) {
    for (let i = 0; i < dest.length; i++) dest[i] = src[i];
  }

  function matVecMul(m, v) {
    const result = new Float64Array(m.length);
    for (let i = 0; i < m.length; i++) {
      let sum = 0;
      for (let j = 0; j < v.length; j++) sum += m[i][j] * v[j];
      result[i] = sum;
    }
    return result;
  }

  return { predict, update, handleMiss, mahalanobisDistance, getState, isAlive };
}

// ─── State Transition Matrix ───────────────────────────────────

function buildTransitionMatrix(dt) {
  // Constant-acceleration model:
  // x  = x + vx*dt + 0.5*ax*dt²
  // vx = vx + ax*dt
  // ax = ax (constant)
  const dt2 = 0.5 * dt * dt;
  const F = matIdentity(STATE_DIM);
  F[0][2] = dt;   // x += vx*dt
  F[0][4] = dt2;  // x += 0.5*ax*dt²
  F[1][3] = dt;   // y += vy*dt
  F[1][5] = dt2;  // y += 0.5*ay*dt²
  F[2][4] = dt;   // vx += ax*dt
  F[3][5] = dt;   // vy += ay*dt
  return F;
}

// ─── Process Noise ─────────────────────────────────────────────

function buildProcessNoise(dt, sigma) {
  // Process noise for constant-acceleration model
  // Q = G * G' * σ²  where G is the noise gain matrix
  const dt2 = dt * dt;
  const dt3 = dt2 * dt;
  const dt4 = dt3 * dt;
  const s2 = sigma * sigma;

  const Q = matCreate(STATE_DIM, STATE_DIM);

  // Position-position
  Q[0][0] = dt4 / 4 * s2;
  Q[1][1] = dt4 / 4 * s2;

  // Position-velocity
  Q[0][2] = dt3 / 2 * s2;
  Q[2][0] = dt3 / 2 * s2;
  Q[1][3] = dt3 / 2 * s2;
  Q[3][1] = dt3 / 2 * s2;

  // Velocity-velocity
  Q[2][2] = dt2 * s2;
  Q[3][3] = dt2 * s2;

  // Position-acceleration
  Q[0][4] = dt2 / 2 * s2;
  Q[4][0] = dt2 / 2 * s2;
  Q[1][5] = dt2 / 2 * s2;
  Q[5][1] = dt2 / 2 * s2;

  // Velocity-acceleration
  Q[2][4] = dt * s2;
  Q[4][2] = dt * s2;
  Q[3][5] = dt * s2;
  Q[5][3] = dt * s2;

  // Acceleration-acceleration
  Q[4][4] = s2;
  Q[5][5] = s2;

  return Q;
}

// ─── Convenience: select best detection using Kalman gating ─────

/**
 * From a list of candidate detections, select the one closest to the
 * Kalman prediction (within gating threshold).
 *
 * @param {Object} tracker — Kalman tracker instance
 * @param {Array} candidates — [{ x, y, brightness, radius, ... }]
 * @param {number} gateThreshold — Mahalanobis distance threshold (default 3.0 = 99.7%)
 * @returns {{ candidate, distance } | null}
 */
export function selectBestCandidate(tracker, candidates, gateThreshold = 4.0) {
  if (!candidates || candidates.length === 0) return null;
  if (!tracker.isAlive()) {
    // Not initialized yet — return brightest candidate
    const best = candidates.reduce((a, b) => (b.brightness > a.brightness ? b : a));
    return { candidate: best, distance: 0 };
  }

  let bestCandidate = null;
  let bestDist = Infinity;

  for (const c of candidates) {
    const dist = tracker.mahalanobisDistance(c.x, c.y);
    if (dist < gateThreshold && dist < bestDist) {
      bestDist = dist;
      bestCandidate = c;
    }
  }

  return bestCandidate ? { candidate: bestCandidate, distance: bestDist } : null;
}
