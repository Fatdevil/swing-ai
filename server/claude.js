/**
 * Claude Sonnet — Position Analysis & Summarizer
 * =================================================
 * Two roles:
 * 1. analyzePosition() — Frame-by-frame position analysis (angles, checkpoints)
 * 2. summarizeAnalysis() — Combines Gemini motion + Claude position into unified coaching
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  return new Anthropic({ apiKey, timeout: 90_000 }); // 90s timeout
}

// ─── POSITION ANALYSIS (frame-by-frame) ─────────────────────────

/**
 * Analyze swing positions from 8 key frames
 * @param {Array} frames - [{phase, base64, measurements}]
 * @param {string} cameraAngle - 'side' | 'front' | 'dtl'
 * @param {string} language - 'en' | 'sv'
 * @param {string|null} knowledgeBase - golf knowledge prompt text
 * @param {Object} options - { guestMode, coachingProfile, coachingHistory, sequencing }
 */
export async function analyzePosition(frames, cameraAngle, language = 'sv', knowledgeBase = '', options = {}) {
  const client = getClient();
  const { guestMode = false, coachingProfile = '', coachingHistory = '', sequencing = null } = options;

  const langInstruction = language === 'sv'
    ? 'Respond entirely in Swedish.'
    : 'Respond entirely in English.';

  const cameraAngleDesc = {
    side: 'side view (face-on)',
    front: 'front-facing view',
    dtl: 'down-the-line view (behind the golfer)',
  }[cameraAngle] || 'side view';

  const angleCapabilities = {
    side: `## CAMERA ANGLE GUIDE — SIDE VIEW\nReliably assess: spine tilt, head sway, knee flex, arm extension, shaft lean at impact, weight transfer, tempo, follow-through balance.\nCANNOT reliably assess: hip open degrees, shoulder turn degrees, club face angle, swing path, X-Factor.\nBiomechanics confidence: shaftLeanAtImpact=HIGH, spineAngleChange=HIGH, hipOpenAtImpact=LOW(±15°), shoulderTurnAtTop=LOW(±15°), xFactor=LOW.`,
    front: `## CAMERA ANGLE GUIDE — FRONT VIEW\nReliably assess: shoulder rotation, hip rotation, X-Factor, weight distribution, arm position at top.\nCANNOT reliably assess: shaft lean, takeaway path, extension through ball.\nBiomechanics confidence: hipOpenAtImpact=HIGH(±5°), shoulderTurnAtTop=HIGH(±5°), xFactor=HIGH(±5°), shaftLeanAtImpact=LOW.`,
    dtl: `## CAMERA ANGLE GUIDE — DOWN THE LINE\nReliably assess: swing plane, club face angle, inside/outside path, spine angle maintenance, early extension, takeaway path.\nCANNOT reliably assess: shoulder turn degrees, hip rotation degrees, lateral sway, weight transfer, X-Factor.\nBiomechanics confidence: spineAngleChange=HIGH(±2°), shaftLeanAtImpact=MEDIUM, hipOpenAtImpact=LOW, shoulderTurnAtTop=LOW, xFactor=LOW.`,
  }[cameraAngle] || '';

  // Build measurement summary
  const framesMeta = frames.map((f, i) => {
    let measureText = 'No pose data available';
    if (f.measurements) {
      measureText = Object.entries(f.measurements)
        .map(([key, m]) => `${key}: ${m.value.toFixed(1)}° (${m.status}, confidence: ${(m.confidence * 100).toFixed(0)}%)`)
        .join(', ');
    }
    return `Frame ${i + 1} (${f.phase}): ${measureText}`;
  }).join('\n');

  let sequencingCtx = '';
  if (sequencing) {
    sequencingCtx = `## TPI KINEMATIC SEQUENCING (from MediaPipe)\nSequence grade: ${sequencing.grade}/100\nPeak velocity order: ${sequencing.actualOrder?.join(' → ') || 'unknown'}\nIdeal order: hips → torso → arms → hands\nCorrect: ${sequencing.isCorrect ? 'YES' : 'NO'}\n`;
    if (sequencing.errors?.length > 0) {
      sequencingCtx += 'Errors: ' + sequencing.errors.map(e => e.en || e).join('; ') + '\n';
    }
  }

  const profileCtx = guestMode ? '' : (coachingProfile || '');
  const historyCtx = guestMode ? '' : (coachingHistory || '');

  const systemPrompt = `You are a PGA-certified golf coach and biomechanics expert. Your SPECIFIC role is POSITION ANALYSIS — analyzing static frame positions with precision.

${knowledgeBase}
${profileCtx}
${historyCtx}

${angleCapabilities}

## ANALYSIS TASK
You are analyzing a golf swing from a ${cameraAngleDesc}. You will receive ${frames.length} sequential frames.

CRITICAL: Follow the CAMERA ANGLE GUIDE. Only give confident estimates for metrics marked HIGH confidence.

## MediaPipe Measurements:
${framesMeta}

${sequencingCtx}

## STRICT SCORING RUBRIC — CHECKPOINT-BASED (5 checkpoints per category, 20 points each)

### Setup (5 checkpoints × 20 = 100):
1. Grip: neutral, V's pointing to trail shoulder
2. Stance: shoulder width, ball position correct for club
3. Posture: spine tilt 35-45°, arms hanging naturally
4. Alignment: feet/hips/shoulders parallel to target line
5. Weight: 50-50 distribution, balanced over balls of feet
→ 5/5 met = 100, 4/5 = 80, 3/5 = 60, 2/5 = 40, 1/5 = 20, 0/5 = 10

### Backswing (5 checkpoints × 20 = 100):
1. Takeaway: one-piece, club on plane, no early wrist set
2. Halfway back: shaft parallel to target line, toe pointing up
3. Top: lead arm extended, wrist hinged 90°, club parallel to target
4. Shoulder turn: 80-100° turn with stable lower body
5. Spine angle: maintained from address (< 5° change)
→ Score = checkpoints_met × 20 (min 10)

### Transition & Downswing (5 checkpoints × 20 = 100):
1. Sequence: lower body initiates before upper body
2. Lag: wrist angle maintained or increased entering downswing
3. Club path: approaches from inside (not over-the-top)
4. Hip rotation: hips 30-50° open at impact approach
5. Shaft: drops into slot, on or below backswing plane
→ Score = checkpoints_met × 20 (min 10)

### Impact (5 checkpoints × 20 = 100):
1. Hands ahead: shaft leaning forward (6-18° forward lean)
2. Hips open: 30-50° open at impact
3. Weight forward: 70-80% on lead foot
4. Head behind ball: stable head position, slight trail tilt
5. Lead arm: extended (not chicken wing), connection maintained
→ Score = checkpoints_met × 20 (min 10)

### Follow-through & Finish (5 checkpoints × 20 = 100):
1. Extension: both arms extended post-impact
2. Rotation: chest facing target at finish
3. Balance: held finish position for 2+ seconds
4. Weight: 90%+ on lead foot, trail toe only touching
5. Club: finishes behind head/neck, not wrapped around body
→ Score = checkpoints_met × 20 (min 10)

## SCORE ANCHORING RULES — CRITICAL
DO NOT cluster scores between 65-75. Use the FULL range:
- 90-100: Tour-level execution. All 5 checkpoints met perfectly.
- 80-89: Strong amateur. 4/5 checkpoints met consistently.
- 70-79: Mid-handicapper. 3/5 checkpoints met, 1-2 minor deviations.
- 60-69: High handicapper. 2-3 checkpoints met, 1 major fault present.
- 50-59: Beginner+. 1-2 checkpoints met, multiple faults affecting ball flight.
- 30-49: Beginner. Fundamental issues, needs significant rebuild.
- 10-29: First-time golfer. Most basics missing.



ANCHORING: If you find 2+ major faults, totalScore MUST be < 70.
If only 1 minor fault, totalScore should be 75-85.
A clean swing with no visible faults should score 85+.

## FAULT SEVERITY MULTIPLIER
- Each "critical" fault detected: −8 to −15 points from affected category
- Each "major" fault: −5 to −10 points from affected category
- Each "moderate" fault: −3 to −5 points from affected category

## RESPONSE FORMAT
Valid JSON only — no markdown, no code fences:

{
  "totalScore": <0-100>,
  "estimatedHandicap": "<handicap range>",
  "causalChain": {
    "rootCause": "<what the body physically did wrong>",
    "biomechanicalEffect": "<how this altered the club dynamics/path>",
    "ballFlight": "<the inevitable outcome on the ball flight>"
  },
  "recommendedDrill": {
    "id": "<drill ID, e.g. 'pump_drill'>",
    "reason": "<why this drill>"
  },
  "faultsDetected": [
    {"id": "<fault ID>", "severity": "<critical|major|moderate>", "confidence": "<high|medium|low>", "evidence": "<specific frame reference + what you see>", "fault": "<human readable name>"}
  ],
  "categories": [
    {"name": "Setup", "score": <0-100>, "status": "correct|improve", "analysis": "<string>", "tips": ["<tip>"], "keyFrame": <1-8>, "checkpointsMet": ["<checkpoint description>"], "checkpointsMissed": ["<checkpoint description>"]},
    {"name": "Backswing", "score": <0-100>, "status": "correct|improve", "analysis": "<string>", "tips": ["<tip>"], "keyFrame": <1-8>, "checkpointsMet": [], "checkpointsMissed": []},
    {"name": "Transition & Downswing", "score": <0-100>, "status": "correct|improve", "analysis": "<string>", "tips": ["<tip>"], "keyFrame": <1-8>, "checkpointsMet": [], "checkpointsMissed": []},
    {"name": "Impact", "score": <0-100>, "status": "correct|improve", "analysis": "<string>", "tips": ["<tip>"], "keyFrame": <1-8>, "checkpointsMet": [], "checkpointsMissed": []},
    {"name": "Follow-through & Finish", "score": <0-100>, "status": "correct|improve", "analysis": "<string>", "tips": ["<tip>"], "keyFrame": <1-8>, "checkpointsMet": [], "checkpointsMissed": []}
  ],
  "biomechanics": {
    "hipOpenAtImpact": <degrees>,
    "shoulderTurnAtTop": <degrees>,
    "xFactor": <degrees>,
    "tempoRatio": <estimated backswing-to-downswing time ratio, e.g. 2.8, number>,
    "shaftLeanAtImpact": <degrees>,
    "spineAngleChange": <degrees>
  }
}

## CRITICAL
- Status is "correct" if score >= 70, "improve" if < 70
- For biomechanics: estimate values as accurately as possible. If uncertain, omit that key. Use numbers only.
- EVERY checkpointsMet and checkpointsMissed MUST contain at least 1 entry describing what was observed.
- FAULT IDs must match: over_the_top, reverse_pivot, casting, chicken_wing, early_extension, sway, loss_of_posture, flat_backswing, slice, hook, fat_shots, thin_top, deceleration
- ${langInstruction}`;

  // Build image content
  const content = [];
  for (const frame of frames) {
    const mediaTypeMatch = frame.base64.match(/^data:(image\/\w+);base64,/);
    const mediaType = mediaTypeMatch ? mediaTypeMatch[1] : 'image/jpeg';
    const base64Data = frame.base64.replace(/^data:image\/\w+;base64,/, '');

    content.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: base64Data },
    });
  }

  content.push({
    type: 'text',
    text: `These ${frames.length} images are sequential frames from a golf swing (${cameraAngleDesc}). Order: ${frames.map((f, i) => `Frame ${i + 1} = ${f.phase}`).join(', ')}. Analyze positions and score.`,
  });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content }],
  });

  const text = response.content?.find(c => c.type === 'text')?.text;
  if (!text) throw new Error('No text response from Claude');

  const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(jsonStr);
}


// ─── SUMMARIZER (combines Gemini motion + Claude position) ──────

/**
 * Combine Gemini motion analysis + Claude position analysis into unified coaching
 * @param {Object} geminiResult - Motion analysis from Gemini
 * @param {Object} claudeResult - Position analysis from Claude
 * @param {string} language - 'en' | 'sv'
 */
export async function summarizeAnalysis(geminiResult, claudeResult, language = 'sv') {
  const client = getClient();
  const sv = language === 'sv';

  const prompt = `You are a HEAD GOLF COACH. Two specialist analysts have examined the same golf swing:

## ANALYST 1: MOTION SPECIALIST (analyzed video)
${JSON.stringify(geminiResult, null, 2)}

## ANALYST 2: POSITION SPECIALIST (analyzed 8 key frames)
${JSON.stringify(claudeResult, null, 2)}

## YOUR TASK
Combine both analyses into ONE unified coaching report. Your unique value is CAUSAL ANALYSIS — finding connections between motion faults and position faults.

For example:
- If motion shows "rushing the downswing" AND positions show "poor shaft lean" → these are CONNECTED (rushing prevents lag)
- If motion shows "good sequencing" BUT positions show "loss of posture" → the sequencing is compensating for posture issues

## RESPONSE FORMAT
Valid JSON only:

{
  "totalScore": <average of motion grade and position score, 0-100>,
  "estimatedHandicap": "<from position analysis>",
  "causalChain": {
    "rootCause": "<what the body did wrong mechanically, citing both motion and position data>",
    "biomechanicalEffect": "<how this root cause forced the club path or face to change incorrectly>",
    "ballFlight": "<the inevitable outcome on the ball flight>"
  },
  "recommendedDrill": ${JSON.stringify(claudeResult?.recommendedDrill || { id: 'pump_drill', reason: '' })},
  "faultsDetected": [
    {
      "id": "<fault id>",
      "fault": "<fault name>",
      "severity": "<high/medium/low>",
      "source": "<motion|position|both>",
      "evidence": "<combined evidence from both analyses>",
      "confidence": "<high/medium/low>"
    }
  ],
  "tempo": "<detailed tempo assessment from motion analysis>",
  "categories": ${JSON.stringify(claudeResult?.categories || [])},
  "biomechanics": ${JSON.stringify(claudeResult?.biomechanics || {})},
  "motionAnalysis": {
    "tempoRatio": ${geminiResult?.tempoRatio || 'null'},
    "tempoGrade": "${geminiResult?.tempoGrade || 'unknown'}",
    "sequencingOrder": ${JSON.stringify(geminiResult?.sequencingOrder || [])},
    "sequencingCorrect": ${geminiResult?.sequencingCorrect ?? false},
    "transitionQuality": "${geminiResult?.transitionQuality || 'unknown'}",
    "castingDetected": ${geminiResult?.castingDetected ?? false},
    "dynamicBalance": "${geminiResult?.dynamicBalance || 'unknown'}",
    "overallMotionGrade": ${geminiResult?.overallMotionGrade || 0}
  },
  "dualEngineInsights": [
    {
      "insight": "<causal connection between motion and position findings>",
      "source": "combined"
    }
  ],
  "coachingSummary": "<3-4 sentence coaching summary that weaves together BOTH motion and position findings>"
}

CRITICAL:
- ${sv ? 'Respond entirely in Swedish.' : 'Respond entirely in English.'}
- The dualEngineInsights are the MOST IMPORTANT part — this is what makes dual engine valuable
- Find at least 2-3 causal connections
- Use the categories and biomechanics from the position analysis as the base, but enrich with motion insights`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 5000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content?.find(c => c.type === 'text')?.text;
  if (!text) throw new Error('No summarizer response');

  const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(jsonStr);
}

// ─── CRITICAL: Do not export callClaudeAPI since it was removed ────

export async function evaluateChallenge(frames, systemPrompt) {
  const client = getClient();
  
  const formattedFrames = frames.map(f => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/jpeg',
      data: f.base64.replace(/^data:image\/\w+;base64,/, ''),
    }
  }));

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: `Analyze these ${frames.length} sequential frames from a golf swing and score the similarity.` },
          ...formattedFrames
        ]
      }
    ]
  });

  const textContent = response.content?.find((c) => c.type === 'text')?.text || '';
  const jsonMatch = textContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid response format from Claude Vision');

  return JSON.parse(jsonMatch[0]);
}
