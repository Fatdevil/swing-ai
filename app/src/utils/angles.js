/**
 * Angle calculations from MediaPipe Pose landmarks
 * 
 * MediaPipe Pose landmark indices:
 * 0: nose, 11: left shoulder, 12: right shoulder,
 * 13: left elbow, 14: right elbow, 15: left wrist, 16: right wrist,
 * 23: left hip, 24: right hip, 25: left knee, 26: right knee,
 * 27: left ankle, 28: right ankle
 */

/**
 * Calculate angle between three points (in degrees)
 */
function angleBetween(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.sqrt(ab.x ** 2 + ab.y ** 2);
  const magCB = Math.sqrt(cb.x ** 2 + cb.y ** 2);
  const cos = dot / (magAB * magCB);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/**
 * Calculate angle of a line segment relative to vertical
 */
function angleFromVertical(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const angleRad = Math.atan2(dx, -dy); // -dy because y increases downward
  return Math.abs((angleRad * 180) / Math.PI);
}

/**
 * Calculate angle of a line segment relative to horizontal
 */
function angleFromHorizontal(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
}

/**
 * Calculate all 7 measurements from landmarks
 * @param {Array} landmarks - 33 MediaPipe Pose landmarks
 * @returns {Object} - 7 measurements with value, ideal, status, and confidence
 */
export function calculateAllAngles(landmarks) {
  if (!landmarks || landmarks.length < 33) return null;

  const shoulderMid = midpoint(landmarks[11], landmarks[12]);
  const hipMid = midpoint(landmarks[23], landmarks[24]);

  return {
    spineTilt: calculateSpineTilt(shoulderMid, hipMid),
    shoulderRotation: calculateShoulderRotation(landmarks[11], landmarks[12]),
    hipTilt: calculateHipTilt(landmarks[23], landmarks[24]),
    leadingKnee: calculateKneeAngle(landmarks[23], landmarks[25], landmarks[27], 'leading'),
    trailingKnee: calculateKneeAngle(landmarks[24], landmarks[26], landmarks[28], 'trailing'),
    xFactor: calculateXFactor(landmarks[11], landmarks[12], landmarks[23], landmarks[24]),
    headOffset: calculateHeadOffset(landmarks[0], hipMid),
  };
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function calculateSpineTilt(shoulderMid, hipMid) {
  const value = angleFromVertical(hipMid, shoulderMid);
  return {
    value,
    ideal: '35–45°',
    status: value >= 30 && value <= 50 ? 'good' : value >= 25 && value <= 55 ? 'warning' : 'poor',
    confidence: 0.8, // Reasonable from 2D side view
  };
}

function calculateShoulderRotation(leftShoulder, rightShoulder) {
  const value = angleFromHorizontal(leftShoulder, rightShoulder);
  return {
    value,
    ideal: 'Varies by phase',
    status: value < 30 ? 'good' : value < 45 ? 'warning' : 'poor',
    confidence: 0.5, // 3D rotation is hard from 2D — AI estimate
  };
}

function calculateHipTilt(leftHip, rightHip) {
  const value = angleFromHorizontal(leftHip, rightHip);
  return {
    value,
    ideal: 'Varies by phase',
    status: value < 15 ? 'good' : value < 25 ? 'warning' : 'poor',
    confidence: 0.5, // 3D rotation estimated from 2D
  };
}

function calculateKneeAngle(hip, knee, ankle, label) {
  const value = angleBetween(hip, knee, ankle);
  return {
    value,
    ideal: '140–160°',
    status: value >= 135 && value <= 165 ? 'good' : value >= 120 && value <= 175 ? 'warning' : 'poor',
    confidence: 0.75,
  };
}

function calculateXFactor(lShoulder, rShoulder, lHip, rHip) {
  const shoulderAngle = angleFromHorizontal(lShoulder, rShoulder);
  const hipAngle = angleFromHorizontal(lHip, rHip);
  const value = Math.abs(shoulderAngle - hipAngle);
  return {
    value,
    ideal: '45–60°',
    status: value >= 40 && value <= 65 ? 'good' : value >= 30 && value <= 75 ? 'warning' : 'poor',
    confidence: 0.4, // Low confidence from 2D — requires 3D depth
  };
}

function calculateHeadOffset(nose, hipMid) {
  const value = Math.abs(nose.x - hipMid.x) * 100; // Percentage of frame width
  return {
    value,
    ideal: 'Near 0%',
    status: value < 3 ? 'good' : value < 7 ? 'warning' : 'poor',
    confidence: 0.85, // Good from any angle
  };
}
