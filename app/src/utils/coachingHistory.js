/**
 * COACHING HISTORY
 * ================
 * Extracts structured coaching data from past analyses to:
 * 1. Display on Coach Dashboard (progress, drills, focus areas)
 * 2. Inject into Claude's next analysis prompt
 */

import { getHistory, getSetting, setSetting } from './storage';
import { buildPlanPrompt } from './trainingPlan';
import { buildJournalPrompt } from './swingJournal';

/**
 * Get coaching history summary from IndexedDB analyses
 * @returns {Object} { sessions, scores, drills, faults, latestCoaching, trend }
 */
export async function getCoachingHistory() {
  const analyses = await getHistory(); // newest first

  const sessions = analyses
    .filter((a) => a.coaching)
    .map((a) => ({
      id: a.id,
      timestamp: a.timestamp,
      score: a.totalScore || a.coaching?.totalScore || 0,
      handicap: a.coaching?.estimatedHandicap || '—',
      priorityFocus: a.coaching?.priorityFocus || '',
      faults: (a.coaching?.faultsDetected || []).map((f) => ({
        id: f.id,
        confidence: f.confidence,
        evidence: f.evidence,
      })),
      drill: a.coaching?.recommendedDrill || null,
      categories: (a.coaching?.categories || []).map((c) => ({
        name: c.name,
        score: c.score,
        status: c.status,
        tips: c.tips || [],
      })),
    }));

  // Score trend (oldest → newest for charting)
  const scores = sessions.map((s) => ({
    score: s.score,
    timestamp: s.timestamp,
  })).reverse();

  // Collect all drills across sessions
  const drillLog = getDrillLog();

  // Latest coaching data
  const latest = sessions[0] || null;

  // Trend direction
  let trend = 'stable';
  if (scores.length >= 2) {
    const recent = scores.slice(-3).map((s) => s.score);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const earlier = scores.slice(0, -3).map((s) => s.score);
    const earlierAvg = earlier.length > 0
      ? earlier.reduce((a, b) => a + b, 0) / earlier.length
      : avg;
    if (avg > earlierAvg + 3) trend = 'improving';
    else if (avg < earlierAvg - 3) trend = 'declining';
  }

  return {
    sessions,
    scores,
    drillLog,
    latest,
    trend,
    totalSessions: sessions.length,
  };
}

/**
 * Build history context string for Claude's system prompt
 * Compact format to fit within token budget
 */
export function buildCoachingHistoryPrompt(history, language) {
  if (!history || history.totalSessions === 0) return '';
  const sv = language === 'sv';

  let ctx = '\n## COACHING HISTORY (reference for continuity)\n';

  // Score trend
  if (history.scores.length > 0) {
    const scoreList = history.scores.slice(-5).map((s) =>
      `${new Date(s.timestamp).toLocaleDateString()}: ${s.score}`
    ).join(' → ');
    ctx += `Score trend (last ${Math.min(5, history.scores.length)} sessions): ${scoreList}\n`;
    ctx += `Trend: ${history.trend}\n\n`;
  }

  // Latest session details
  if (history.latest) {
    ctx += `Latest session (${new Date(history.latest.timestamp).toLocaleDateString()}):\n`;
    ctx += `  Score: ${history.latest.score}\n`;
    ctx += `  Priority focus: ${history.latest.priorityFocus}\n`;
    if (history.latest.drill) {
      ctx += `  Recommended drill: ${history.latest.drill.id} — "${history.latest.drill.reason}"\n`;
    }
    ctx += `  Faults: ${history.latest.faults.map((f) => f.id).join(', ') || 'none identified'}\n`;
    ctx += `  Category scores: ${history.latest.categories.map((c) => `${c.name}: ${c.score}`).join(', ')}\n`;
    ctx += '\n';
  }

  // Active drills
  const activeDrills = history.drillLog.filter((d) => d.status === 'active');
  const completedDrills = history.drillLog.filter((d) => d.status === 'completed');

  if (activeDrills.length > 0) {
    ctx += `Active drills the user is working on:\n`;
    activeDrills.forEach((d) => {
      ctx += `  - ${d.drillId}: "${d.reason}" (assigned ${new Date(d.assignedAt).toLocaleDateString()})\n`;
    });
    ctx += '\n';
  }

  if (completedDrills.length > 0) {
    ctx += `Drills user has completed:\n`;
    completedDrills.forEach((d) => {
      ctx += `  - ${d.drillId} (completed ${new Date(d.completedAt).toLocaleDateString()})\n`;
    });
    ctx += '\n';
  }

  ctx += `IMPORTANT: Reference this history in your analysis. Note improvements, recurring faults, and whether current drills are working. If a drill has been active for 3+ sessions without improvement, suggest a different approach.\n`;

  // Training plan context
  try {
    const planCtx = buildPlanPrompt(language);
    if (planCtx) ctx += planCtx;
  } catch {
    // trainingPlan module may not be available in all contexts
  }

  // Swing journal — player's own notes and swing thoughts
  try {
    const journalCtx = buildJournalPrompt(language);
    if (journalCtx) ctx += journalCtx;
  } catch {
    // swingJournal module may not be available
  }

  return ctx;
}

// ============================================================
// DRILL LOG — persistent tracking of assigned drills
// ============================================================

/**
 * Get all tracked drills
 * @returns {Array} [{ drillId, reason, assignedAt, status, completedAt }]
 */
export function getDrillLog() {
  return getSetting('drill_log') || [];
}

/**
 * Add a drill to the log (called when a new analysis recommends a drill)
 */
export function addDrill(drillId, reason) {
  const log = getDrillLog();
  // Don't duplicate active drills
  if (log.some((d) => d.drillId === drillId && d.status === 'active')) return;
  log.push({
    drillId,
    reason,
    assignedAt: Date.now(),
    status: 'active', // active | completed
    completedAt: null,
  });
  setSetting('drill_log', log);
}

/**
 * Mark a drill as completed
 */
export function completeDrill(drillId) {
  const log = getDrillLog();
  const drill = log.find((d) => d.drillId === drillId && d.status === 'active');
  if (drill) {
    drill.status = 'completed';
    drill.completedAt = Date.now();
    setSetting('drill_log', log);
  }
}

/**
 * Reactivate a completed drill
 */
export function reactivateDrill(drillId) {
  const log = getDrillLog();
  const drill = log.find((d) => d.drillId === drillId && d.status === 'completed');
  if (drill) {
    drill.status = 'active';
    drill.completedAt = null;
    setSetting('drill_log', log);
  }
}

/**
 * Clear all coaching history (drill log)
 */
export function clearCoachingHistory() {
  setSetting('drill_log', []);
}
