/**
 * Swing Annotation Engine
 * =======================
 * Draws analysis overlays on golf swing frames:
 * - Spine angle line
 * - Hip & shoulder rotation lines
 * - Knee flex angles
 * - Head position marker
 * - Measurement labels with values
 * - Color-coded status (green = good, amber = warning, red = poor)
 *
 * Uses MediaPipe pose landmarks to position annotations accurately.
 */

// Design tokens matching SWING_AI brand
const COLORS = {
  good: '#9DFF00',      // Kinetic green
  warning: '#FFB800',   // Amber
  poor: '#FF4444',      // Red
  guide: 'rgba(255, 255, 255, 0.25)', // Subtle reference lines
  label: '#FFFFFF',
  labelBg: 'rgba(0, 0, 0, 0.7)',
  ideal: 'rgba(157, 255, 0, 0.15)', // Ghost overlay for ideal position
};

const LINE_WIDTH = 2.5;
const FONT_SIZE = 11;
const LABEL_PADDING = 4;

/**
 * Draw all annotations on a swing frame
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} landmarks - 33 MediaPipe landmarks (normalized 0-1)
 * @param {Object} measurements - Calculated angle measurements
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {string} phase - Swing phase name
 * @param {Object} options - { showLabels, showGuides, showIdeal }
 */
export function drawAnnotations(ctx, landmarks, measurements, width, height, phase, options = {}) {
  if (!landmarks || !measurements) return;

  const { showLabels = true, showGuides = true } = options;
  
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Helper to convert landmark to pixel coords
  const px = (lm) => ({ x: lm.x * width, y: lm.y * height });

  // Key landmarks
  const nose = px(landmarks[0]);
  const lShoulder = px(landmarks[11]);
  const rShoulder = px(landmarks[12]);
  const lHip = px(landmarks[23]);
  const rHip = px(landmarks[24]);
  const lKnee = px(landmarks[25]);
  const rKnee = px(landmarks[26]);
  const lAnkle = px(landmarks[27]);
  const rAnkle = px(landmarks[28]);
  const lWrist = px(landmarks[15]);
  const rWrist = px(landmarks[16]);

  const shoulderMid = midpoint(lShoulder, rShoulder);
  const hipMid = midpoint(lHip, rHip);

  // 1. Spine angle line
  if (measurements.spineTilt) {
    drawMeasurementLine(ctx, hipMid, shoulderMid, measurements.spineTilt, 'Spine', showLabels);
  }

  // 2. Shoulder line
  if (measurements.shoulderRotation) {
    drawMeasurementLine(ctx, lShoulder, rShoulder, measurements.shoulderRotation, 'Shoulder', showLabels);
  }

  // 3. Hip line
  if (measurements.hipTilt) {
    drawMeasurementLine(ctx, lHip, rHip, measurements.hipTilt, 'Hip', showLabels);
  }

  // 4. Leading knee angle
  if (measurements.leadingKnee) {
    drawAngleArc(ctx, lHip, lKnee, lAnkle, measurements.leadingKnee, 'L Knee', showLabels);
  }

  // 5. Trailing knee angle
  if (measurements.trailingKnee) {
    drawAngleArc(ctx, rHip, rKnee, rAnkle, measurements.trailingKnee, 'R Knee', showLabels);
  }

  // 6. Head position marker
  if (measurements.headOffset) {
    drawHeadMarker(ctx, nose, hipMid, measurements.headOffset, showLabels);
  }

  // 7. Vertical guide line (through setup hip center)
  if (showGuides) {
    drawGuideLine(ctx, hipMid.x, 0, hipMid.x, height);
  }

  // 8. X-Factor label (if at top of backswing)
  if (measurements.xFactor && (phase === 'top' || phase === 'Top')) {
    drawXFactorLabel(ctx, shoulderMid, hipMid, measurements.xFactor, showLabels);
  }

  // 9. Wrist position (track club path)
  drawWristTracker(ctx, lWrist, rWrist);

  // 10. Lead arm extension (shoulder → elbow → wrist angle)
  const lElbow = px(landmarks[13]);
  if (measurements.leadArmExtension) {
    drawAngleArc(ctx, lShoulder, lElbow, lWrist, measurements.leadArmExtension, 'Arm', showLabels);
  }

  // 11. Confidence + 3D badge (top-right corner)
  if (showLabels) {
    drawInfoBadges(ctx, measurements, width);
  }

  ctx.restore();
}

// ----- Drawing primitives -----

function drawMeasurementLine(ctx, from, to, measurement, label, showLabels) {
  const color = statusColor(measurement.status);

  // Main line
  ctx.strokeStyle = color;
  ctx.lineWidth = LINE_WIDTH;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Extension lines (subtle guides showing the line direction)
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > 0) {
    const ext = 15;
    ctx.strokeStyle = COLORS.guide;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(from.x - (dx / len) * ext, from.y - (dy / len) * ext);
    ctx.lineTo(from.x, from.y);
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x + (dx / len) * ext, to.y + (dy / len) * ext);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Label
  if (showLabels && measurement.value !== undefined) {
    const mid = midpoint(from, to);
    const text = `${label} ${measurement.value.toFixed(0)}°`;
    drawLabel(ctx, mid.x + 12, mid.y - 8, text, color);
  }
}

function drawAngleArc(ctx, a, vertex, c, measurement, label, showLabels) {
  const color = statusColor(measurement.status);
  const radius = 20;

  // Angle lines through vertex
  ctx.strokeStyle = color;
  ctx.lineWidth = LINE_WIDTH;
  ctx.shadowColor = color;
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(vertex.x, vertex.y);
  ctx.lineTo(c.x, c.y);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Arc
  const startAngle = Math.atan2(a.y - vertex.y, a.x - vertex.x);
  const endAngle = Math.atan2(c.y - vertex.y, c.x - vertex.x);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(vertex.x, vertex.y, radius, startAngle, endAngle, false);
  ctx.stroke();

  // Label
  if (showLabels && measurement.value !== undefined) {
    const text = `${measurement.value.toFixed(0)}°`;
    const labelX = vertex.x + Math.cos((startAngle + endAngle) / 2) * (radius + 14);
    const labelY = vertex.y + Math.sin((startAngle + endAngle) / 2) * (radius + 14);
    drawLabel(ctx, labelX, labelY, text, color);
  }
}

function drawHeadMarker(ctx, nose, hipMid, measurement, showLabels) {
  const color = statusColor(measurement.status);

  // Crosshair on nose
  const size = 8;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(nose.x - size, nose.y);
  ctx.lineTo(nose.x + size, nose.y);
  ctx.moveTo(nose.x, nose.y - size);
  ctx.lineTo(nose.x, nose.y + size);
  ctx.stroke();

  // Dashed line to hip center (showing offset)
  ctx.strokeStyle = COLORS.guide;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(nose.x, nose.y + size);
  ctx.lineTo(hipMid.x, hipMid.y);
  ctx.stroke();
  ctx.setLineDash([]);

  if (showLabels) {
    drawLabel(ctx, nose.x + 12, nose.y - 12, `Head ${measurement.value.toFixed(1)}%`, color);
  }
}

function drawXFactorLabel(ctx, shoulderMid, hipMid, measurement, showLabels) {
  if (!showLabels) return;
  const color = statusColor(measurement.status);
  const mid = midpoint(shoulderMid, hipMid);
  drawLabel(ctx, mid.x - 50, mid.y, `X-Factor ${measurement.value.toFixed(0)}°`, color, true);
}

function drawWristTracker(ctx, lWrist, rWrist) {
  // Small dots on wrist positions — tracks club handle
  [lWrist, rWrist].forEach(w => {
    ctx.fillStyle = COLORS.good;
    ctx.shadowColor = COLORS.good;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(w.x, w.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  });
}

function drawGuideLine(ctx, x1, y1, x2, y2) {
  ctx.strokeStyle = COLORS.guide;
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawLabel(ctx, x, y, text, color, highlight = false) {
  ctx.font = `bold ${FONT_SIZE}px 'Inter', 'SF Pro', system-ui, sans-serif`;
  const metrics = ctx.measureText(text);
  const w = metrics.width + LABEL_PADDING * 2;
  const h = FONT_SIZE + LABEL_PADDING * 2;

  // Background
  ctx.fillStyle = highlight ? color : COLORS.labelBg;
  ctx.beginPath();
  roundRect(ctx, x - LABEL_PADDING, y - FONT_SIZE - LABEL_PADDING + 2, w, h, 4);
  ctx.fill();

  // Border accent
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundRect(ctx, x - LABEL_PADDING, y - FONT_SIZE - LABEL_PADDING + 2, w, h, 4);
  ctx.stroke();

  // Text
  ctx.fillStyle = highlight ? COLORS.labelBg : COLORS.label;
  ctx.fillText(text, x, y);
}

// ----- Helpers -----

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function statusColor(status) {
  return COLORS[status] || COLORS.good;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
}

/**
 * Generate an annotated version of a swing frame
 * Takes a frame's base64 image + landmarks + measurements,
 * returns a new base64 image with annotations drawn on top
 *
 * @param {string} frameBase64 - data:image/jpeg;base64,... 
 * @param {Array} landmarks - 33 MediaPipe landmarks
 * @param {Object} measurements - from calculateAllAngles()
 * @param {string} phase - Swing phase name
 * @returns {Promise<string>} - Annotated image as base64 data URL
 */
export async function annotateFrame(frameBase64, landmarks, measurements, phase) {
  if (!landmarks || !measurements) return frameBase64;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      // Draw original frame
      ctx.drawImage(img, 0, 0);

      // Draw annotations
      drawAnnotations(ctx, landmarks, measurements, img.width, img.height, phase);

      // Phase label in top-left corner
      ctx.font = `bold 14px 'Inter', system-ui, sans-serif`;
      const phaseText = phase.replace(/_/g, ' ').toUpperCase();
      const tm = ctx.measureText(phaseText);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.beginPath();
      roundRect(ctx, 8, 8, tm.width + 16, 26, 6);
      ctx.fill();
      ctx.fillStyle = COLORS.good;
      ctx.fillText(phaseText, 16, 27);

      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = frameBase64;
  });
}

/**
 * Draw info badges in the top-right corner:
 * - "3D" badge if measurements use 3D data
 * - Average confidence percentage
 */
function drawInfoBadges(ctx, measurements, canvasWidth) {
  const entries = Object.values(measurements).filter(m => m && typeof m.confidence === 'number');
  if (entries.length === 0) return;

  const avgConf = Math.round(entries.reduce((sum, m) => sum + m.confidence, 0) / entries.length * 100);
  const is3D = entries.some(m => m.is3D);

  let x = canvasWidth - 12; // right edge
  const y = 16;
  const badgeH = 20;

  ctx.font = `bold ${FONT_SIZE - 1}px 'Inter', system-ui, sans-serif`;
  ctx.textAlign = 'right';

  // Confidence badge
  const confText = `${avgConf}%`;
  const confW = ctx.measureText(confText).width + 12;
  const confColor = avgConf >= 80 ? COLORS.good : avgConf >= 60 ? COLORS.warning : COLORS.poor;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.beginPath();
  roundRect(ctx, x - confW, y, confW, badgeH, 4);
  ctx.fill();
  ctx.fillStyle = confColor;
  ctx.fillText(confText, x - 6, y + 14);

  // 3D badge (if available)
  if (is3D) {
    x -= confW + 6;
    const tagText = '3D';
    const tagW = ctx.measureText(tagText).width + 12;
    ctx.fillStyle = 'rgba(157, 255, 0, 0.15)';
    ctx.beginPath();
    roundRect(ctx, x - tagW, y, tagW, badgeH, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(157, 255, 0, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    roundRect(ctx, x - tagW, y, tagW, badgeH, 4);
    ctx.stroke();
    ctx.fillStyle = COLORS.good;
    ctx.fillText(tagText, x - 6, y + 14);
  }

  ctx.textAlign = 'left'; // Reset
}
