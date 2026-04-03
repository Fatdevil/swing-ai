/**
 * BALL PHYSICS — Launch Data Estimation from Trajectory
 * =====================================================
 * Given a tracked trajectory in pixel-space, estimate:
 * - Launch angle (degrees)
 * - Ball speed (relative, or m/s if calibrated)
 * - Apex height (pixels + estimated meters)
 * - Carry distance (estimated)
 * - Shot shape (straight / draw / fade)
 *
 * Physics model:
 * - Drag: Fd = 0.5 × Cd × ρ × A × v²
 * - Magnus: Fm ≈ Cl × v (simplified for 2D)
 * - Gravity: g = 9.81 m/s²
 *
 * Note: Without camera calibration (known distance to ball),
 * speed and distance are ESTIMATES based on assumed scale.
 * Launch angle is accurate regardless (it's a ratio).
 */

// ─── Physical Constants ────────────────────────────────────────

const GOLF_BALL = {
  mass: 0.04593,           // kg
  radius: 0.02135,         // m
  area: Math.PI * 0.02135 * 0.02135, // m²
  Cd: 0.25,                // drag coefficient (dimpled ball)
  Cl: 0.18,                // lift coefficient (average backspin)
};

const AIR = {
  density: 1.225,          // kg/m³ at sea level, 15°C
  g: 9.81,                 // m/s²
};

// ─── Launch Data Extraction ────────────────────────────────────

/**
 * Analyze a trajectory and extract launch metrics.
 *
 * @param {Array} trajectory — [{ x, y, time, vx?, vy?, ... }] from Kalman tracker
 * @param {number} videoWidth — video width in pixels
 * @param {number} videoHeight — video height in pixels  
 * @param {number} fps — frames per second
 * @param {Object} calibration — optional { metersPerPixel } for real-world estimates
 * @returns {Object} launch data
 */
export function analyzeLaunchData(trajectory, videoWidth, videoHeight, fps = 30, calibration = null) {
  if (!trajectory || trajectory.length < 3) {
    return { valid: false, reason: 'Too few trajectory points' };
  }

  // ── 1. Find impact frame (ball starts moving) ──
  const impactIdx = findImpactFrame(trajectory);
  const impactPoint = trajectory[impactIdx];

  // ── 2. Launch angle ──
  const launchAngle = calculateLaunchAngle(trajectory, impactIdx);

  // ── 3. Initial velocity (pixels/second) ──
  const initialSpeed = calculateInitialSpeed(trajectory, impactIdx, fps);

  // ── 4. Apex ──
  const apex = findApex(trajectory, impactIdx);

  // ── 5. Landing point (or last known position) ──
  const landing = findLandingPoint(trajectory, impactIdx, apex.index);

  // ── 6. Shot shape (lateral deviation) ──
  const shotShape = analyzeShotShape(trajectory, impactIdx);

  // ── 7. Flight time ──
  const flightTime = trajectory.length > 0
    ? trajectory[trajectory.length - 1].time - impactPoint.time
    : 0;

  // ── 8. Real-world estimates (if calibrated) ──
  let realWorld = null;
  if (calibration?.metersPerPixel) {
    const mpp = calibration.metersPerPixel;
    realWorld = {
      ballSpeedMs: initialSpeed * mpp,
      ballSpeedKmh: initialSpeed * mpp * 3.6,
      ballSpeedMph: initialSpeed * mpp * 2.237,
      apexHeightM: apex.heightPixels * mpp,
      carryDistanceM: landing.distancePixels * mpp,
      carryDistanceYards: landing.distancePixels * mpp * 1.094,
    };
  }

  // ── 9. Estimate without calibration (assume standard conditions) ──
  // Use pixel-based ratios which are always valid
  const heightRatio = apex.heightPixels / videoHeight;
  const distanceRatio = landing.distancePixels / videoWidth;

  // Rough estimate: assume camera captures ~60° FOV at ~5m distance
  // This gives ~6m visible width → ~0.009 m/px for 640px width
  const estimatedMpp = calibration?.metersPerPixel || (6.0 / videoWidth);
  const estimatedSpeed = initialSpeed * estimatedMpp;

  return {
    valid: true,
    launchAngle: Math.round(launchAngle * 10) / 10,         // degrees
    launchAngleRad: launchAngle * (Math.PI / 180),

    initialSpeedPxPerSec: Math.round(initialSpeed),
    estimatedSpeedKmh: Math.round(estimatedSpeed * 3.6),
    estimatedSpeedMph: Math.round(estimatedSpeed * 2.237),

    apex: {
      x: apex.x,
      y: apex.y,
      index: apex.index,
      heightPixels: Math.round(apex.heightPixels),
      heightRatio: Math.round(heightRatio * 100) / 100,
    },

    landing: {
      x: landing.x,
      y: landing.y,
      distancePixels: Math.round(landing.distancePixels),
      distanceRatio: Math.round(distanceRatio * 100) / 100,
    },

    shotShape: shotShape.type,          // 'straight' | 'draw' | 'fade' | 'hook' | 'slice'
    lateralDeviation: shotShape.deviation,

    flightTime: Math.round(flightTime * 100) / 100,  // seconds
    totalPoints: trajectory.length,
    impactIndex: impactIdx,

    realWorld,
  };
}

// ─── Sub-algorithms ────────────────────────────────────────────

function findImpactFrame(trajectory) {
  // Impact = first frame where ball velocity jumps significantly
  // Look for the biggest velocity change in the first third of trajectory
  if (trajectory.length < 3) return 0;

  let maxAccel = 0;
  let impactIdx = 0;
  const searchEnd = Math.min(trajectory.length - 1, Math.floor(trajectory.length / 3) + 2);

  for (let i = 1; i < searchEnd; i++) {
    const prev = trajectory[i - 1];
    const curr = trajectory[i];
    const dt = curr.time - prev.time || 1 / 30;
    const vx = (curr.x - prev.x) / dt;
    const vy = (curr.y - prev.y) / dt;
    const speed = Math.sqrt(vx * vx + vy * vy);

    if (i > 1) {
      const prevPrev = trajectory[i - 2];
      const prevDt = prev.time - prevPrev.time || 1 / 30;
      const prevVx = (prev.x - prevPrev.x) / prevDt;
      const prevVy = (prev.y - prevPrev.y) / prevDt;
      const prevSpeed = Math.sqrt(prevVx * prevVx + prevVy * prevVy);
      const accel = speed - prevSpeed;
      if (accel > maxAccel) {
        maxAccel = accel;
        impactIdx = i - 1;
      }
    }
  }

  return impactIdx;
}

function calculateLaunchAngle(trajectory, impactIdx) {
  // Use the first 3-5 points after impact to calculate launch vector
  const endIdx = Math.min(impactIdx + 5, trajectory.length - 1);
  if (endIdx <= impactIdx) return 0;

  // Linear regression over the initial flight points for robust angle
  const points = trajectory.slice(impactIdx, endIdx + 1);
  if (points.length < 2) return 0;

  const p0 = points[0];
  const p1 = points[points.length - 1];

  const dx = p1.x - p0.x;
  const dy = p0.y - p1.y;  // Flip Y because screen Y is inverted (up = negative)

  if (Math.abs(dx) < 0.001) return 90; // Straight up

  const angleRad = Math.atan2(dy, Math.abs(dx));
  return angleRad * (180 / Math.PI);
}

function calculateInitialSpeed(trajectory, impactIdx, fps) {
  const endIdx = Math.min(impactIdx + 3, trajectory.length - 1);
  if (endIdx <= impactIdx) return 0;

  const p0 = trajectory[impactIdx];
  const p1 = trajectory[endIdx];
  const dt = (endIdx - impactIdx) / fps;

  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;

  return Math.sqrt(dx * dx + dy * dy) / dt; // pixels per second
}

function findApex(trajectory, impactIdx) {
  // Apex = highest point (smallest y value, since screen Y is inverted)
  let minY = Infinity;
  let apexIdx = impactIdx;

  for (let i = impactIdx; i < trajectory.length; i++) {
    if (trajectory[i].y < minY) {
      minY = trajectory[i].y;
      apexIdx = i;
    }
  }

  const impactY = trajectory[impactIdx]?.y || trajectory[0].y;
  return {
    x: trajectory[apexIdx].x,
    y: trajectory[apexIdx].y,
    index: apexIdx,
    heightPixels: Math.abs(impactY - minY),
  };
}

function findLandingPoint(trajectory, impactIdx, apexIdx) {
  // Landing = point where ball returns to (or below) impact height after apex
  // Or simply the last point if ball never "lands" in frame
  const impactY = trajectory[impactIdx]?.y || trajectory[0].y;
  const impactX = trajectory[impactIdx]?.x || trajectory[0].x;

  let landingIdx = trajectory.length - 1;

  // Search after apex for point returning to impact Y level
  for (let i = apexIdx + 1; i < trajectory.length; i++) {
    if (trajectory[i].y >= impactY) {
      landingIdx = i;
      break;
    }
  }

  const landingPoint = trajectory[landingIdx];
  return {
    x: landingPoint.x,
    y: landingPoint.y,
    distancePixels: Math.abs(landingPoint.x - impactX),
  };
}

function analyzeShotShape(trajectory, impactIdx) {
  if (trajectory.length - impactIdx < 5) {
    return { type: 'straight', deviation: 0 };
  }

  // Draw a straight line from impact to last point
  const start = trajectory[impactIdx];
  const end = trajectory[trajectory.length - 1];
  const lineVecX = end.x - start.x;
  const lineVecY = end.y - start.y;
  const lineLen = Math.sqrt(lineVecX * lineVecX + lineVecY * lineVecY);

  if (lineLen < 10) return { type: 'straight', deviation: 0 };

  // Calculate signed perpendicular distance of each mid-flight point from this line
  let totalDeviation = 0;
  let midCount = 0;

  for (let i = impactIdx + 2; i < trajectory.length - 2; i++) {
    const px = trajectory[i].x - start.x;
    const py = trajectory[i].y - start.y;
    // Cross product gives signed distance
    const cross = (px * lineVecY - py * lineVecX) / lineLen;
    totalDeviation += cross;
    midCount++;
  }

  const avgDeviation = midCount > 0 ? totalDeviation / midCount : 0;
  const deviationRatio = avgDeviation / lineLen;

  // Thresholds (negative = left/draw for right-handed DTL view)
  let type = 'straight';
  if (deviationRatio > 0.08) type = 'fade';
  else if (deviationRatio > 0.2) type = 'slice';
  else if (deviationRatio < -0.08) type = 'draw';
  else if (deviationRatio < -0.2) type = 'hook';

  return { type, deviation: Math.round(avgDeviation) };
}

// ─── Trajectory Simulation (forward physics) ───────────────────

/**
 * Simulate a ball flight trajectory using the aerodynamic model.
 * Used for:
 * 1. Validating detected trajectory against physics
 * 2. Extending trajectory beyond video frame
 * 3. Estimating carry when ball leaves frame
 *
 * @param {number} launchAngleDeg
 * @param {number} ballSpeedMs — initial ball speed in m/s
 * @param {number} spinRateRpm — backspin in RPM (estimated or assumed)
 * @param {number} dt — simulation timestep
 * @returns {Array} [{ x, y, vx, vy, time }] in meters
 */
export function simulateTrajectory(launchAngleDeg, ballSpeedMs, spinRateRpm = 3000, dt = 0.01) {
  const angleRad = launchAngleDeg * (Math.PI / 180);
  let vx = ballSpeedMs * Math.cos(angleRad);
  let vy = ballSpeedMs * Math.sin(angleRad);
  let x = 0;
  let y = 0;
  let time = 0;

  const trajectory = [{ x, y, vx, vy, time }];

  // Convert spin to angular velocity
  const omega = spinRateRpm * (2 * Math.PI / 60);

  for (let step = 0; step < 10000; step++) {
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed < 0.1 && y <= 0 && step > 10) break; // Ball stopped
    if (y < -1 && step > 10) break; // Below ground

    // Drag force (opposes velocity)
    const dragMag = 0.5 * AIR.density * GOLF_BALL.Cd * GOLF_BALL.area * speed * speed;
    const dragX = -dragMag * (vx / speed) / GOLF_BALL.mass;
    const dragY = -dragMag * (vy / speed) / GOLF_BALL.mass;

    // Magnus force (lift from backspin, perpendicular to velocity)
    // Simplified: lift acts upward proportional to speed and spin
    const liftMag = 0.5 * AIR.density * GOLF_BALL.Cl * GOLF_BALL.area * speed * speed;
    // Lift direction is perpendicular to velocity and up
    const liftX = liftMag * (-vy / speed) / GOLF_BALL.mass * 0.3;
    const liftY = liftMag * (vx / speed) / GOLF_BALL.mass * 0.3;

    // Update velocity
    vx += (dragX + liftX) * dt;
    vy += (dragY + liftY - AIR.g) * dt;

    // Update position
    x += vx * dt;
    y += vy * dt;
    time += dt;

    trajectory.push({ x, y, vx, vy, time });
  }

  return trajectory;
}

// ─── Flight Quality Score ──────────────────────────────────────

/**
 * Score the quality of a detected trajectory (0-100).
 * Higher = more physically plausible flight.
 */
export function scoreTrajectoryQuality(trajectory, impactIdx = 0) {
  if (!trajectory || trajectory.length < 3) return 0;

  let score = 100;
  const flight = trajectory.slice(impactIdx);

  // 1. Smoothness: penalize large velocity jumps (noise)
  let jerkSum = 0;
  for (let i = 2; i < flight.length; i++) {
    const ax1 = (flight[i].x - flight[i - 1].x) - (flight[i - 1].x - flight[i - 2].x);
    const ay1 = (flight[i].y - flight[i - 1].y) - (flight[i - 1].y - flight[i - 2].y);
    jerkSum += Math.sqrt(ax1 * ax1 + ay1 * ay1);
  }
  const avgJerk = jerkSum / Math.max(1, flight.length - 2);
  if (avgJerk > 20) score -= 30;
  else if (avgJerk > 10) score -= 15;
  else if (avgJerk > 5) score -= 5;

  // 2. Has an apex (goes up then down)
  const apexData = findApex(flight, 0);
  if (apexData.index === 0 || apexData.index === flight.length - 1) {
    score -= 20; // No clear apex
  }

  // 3. Length: reward more data points (more reliable)
  if (flight.length < 5) score -= 25;
  else if (flight.length < 10) score -= 10;

  // 4. Duration: real flights last 2-8 seconds for full carry
  const duration = flight[flight.length - 1]?.time - flight[0]?.time || 0;
  if (duration < 0.3) score -= 20;

  return Math.max(0, Math.min(100, score));
}
