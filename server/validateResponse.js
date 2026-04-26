/**
 * AI Response Validation
 * ======================
 * Sanitizes and validates JSON responses from Claude and Gemini
 * to prevent malformed AI output from crashing the frontend.
 */

/**
 * Validate and sanitize a position analysis response (Claude / Gemini full)
 * Ensures required fields exist with correct types and safe ranges.
 */
export function validatePositionResponse(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('AI returned empty or non-object response');
  }

  // totalScore: must be number 0-100
  if (typeof data.totalScore !== 'number' || isNaN(data.totalScore)) {
    data.totalScore = 0;
  }
  data.totalScore = Math.max(0, Math.min(100, Math.round(data.totalScore)));

  // categories: must be array
  if (!Array.isArray(data.categories)) {
    data.categories = [];
  }
  for (const cat of data.categories) {
    if (typeof cat.score !== 'number' || isNaN(cat.score)) cat.score = 0;
    cat.score = Math.max(0, Math.min(100, Math.round(cat.score)));
    cat.status = cat.score >= 70 ? 'correct' : 'improve';
    cat.name = cat.name || 'Unknown';
    cat.analysis = cat.analysis || '';
    cat.tips = Array.isArray(cat.tips) ? cat.tips : [];
    cat.checkpointsMet = Array.isArray(cat.checkpointsMet) ? cat.checkpointsMet : [];
    cat.checkpointsMissed = Array.isArray(cat.checkpointsMissed) ? cat.checkpointsMissed : [];
  }

  // faultsDetected: must be array
  if (!Array.isArray(data.faultsDetected)) {
    data.faultsDetected = [];
  }

  // biomechanics: must be object
  if (!data.biomechanics || typeof data.biomechanics !== 'object') {
    data.biomechanics = {};
  }
  // Ensure numeric values
  for (const [key, val] of Object.entries(data.biomechanics)) {
    if (val !== null && (typeof val !== 'number' || isNaN(val))) {
      data.biomechanics[key] = null;
    }
  }

  // estimatedHandicap: string or null
  if (data.estimatedHandicap && typeof data.estimatedHandicap !== 'string') {
    data.estimatedHandicap = String(data.estimatedHandicap);
  }

  // recommendedDrill: object or null
  if (data.recommendedDrill && typeof data.recommendedDrill !== 'object') {
    data.recommendedDrill = null;
  }

  return data;
}

/**
 * Validate and sanitize a motion analysis response (Gemini)
 */
export function validateMotionResponse(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('AI returned empty or non-object response');
  }

  if (typeof data.overallMotionGrade !== 'number' || isNaN(data.overallMotionGrade)) {
    data.overallMotionGrade = 50;
  }
  data.overallMotionGrade = Math.max(0, Math.min(100, Math.round(data.overallMotionGrade)));

  if (typeof data.tempoRatio !== 'number' || isNaN(data.tempoRatio)) {
    data.tempoRatio = null;
  }

  if (!Array.isArray(data.keyMotionFaults)) {
    data.keyMotionFaults = [];
  }

  data.castingDetected = Boolean(data.castingDetected);
  data.sequencingCorrect = Boolean(data.sequencingCorrect);

  return data;
}
