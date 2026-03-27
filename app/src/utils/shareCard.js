/**
 * SOCIAL SHARE UTILITY
 * ====================
 * Canvas-rendered share cards + Web Share API
 *
 * Generates premium PNG cards for:
 * - Swing Score (after analysis)
 * - Challenge Score (after challenge)
 *
 * Uses Web Share API on mobile, falls back to download on desktop.
 */

// ============================================================
// CANVAS HELPERS
// ============================================================

function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawScoreArc(ctx, cx, cy, radius, score, lineWidth = 8) {
  // Background arc
  ctx.beginPath();
  ctx.arc(cx, cy, radius, -Math.PI / 2, Math.PI * 1.5, false);
  ctx.strokeStyle = 'rgba(157, 255, 0, 0.12)';
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  // Score arc
  const angle = (score / 100) * Math.PI * 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + angle, false);
  ctx.strokeStyle = '#9DFF00';
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.stroke();
}

// ============================================================
// SCORE CARD — After swing analysis
// ============================================================

export async function generateScoreCard(data, language = 'en') {
  const sv = language === 'sv';
  const W = 1080;
  const H = 1350; // Instagram portrait
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#0A0F1C');
  bgGrad.addColorStop(0.5, '#0D1220');
  bgGrad.addColorStop(1, '#060A14');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Decorative glow
  const glow = ctx.createRadialGradient(W * 0.7, H * 0.15, 0, W * 0.7, H * 0.15, 400);
  glow.addColorStop(0, 'rgba(157, 255, 0, 0.08)');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Border glow line at top
  const borderGrad = ctx.createLinearGradient(0, 0, W, 0);
  borderGrad.addColorStop(0, 'transparent');
  borderGrad.addColorStop(0.3, 'rgba(157, 255, 0, 0.5)');
  borderGrad.addColorStop(0.7, 'rgba(157, 255, 0, 0.5)');
  borderGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = borderGrad;
  ctx.fillRect(0, 0, W, 3);

  // App logo / brand
  ctx.font = '900 28px "Space Grotesk", sans-serif';
  ctx.fillStyle = '#9DFF00';
  ctx.textAlign = 'center';
  ctx.fillText('SWING_AI', W / 2, 70);

  ctx.font = '600 14px "Inter", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText(sv ? 'AI-DRIVEN SVINGANALYS' : 'AI-POWERED SWING ANALYSIS', W / 2, 100);

  // Score circle
  const score = data.totalScore || 0;
  const cx = W / 2;
  const cy = 300;
  drawScoreArc(ctx, cx, cy, 120, score, 10);

  // Score number
  ctx.font = '900 96px "Space Grotesk", sans-serif';
  ctx.fillStyle = '#9DFF00';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(157, 255, 0, 0.4)';
  ctx.shadowBlur = 30;
  ctx.fillText(String(score), cx, cy);
  ctx.shadowBlur = 0;

  ctx.font = '700 14px "Inter", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText(sv ? 'SVINGSCORE' : 'SWING SCORE', cx, cy + 60);

  // Handicap estimate
  const coaching = data.coaching || {};
  if (coaching.estimatedHandicap) {
    ctx.font = '600 16px "Inter", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText(`${sv ? 'Est. Hcp' : 'Est. Hcp'}: ${coaching.estimatedHandicap}`, cx, cy + 90);
  }

  // Category bars
  const categories = coaching.categories || [];
  const barY = 480;
  const barWidth = W - 160;
  const barHeight = 8;
  const barX = 80;

  categories.forEach((cat, i) => {
    const y = barY + i * 70;

    // Label
    ctx.font = '700 18px "Inter", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'left';
    ctx.fillText(cat.name, barX, y);

    // Score
    ctx.font = '800 20px "Space Grotesk", sans-serif';
    ctx.fillStyle = cat.score >= 80 ? '#9DFF00' : cat.score >= 60 ? '#FACC15' : '#F87171';
    ctx.textAlign = 'right';
    ctx.fillText(String(cat.score), barX + barWidth, y);

    // Bar background
    roundRect(ctx, barX, y + 10, barWidth, barHeight, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();

    // Bar fill
    const fillW = (cat.score / 100) * barWidth;
    roundRect(ctx, barX, y + 10, fillW, barHeight, 4);
    ctx.fillStyle = cat.score >= 80 ? '#9DFF00' : cat.score >= 60 ? '#FACC15' : '#F87171';
    ctx.fill();
  });

  // Faults detected
  const faults = coaching.faultsDetected || [];
  if (faults.length > 0) {
    const faultY = barY + categories.length * 70 + 40;
    ctx.font = '700 13px "Inter", sans-serif';
    ctx.fillStyle = 'rgba(157, 255, 0, 0.6)';
    ctx.textAlign = 'left';
    ctx.fillText(sv ? 'IDENTIFIERADE FEL' : 'FAULTS DETECTED', barX, faultY);

    faults.slice(0, 3).forEach((fault, i) => {
      ctx.font = '500 16px "Inter", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(`• ${fault.fault}`, barX + 10, faultY + 28 + i * 28);
    });
  }

  // Recommended drill
  const drill = coaching.recommendedDrill;
  if (drill) {
    const drillY = H - 280;

    roundRect(ctx, barX - 10, drillY, barWidth + 20, 90, 12);
    ctx.fillStyle = 'rgba(157, 255, 0, 0.05)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(157, 255, 0, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = '700 13px "Inter", sans-serif';
    ctx.fillStyle = '#9DFF00';
    ctx.textAlign = 'left';
    ctx.fillText(sv ? 'REKOMMENDERAD ÖVNING' : 'RECOMMENDED DRILL', barX + 10, drillY + 30);

    ctx.font = '600 18px "Inter", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(drill.name || drill.id, barX + 10, drillY + 60);
  }

  // QR-style pattern for viral CTA
  const qrX = W / 2 - 45;
  const qrY = H - 230;
  const qrSize = 90;
  ctx.strokeStyle = 'rgba(157, 255, 0, 0.3)';
  ctx.lineWidth = 1;
  roundRect(ctx, qrX, qrY, qrSize, qrSize, 8);
  ctx.stroke();

  // Simulated QR grid pattern
  ctx.fillStyle = 'rgba(157, 255, 0, 0.6)';
  const cellSize = 6;
  const gridCols = 11;
  const padX = qrX + (qrSize - gridCols * cellSize) / 2;
  const padY = qrY + (qrSize - gridCols * cellSize) / 2;
  // Position detection patterns (corners)
  for (let row = 0; row < gridCols; row++) {
    for (let col = 0; col < gridCols; col++) {
      const isCorner = (row < 3 && col < 3) || (row < 3 && col >= gridCols - 3) || (row >= gridCols - 3 && col < 3);
      const isInnerCorner = (row === 1 && col === 1) || (row === 1 && col === gridCols - 2) || (row === gridCols - 2 && col === 1);
      const shouldFill = isCorner || isInnerCorner || ((row + col) % 3 === 0 && row > 2 && col > 2);
      if (shouldFill) {
        ctx.fillRect(padX + col * cellSize, padY + row * cellSize, cellSize - 1, cellSize - 1);
      }
    }
  }

  // CTA text below QR
  ctx.font = '600 14px "Inter", sans-serif';
  ctx.fillStyle = '#9DFF00';
  ctx.textAlign = 'center';
  ctx.fillText(sv ? 'Prova SWING_AI' : 'Try SWING_AI', W / 2, qrY + qrSize + 25);

  ctx.font = '500 11px "Inter", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillText('swingai.app', W / 2, qrY + qrSize + 45);

  // Footer
  ctx.font = '600 13px "Inter", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.textAlign = 'center';
  ctx.fillText(sv ? 'AI-driven svinganalys' : 'AI-powered swing analysis', W / 2, H - 50);

  // Date
  ctx.font = '500 12px "Inter", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillText(new Date().toLocaleDateString(sv ? 'sv-SE' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  }), W / 2, H - 30);

  // Bottom gradient line
  ctx.fillStyle = borderGrad;
  ctx.fillRect(0, H - 3, W, 3);

  return canvas.toDataURL('image/png');
}

// ============================================================
// CHALLENGE CARD — After challenge attempt
// ============================================================

export async function generateChallengeCard(challengeTitle, playerName, score, badge, language = 'en') {
  const sv = language === 'sv';
  const W = 1080;
  const H = 1080; // Square for Instagram
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#0A0F1C');
  bgGrad.addColorStop(1, '#060A14');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Decorative glows
  const glow1 = ctx.createRadialGradient(W * 0.3, H * 0.3, 0, W * 0.3, H * 0.3, 350);
  glow1.addColorStop(0, 'rgba(157, 255, 0, 0.06)');
  glow1.addColorStop(1, 'transparent');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, W, H);

  if (badge === 'gold') {
    const glow2 = ctx.createRadialGradient(W * 0.7, H * 0.6, 0, W * 0.7, H * 0.6, 300);
    glow2.addColorStop(0, 'rgba(251, 191, 36, 0.06)');
    glow2.addColorStop(1, 'transparent');
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, W, H);
  }

  // Top border
  const borderGrad = ctx.createLinearGradient(0, 0, W, 0);
  borderGrad.addColorStop(0, 'transparent');
  borderGrad.addColorStop(0.5, 'rgba(157, 255, 0, 0.5)');
  borderGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = borderGrad;
  ctx.fillRect(0, 0, W, 3);

  // Brand
  ctx.font = '900 28px "Space Grotesk", sans-serif';
  ctx.fillStyle = '#9DFF00';
  ctx.textAlign = 'center';
  ctx.fillText('SWING_AI', W / 2, 70);

  // Challenge label
  ctx.font = '700 14px "Inter", sans-serif';
  ctx.fillStyle = 'rgba(157, 255, 0, 0.6)';
  ctx.fillText(sv ? 'UTMANING' : 'CHALLENGE', W / 2, 120);

  // Challenge title
  ctx.font = '800 42px "Space Grotesk", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(challengeTitle, W / 2, 180);

  // "vs" player name
  ctx.font = '600 20px "Inter", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText(`vs ${playerName}`, W / 2, 220);

  // Score circle
  const cx = W / 2;
  const cy = 440;
  drawScoreArc(ctx, cx, cy, 150, score, 12);

  // Score
  ctx.font = '900 120px "Space Grotesk", sans-serif';
  ctx.fillStyle = '#9DFF00';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(157, 255, 0, 0.4)';
  ctx.shadowBlur = 40;
  ctx.fillText(String(score), cx, cy);
  ctx.shadowBlur = 0;

  ctx.font = '700 16px "Inter", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText(sv ? 'LIKHETSPOÄNG' : 'SIMILARITY SCORE', cx, cy + 80);

  // Badge
  if (badge) {
    const badgeY = 670;
    const badgeColors = {
      gold: { bg: 'rgba(251, 191, 36, 0.15)', border: 'rgba(251, 191, 36, 0.4)', text: '#FFC107', label: sv ? '🥇 GULD' : '🥇 GOLD' },
      silver: { bg: 'rgba(203, 213, 225, 0.1)', border: 'rgba(203, 213, 225, 0.3)', text: '#CBD5E1', label: sv ? '🥈 SILVER' : '🥈 SILVER' },
      bronze: { bg: 'rgba(234, 88, 12, 0.1)', border: 'rgba(234, 88, 12, 0.3)', text: '#EA580C', label: sv ? '🥉 BRONS' : '🥉 BRONZE' },
    };
    const b = badgeColors[badge] || badgeColors.bronze;

    roundRect(ctx, W / 2 - 120, badgeY, 240, 50, 25);
    ctx.fillStyle = b.bg;
    ctx.fill();
    ctx.strokeStyle = b.border;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = '800 18px "Space Grotesk", sans-serif';
    ctx.fillStyle = b.text;
    ctx.textBaseline = 'middle';
    ctx.fillText(b.label, W / 2, badgeY + 25);
  }

  // CTA
  ctx.font = '600 18px "Inter", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(sv ? 'Kan du slå min score?' : 'Can you beat my score?', W / 2, H - 120);

  // Footer
  ctx.font = '600 13px "Inter", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillText('swingai.app', W / 2, H - 75);

  ctx.fillStyle = borderGrad;
  ctx.fillRect(0, H - 3, W, 3);

  return canvas.toDataURL('image/png');
}

// ============================================================
// SHARE / DOWNLOAD
// ============================================================

/**
 * Share or download a data URL image
 */
export async function shareImage(dataUrl, filename, title) {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], filename, { type: 'image/png' });

    // Try Web Share API (works on mobile)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: title || 'SWING_AI',
        files: [file],
      });
      return 'shared';
    }
  } catch (e) {
    // User cancelled or API not available — fall through to download
    if (e.name === 'AbortError') return 'cancelled';
    console.warn('Share failed, falling back to download:', e);
  }

  // Fallback: download
  downloadDataUrl(dataUrl, filename);
  return 'downloaded';
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
