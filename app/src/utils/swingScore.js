/**
 * SWING SCORE ENGINE v2.0
 * =======================
 * Formula-based scoring that anchors AI estimates to objective criteria.
 * 
 * Architecture:
 * ┌─────────────────────────────────────────────────┐
 * │ SWING SCORE (0-100)                             │
 * │                                                 │
 * │ 🎯 Position Score (50%)  ← AI vision analysis   │
 * │    Setup, Backswing, Transition, Impact, Finish  │
 * │                                                 │
 * │ ⚡ Motion Score (30%)    ← Tempo + sequencing    │
 * │    Tempo Ratio, Kinematic Seq, Balance           │
 * │                                                 │
 * │ 📐 Mechanics Score (20%) ← MediaPipe measured   │
 * │    Spine Angle, Lead Arm, X-Factor, Weight       │
 * └─────────────────────────────────────────────────┘
 *
 * Key principles:
 * - Every sub-score has a FORMULA, not an AI guess
 * - Tour benchmark data for comparison
 * - Delta tracking against previous analyses
 * - Personal best tracking
 */

import { getSetting, setSetting, getHistoryMeta } from './storage';

// ─── TOUR BENCHMARKS ──────────────────────────────────────────
// Based on PGA Tour averages and TPI research data

export const TOUR_BENCHMARKS = {
  tempoRatio:        { value: 3.0,  unit: ':1', range: [2.5, 3.5],  label: { en: 'Tempo Ratio', sv: 'Tempo-kvot' } },
  xFactor:           { value: 45,   unit: '°',  range: [38, 55],    label: { en: 'X-Factor', sv: 'X-Faktor' } },
  shoulderTurn:      { value: 90,   unit: '°',  range: [80, 100],   label: { en: 'Shoulder Turn', sv: 'Axelrotation' } },
  hipOpen:           { value: 40,   unit: '°',  range: [30, 50],    label: { en: 'Hip Open at Impact', sv: 'Höftöppning vid träff' } },
  shaftLean:         { value: 12,   unit: '°',  range: [6, 18],     label: { en: 'Shaft Lean', sv: 'Skaftlutning' } },
  spineAngleChange:  { value: 2,    unit: '°',  range: [0, 5],      label: { en: 'Spine Angle Maint.', sv: 'Ryggradsvinkel-behåll.' } },
  leadArmExtension:  { value: 175,  unit: '°',  range: [165, 180],  label: { en: 'Lead Arm Extension', sv: 'Ledande arm extension' } },
  spineTilt:         { value: 40,   unit: '°',  range: [30, 50],    label: { en: 'Spine Tilt', sv: 'Rygglutning' } },
};

// ─── SCORE FORMULAS ────────────────────────────────────────────
// Each returns 0-100 based on how close to ideal

/**
 * Score based on proximity to an ideal value with a tolerance range.
 * Perfect match = 100. Outside the outer range = diminishing returns.
 * 
 * @param {number} value - Measured value
 * @param {number} ideal - Perfect value
 * @param {number} goodRange - ± range for 80+ score
 * @param {number} okRange - ± range for 60+ score
 * @returns {number} 0-100 score
 */
function proximityScore(value, ideal, goodRange, okRange) {
  if (value == null || isNaN(value)) return null;
  const diff = Math.abs(value - ideal);
  if (diff <= goodRange * 0.3) return 100;                         // Near-perfect: 95-100
  if (diff <= goodRange) return 100 - (diff / goodRange) * 20;     // Good range: 80-100
  if (diff <= okRange) return 80 - ((diff - goodRange) / (okRange - goodRange)) * 30; // OK: 50-80
  return Math.max(0, 50 - ((diff - okRange) / okRange) * 50);     // Poor: 0-50
}

/**
 * Score for spine angle maintenance — lower change = better.
 * Tour average is ~2° change from address to impact.
 */
function spineAngleScore(changeInDegrees) {
  if (changeInDegrees == null || isNaN(changeInDegrees)) return null;
  const abs = Math.abs(changeInDegrees);
  if (abs <= 2) return 100;
  if (abs <= 5) return 100 - ((abs - 2) / 3) * 15;  // 85-100
  if (abs <= 10) return 85 - ((abs - 5) / 5) * 25;  // 60-85
  if (abs <= 15) return 60 - ((abs - 10) / 5) * 20;  // 40-60
  return Math.max(10, 40 - ((abs - 15) / 10) * 30);  // 10-40
}

/**
 * Score for lead arm extension at impact.
 * Straight = 180°, good = 165-180°, poor = <140°
 */
function leadArmScore(angle) {
  if (angle == null || isNaN(angle)) return null;
  if (angle >= 175) return 100;
  if (angle >= 165) return 85 + ((angle - 165) / 10) * 15;        // 85-100
  if (angle >= 150) return 60 + ((angle - 150) / 15) * 25;        // 60-85
  if (angle >= 130) return 30 + ((angle - 130) / 20) * 30;        // 30-60
  return Math.max(10, 30 - ((130 - angle) / 30) * 20);            // 10-30
}

/**
 * Score for tempo ratio. Ideal is 3.0:1 (backswing:downswing).
 * Tour range is 2.5-3.5:1.
 */
function tempoScore(ratio) {
  return proximityScore(ratio, 3.0, 0.5, 1.2);
}

/**
 * Score for X-Factor (hip-shoulder separation).
 * Tour average is ~45°. Good range: 35-55°.
 */
function xFactorScore(degrees) {
  return proximityScore(degrees, 45, 10, 20);
}

/**
 * Score for shoulder turn at top of backswing.
 * Tour average is ~90°. Good range: 80-100°.
 */
function shoulderTurnScore(degrees) {
  return proximityScore(degrees, 90, 10, 20);
}

/**
 * Score for hip open at impact.
 * Tour average is ~40°. Good range: 30-50°.
 */
function hipOpenScore(degrees) {
  return proximityScore(degrees, 40, 10, 20);
}

/**
 * Score for shaft lean at impact.
 * Tour average is ~12°. Forward lean = positive.
 */
function shaftLeanScore(degrees) {
  return proximityScore(degrees, 12, 6, 15);
}

// ─── COMPOSITE SCORE CALCULATOR ────────────────────────────────

/**
 * Calculate the full Swing Score 2.0 breakdown from analysis data.
 *
 * @param {Object} coaching - The coaching/analysis result from Claude
 * @param {Object} mediapipeData - MediaPipe measurements (from angles.js)
 * @param {Object} motionData - Gemini motion analysis data
 * @returns {Object} Full score breakdown
 */
export function calculateSwingScore(coaching, mediapipeData = null, motionData = null) {
  const bio = coaching?.biomechanics || {};
  const categories = coaching?.categories || [];

  // ─── POSITION SCORE (from AI category scores) ──────────────
  const positionScores = {
    setup:       categories.find(c => c.name === 'Setup')?.score ?? null,
    backswing:   categories.find(c => c.name === 'Backswing')?.score ?? null,
    transition:  categories.find(c => c.name?.includes('Transition'))?.score ?? null,
    impact:      categories.find(c => c.name === 'Impact')?.score ?? null,
    finish:      categories.find(c => c.name?.includes('Follow'))?.score ?? null,
  };

  const positionWeights = { setup: 0.10, backswing: 0.12, transition: 0.13, impact: 0.10, finish: 0.05 };
  const positionTotal = weightedAverage(positionScores, positionWeights, 50);

  // ─── MOTION SCORE (from biomechanics/tempo) ────────────────
  const motionScores = {
    tempo:       tempoScore(bio.tempoRatio),
    sequencing:  null, // Will be set from kinematic data if available
    balance:     null, // Will be set from mediapipe if available
  };

  // Use kinematic sequencing data from Gemini if available
  if (motionData?.sequencing) {
    motionScores.sequencing = motionData.sequencing;
  }

  // Calculate balance from MediaPipe head offset if available
  if (mediapipeData?.headOffset) {
    const headOff = mediapipeData.headOffset.value;
    motionScores.balance = headOff <= 2 ? 100 : headOff <= 5 ? 85 : headOff <= 8 ? 65 : 40;
  }

  const motionWeights = { tempo: 0.12, sequencing: 0.10, balance: 0.08 };
  const motionTotal = weightedAverage(motionScores, motionWeights, 30);

  // ─── MECHANICS SCORE (formula-based from measurements) ─────
  const mechanicsScores = {
    spineAngle:   spineAngleScore(bio.spineAngleChange ?? mediapipeData?.spineTilt?.value),
    leadArm:      leadArmScore(mediapipeData?.leadArmExtension?.value),
    xFactor:      xFactorScore(bio.xFactor ?? mediapipeData?.xFactor?.value),
    hipShoulder:  null,
  };

  // Composite hip-shoulder: combine hipOpen and shoulderTurn
  const hipScore = hipOpenScore(bio.hipOpenAtImpact);
  const shoulderScore = shoulderTurnScore(bio.shoulderTurnAtTop);
  if (hipScore != null && shoulderScore != null) {
    mechanicsScores.hipShoulder = (hipScore + shoulderScore) / 2;
  } else {
    mechanicsScores.hipShoulder = hipScore ?? shoulderScore ?? null;
  }

  const mechanicsWeights = { spineAngle: 0.07, leadArm: 0.05, xFactor: 0.05, hipShoulder: 0.03 };
  const mechanicsTotal = weightedAverage(mechanicsScores, mechanicsWeights, 20);

  // ─── TOTAL SWING SCORE ─────────────────────────────────────
  const totalScore = Math.round(positionTotal + motionTotal + mechanicsTotal);

  // ─── BIOMECHANICS SUB-SCORES (for display) ─────────────────
  const biomechanicsBreakdown = {
    tempoRatio:       { value: bio.tempoRatio,        score: tempoScore(bio.tempoRatio),               tour: TOUR_BENCHMARKS.tempoRatio },
    xFactor:          { value: bio.xFactor ?? mediapipeData?.xFactor?.value, score: xFactorScore(bio.xFactor ?? mediapipeData?.xFactor?.value), tour: TOUR_BENCHMARKS.xFactor },
    shoulderTurn:     { value: bio.shoulderTurnAtTop,  score: shoulderTurnScore(bio.shoulderTurnAtTop), tour: TOUR_BENCHMARKS.shoulderTurn },
    hipOpen:          { value: bio.hipOpenAtImpact,     score: hipOpenScore(bio.hipOpenAtImpact),         tour: TOUR_BENCHMARKS.hipOpen },
    shaftLean:        { value: bio.shaftLeanAtImpact,   score: shaftLeanScore(bio.shaftLeanAtImpact),     tour: TOUR_BENCHMARKS.shaftLean },
    spineAngleChange: { value: bio.spineAngleChange,    score: spineAngleScore(bio.spineAngleChange),     tour: TOUR_BENCHMARKS.spineAngleChange },
    leadArmExtension: { value: mediapipeData?.leadArmExtension?.value, score: leadArmScore(mediapipeData?.leadArmExtension?.value), tour: TOUR_BENCHMARKS.leadArmExtension },
  };

  // B1 FIX: normalizePillar klampar till 0-100 och sätter null om
  // bidraget är så litet att det indikerar inga användbara data.
  // Tidigare: positionTotal / 0.50 kunde ge 100 om bara 1 kategori fanns.
  const normalizePillar = (total, maxContribution, minThreshold = 0.05) => {
    if (total < maxContribution * minThreshold) return null; // Otillräckliga data
    return Math.min(100, Math.max(0, Math.round(total / maxContribution)));
  };

  return {
    totalScore,

    // Three pillars
    position: {
      score: normalizePillar(positionTotal, 0.50), // null = otillräckliga kategorier
      weight: '50%',
      breakdown: positionScores,
    },
    motion: {
      score: normalizePillar(motionTotal, 0.30),
      weight: '30%',
      breakdown: motionScores,
    },
    mechanics: {
      score: normalizePillar(mechanicsTotal, 0.20),
      weight: '20%',
      breakdown: mechanicsScores,
    },

    // Detailed biomechanics
    biomechanicsBreakdown,

    // Legacy compat
    legacyScore: coaching?.totalScore ?? totalScore,
  };
}

// ─── WEIGHTED AVERAGE HELPER ───────────────────────────────────

function weightedAverage(scores, weights, maxContribution) {
  let totalWeight = 0;
  let totalScore = 0;
  let availableWeight = 0;
  let availableCount = 0;

  for (const [key, weight] of Object.entries(weights)) {
    const score = scores[key];
    if (score != null && !isNaN(score)) {
      totalScore += score * weight;
      totalWeight += weight;
      availableCount++;
    }
    availableWeight += weight;
  }

  if (totalWeight === 0) return maxContribution * 0.5; // Default to 50% if no data

  // Require at least 2 subscores before scaling up — a single score
  // shouldn't be extrapolated to represent the entire pillar
  const totalKeys = Object.keys(weights).length;
  if (availableCount < 2 && totalKeys > 2) {
    // Conservative: use raw weighted score without scale-up
    return (totalScore / totalWeight) * (totalWeight / availableWeight) * maxContribution;
  }

  // Scale up to fill the maxContribution proportionally
  const scaleFactor = availableWeight / totalWeight;
  return (totalScore * scaleFactor / availableWeight) * maxContribution;
}

// ─── DELTA CALCULATION ─────────────────────────────────────────

/**
 * Calculate score deltas against the previous analysis.
 * Returns { total: +6, position: +3, motion: +2, mechanics: +1, ... }
 */
export async function calculateDeltas(currentScore) {
  try {
    // D2 FIX: Använd getHistoryMeta istället för getHistory.
    // getHistory() laddar ALL data inkl. base64-frames (~250MB för 50 analyser).
    // getHistoryMeta() hämtar bara metadata (score, timestamp) — ~1KB totalt.
    const history = await getHistoryMeta(5);
    if (!history || history.length < 2) return null;

    // history[0] = nuvarande (precis sparat), history[1] = föregående
    const prev = history[1];
    if (prev?.totalScore == null) return null;

    // Med getHistoryMeta har vi inte full coaching-data — jämför bara total
    return {
      total: currentScore.totalScore - prev.totalScore,
      position: null,   // Pillar-deltas kräver full data — inte avgörande för UX
      motion: null,
      mechanics: null,
      biomechanics: {},
    };
  } catch {
    return null;
  }
}

// ─── PERSONAL BESTS ────────────────────────────────────────────

/**
 * Check the current score against personal bests and update if new records.
 * @returns {Object} { newRecords: ['total', 'tempo', ...], personalBests: {...} }
 */
export function checkPersonalBests(swingScore) {
  const bests = getSetting('personal_bests') || {};
  const newRecords = [];

  // Check total
  if (swingScore.totalScore > (bests.total || 0)) {
    bests.total = swingScore.totalScore;
    bests.totalDate = Date.now();
    newRecords.push('total');
  }

  // Check pillars
  const pillars = { position: swingScore.position.score, motion: swingScore.motion.score, mechanics: swingScore.mechanics.score };
  for (const [key, score] of Object.entries(pillars)) {
    if (score > (bests[key] || 0)) {
      bests[key] = score;
      bests[`${key}Date`] = Date.now();
      newRecords.push(key);
    }
  }

  // Check biomechanics sub-scores
  for (const [key, data] of Object.entries(swingScore.biomechanicsBreakdown)) {
    if (data.score != null && data.score > (bests[`bio_${key}`] || 0)) {
      bests[`bio_${key}`] = data.score;
      bests[`bio_${key}Date`] = Date.now();
      newRecords.push(key);
    }
  }

  setSetting('personal_bests', bests);

  return { newRecords, personalBests: bests };
}

/**
 * Get all personal bests
 */
export function getPersonalBests() {
  return getSetting('personal_bests') || {};
}

// ─── SCORE LABELS & GRADES ─────────────────────────────────────

export function getScoreGrade(score) {
  if (score >= 90) return { grade: 'A+', label: { en: 'Tour Level', sv: 'Tour-nivå' }, color: '#9DFF00' };
  if (score >= 80) return { grade: 'A',  label: { en: 'Excellent', sv: 'Utmärkt' }, color: '#9DFF00' };
  if (score >= 70) return { grade: 'B',  label: { en: 'Good', sv: 'Bra' }, color: '#9DFF00' };
  if (score >= 60) return { grade: 'C',  label: { en: 'Adequate', sv: 'Godtagbar' }, color: '#FFA500' };
  if (score >= 50) return { grade: 'D',  label: { en: 'Needs Work', sv: 'Behöver arbete' }, color: '#FF6B6B' };
  return             { grade: 'F',  label: { en: 'Rebuild', sv: 'Bygga om' }, color: '#FF3333' };
}

export function getScoreLabel(score, language = 'sv') {
  const grade = getScoreGrade(score);
  return grade.label[language] || grade.label.en;
}

// ─── ESTIMATED HANDICAP ────────────────────────────────────────

export function estimateHandicap(totalScore) {
  if (totalScore >= 95) return '+2 – Scratch';
  if (totalScore >= 90) return '0 – 4';
  if (totalScore >= 85) return '5 – 9';
  if (totalScore >= 80) return '10 – 14';
  if (totalScore >= 75) return '15 – 19';
  if (totalScore >= 70) return '20 – 24';
  if (totalScore >= 60) return '25 – 30';
  if (totalScore >= 50) return '30 – 36';
  return '36+';
}
