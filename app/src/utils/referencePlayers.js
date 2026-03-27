/**
 * REFERENCE PLAYER PROFILES
 * =========================
 * Biomechanical signatures of elite players that users can aim to emulate.
 * When a user says "I want to swing like Rory," Claude compares their swing
 * against these specific traits and flags deviations.
 */

export const REFERENCE_PLAYERS = {
  rory_mcilroy: {
    name: 'Rory McIlroy',
    style: { en: 'Athletic, rotational power', sv: 'Atletisk, rotationskraft' },
    traits: {
      en: [
        'Extremely wide arc — full extension in backswing and through-swing',
        'Aggressive hip clearance: hips are 50-55° open at impact (more than average tour player)',
        'Fast tempo with smooth acceleration — 3:1 backswing-to-downswing ratio',
        'Deep squat move in transition — uses ground forces exceptionally',
        'High hands at top — full wrist set, club slightly past parallel',
        'Late release pattern — extreme lag maintained until very late',
        'Balanced, full finish with belt buckle facing well left of target',
        'Head stays very still through impact despite aggressive rotation',
      ],
      sv: [
        'Extremt bred båge — full extension i baksving och genomsving',
        'Aggressiv höftrensning: höfterna är 50-55° öppna vid träff (mer än genomsnittlig tour-spelare)',
        'Snabbt tempo med jämn acceleration — 3:1 baksving-till-nedsving ratio',
        'Djup knäböjningrörelse i övergången — använder markkrafter exceptionellt',
        'Höga händer vid toppen — full handledsvinkell, klubba något förbi parallellt',
        'Sen release — extremt lag bibehållet till väldigt sent',
        'Balanserat, fullt avslut med bältespännet vänt väl vänster om målet',
        'Huvudet förblir väldigt stilla genom träffen trots aggressiv rotation',
      ],
    },
    keyMetrics: {
      hipOpenAtImpact: '50-55°',
      shoulderTurnAtTop: '95-100°',
      tempoRatio: '3:1',
      xFactor: '50-55°',
    },
  },

  tiger_woods: {
    name: 'Tiger Woods',
    style: { en: 'Controlled power, precision', sv: 'Kontrollerad kraft, precision' },
    traits: {
      en: [
        'Very controlled, compact backswing — club rarely goes past parallel',
        'Exceptional spine angle maintenance throughout the swing',
        'Stinger capability — low, penetrating ball flight under pressure',
        'Very stable lower body — minimal lateral sway throughout',
        'Hands slightly ahead of club at impact — textbook shaft lean',
        'Strong left side through impact — lead arm stays connected',
        'Moderate tempo — not as fast as McIlroy but incredibly consistent',
        'Trademark fist pump finish on crucial shots',
      ],
      sv: [
        'Väldigt kontrollerad, kompakt baksving — klubban går sällan förbi parallellt',
        'Exceptionellt bibehållen ryggvinkel genom hela svingen',
        'Stinger-förmåga — låg, penetrerande bollbana under press',
        'Väldigt stabil underkropp — minimal lateral svajning',
        'Händerna något framför klubban vid träff — läroboksmässig skaftlutning',
        'Stark vänstersida genom träff — ledande armen förblir ansluten',
        'Måttligt tempo — inte lika snabbt som McIlroy men otroligt konsekvent',
        'Karaktäristiskt knytnävsavslut på avgörande slag',
      ],
    },
    keyMetrics: {
      hipOpenAtImpact: '40-45°',
      shoulderTurnAtTop: '90-95°',
      tempoRatio: '3:1',
      xFactor: '45-50°',
    },
  },

  ben_hogan: {
    name: 'Ben Hogan',
    style: { en: 'Mechanical precision, ball striking', sv: 'Mekanisk precision, bollkontakt' },
    traits: {
      en: [
        'Legendary flat swing plane — more around the body',
        'Supinated lead wrist at impact — eliminates the hook',
        'Deliberate, slow backswing with explosive downswing transition',
        'Cup at the top (lead wrist cupped), then supination through impact',
        'Extremely pure ball striking — divots consistently after the ball',
        'Right elbow tucked close to body in downswing',
        'Lateral shift before rotation in transition',
        'Very quiet lower body — no excessive movement',
      ],
      sv: [
        'Legendariskt platt svingplan — mer runt kroppen',
        'Supinerad ledande handled vid träff — eliminerar hooken',
        'Medveten, långsam baksving med explosiv nedsving-övergång',
        'Kupning vid toppen (ledande handleden kuppad), sedan supination genom träff',
        'Extremt ren bollkontakt — fjun konsekvent efter bollen',
        'Höger armbåge tätt intill kroppen i nedsvingen',
        'Lateral förskjutning innan rotation i övergången',
        'Väldigt lugn underkropp — inga överdrivna rörelser',
      ],
    },
    keyMetrics: {
      hipOpenAtImpact: '35-40°',
      shoulderTurnAtTop: '85-90°',
      tempoRatio: '3.5:1',
      xFactor: '40-45°',
    },
  },

  dustin_johnson: {
    name: 'Dustin Johnson',
    style: { en: 'Power with bowed wrist', sv: 'Kraft med böjd handled' },
    traits: {
      en: [
        'Signature bowed left wrist at the top — extremely shut club face',
        'Very athletic, uses height and leverage for distance',
        'Squat move in transition — deep knee flex before exploding up',
        'Relatively short backswing for his strength — efficiency',
        'High draw as stock shot — from the bowed wrist',
        'Wide stance, strong base',
        'Very fast hip speed — one of the fastest on tour',
        'Stays in flex through impact — no early extension',
      ],
      sv: [
        'Signaturböjd vänster handled vid toppen — extremt stängd klubbyta',
        'Väldigt atletisk, använder längd och hävstång för distans',
        'Knäböjningsrörelse i övergången — djup knäflex innan explosion uppåt',
        'Relativt kort baksving för sin styrka — effektivitet',
        'Hög draw som standardslag — från den böjda handleden',
        'Brett stativ, stark bas',
        'Väldigt snabb höfthastighet — en av de snabbaste på touren',
        'Stannar i flex genom träff — ingen tidig extension',
      ],
    },
    keyMetrics: {
      hipOpenAtImpact: '45-50°',
      shoulderTurnAtTop: '85-90°',
      tempoRatio: '2.5:1',
      xFactor: '45-50°',
    },
  },

  nelly_korda: {
    name: 'Nelly Korda',
    style: { en: 'Effortless power, smooth tempo', sv: 'Ansträngningslös kraft, jämnt tempo' },
    traits: {
      en: [
        'Incredibly smooth tempo — appears effortless despite high club speed',
        'Very neutral grip and setup — textbook fundamentals',
        'Full shoulder turn with minimal lateral movement',
        'Excellent balance throughout — can hold finish for 5+ seconds',
        'Lead arm stays connected to body through impact',
        'Slight draw bias — comes from inside with controlled release',
        'No wasted motion — everything is efficient and purposeful',
        'Great role model for golfers seeking consistency over raw power',
      ],
      sv: [
        'Otroligt jämnt tempo — ser ansträngningslöst ut trots hög klubbhastighet',
        'Väldigt neutralt grepp och setup — läroboksmässiga grunder',
        'Full axelrotation med minimal lateral rörelse',
        'Utmärkt balans genomgående — kan hålla avslut i 5+ sekunder',
        'Ledande armen förblir ansluten till kroppen genom träff',
        'Lätt draw-tendens — kommer inifrån med kontrollerad release',
        'Inga onödiga rörelser — allt är effektivt och avsiktligt',
        'Bra förebild för golfare som söker konsistens framför rå kraft',
      ],
    },
    keyMetrics: {
      hipOpenAtImpact: '38-42°',
      shoulderTurnAtTop: '90-95°',
      tempoRatio: '3:1',
      xFactor: '45-50°',
    },
  },
};

/**
 * COACHING APPROACH PRESETS
 * Predefined coaching philosophies a user can choose from
 */
export const COACHING_APPROACHES = {
  minimal_fix: {
    name: { en: 'Minimal Changes', sv: 'Minimala ändringar' },
    icon: '🎯',
    description: {
      en: 'Keep what works. Fix only what\'s broken. Smallest change, biggest impact.',
      sv: 'Behåll det som fungerar. Fixa bara det som är trasigt. Minsta ändring, störst effekt.',
    },
    promptInstructions: 'The user wants MINIMAL changes. Identify the ONE most impactful fix and focus ONLY on that. Do NOT suggest wholesale changes. Preserve their existing technique as much as possible. Prioritize feel and simplicity over biomechanical perfection.',
  },
  rebuild: {
    name: { en: 'Full Rebuild', sv: 'Total ombyggnad' },
    icon: '🔨',
    description: {
      en: 'Build from the ground up. Willing to go through a learning curve for long-term improvement.',
      sv: 'Bygg från grunden. Villig att gå igenom en inlärningskurva för långsiktig förbättring.',
    },
    promptInstructions: 'The user wants a FULL REBUILD. Be thorough and systematic. Address ALL fundamental issues, starting from setup and working through each phase. Prioritize building a solid foundation even if it means short-term regression. Provide a phased plan.',
  },
  consistency: {
    name: { en: 'More Consistent', sv: 'Mer konsistens' },
    icon: '📊',
    description: {
      en: 'I want to hit it the same way every time. Reduce variability.',
      sv: 'Jag vill slå likadant varje gång. Minska variationen.',
    },
    promptInstructions: 'The user prioritizes CONSISTENCY over distance or power. Focus on repeatable positions, simple movements, and reducing moving parts. Identify any positions that introduce variability (e.g., long backswing, complex wrist action) and suggest simpler alternatives.',
  },
  distance: {
    name: { en: 'More Distance', sv: 'Mer distans' },
    icon: '💪',
    description: {
      en: 'I want to hit it farther. Speed and power are my priorities.',
      sv: 'Jag vill slå längre. Hastighet och kraft är mina prioriteringar.',
    },
    promptInstructions: 'The user wants MORE DISTANCE. Focus on: X-factor stretch, ground force utilization, lag preservation, full extension, and efficient energy transfer. Identify any "speed leaks" in their swing (early release, poor sequencing, restricted turn) and address those specifically.',
  },
  shot_fix: {
    name: { en: 'Fix a Specific Miss', sv: 'Fixa ett specifikt miss' },
    icon: '🩹',
    description: {
      en: 'I have a specific problem (slice, hook, thin shots, etc.) that I want to eliminate.',
      sv: 'Jag har ett specifikt problem (slice, hook, tunna slag, etc.) som jag vill eliminera.',
    },
    promptInstructions: 'The user wants to fix a SPECIFIC MISS PATTERN. Ask about the miss pattern in the onboarding conversation. Then analyze their swing specifically through the lens of what causes that miss. Every tip should circle back to eliminating that specific problem.',
  },
};

// ============================================================
// COACH PERSONALITIES
// ============================================================

export const COACH_PERSONALITIES = {
  technical_pro: {
    name: { en: 'Technical Pro', sv: 'Teknisk Pro' },
    icon: '🎓',
    description: {
      en: 'Professional, methodical, precise. Like having a PGA tour coach.',
      sv: 'Professionell, metodisk, precis. Som en PGA tour-coach.',
    },
    promptInstructions: `You are a professional, methodical PGA-certified coach. Your tone is:
- Clear, precise, and encouraging
- Use proper biomechanics terminology
- Be supportive but direct about faults
- Structure feedback logically
- Celebrate progress genuinely`,
  },
  roast_coach: {
    name: { en: 'Roast Coach', sv: 'Roast Coach' },
    icon: '🔥',
    description: {
      en: 'Savage humor, brutal honesty. Accurate analysis delivered with zero mercy.',
      sv: 'Brutal humor, ärlig till smärtgränsen. Korrekt analys levererad utan nåd.',
    },
    promptInstructions: `You are a TRASH-TALKING golf coach. Your analysis is ACCURATE and EXPERT-LEVEL, but you deliver it with SAVAGE humor. Rules:
- Roast their faults mercilessly with creative insults and comparisons
- Use exaggeration for comedic effect ("My grandmother has better hip rotation — and she's been dead for 10 years")
- Be genuinely funny, not just mean
- Still give actionable advice, just wrapped in humor
- ALWAYS end with ONE genuinely encouraging thing to keep them motivated
- The worse the fault, the harder the roast
- Reference specific numbers and data in your roasts ("38° hip rotation? That's not a golf swing, that's a gentle sway at a concert")`,
  },
  pure_data: {
    name: { en: 'Pure Data', sv: 'Ren Data' },
    icon: '📊',
    description: {
      en: 'Numbers only. No emotions, no fluff. Raw metrics and delta analysis.',
      sv: 'Bara siffror. Inga känslor, inget fluff. Ren metrik och delta-analys.',
    },
    promptInstructions: `You are a DATA-ONLY golf analyst. Your tone is:
- Exclusively analytical — no emotions, no encouragement, no motivational language
- Lead with numbers, percentages, and deltas (Δ)
- Format: "Hip rotation: 38° (Tour avg: 42°, Δ-9.5%, below threshold)"
- Use bullet points and structured data, never paragraphs
- Compare every metric to tour averages with percentage deltas
- Rank faults by impact magnitude
- Recommend drills with expected improvement percentages
- Think of yourself as a Bloomberg terminal for golf swings`,
  },
};
