/**
 * TPI-Style Kinematic Sequencing Analysis
 * ========================================
 * Calculates angular velocity of 4 body segments across swing frames:
 * 1. Hips (pelvis rotation)
 * 2. Torso (shoulder rotation relative to hips)
 * 3. Arms (elbow/wrist movement rate)
 * 4. Hands/Club (wrist velocity — proxy for club head)
 *
 * Detects peak velocity timing per segment and validates correct
 * TPI sequencing: Hips → Torso → Arms → Hands
 *
 * MediaPipe landmark indices:
 * 0: nose, 11/12: shoulders, 13/14: elbows,
 * 15/16: wrists, 23/24: hips
 */

/**
 * Analyze kinematic sequencing across all frames
 * @param {Array} frameResults - Array of { landmarks, timestamp } from pose analysis
 * @returns {Object} { segments, sequenceOrder, isCorrect, grade, peakTimings }
 */
export function analyzeSequencing(frameResults) {
  // Prefer worldLandmarks (3D) if available, fall back to 2D landmarks
  const validFrames = frameResults.filter(f => {
    const lm = f.worldLandmarks || f.landmarks;
    return lm && lm.length >= 33;
  });
  if (validFrames.length < 4) return null;

  // B2 FIX: Kontrollera om alla timestamps är 0 — dt faller då tillbaka på 0.033s konstant.
  // Sekvensordningen kan ändå vara korrekt, men hastighetsmagnituder blir opålitliga.
  const allZeroTimestamps = validFrames.every(f => !f.timestamp || f.timestamp === 0);
  if (allZeroTimestamps) {
    console.warn('[kinematic] All timestamps are 0 — velocity magnitudes unreliable, using constant dt=0.033s. Sequence order may still be valid.');
  }

  // Helper to get best available landmarks
  const getLM = (f) => f.worldLandmarks || f.landmarks;

  // === Temporal Smoothing ===
  // Apply 3-frame weighted average to landmark positions before velocity calculation
  // This dramatically reduces jitter in angular velocity curves
  const smoothedFrames = validFrames.map((frame, i) => {
    const lm = getLM(frame);
    if (i === 0 || i === validFrames.length - 1) return { ...frame, _smoothedLM: lm };

    const prev = getLM(validFrames[i - 1]);
    const next = getLM(validFrames[i + 1]);

    // Weighted average: 0.25 * prev + 0.5 * current + 0.25 * next
    const smoothed = lm.map((point, j) => ({
      x: prev[j].x * 0.25 + point.x * 0.5 + next[j].x * 0.25,
      y: prev[j].y * 0.25 + point.y * 0.5 + next[j].y * 0.25,
      z: ((prev[j].z || 0) * 0.25 + (point.z || 0) * 0.5 + (next[j].z || 0) * 0.25),
      visibility: point.visibility,
    }));

    return { ...frame, _smoothedLM: smoothed };
  });

  // Calculate angular velocities per frame for each segment
  const hipVelocities = [];
  const torsoVelocities = [];
  const armVelocities = [];
  const handVelocities = [];
  const timestamps = [];

  for (let i = 1; i < smoothedFrames.length; i++) {
    const prev = smoothedFrames[i - 1]._smoothedLM;
    const curr = smoothedFrames[i]._smoothedLM;
    let dt = (validFrames[i].timestamp - validFrames[i - 1].timestamp) || 0.033;
    // Handle millisecond timestamps (> 1000 means ms)
    if (dt > 1000) dt = dt / 1000;
    // Clamp minimum dt to prevent noise amplification
    dt = Math.max(dt, 0.016); // ~60fps minimum

    timestamps.push(validFrames[i].timestamp);

    // 1. HIP angular velocity (rotation of hip line) — uses Z for 3D rotation
    const hipAnglePrev = lineAngle3D(prev[23], prev[24]);
    const hipAngleCurr = lineAngle3D(curr[23], curr[24]);
    hipVelocities.push(Math.abs(hipAngleCurr - hipAnglePrev) / dt);

    // 2. TORSO angular velocity (shoulder line relative to hip line)
    const shoulderAnglePrev = lineAngle3D(prev[11], prev[12]);
    const shoulderAngleCurr = lineAngle3D(curr[11], curr[12]);
    const torsoRotPrev = shoulderAnglePrev - hipAnglePrev;
    const torsoRotCurr = shoulderAngleCurr - hipAngleCurr;
    torsoVelocities.push(Math.abs(torsoRotCurr - torsoRotPrev) / dt);

    // 3. ARM velocity (elbow + wrist position change rate) — includes Z
    const armSpeedPrev = segmentSpeed3D(prev[13], prev[14], prev[15], prev[16]);
    const armSpeedCurr = segmentSpeed3D(curr[13], curr[14], curr[15], curr[16]);
    armVelocities.push((armSpeedPrev + armSpeedCurr) / 2 / dt);

    // 4. HAND/CLUB velocity (wrist position change — proxy for club head speed) — includes Z
    const handSpeed = Math.sqrt(
      (curr[15].x - prev[15].x) ** 2 + (curr[15].y - prev[15].y) ** 2 + ((curr[15].z || 0) - (prev[15].z || 0)) ** 2 +
      (curr[16].x - prev[16].x) ** 2 + (curr[16].y - prev[16].y) ** 2 + ((curr[16].z || 0) - (prev[16].z || 0)) ** 2
    ) / 2;
    handVelocities.push(handSpeed / dt);
  }

  // Smooth all curves (3-point moving average)
  const smoothHips = smooth(hipVelocities);
  const smoothTorso = smooth(torsoVelocities);
  const smoothArms = smooth(armVelocities);
  const smoothHands = smooth(handVelocities);

  // Normalize all curves to 0-100 scale
  const normHips = normalize(smoothHips);
  const normTorso = normalize(smoothTorso);
  const normArms = normalize(smoothArms);
  const normHands = normalize(smoothHands);

  // Find peak index for each segment (in the downswing region — second half)
  const midpoint = Math.floor(normHips.length * 0.3); // Downswing starts roughly here
  const peakHip = findPeakIndex(normHips, midpoint);
  const peakTorso = findPeakIndex(normTorso, midpoint);
  const peakArm = findPeakIndex(normArms, midpoint);
  const peakHand = findPeakIndex(normHands, midpoint);

  // Determine sequence order
  const peaks = [
    { segment: 'hips', index: peakHip, label: { en: 'Hips', sv: 'Höfter' } },
    { segment: 'torso', index: peakTorso, label: { en: 'Torso', sv: 'Bål' } },
    { segment: 'arms', index: peakArm, label: { en: 'Arms', sv: 'Armar' } },
    { segment: 'hands', index: peakHand, label: { en: 'Hands', sv: 'Händer' } },
  ];

  const sequenceOrder = [...peaks].sort((a, b) => a.index - b.index);
  const idealOrder = ['hips', 'torso', 'arms', 'hands'];
  const actualOrder = sequenceOrder.map(p => p.segment);

  // Check if sequence matches ideal
  const isCorrect = actualOrder.every((seg, i) => seg === idealOrder[i]);

  // Grade the sequencing (0-100)
  let grade = 100;
  actualOrder.forEach((seg, i) => {
    const idealPos = idealOrder.indexOf(seg);
    const diff = Math.abs(i - idealPos);
    grade -= diff * 20; // -20 per position off
  });
  grade = Math.max(0, grade);

  // Find specific sequence errors
  const errors = [];
  if (actualOrder[0] !== 'hips') {
    errors.push({ en: 'Hips should fire first', sv: 'Höfterna bör starta först' });
  }
  if (actualOrder.indexOf('hands') < actualOrder.indexOf('arms')) {
    errors.push({ en: 'Hands peak before arms — possible casting', sv: 'Händerna peakar före armarna — möjlig casting' });
  }
  if (actualOrder.indexOf('arms') < actualOrder.indexOf('torso')) {
    errors.push({ en: 'Arms fire before torso — losing power transfer', sv: 'Armarna startar före bålen — tappar kraftöverföring' });
  }

  return {
    segments: {
      hips: { velocities: normHips, peak: peakHip, color: '#9DFF00' },
      torso: { velocities: normTorso, peak: peakTorso, color: '#00BFFF' },
      arms: { velocities: normArms, peak: peakArm, color: '#FFB800' },
      hands: { velocities: normHands, peak: peakHand, color: '#FF4444' },
    },
    timestamps,
    sequenceOrder,
    actualOrder,
    idealOrder,
    isCorrect,
    grade,
    errors,
    peakTimings: peaks,
    frameCount: normHips.length,
    timestampReliable: !allZeroTimestamps, // B2: false = dt är konstant 0.033s, ej uppmätt
  };
}

/**
 * Build a compact summary for Claude's prompt
 */
export function buildSequencingPrompt(sequencing, language) {
  if (!sequencing) return '';
  const sv = language === 'sv';

  let ctx = '\n## TPI KINEMATIC SEQUENCING ANALYSIS\n';
  ctx += `Sequence grade: ${sequencing.grade}/100\n`;
  ctx += `Actual peak order: ${sequencing.actualOrder.join(' → ')}\n`;
  ctx += `Ideal order: ${sequencing.idealOrder.join(' → ')}\n`;
  ctx += `Correct sequencing: ${sequencing.isCorrect ? 'YES' : 'NO'}\n`;

  if (sequencing.errors.length > 0) {
    ctx += `\nSequencing errors detected:\n`;
    sequencing.errors.forEach(e => {
      ctx += `- ${e.en}\n`;
    });
  }

  ctx += `\nIMPORTANT: Reference this TPI sequencing data in your analysis. If the sequencing is wrong, explain WHY it matters (power loss, inconsistency, injury risk) and suggest drills to fix it.\n`;

  return ctx;
}

// ===== Helpers =====

function lineAngle3D(a, b) {
  // If Z data is available, use atan2(dz, dx) for horizontal-plane rotation
  const dx = b.x - a.x;
  const dz = (b.z || 0) - (a.z || 0);
  if (dz !== 0) {
    return Math.atan2(dz, dx) * (180 / Math.PI);
  }
  // Fallback to 2D
  return Math.atan2(b.y - a.y, dx) * (180 / Math.PI);
}

function segmentSpeed3D(lElbow, rElbow, lWrist, rWrist) {
  // Average displacement of arm segment endpoints — includes Z axis
  return (
    Math.sqrt((lElbow.x - lWrist.x) ** 2 + (lElbow.y - lWrist.y) ** 2 + ((lElbow.z || 0) - (lWrist.z || 0)) ** 2) +
    Math.sqrt((rElbow.x - rWrist.x) ** 2 + (rElbow.y - rWrist.y) ** 2 + ((rElbow.z || 0) - (rWrist.z || 0)) ** 2)
  ) / 2;
}

function smooth(arr, windowSize = 1) {
  return arr.map((_, i) => {
    const start = Math.max(0, i - windowSize);
    const end = Math.min(arr.length, i + windowSize + 1);
    const slice = arr.slice(start, end);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

function normalize(arr) {
  const max = Math.max(...arr) || 1;
  return arr.map(v => (v / max) * 100);
}

function findPeakIndex(arr, startFrom = 0) {
  let peakIdx = startFrom;
  for (let i = startFrom; i < arr.length; i++) {
    if (arr[i] > arr[peakIdx]) peakIdx = i;
  }
  return peakIdx;
}
