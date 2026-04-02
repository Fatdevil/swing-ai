/**
 * Gemini 2.5 Pro — Full Swing Analysis (Video)
 * ===============================================
 * Two modes:
 * 1. analyzeMotion() — Motion-only analysis (for dual engine mode)
 * 2. analyzeFullSwing() — Complete analysis (for basic/standalone mode)
 *
 * Uses Google Generative AI SDK with video input.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

function getModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
}

/**
 * Strip data URI prefix from base64 string
 */
function cleanBase64(b64) {
  return b64.replace(/^data:video\/\w+;base64,/, '');
}

/**
 * Parse JSON from AI response text
 */
function parseJSON(text) {
  const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('Gemini JSON parse error:', text.slice(0, 500));
    throw new Error('Could not parse Gemini response');
  }
}

// ─── MOTION-ONLY ANALYSIS (for Premium dual engine) ─────────

/**
 * Analyze swing motion from video (used alongside Claude in Premium mode)
 */
export async function analyzeMotion(videoBase64, cameraAngle, language = 'sv') {
  const model = getModel();

  const langInstruction = language === 'sv'
    ? 'Respond entirely in Swedish.'
    : 'Respond entirely in English.';

  const cameraAngleDesc = {
    side: 'side view (face-on)',
    front: 'front-facing view',
    dtl: 'down-the-line view (behind the golfer)',
    auto: 'unknown angle — you must first determine the camera angle from the video',
  }[cameraAngle] || 'unknown angle — determine from video';

  const autoDetectInstruction = cameraAngle === 'auto'
    ? 'IMPORTANT: First determine the camera angle (side/face-on, front, or down-the-line) from the video before analyzing. Adjust your analysis based on what is reliably visible from that angle.'
    : '';

  const prompt = `You are an elite PGA golf coach specializing in MOVEMENT ANALYSIS. You have been given a video of a golf swing from a ${cameraAngleDesc}.

${autoDetectInstruction}

Your UNIQUE role is to analyze the MOTION and DYNAMICS — things that can only be seen in video, not still images:

## YOUR FOCUS AREAS (Motion-Specific):
1. **Tempo & Rhythm**: Backswing-to-downswing time ratio (tour average ≈ 3:1). Is the swing rushed, smooth, or deliberate?
2. **Kinematic Sequencing**: In what order do body segments accelerate? Ideal: hips → torso → arms → hands.
3. **Transition Quality**: How smooth is the backswing-to-downswing transition?
4. **Casting / Early Release**: Do the wrists release too early?
5. **Dynamic Balance**: Does the golfer maintain balance through the swing?
6. **Acceleration Pattern**: Does speed build progressively or spike erratically?
7. **Weight Transfer Flow**: Smooth shift from trail foot to lead foot?

## RESPONSE FORMAT
Valid JSON only — no markdown, no code fences:

{
  "tempoRatio": <number, e.g. 2.8>,
  "tempoGrade": "<excellent/good/fair/poor>",
  "tempoNotes": "<observation>",
  "sequencingOrder": ["<actual order>"],
  "sequencingCorrect": <true/false>,
  "sequencingNotes": "<observation>",
  "transitionQuality": "<smooth/abrupt/rushed/deliberate>",
  "transitionNotes": "<observation>",
  "castingDetected": <true/false>,
  "castingNotes": "<evidence>",
  "dynamicBalance": "<excellent/good/fair/poor>",
  "balanceNotes": "<observation>",
  "accelerationPattern": "<progressive/erratic/decelerating>",
  "weightTransfer": "<good/restricted/reverse>",
  "overallMotionGrade": <0-100>,
  "keyMotionFaults": [
    {"fault": "<name>", "severity": "<high/medium/low>", "evidence": "<what you see>"}
  ],
  "motionSummary": "<2-3 sentence summary>"
}

## CRITICAL
- Focus ONLY on what video reveals that still images cannot
- ${langInstruction}`;

  const result = await model.generateContent([
    { inlineData: { mimeType: 'video/mp4', data: cleanBase64(videoBase64) } },
    { text: prompt },
  ]);

  return parseJSON(result.response.text());
}


// ─── FULL SWING ANALYSIS (for Basic standalone mode) ────────

/**
 * Complete swing analysis from video — positions + motion + scoring
 * This is used when running Gemini as the ONLY engine (Basic tier)
 */
export async function analyzeFullSwing(videoBase64, cameraAngle, language = 'sv', knowledgeBase = '') {
  const model = getModel();

  const langInstruction = language === 'sv'
    ? 'Respond entirely in Swedish.'
    : 'Respond entirely in English.';

  const cameraAngleDesc = {
    side: 'side view (face-on)',
    front: 'front-facing view',
    dtl: 'down-the-line view (behind the golfer)',
    auto: 'unknown angle',
  }[cameraAngle] || 'unknown angle';

  const angleCapabilities = {
    side: `CAMERA: SIDE VIEW. Reliably assess: spine tilt, head sway, knee flex, arm extension, shaft lean at impact, weight transfer, tempo, follow-through balance. Less reliable: hip rotation degrees, shoulder turn degrees, club face angle.`,
    front: `CAMERA: FRONT VIEW. Reliably assess: shoulder rotation, hip rotation, X-Factor, weight distribution, arm position. Less reliable: shaft lean, takeaway path.`,
    dtl: `CAMERA: DOWN THE LINE. Reliably assess: swing plane, club face angle, path, spine angle, early extension, takeaway. Less reliable: shoulder turn, hip rotation, lateral sway.`,
    auto: `CAMERA: AUTO-DETECT. First, determine the camera angle from the video (side/face-on, front, or down-the-line). Then adjust your analysis to only make claims about things reliably visible from that angle.`,
  }[cameraAngle] || '';

  const prompt = `You are a PGA-certified golf coach and biomechanics expert. Analyze this golf swing video.${
    cameraAngle === 'auto' ? ' First determine the camera angle.' : ` Camera angle: ${cameraAngleDesc}.`
  }

${angleCapabilities}

${knowledgeBase ? '## GOLF KNOWLEDGE BASE\n' + knowledgeBase.slice(0, 8000) : ''}

## COMPLETE ANALYSIS TASK
Watch the entire swing video carefully. Analyze BOTH:
1. **Positions** — body angles, checkpoints at each phase
2. **Motion** — tempo, rhythm, sequencing, transition quality, balance

## SCORING RULES
- Score each category 0-100
- Calculate totalScore using weighted average: Setup 15%, Backswing 20%, Transition 25%, Impact 25%, Follow-through 15%
- Status: "correct" if score >= 70, "improve" if < 70

## RESPONSE FORMAT
Valid JSON only — no markdown, no code fences:

{
  "totalScore": <0-100, CALCULATED from weighted category scores>,
  "estimatedHandicap": "<handicap range based on totalScore>",
  "priorityFocus": "<the single most impactful thing to fix>",
  "recommendedDrill": {
    "id": "<drill name as snake_case, e.g. 'pump_drill'>",
    "reason": "<why this drill>"
  },
  "faultsDetected": [
    {"id": "<fault_id>", "confidence": "<high/medium/low>", "evidence": "<what you see>"}
  ],
  "tempo": "<tempo assessment: ratio, rhythm, smoothness>",
  "categories": [
    {"name": "Setup", "score": <0-100>, "status": "correct|improve", "analysis": "<detailed observation>", "tips": ["<actionable tip>"], "keyFrame": 1, "checkpointsMet": ["<met>"], "checkpointsMissed": ["<missed>"]},
    {"name": "Backswing", "score": <0-100>, "status": "correct|improve", "analysis": "<observation>", "tips": ["<tip>"], "keyFrame": 3, "checkpointsMet": [], "checkpointsMissed": []},
    {"name": "Transition & Downswing", "score": <0-100>, "status": "correct|improve", "analysis": "<observation>", "tips": ["<tip>"], "keyFrame": 5, "checkpointsMet": [], "checkpointsMissed": []},
    {"name": "Impact", "score": <0-100>, "status": "correct|improve", "analysis": "<observation>", "tips": ["<tip>"], "keyFrame": 6, "checkpointsMet": [], "checkpointsMissed": []},
    {"name": "Follow-through & Finish", "score": <0-100>, "status": "correct|improve", "analysis": "<observation>", "tips": ["<tip>"], "keyFrame": 8, "checkpointsMet": [], "checkpointsMissed": []}
  ],
  "biomechanics": {
    "hipOpenAtImpact": <degrees or null>,
    "shoulderTurnAtTop": <degrees or null>,
    "xFactor": <degrees or null>,
    "tempoRatio": <number, e.g. 2.8>,
    "shaftLeanAtImpact": <degrees or null>,
    "spineAngleChange": <degrees or null>
  },
  "motionAnalysis": {
    "tempoRatio": <number>,
    "tempoGrade": "<excellent/good/fair/poor>",
    "sequencingOrder": ["<actual order>"],
    "sequencingCorrect": <true/false>,
    "transitionQuality": "<smooth/abrupt/rushed/deliberate>",
    "castingDetected": <true/false>,
    "dynamicBalance": "<excellent/good/fair/poor>",
    "overallMotionGrade": <0-100>
  },
  "coachingSummary": "<3-4 sentence coaching summary combining position and motion findings>"
}

## HANDICAP MAP
- 90-100 → Scratch / +handicap
- 80-89 → 1-5 hcp
- 70-79 → 6-12 hcp
- 60-69 → 13-20 hcp
- 50-59 → 21-28 hcp
- 40-49 → 29-36 hcp
- <40 → 36+ hcp

## CRITICAL
- Use numbers only for biomechanics (no strings, no degree symbols). If uncertain, use null.
- Be specific — reference what you see in the video
- ${langInstruction}`;

  const result = await model.generateContent([
    { inlineData: { mimeType: 'video/mp4', data: cleanBase64(videoBase64) } },
    { text: prompt },
  ]);

  return parseJSON(result.response.text());
}
