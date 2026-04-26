import { REFERENCE_PLAYERS } from './referencePlayers.js';

export function buildChallengePrompt(challengeId, language) {
  const player = REFERENCE_PLAYERS[challengeId];
  if (!player) {
    throw new Error(`Invalid challenge ID: ${challengeId}`);
  }

  const lang = language === 'sv' ? 'sv' : 'en';
  const traits = player.traits[lang] || player.traits.en;

  return `You are judging a SWING SIMILARITY CHALLENGE. The golfer is trying to swing as similarly as possible to ${player.name}.

## ${player.name}'s Swing Characteristics
Style: ${player.style[lang] || player.style.en}

Key traits to evaluate against:
${traits.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Key metrics:
- Hip open at impact: ${player.keyMetrics.hipOpenAtImpact}
- Shoulder turn at top: ${player.keyMetrics.shoulderTurnAtTop}
- Tempo ratio: ${player.keyMetrics.tempoRatio}
- X-factor: ${player.keyMetrics.xFactor}

## YOUR TASK
Score how similar this golfer's swing is to ${player.name}'s swing on a scale of 0-100.

Evaluate each of these aspects:
1. **Tempo & Rhythm** (0-100): Does their tempo match ${player.name}'s characteristic rhythm?
2. **Positions** (0-100): Do key positions (setup, top, impact, finish) resemble ${player.name}?
3. **Signature Moves** (0-100): Are ${player.name}'s unique traits present?
4. **Overall Feel** (0-100): Does it "look like" a ${player.name} swing?

## RESPONSE FORMAT
${language === 'sv' ? 'Respond entirely in Swedish.' : 'Respond entirely in English.'}
Valid JSON only — no markdown, no code fences:

{
  "similarityScore": <0-100, weighted average of the 4 aspects>,
  "aspects": [
    { "name": "Tempo & Rhythm", "score": <0-100>, "feedback": "<specific feedback>" },
    { "name": "Positions", "score": <0-100>, "feedback": "<specific feedback>" },
    { "name": "Signature Moves", "score": <0-100>, "feedback": "<specific feedback>" },
    { "name": "Overall Feel", "score": <0-100>, "feedback": "<specific feedback>" }
  ],
  "summary": "<2-3 sentence overall assessment of similarity>",
  "bestMatch": "<which specific trait of ${player.name} the golfer matched best>",
  "biggestGap": "<which trait they were furthest from matching>"
}`;
}
