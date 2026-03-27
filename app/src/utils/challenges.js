/**
 * SOLO CHALLENGES
 * ================
 * Predefined swing-similarity challenges.
 * "Can you swing like Tiger Woods? Score 80+!"
 *
 * Best scores stored in localStorage.
 */

import { getSetting, setSetting } from './storage';
import { REFERENCE_PLAYERS } from './referencePlayers';

// ============================================================
// CHALLENGE DEFINITIONS
// ============================================================

export const CHALLENGES = [
  {
    id: 'tiger_precision',
    playerId: 'tiger_woods',
    title: { en: 'Tiger\'s Precision', sv: 'Tigers Precision' },
    description: {
      en: 'Can you match Tiger Woods\' legendary control and compact power?',
      sv: 'Kan du matcha Tiger Woods legendariska kontroll och kompakta kraft?',
    },
    difficulty: 'hard',
    badgeThresholds: [
      { min: 90, badge: 'gold', label: { en: 'Gold — Tour Level', sv: 'Guld — Tour-niv\u00e5' } },
      { min: 75, badge: 'silver', label: { en: 'Silver — Low Handicap', sv: 'Silver — L\u00e5gt Hcp' } },
      { min: 60, badge: 'bronze', label: { en: 'Bronze — Solid Effort', sv: 'Brons — Stark insats' } },
    ],
  },
  {
    id: 'rory_power',
    playerId: 'rory_mcilroy',
    title: { en: 'Rory\'s Rotational Power', sv: 'Rorys Rotationskraft' },
    description: {
      en: 'Match Rory McIlroy\'s explosive hip clearance and wide arc.',
      sv: 'Matcha Rory McIlroys explosiva h\u00f6ftrensning och breda b\u00e5ge.',
    },
    difficulty: 'hard',
    badgeThresholds: [
      { min: 90, badge: 'gold', label: { en: 'Gold — Tour Level', sv: 'Guld — Tour-niv\u00e5' } },
      { min: 75, badge: 'silver', label: { en: 'Silver — Athletic Swing', sv: 'Silver — Atletisk sving' } },
      { min: 60, badge: 'bronze', label: { en: 'Bronze — Good Effort', sv: 'Brons — Bra insats' } },
    ],
  },
  {
    id: 'hogan_ballstriker',
    playerId: 'ben_hogan',
    title: { en: 'Hogan\'s Ball Striking', sv: 'Hogans Bollkontakt' },
    description: {
      en: 'Emulate the most mechanically precise swing in golf history.',
      sv: 'Efterlikna den mest mekaniskt precisa svingen i golfhistorien.',
    },
    difficulty: 'expert',
    badgeThresholds: [
      { min: 90, badge: 'gold', label: { en: 'Gold — Legendary', sv: 'Guld — Legend' } },
      { min: 75, badge: 'silver', label: { en: 'Silver — Purist', sv: 'Silver — Purist' } },
      { min: 60, badge: 'bronze', label: { en: 'Bronze — Student', sv: 'Brons — Elev' } },
    ],
  },
  {
    id: 'dj_power',
    playerId: 'dustin_johnson',
    title: { en: 'DJ\'s Bowed Wrist', sv: 'DJs B\u00f6jda Handled' },
    description: {
      en: 'Can you replicate Dustin Johnson\'s signature bowed wrist and explosive speed?',
      sv: 'Kan du replikera Dustin Johnsons signaturb\u00f6jda handled och explosiva hastighet?',
    },
    difficulty: 'hard',
    badgeThresholds: [
      { min: 90, badge: 'gold', label: { en: 'Gold — Bomber', sv: 'Guld — Bomber' } },
      { min: 75, badge: 'silver', label: { en: 'Silver — Power Player', sv: 'Silver — Kraftspelare' } },
      { min: 60, badge: 'bronze', label: { en: 'Bronze — Distance Seeker', sv: 'Brons — Distanss\u00f6kare' } },
    ],
  },
  {
    id: 'nelly_smooth',
    playerId: 'nelly_korda',
    title: { en: 'Nelly\'s Effortless Tempo', sv: 'Nellys Anstr\u00e4ngningsl\u00f6sa Tempo' },
    description: {
      en: 'Match Nelly Korda\'s silky-smooth tempo and perfect balance.',
      sv: 'Matcha Nelly Kordas silkeslena tempo och perfekta balans.',
    },
    difficulty: 'medium',
    badgeThresholds: [
      { min: 90, badge: 'gold', label: { en: 'Gold — Effortless', sv: 'Guld — Anstr\u00e4ngningsl\u00f6s' } },
      { min: 75, badge: 'silver', label: { en: 'Silver — Smooth', sv: 'Silver — Smidig' } },
      { min: 60, badge: 'bronze', label: { en: 'Bronze — Balanced', sv: 'Brons — Balanserad' } },
    ],
  },
];

// ============================================================
// DIFFICULTY CONFIG
// ============================================================

export const DIFFICULTY = {
  medium: { color: '#4ADE80', label: { en: 'Medium', sv: 'Medel' } },
  hard: { color: '#FACC15', label: { en: 'Hard', sv: 'Sv\u00e5r' } },
  expert: { color: '#F87171', label: { en: 'Expert', sv: 'Expert' } },
};

// ============================================================
// BADGE PERSISTENCE
// ============================================================

const STORAGE_KEY = 'challenge_results';

/**
 * Get all challenge results
 * @returns {Object} { challengeId: { bestScore, badge, attempts, lastAttempt } }
 */
export function getChallengeResults() {
  return getSetting(STORAGE_KEY) || {};
}

/**
 * Save a challenge attempt
 */
export function saveChallengeResult(challengeId, score) {
  const results = getChallengeResults();
  const challenge = CHALLENGES.find((c) => c.id === challengeId);
  if (!challenge) return;

  // Determine badge
  let badge = null;
  for (const threshold of challenge.badgeThresholds) {
    if (score >= threshold.min) {
      badge = threshold.badge;
      break;
    }
  }

  const existing = results[challengeId] || { bestScore: 0, badge: null, attempts: 0 };
  results[challengeId] = {
    bestScore: Math.max(score, existing.bestScore),
    badge: getBetterBadge(badge, existing.badge),
    attempts: existing.attempts + 1,
    lastAttempt: Date.now(),
    lastScore: score,
  };

  setSetting(STORAGE_KEY, results);
  return results[challengeId];
}

function getBetterBadge(a, b) {
  const order = { gold: 3, silver: 2, bronze: 1 };
  return (order[a] || 0) >= (order[b] || 0) ? a : b;
}

/**
 * Get enriched challenge list with results
 */
export function getChallengesWithResults() {
  const results = getChallengeResults();
  return CHALLENGES.map((c) => ({
    ...c,
    player: REFERENCE_PLAYERS[c.playerId],
    result: results[c.id] || null,
  }));
}

/**
 * Build the Claude system prompt for a challenge similarity score
 */
export function buildChallengePrompt(playerId, language) {
  const player = REFERENCE_PLAYERS[playerId];
  if (!player) return '';

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
