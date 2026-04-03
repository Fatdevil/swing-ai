import { getSetting } from './storage';
import { buildKnowledgeBasePrompt, DRILL_LIBRARY, HANDICAP_MAP } from './golfKnowledge';
import { REFERENCE_PLAYERS, COACHING_APPROACHES, COACH_PERSONALITIES } from './referencePlayers';
import { getCoachingHistory, buildCoachingHistoryPrompt, addDrill } from './coachingHistory';

/**
 * Build coaching profile context for the system prompt
 * Loaded from localStorage — set in CoachModePage
 */
function buildCoachingProfileContext(language) {
  const profileStr = getSetting('coaching_profile');
  if (!profileStr) return '';

  try {
    const profile = JSON.parse(profileStr);
    if (!profile.completed) return '';

    let context = '\n## USER COACHING PROFILE (ADAPT ALL TIPS TO THIS)\n';

    if (profile.approach && COACHING_APPROACHES[profile.approach]) {
      const approach = COACHING_APPROACHES[profile.approach];
      context += `Coaching approach: ${approach.name[language] || approach.name.en}\n`;
      context += `Instructions: ${approach.promptInstructions}\n\n`;
    }

    if (profile.referencePlayer && REFERENCE_PLAYERS[profile.referencePlayer]) {
      const player = REFERENCE_PLAYERS[profile.referencePlayer];
      context += `Reference player: ${player.name} (${player.style[language] || player.style.en})\n`;
      context += `When analyzing, compare the user's swing against these specific traits of ${player.name}:\n`;
      const traits = player.traits[language] || player.traits.en;
      traits.forEach((t) => { context += `  - ${t}\n`; });
      context += `Key metrics to target: ${JSON.stringify(player.keyMetrics)}\n\n`;
    }

    if (profile.specificGoal) {
      context += `User's stated goal: "${profile.specificGoal}"\n`;
      context += `IMPORTANT: Every tip, drill, and priority should serve this goal. Filter out advice that doesn't contribute to it.\n`;
    }

    // Include key conversation insights if available
    if (profile.conversationHistory?.length > 0) {
      const coachMessages = profile.conversationHistory
        .filter((m) => m.role === 'coach')
        .map((m) => m.text)
        .join(' ');
      if (coachMessages.length > 0) {
        context += `\nCoaching conversation context (insights gathered during onboarding):\n${coachMessages.slice(0, 500)}\n`;
      }
    }

    // Coach personality
    if (profile.personality && COACH_PERSONALITIES[profile.personality]) {
      const personality = COACH_PERSONALITIES[profile.personality];
      context += `\n## COACH PERSONALITY (ADAPT YOUR TONE TO THIS)\n${personality.promptInstructions}\n`;
    }

    return context;
  } catch {
    return '';
  }
}

/**
 * Get AI coaching from Claude Sonnet via Anthropic API
 * Uses the Golf Biomechanics Knowledge Base + Coaching Profile as the analytical framework.
 *
 * @param {Array<{phase: string, base64: string, measurements: Object|null}>} frames - 8 key frames
 * @param {string} cameraAngle - 'side' | 'front' | 'dtl'
 * @returns {Object} Structured coaching response
 */
export async function getCoaching(frames, cameraAngle, sequencing, options = {}) {
  const { guestMode = false } = options;
  const apiKey = getSetting('anthropic_key');
  if (!apiKey) {
    throw new Error('Anthropic API key not set. Go to Profile → Settings to add your key.');
  }

  const language = localStorage.getItem('swing_ai_lang') || 'sv';
  const langInstruction = language === 'sv'
    ? 'Respond entirely in Swedish.'
    : 'Respond entirely in English.';

  const cameraAngleDesc = {
    side: 'side view (face-on)',
    front: 'front-facing view',
    dtl: 'down-the-line view (behind the golfer)',
  }[cameraAngle] || 'side view';

  // Camera-angle-specific analysis guidance
  const angleCapabilities = {
    side: `## CAMERA ANGLE GUIDE — SIDE VIEW\nReliably assess: spine tilt, head sway, knee flex, arm extension, shaft lean at impact, weight transfer, tempo, follow-through balance.\nCANNOT reliably assess: hip open degrees (rotation hidden), shoulder turn degrees (foreshortened), club face angle (invisible), swing path (invisible), X-Factor (unreliable).\nBiomechanics confidence: shaftLeanAtImpact=HIGH, spineAngleChange=HIGH, hipOpenAtImpact=LOW(±15°), shoulderTurnAtTop=LOW(±15°), xFactor=LOW.`,
    front: `## CAMERA ANGLE GUIDE — FRONT VIEW\nReliably assess: shoulder rotation (excellent), hip rotation (good), X-Factor (good), weight distribution, arm position at top.\nCANNOT reliably assess: shaft lean (club appears head-on), takeaway path (club moves away), extension through ball.\nBiomechanics confidence: hipOpenAtImpact=HIGH(±5°), shoulderTurnAtTop=HIGH(±5°), xFactor=HIGH(±5°), shaftLeanAtImpact=LOW.`,
    dtl: `## CAMERA ANGLE GUIDE — DOWN THE LINE\nReliably assess: swing plane (excellent), club face angle, inside/outside path, spine angle maintenance, early extension (BEST angle), takeaway path, shaft plane.\nCANNOT reliably assess: shoulder turn degrees (hidden), hip rotation degrees (hidden), lateral sway (hidden), weight transfer, head movement lateral, X-Factor.\nBiomechanics confidence: spineAngleChange=HIGH(±2°), shaftLeanAtImpact=MEDIUM, hipOpenAtImpact=LOW, shoulderTurnAtTop=LOW, xFactor=LOW.`,
  }[cameraAngle] || '';

  // Build measurement summary across frames
  const framesMeta = frames.map((f, i) => {
    let measureText = 'No pose data available';
    if (f.measurements) {
      measureText = Object.entries(f.measurements)
        .map(([key, m]) => `${key}: ${m.value.toFixed(1)}° (${m.status}, confidence: ${(m.confidence * 100).toFixed(0)}%)`)
        .join(', ');
    }
    const phaseConf = f.phaseConfidence ? ` [phase confidence: ${(f.phaseConfidence * 100).toFixed(0)}%]` : '';
    return `Frame ${i + 1} (${f.phase}${phaseConf}): ${measureText}`;
  }).join('\n');

  // Get the full knowledge base as text
  const knowledgeBase = buildKnowledgeBasePrompt(language);

  // Get coaching profile context (if user has set up Coach Mode) — skip in guest mode
  const coachingProfile = guestMode ? '' : buildCoachingProfileContext(language);

  // Get coaching history context (past sessions, drills, trends) — skip in guest mode
  let coachingHistoryCtx = '';
  if (!guestMode) {
    try {
      const history = await getCoachingHistory();
      coachingHistoryCtx = buildCoachingHistoryPrompt(history, language);
    } catch { /* ignore if history fails */ }
  }

  // Available drill IDs for the response schema
  const drillIds = Object.keys(DRILL_LIBRARY);

  const systemPrompt = `You are a PGA-certified golf coach and biomechanics expert. You analyze golf swings STRICTLY according to the biomechanics reference framework provided below. You do NOT guess scores or make up advice — you score against the rubric, identify faults from the fault library, and recommend drills from the drill catalog.

${knowledgeBase}
${coachingProfile}
${coachingHistoryCtx}

${angleCapabilities}

## ANALYSIS TASK
You are analyzing a golf swing from a ${cameraAngleDesc} captured on video. You will receive ${frames.length} sequential frames.

CRITICAL: Follow the CAMERA ANGLE GUIDE above. Only give confident biomechanics estimates for metrics marked HIGH confidence for this angle. For LOW confidence metrics, use conservative middle-range estimates and note the uncertainty.

## MediaPipe Measurements (supplementary — verify with your visual analysis):
${framesMeta}

Note: 2D estimates. Low-confidence values should be verified visually.

${sequencing ? buildSequencingCtx(sequencing) : ''}

## ANALYSIS RULES (MANDATORY)
1. Score each category using the STRICT CHECKPOINT RUBRIC below
2. Calculate totalScore using WEIGHTED AVERAGE (Setup 15%, Backswing 20%, Transition 25%, Impact 25%, Follow-through 15%)
3. When identifying faults, use ONLY fault names from the FAULT PROFILES section
4. When recommending drills, use ONLY drills from the DRILL LIBRARY — reference them by ID
5. Map totalScore to handicap using the HANDICAP MAP
6. Reference specific frame numbers in evidence
7. For each category, list which checkpoints are MET and which are MISSED

## STRICT SCORING RUBRIC — CHECKPOINT-BASED (5 checkpoints per category, 20 points each)

### Setup (5 checkpoints × 20 = 100):
1. Grip: neutral, V's pointing to trail shoulder
2. Stance: shoulder width, ball position correct for club
3. Posture: spine tilt 35-45°, arms hanging naturally
4. Alignment: feet/hips/shoulders parallel to target line
5. Weight: 50-50 distribution, balanced over balls of feet

### Backswing (5 checkpoints × 20 = 100):
1. Takeaway: one-piece, club on plane, no early wrist set
2. Halfway back: shaft parallel to target line, toe pointing up
3. Top: lead arm extended, wrist hinged 90°, club parallel to target
4. Shoulder turn: 80-100° turn with stable lower body
5. Spine angle: maintained from address (< 5° change)

### Transition & Downswing (5 checkpoints × 20 = 100):
1. Sequence: lower body initiates before upper body
2. Lag: wrist angle maintained or increased entering downswing
3. Club path: approaches from inside (not over-the-top)
4. Hip rotation: hips 30-50° open at impact approach
5. Shaft: drops into slot, on or below backswing plane

### Impact (5 checkpoints × 20 = 100):
1. Hands ahead: shaft leaning forward (6-18° forward lean)
2. Hips open: 30-50° open at impact
3. Weight forward: 70-80% on lead foot
4. Head behind ball: stable head position, slight trail tilt
5. Lead arm: extended (not chicken wing), connection maintained

### Follow-through & Finish (5 checkpoints × 20 = 100):
1. Extension: both arms extended post-impact
2. Rotation: chest facing target at finish
3. Balance: held finish position for 2+ seconds
4. Weight: 90%+ on lead foot, trail toe only touching
5. Club: finishes behind head/neck, not wrapped around body

→ SCORING: checkpoints_met × 20 (minimum 10)

## SCORE ANCHORING RULES — CRITICAL
DO NOT cluster scores between 65-75. Use the FULL range:
- 90-100: Tour-level execution. 5/5 checkpoints met.
- 80-89: Strong amateur. 4/5 checkpoints met.
- 70-79: Mid-handicapper. 3/5 checkpoints met.
- 60-69: High handicapper. 2-3/5 met, 1 major fault.
- 50-59: Beginner+. 1-2/5 met, multiple faults.
- 30-49: Beginner. Fundamental issues.
- 10-29: First-time golfer.

ANCHORING: 2+ major faults → totalScore MUST be < 70.
Only 1 minor fault → 75-85. No visible faults → 85+.

## FAULT SEVERITY
- "critical" fault: −8 to −15 from affected category
- "major" fault: −5 to −10 from affected category
- "moderate" fault: −3 to −5 from affected category

## RESPONSE FORMAT
Valid JSON only — no markdown, no code fences:

{
  "totalScore": <number 0-100, CALCULATED from weighted category scores>,
  "estimatedHandicap": "<from HANDICAP_MAP based on totalScore>",
  "priorityFocus": "<the single most impactful fault to fix — cite fault profile name>",
  "recommendedDrill": {
    "id": "<drill ID from DRILL_LIBRARY, e.g. 'pump_drill'>",
    "reason": "<why this drill targets the priority fault>"
  },
  "faultsDetected": [
    {
      "id": "<fault profile ID>",
      "severity": "<critical|major|moderate>",
      "confidence": "<high/medium/low>",
      "evidence": "<specific frame ref + what you see>",
      "fault": "<human readable name>"
    }
  ],
  "tempo": "<assessment: ratio, transition smoothness, sequencing>",
  "categories": [
    {"name": "Setup", "score": <0-100>, "status": "correct|improve", "analysis": "<ref checkpoints>", "tips": ["<tip>"], "keyFrame": <1-8>, "checkpointsMet": ["<description>"], "checkpointsMissed": ["<description>"]},
    {"name": "Backswing", "score": <0-100>, "status": "correct|improve", "analysis": "<string>", "tips": ["<tip>"], "keyFrame": <1-8>, "checkpointsMet": ["<description>"], "checkpointsMissed": ["<description>"]},
    {"name": "Transition & Downswing", "score": <0-100>, "status": "correct|improve", "analysis": "<string>", "tips": ["<tip>"], "keyFrame": <1-8>, "checkpointsMet": ["<description>"], "checkpointsMissed": ["<description>"]},
    {"name": "Impact", "score": <0-100>, "status": "correct|improve", "analysis": "<string>", "tips": ["<tip>"], "keyFrame": <1-8>, "checkpointsMet": ["<description>"], "checkpointsMissed": ["<description>"]},
    {"name": "Follow-through & Finish", "score": <0-100>, "status": "correct|improve", "analysis": "<string>", "tips": ["<tip>"], "keyFrame": <1-8>, "checkpointsMet": ["<description>"], "checkpointsMissed": ["<description>"]}
  ],
  "biomechanics": {
    "hipOpenAtImpact": <estimated degrees hip is open at impact, number>,
    "shoulderTurnAtTop": <estimated shoulder rotation at top of backswing in degrees, number>,
    "xFactor": <estimated hip-shoulder separation angle in degrees, number>,
    "tempoRatio": <estimated backswing-to-downswing time ratio, e.g. 2.8, number>,
    "shaftLeanAtImpact": <estimated forward shaft lean at impact in degrees, number>,
    "spineAngleChange": <estimated change in spine angle from address to impact in degrees, number>
  }
}

## CRITICAL
- Status is "correct" if score >= 70, "improve" if < 70
- For biomechanics: estimate as accurately as possible. Omit if uncertain. Numbers only.
- EVERY checkpointsMet and checkpointsMissed MUST have at least 1 entry.
- FAULT IDs must match: over_the_top, reverse_pivot, casting, chicken_wing, early_extension, sway, loss_of_posture, flat_backswing, slice, hook, fat_shots, thin_top, deceleration
- ${langInstruction}
- Available drill IDs: ${drillIds.join(', ')}`;

  // Build message content with all frames as images
  const content = [];
  for (const frame of frames) {
    const mediaTypeMatch = frame.base64.match(/^data:(image\/\w+);base64,/);
    const mediaType = mediaTypeMatch ? mediaTypeMatch[1] : 'image/jpeg';
    const base64Data = frame.base64.replace(/^data:image\/\w+;base64,/, '');

    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: base64Data,
      },
    });
  }

  content.push({
    type: 'text',
    text: `These ${frames.length} images are sequential frames from a golf swing video (${cameraAngleDesc}). Chronological order: ${frames.map((f, i) => `Frame ${i + 1} = ${f.phase}`).join(', ')}. Analyze using the biomechanics framework and score against the rubric.`,
  });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content,
        },
      ],
      system: systemPrompt,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Claude API error:', response.status, errorBody);
    throw new Error(`API error ${response.status}: ${errorBody.slice(0, 200)}`);
  }

  const result = await response.json();
  const textContent = result.content?.find((c) => c.type === 'text')?.text;

  if (!textContent) {
    throw new Error('No text response from Claude');
  }

  // Parse JSON from response
  const jsonStr = textContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    const parsed = JSON.parse(jsonStr);

    // Enrich drill recommendation with full drill data
    if (parsed.recommendedDrill?.id && DRILL_LIBRARY[parsed.recommendedDrill.id]) {
      const drill = DRILL_LIBRARY[parsed.recommendedDrill.id];
      parsed.recommendedDrill.name = drill.name[language] || drill.name.en;
      parsed.recommendedDrill.instructions = drill.instructions[language] || drill.instructions.en;
      parsed.recommendedDrill.reps = drill.reps;
      parsed.recommendedDrill.equipment = drill.equipment;
    }

    // Verify handicap mapping consistency
    const matchingHandicap = HANDICAP_MAP.find(
      (h) => parsed.totalScore >= h.minScore && parsed.totalScore <= h.maxScore
    );
    if (matchingHandicap) {
      parsed.estimatedHandicap = matchingHandicap.handicap;
    }

    return parsed;
  } catch (parseErr) {
    console.error('Failed to parse Claude response:', textContent);
    throw new Error('Could not parse AI response. Please try again.');
  }
}

/**
 * Build compact TPI sequencing context for Claude's system prompt
 */
function buildSequencingCtx(sequencing) {
  if (!sequencing) return '';
  let ctx = '## TPI KINEMATIC SEQUENCING (from MediaPipe frame analysis)\n';
  ctx += `Sequence grade: ${sequencing.grade}/100\n`;
  ctx += `Peak velocity order: ${sequencing.actualOrder.join(' → ')}\n`;
  ctx += `Ideal order: hips → torso → arms → hands\n`;
  ctx += `Correct: ${sequencing.isCorrect ? 'YES' : 'NO'}\n`;
  if (sequencing.errors.length > 0) {
    ctx += 'Errors: ' + sequencing.errors.map(e => e.en).join('; ') + '\n';
  }
  ctx += '\nINSTRUCTION: Reference this TPI sequencing data. If the order is wrong, explain the power leak and suggest corrective drills.\n';
  return ctx;
}
