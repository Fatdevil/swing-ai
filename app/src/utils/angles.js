/**
 * 3D Angle Calculations from MediaPipe Pose Landmarks
 * =====================================================
 * Uses worldLandmarks (3D meters, origin at hip center) for accurate
 * biomechanical measurements. Falls back to 2D if worldLandmarks unavailable.
 *
 * MediaPipe Pose landmark indices:
 * 0: nose, 11: left shoulder, 12: right shoulder,
 * 13: left elbow, 14: right elbow, 15: left wrist, 16: right wrist,
 * 23: left hip, 24: right hip, 25: left knee, 26: right knee,
 * 27: left ankle, 28: right ankle
 */

/**
 * Calculate angle between three 3D points at vertex B (in degrees)
 */
function angleBetween3D(a, b, c) {
  const ba = { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) };
  const bc = { x: c.x - b.x, y: c.y - b.y, z: (c.z || 0) - (b.z || 0) };
  const dot = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z;
  const magBA = Math.sqrt(ba.x ** 2 + ba.y ** 2 + ba.z ** 2);
  const magBC = Math.sqrt(bc.x ** 2 + bc.y ** 2 + bc.z ** 2);
  if (magBA === 0 || magBC === 0) return 0;
  const cos = dot / (magBA * magBC);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/**
 * Calculate the angle of a 3D line segment relative to the vertical (Y-axis)
 */
function angleFromVertical3D(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = (b.z || 0) - (a.z || 0);
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (length === 0) return 0;
  // Angle between the vector and the vertical axis (0, -1, 0)
  // cos(θ) = dot(v, up) / |v|
  const cosAngle = -dy / length; // -dy because Y increases downward in screen space
  return (Math.acos(Math.max(-1, Math.min(1, cosAngle))) * 180) / Math.PI;
}

/**
 * Calculate the rotation angle of a body segment using the Z-axis depth.
 * For shoulder/hip lines: measures how much the line is rotated away from
 * the camera plane. A perfectly face-on line has 0° rotation.
 *
 * Uses atan2(dz, dx) to get the true rotation in the horizontal plane.
 */
function planeRotation3D(left, right) {
  const dx = right.x - left.x;
  const dz = (right.z || 0) - (left.z || 0);
  // atan2 gives us the rotation in the XZ plane (horizontal)
  const angleRad = Math.atan2(dz, dx);
  return Math.abs((angleRad * 180) / Math.PI);
}

/**
 * Calculate the tilt of a body segment (2D projection angle from horizontal)
 * Used for visual tilt assessment independent of depth rotation.
 */
function tiltAngle(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
}

/**
 * Get the minimum visibility of a set of landmarks.
 * Returns a 0-1 score used for confidence gating.
 */
function minVisibility(...landmarks) {
  const vis = landmarks.map(lm => lm?.visibility ?? 0);
  return Math.min(...vis);
}

/**
 * Derive a dynamic confidence score from visibility values.
 * - visibility > 0.8 → high confidence (0.85-0.95)
 * - visibility 0.5-0.8 → medium confidence (0.5-0.85)
 * - visibility < 0.5 → low confidence (0.2-0.5)
 */
function visibilityToConfidence(vis, baseConfidence = 0.85) {
  if (vis >= 0.8) return Math.min(0.95, baseConfidence + 0.1);
  if (vis >= 0.5) return baseConfidence * vis;
  return Math.max(0.2, baseConfidence * vis);
}

/**
 * Calculate all measurements from landmarks
 * @param {Array} landmarks - 33 MediaPipe Pose landmarks (worldLandmarks preferred, falls back to 2D)
 * @returns {Object} - Measurements with value, ideal, status, confidence, and visibility
 */
export function calculateAllAngles(landmarks) {
  if (!landmarks || landmarks.length < 33) return null;

  const has3D = landmarks[0]?.z !== undefined && landmarks[0]?.z !== 0;

  const shoulderMid = midpoint3D(landmarks[11], landmarks[12]);
  const hipMid = midpoint3D(landmarks[23], landmarks[24]);

  return {
    spineTilt: calculateSpineTilt(shoulderMid, hipMid, landmarks[11], landmarks[12], landmarks[23], landmarks[24]),
    shoulderRotation: calculateShoulderRotation(landmarks[11], landmarks[12], has3D),
    hipTilt: calculateHipRotation(landmarks[23], landmarks[24], has3D),
    leadingKnee: calculateKneeAngle(landmarks[23], landmarks[25], landmarks[27], 'leading'),
    trailingKnee: calculateKneeAngle(landmarks[24], landmarks[26], landmarks[28], 'trailing'),
    xFactor: calculateXFactor(landmarks[11], landmarks[12], landmarks[23], landmarks[24], has3D),
    headOffset: calculateHeadOffset(landmarks[0], hipMid),
    leadArmExtension: calculateLeadArmExtension(landmarks[11], landmarks[13], landmarks[15]),
  };
}

function midpoint3D(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z || 0) + (b.z || 0)) / 2,
    visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1),
  };
}

function calculateSpineTilt(shoulderMid, hipMid, lShoulder, rShoulder, lHip, rHip) {
  const value = angleFromVertical3D(hipMid, shoulderMid);
  const vis = minVisibility(lShoulder, rShoulder, lHip, rHip);
  return {
    value,
    ideal: '35–45°',
    status: value >= 30 && value <= 50 ? 'good' : value >= 25 && value <= 55 ? 'warning' : 'poor',
    confidence: visibilityToConfidence(vis, 0.90),
    visibility: vis,
  };
}

function calculateShoulderRotation(leftShoulder, rightShoulder, has3D) {
  // In 3D mode: use the true horizontal-plane rotation (XZ plane)
  // In 2D mode: fall back to projected tilt (less accurate)
  const value = has3D
    ? planeRotation3D(leftShoulder, rightShoulder)
    : tiltAngle(leftShoulder, rightShoulder);

  const vis = minVisibility(leftShoulder, rightShoulder);
  const baseConf = has3D ? 0.90 : 0.50;

  return {
    value,
    ideal: 'Varies by phase',
    status: value < 30 ? 'good' : value < 45 ? 'warning' : 'poor',
    confidence: visibilityToConfidence(vis, baseConf),
    visibility: vis,
    is3D: has3D,
  };
}

function calculateHipRotation(leftHip, rightHip, has3D) {
  const value = has3D
    ? planeRotation3D(leftHip, rightHip)
    : tiltAngle(leftHip, rightHip);

  const vis = minVisibility(leftHip, rightHip);
  const baseConf = has3D ? 0.85 : 0.50;

  return {
    value,
    ideal: 'Varies by phase',
    status: value < 15 ? 'good' : value < 25 ? 'warning' : 'poor',
    confidence: visibilityToConfidence(vis, baseConf),
    visibility: vis,
    is3D: has3D,
  };
}

function calculateKneeAngle(hip, knee, ankle, label) {
  const value = angleBetween3D(hip, knee, ankle);
  const vis = minVisibility(hip, knee, ankle);
  return {
    value,
    ideal: '140–160°',
    status: value >= 135 && value <= 165 ? 'good' : value >= 120 && value <= 175 ? 'warning' : 'poor',
    confidence: visibilityToConfidence(vis, 0.85),
    visibility: vis,
  };
}

function calculateXFactor(lShoulder, rShoulder, lHip, rHip, has3D) {
  let shoulderAngle, hipAngle;

  if (has3D) {
    // True 3D rotation difference in the horizontal plane
    shoulderAngle = planeRotation3D(lShoulder, rShoulder);
    hipAngle = planeRotation3D(lHip, rHip);
  } else {
    shoulderAngle = tiltAngle(lShoulder, rShoulder);
    hipAngle = tiltAngle(lHip, rHip);
  }

  const value = Math.abs(shoulderAngle - hipAngle);
  const vis = minVisibility(lShoulder, rShoulder, lHip, rHip);
  const baseConf = has3D ? 0.85 : 0.40;

  return {
    value,
    ideal: '45–60°',
    status: value >= 40 && value <= 65 ? 'good' : value >= 30 && value <= 75 ? 'warning' : 'poor',
    confidence: visibilityToConfidence(vis, baseConf),
    visibility: vis,
    is3D: has3D,
  };
}

function calculateHeadOffset(nose, hipMid) {
  const value = Math.abs(nose.x - hipMid.x) * 100; // Percentage of frame width (or meters in 3D)
  const vis = minVisibility(nose, hipMid);
  return {
    value,
    ideal: 'Near 0%',
    status: value < 3 ? 'good' : value < 7 ? 'warning' : 'poor',
    confidence: visibilityToConfidence(vis, 0.85),
    visibility: vis,
  };
}

/**
 * NEW: Lead arm extension — measures how straight the lead arm is
 * (shoulder → elbow → wrist angle). Straight = 180°.
 */
function calculateLeadArmExtension(shoulder, elbow, wrist) {
  const value = angleBetween3D(shoulder, elbow, wrist);
  const vis = minVisibility(shoulder, elbow, wrist);
  return {
    value,
    ideal: '165–180°',
    status: value >= 160 ? 'good' : value >= 140 ? 'warning' : 'poor',
    confidence: visibilityToConfidence(vis, 0.85),
    visibility: vis,
  };
}
