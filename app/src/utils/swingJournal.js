/**
 * SWING JOURNAL
 * =============
 * Inspired by Ben Hogan's practice of keeping detailed swing notes.
 *
 * "Feel vs Real" — what a golfer FEELS during a swing is rarely
 * what's ACTUALLY happening. This journal bridges that gap by
 * letting the player document their feels, while the AI coach
 * documents the reality from video analysis.
 *
 * Structure:
 * 1. SWING THOUGHT — One active thought/mantra at all times
 *    (e.g. "Slow takeaway, feel the lag")
 * 2. JOURNAL ENTRIES — Timestamped notes, optionally linked to sessions
 *    (e.g. "Today the pump drill finally clicked — I felt the hips lead")
 *
 * Full transparency: both player notes and AI analysis are visible
 * and injected into coaching prompts.
 */

import { getSetting, setSetting } from './storage';

// ─── SWING THOUGHT (active mantra) ─────────────────────────────

/**
 * Get the current active swing thought
 * @returns {Object|null} { text, updatedAt }
 */
export function getSwingThought() {
  return getSetting('swing_thought') || null;
}

/**
 * Set a new active swing thought
 * @param {string} text - The swing thought text
 */
export function setSwingThought(text) {
  if (!text || !text.trim()) {
    setSetting('swing_thought', null);
    return null;
  }
  const thought = {
    text: text.trim(),
    updatedAt: Date.now(),
  };
  setSetting('swing_thought', thought);
  return thought;
}

/**
 * Clear the active swing thought
 */
export function clearSwingThought() {
  setSetting('swing_thought', null);
}

// ─── JOURNAL ENTRIES ────────────────────────────────────────────

/**
 * Get all journal entries (newest first)
 * @returns {Array} [{ id, text, timestamp, sessionId?, type, pinned }]
 */
export function getJournalEntries() {
  const entries = getSetting('swing_journal') || [];
  return entries.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Add a new journal entry
 * @param {string} text - Note text
 * @param {Object} options - { type: 'note'|'feel'|'insight', sessionId? }
 * @returns {Object} The created entry
 */
export function addJournalEntry(text, options = {}) {
  if (!text || !text.trim()) return null;

  const entries = getSetting('swing_journal') || [];
  const entry = {
    id: `j_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    text: text.trim(),
    timestamp: Date.now(),
    sessionId: options.sessionId || null,
    type: options.type || 'note', // note | feel | insight
    pinned: false,
  };

  entries.push(entry);

  // Keep max 50 entries
  if (entries.length > 50) {
    const unpinned = entries.filter(e => !e.pinned);
    const pinned = entries.filter(e => e.pinned);
    const trimmed = [...pinned, ...unpinned.slice(-Math.max(30, 50 - pinned.length))];
    setSetting('swing_journal', trimmed);
  } else {
    setSetting('swing_journal', entries);
  }

  return entry;
}

/**
 * Update an existing journal entry
 * @param {string} id - Entry ID
 * @param {string} newText - Updated text
 */
export function updateJournalEntry(id, newText) {
  const entries = getSetting('swing_journal') || [];
  const entry = entries.find(e => e.id === id);
  if (entry) {
    entry.text = newText.trim();
    entry.updatedAt = Date.now();
    setSetting('swing_journal', entries);
  }
  return entry;
}

/**
 * Delete a journal entry
 * @param {string} id - Entry ID
 */
export function deleteJournalEntry(id) {
  const entries = getSetting('swing_journal') || [];
  const filtered = entries.filter(e => e.id !== id);
  setSetting('swing_journal', filtered);
}

/**
 * Toggle pin on a journal entry
 */
export function togglePinEntry(id) {
  const entries = getSetting('swing_journal') || [];
  const entry = entries.find(e => e.id === id);
  if (entry) {
    entry.pinned = !entry.pinned;
    setSetting('swing_journal', entries);
  }
  return entry;
}

// ─── PROMPT INJECTION ──────────────────────────────────────────

/**
 * Build a prompt fragment with the player's notes for AI context.
 * This gives the coach full transparency into what the player
 * is thinking and feeling.
 *
 * @param {string} language - 'en' | 'sv'
 * @returns {string} Prompt fragment
 */
export function buildJournalPrompt(language = 'sv') {
  const thought = getSwingThought();
  const entries = getJournalEntries();

  if (!thought && entries.length === 0) return '';

  const sv = language === 'sv';
  let ctx = '\n## PLAYER\'S OWN NOTES (Swing Journal)\n';
  ctx += 'These are the player\'s personal observations. They represent FEEL, not necessarily REALITY.\n';
  ctx += 'Use them to understand what the player is working on and reference them in your coaching.\n\n';

  // Active swing thought
  if (thought) {
    ctx += `🎯 ACTIVE SWING THOUGHT: "${thought.text}"\n`;
    ctx += `   (Set ${new Date(thought.updatedAt).toLocaleDateString()})\n\n`;
  }

  // Recent journal entries (last 5)
  const recent = entries.slice(0, 5);
  if (recent.length > 0) {
    ctx += 'Recent journal entries:\n';
    recent.forEach(e => {
      const typeEmoji = e.type === 'feel' ? '💭' : e.type === 'insight' ? '💡' : '📝';
      const date = new Date(e.timestamp).toLocaleDateString();
      const pinned = e.pinned ? ' ⭐' : '';
      ctx += `  ${typeEmoji} [${date}]${pinned}: "${e.text}"\n`;
    });
    ctx += '\n';
  }

  // Pinned entries (always include)
  const pinned = entries.filter(e => e.pinned && !recent.includes(e));
  if (pinned.length > 0) {
    ctx += 'Pinned observations:\n';
    pinned.forEach(e => {
      ctx += `  ⭐ "${e.text}"\n`;
    });
    ctx += '\n';
  }

  ctx += 'IMPORTANT: If the player\'s FEEL contradicts your ANALYSIS, point this out gently. ';
  ctx += '"Feel vs Real" discrepancies are valuable coaching moments.\n';

  return ctx;
}
