/**
 * TRAINING PLAN ENGINE
 * ====================
 * Generates and manages structured weekly training plans based on
 * analysis results, coaching profile, and progress history.
 *
 * Flow:
 * 1. After analysis → generatePlan() creates a 4-week plan
 * 2. Plan stored in localStorage via settings
 * 3. User progresses through weeks, marking drills as done
 * 4. Plan injected into future AI prompts for continuity
 * 5. Re-generated when a new analysis reveals different priorities
 */

import { getSetting, setSetting } from './storage';
import { DRILL_LIBRARY, FAULT_PROFILES } from './golfKnowledge';

// ─── PLAN STORAGE ──────────────────────────────────────────────

export function getActivePlan() {
  return getSetting('training_plan') || null;
}

export function savePlan(plan) {
  setSetting('training_plan', plan);
}

export function clearPlan() {
  setSetting('training_plan', null);
}

// ─── WEEK PROGRESSION ──────────────────────────────────────────

export function advanceWeek(planOverride = null) {
  const plan = planOverride || getActivePlan();
  if (!plan) return null;
  if (plan.currentWeek < plan.weeks.length - 1) {
    plan.currentWeek += 1;
    savePlan(plan);
  }
  return plan;
}

export function goToWeek(weekIndex) {
  const plan = getActivePlan();
  if (!plan || weekIndex < 0 || weekIndex >= plan.weeks.length) return null;
  plan.currentWeek = weekIndex;
  savePlan(plan);
  return plan;
}

export function toggleDrillDone(weekIndex, drillIndex) {
  const plan = getActivePlan();
  if (!plan) return null;
  const week = plan.weeks[weekIndex];
  if (!week || !week.drills[drillIndex]) return null;
  week.drills[drillIndex].done = !week.drills[drillIndex].done;
  plan.lastUpdated = Date.now();
  savePlan(plan);
  return plan;
}

// ─── PLAN GENERATION ───────────────────────────────────────────

/**
 * Generate a structured 4-week training plan from analysis results
 * @param {Object} coaching - The coaching analysis result
 * @param {Object} profile - User coaching profile
 * @param {string} language - 'en' | 'sv'
 * @returns {Object} The training plan
 */
export function generatePlan(coaching, profile = {}, language = 'sv') {
  const sv = language === 'sv';
  const faults = coaching?.faultsDetected || [];
  const categories = coaching?.categories || [];
  const score = coaching?.totalScore || 0;

  // Sort faults by severity
  const severityOrder = { high: 0, critical: 0, medium: 1, major: 1, low: 2, moderate: 2 };
  const sortedFaults = [...faults].sort(
    (a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2)
  );

  // Find weakest categories
  const weakCategories = [...categories]
    .filter(c => c.score < 80)
    .sort((a, b) => a.score - b.score);

  // Determine primary and secondary focus
  const primaryFault = sortedFaults[0] || null;
  const secondaryFault = sortedFaults[1] || null;

  // Find relevant drills from the library
  const findDrillsForFault = (faultId) => {
    return Object.entries(DRILL_LIBRARY)
      .filter(([, drill]) => drill.targetFaults.includes(faultId))
      .map(([id, drill]) => ({ id, ...drill }));
  };

  const primaryDrills = primaryFault ? findDrillsForFault(primaryFault.id) : [];
  const secondaryDrills = secondaryFault ? findDrillsForFault(secondaryFault.id) : [];

  // Fallback drills if no faults detected
  const generalDrills = [
    { id: 'mirror_drill', ...DRILL_LIBRARY.mirror_drill },
    { id: 'tempo_drill', ...DRILL_LIBRARY.tempo_drill },
    { id: 'pre_round_warmup', ...DRILL_LIBRARY.pre_round_warmup },
  ];

  // Build 4-week plan
  const weeks = [
    // Week 1: Awareness — isolate the primary fault
    {
      weekNumber: 1,
      theme: sv ? 'Medvetenhet — Förstå felet' : 'Awareness — Understand the fault',
      focus: primaryFault
        ? (sv ? `Fokus: ${primaryFault.fault}` : `Focus: ${primaryFault.fault}`)
        : (sv ? 'Grunderna' : 'Fundamentals'),
      description: sv
        ? 'Denna vecka handlar om att förstå och känna ditt primära felområde. Gör övningarna långsamt och medvetet.'
        : 'This week is about understanding and feeling your primary fault. Do drills slowly and deliberately.',
      drills: buildWeekDrills(primaryDrills.slice(0, 2), generalDrills, sv, 'slow'),
      milestone: buildMilestone(primaryFault, weakCategories[0], sv, 'feel'),
    },
    // Week 2: Repetition — build the new pattern
    {
      weekNumber: 2,
      theme: sv ? 'Repetition — Bygg nytt mönster' : 'Repetition — Build new pattern',
      focus: primaryFault
        ? (sv ? `Fortsatt: ${primaryFault.fault}` : `Continued: ${primaryFault.fault}`)
        : (sv ? 'Tempo & kontakt' : 'Tempo & contact'),
      description: sv
        ? 'Öka hastigheten. Upprepa övningarna tills de känns naturliga. Börja slå bollar med nytt fokus.'
        : 'Increase speed. Repeat drills until they feel natural. Start hitting balls with new focus.',
      drills: buildWeekDrills(
        [...primaryDrills.slice(0, 1), ...primaryDrills.slice(2, 3)],
        [{ id: 'half_swing_punch', ...DRILL_LIBRARY.half_swing_punch }],
        sv,
        'medium'
      ),
      milestone: buildMilestone(primaryFault, weakCategories[0], sv, 'repeat'),
    },
    // Week 3: Integration — combine with secondary focus
    {
      weekNumber: 3,
      theme: sv ? 'Integration — Kombinera' : 'Integration — Combine',
      focus: secondaryFault
        ? (sv ? `Ny: ${secondaryFault.fault} + föregående` : `New: ${secondaryFault.fault} + previous`)
        : (sv ? 'Fullständig sving' : 'Full swing'),
      description: sv
        ? 'Dags att integrera den nya mekaniken med full fart. Lägg till sekundärt fokusområde.'
        : 'Time to integrate the new mechanics at full speed. Add secondary focus area.',
      drills: buildWeekDrills(
        [...primaryDrills.slice(0, 1), ...secondaryDrills.slice(0, 2)],
        generalDrills.slice(0, 1),
        sv,
        'full'
      ),
      milestone: buildMilestone(secondaryFault || primaryFault, weakCategories[1] || weakCategories[0], sv, 'integrate'),
    },
    // Week 4: Testing — film new baseline
    {
      weekNumber: 4,
      theme: sv ? 'Testning — Ny baseline' : 'Testing — New baseline',
      focus: sv ? 'Filma och jämför' : 'Film and compare',
      description: sv
        ? 'Filma en ny sving och jämför med din baseline. Se förbättringen! Om score ökat 5+ poäng: byt fokus. Annars: förläng planen.'
        : 'Film a new swing and compare with your baseline. See the improvement! If score increased 5+ points: change focus. Otherwise: extend the plan.',
      drills: [
        {
          id: 'new_baseline',
          name: sv ? '📹 Filma ny baseline-sving' : '📹 Film new baseline swing',
          instruction: sv
            ? 'Filma din sving från samma vinkel som förra gången. Analysera och jämför scorer.'
            : 'Film your swing from the same angle as last time. Analyze and compare scores.',
          done: false,
          intensity: 'test',
        },
        ...(primaryDrills[0] ? [{
          id: primaryDrills[0].id,
          name: primaryDrills[0].name[language] || primaryDrills[0].name.en,
          instruction: primaryDrills[0].instructions[language] || primaryDrills[0].instructions.en,
          done: false,
          intensity: 'full',
        }] : []),
        {
          id: 'pre_round_warmup',
          name: DRILL_LIBRARY.pre_round_warmup.name[language],
          instruction: DRILL_LIBRARY.pre_round_warmup.instructions[language],
          done: false,
          intensity: 'warmup',
        },
      ],
      milestone: {
        text: sv
          ? `Mål: Förbättra totalpoängen från ${score} → ${Math.min(100, score + 5)}+`
          : `Goal: Improve total score from ${score} → ${Math.min(100, score + 5)}+`,
        target: Math.min(100, score + 5),
        type: 'score',
      },
    },
  ];

  const plan = {
    id: `plan_${Date.now()}`,
    createdAt: Date.now(),
    lastUpdated: Date.now(),
    currentWeek: 0,
    baselineScore: score,
    primaryFocus: primaryFault?.fault || (sv ? 'Allmän förbättring' : 'General improvement'),
    secondaryFocus: secondaryFault?.fault || null,
    approach: profile.approach || 'minimal_fix',
    weeks,
  };

  savePlan(plan);
  return plan;
}

// ─── HELPERS ───────────────────────────────────────────────────

function buildWeekDrills(faultDrills, fallbackDrills, sv, intensity) {
  const drills = [];
  const seen = new Set();

  // Add fault-specific drills first
  for (const drill of faultDrills) {
    if (!drill || seen.has(drill.id)) continue;
    seen.add(drill.id);
    const lang = sv ? 'sv' : 'en';
    drills.push({
      id: drill.id,
      name: drill.name?.[lang] || drill.name?.en || drill.id,
      instruction: drill.instructions?.[lang] || drill.instructions?.en || '',
      reps: drill.reps || '',
      done: false,
      intensity,
    });
  }

  // Fill up to 3 drills with fallback
  for (const drill of fallbackDrills) {
    if (drills.length >= 3 || seen.has(drill.id)) continue;
    seen.add(drill.id);
    const lang = sv ? 'sv' : 'en';
    drills.push({
      id: drill.id,
      name: drill.name?.[lang] || drill.name?.en || drill.id,
      instruction: drill.instructions?.[lang] || drill.instructions?.en || '',
      reps: drill.reps || '',
      done: false,
      intensity,
    });
  }

  return drills;
}

function buildMilestone(fault, weakCategory, sv, phase) {
  if (!fault && !weakCategory) {
    return {
      text: sv ? 'Känn dig bekväm med grunderna' : 'Feel comfortable with fundamentals',
      type: 'general',
    };
  }

  const templates = {
    feel: sv
      ? `Mål: Kunna identifiera och KÄNNA ${fault?.fault || 'felet'} under svingen`
      : `Goal: Be able to identify and FEEL ${fault?.fault || 'the fault'} during the swing`,
    repeat: sv
      ? `Mål: Göra 10 korrekta slag i rad utan ${fault?.fault || 'felet'}`
      : `Goal: Hit 10 correct shots in a row without ${fault?.fault || 'the fault'}`,
    integrate: sv
      ? `Mål: Full sving utan ${fault?.fault || 'felet'} i 70%+ av slagen`
      : `Goal: Full swing without ${fault?.fault || 'the fault'} in 70%+ of shots`,
  };

  return {
    text: templates[phase] || templates.feel,
    type: 'drill',
    targetCategory: weakCategory?.name || null,
  };
}

// ─── PROMPT INJECTION ──────────────────────────────────────────

/**
 * Build a prompt fragment describing the active training plan
 * for injection into AI analysis prompts
 */
export function buildPlanPrompt(language = 'sv') {
  const plan = getActivePlan();
  if (!plan) return '';

  const sv = language === 'sv';
  const currentWeek = plan.weeks[plan.currentWeek];
  if (!currentWeek) return '';

  const completedDrills = currentWeek.drills.filter(d => d.done).length;
  const totalDrills = currentWeek.drills.length;

  let ctx = `\n## ACTIVE TRAINING PLAN\n`;
  ctx += `Plan created: ${new Date(plan.createdAt).toLocaleDateString()}\n`;
  ctx += `Primary focus: ${plan.primaryFocus}\n`;
  ctx += plan.secondaryFocus ? `Secondary focus: ${plan.secondaryFocus}\n` : '';
  ctx += `Baseline score: ${plan.baselineScore}\n`;
  ctx += `Currently on: Week ${plan.currentWeek + 1}/4 — "${currentWeek.theme}"\n`;
  ctx += `Drills completed this week: ${completedDrills}/${totalDrills}\n`;
  ctx += `Milestone: ${currentWeek.milestone?.text || 'none'}\n\n`;

  ctx += `IMPORTANT: Reference this training plan in your coaching. `;
  ctx += sv
    ? 'Berätta för användaren var de befinner sig i sin plan och om de är på rätt spår.\n'
    : 'Tell the user where they are in their plan and if they are on track.\n';

  return ctx;
}
