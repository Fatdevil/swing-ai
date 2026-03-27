/**
 * GOLF BIOMECHANICS KNOWLEDGE BASE
 * ================================
 * This module provides the analytical framework that Claude operates within.
 * Instead of Claude "guessing" scores and advice, it uses this structured
 * knowledge base as its reference — like a PGA instructor's handbook.
 *
 * Structure:
 * 1. SWING_PHASES — ideal positions & measurements per phase
 * 2. FAULT_PROFILES — common errors with cause-effect chains
 * 3. SCORING_RUBRIC — standardized criteria for each score range
 * 4. DRILL_LIBRARY — curated drills linked to specific faults
 * 5. HANDICAP_MAP — score-to-handicap correlation
 */

// ============================================================
// 1. SWING PHASES — Ideal biomechanical positions
// ============================================================

export const SWING_PHASES = {
  setup: {
    name: { en: 'Setup / Address', sv: 'Setup / Adress' },
    keyFrame: 1,
    description: {
      en: 'The foundation of every swing. Errors here cascade through every phase.',
      sv: 'Grunden för varje sving. Fel här fortplantar sig genom varje fas.',
    },
    idealPositions: {
      spineTilt: { min: 25, max: 35, unit: '°', note: 'Forward tilt from hips, NOT waist' },
      kneeFlex: { min: 145, max: 160, unit: '°', note: 'Slight athletic flex, not deep squat' },
      weightDistribution: '50/50 between feet, slightly toward balls of feet',
      armHang: 'Arms hang naturally from shoulders, slight space between hands and thighs',
      headPosition: 'Behind or directly over the ball, chin up to allow shoulder turn',
      alignment: 'Feet, hips, shoulders parallel to target line',
      gripPressure: 'Medium (4-5 on 10 scale), secure but not tense',
    },
    checkpoints: [
      'Spine angle tilted from hips, not rounded from shoulders',
      'Weight balanced, knees over balls of feet',
      'Arms relaxed, hanging naturally',
      'Chin up, not buried in chest',
      'Ball position appropriate for club selection',
    ],
  },

  takeaway: {
    name: { en: 'Takeaway', sv: 'Upptagning' },
    keyFrame: 2,
    description: {
      en: 'The first 18 inches. Must be initiated by shoulder rotation, not hands.',
      sv: 'De första 45 centimetrarna. Ska initieras av axelrotation, inte händer.',
    },
    idealPositions: {
      shoulderRotation: { min: 20, max: 35, unit: '°', note: 'Shoulders begin turning as one unit' },
      clubPath: 'Club stays low and inside, parallel to target line when shaft is parallel to ground',
      wristAction: 'Minimal wrist hinge at this stage — "one-piece takeaway"',
      headMovement: 'Nearly zero lateral movement',
      hipMovement: 'Minimal — hips resist as shoulders turn (building tension)',
    },
    checkpoints: [
      'One-piece takeaway: shoulders, arms, and club move as a connected unit',
      'No early wrist hinge or "picking up" the club',
      'Club head stays outside the hands when shaft is parallel to ground',
      'Head remains stable, eyes on ball',
    ],
  },

  backswing: {
    name: { en: 'Backswing', sv: 'Baksving' },
    keyFrame: 3,
    description: {
      en: 'Loading the spring. The goal is full shoulder turn with restricted hip turn to create torque.',
      sv: 'Ladda fjädern. Målet är full axelrotation med begränsad höftrotation för att skapa vridmoment.',
    },
    idealPositions: {
      shoulderRotation: { min: 75, max: 100, unit: '°', note: 'Full 90° turn is ideal for most golfers' },
      hipRotation: { min: 35, max: 50, unit: '°', note: 'Restricted to create X-factor tension' },
      xFactor: { min: 35, max: 55, unit: '°', note: 'Difference between shoulder and hip rotation' },
      weightShift: '60-70% on trail foot (right foot for right-hander)',
      spineAngle: 'Maintained from address — no standing up or dipping',
      leftArm: 'Straight or near-straight (slight bend acceptable)',
    },
    checkpoints: [
      'Full shoulder turn (back facing target)',
      'Limited hip turn creates tension (the "X-factor")',
      'Weight loaded onto trail leg without swaying past outside of trail foot',
      'Left arm reasonably straight (not rigid)',
      'Spine angle maintained from address',
    ],
  },

  top: {
    name: { en: 'Top of Backswing', sv: 'Toppen av baksving' },
    keyFrame: 4,
    description: {
      en: 'The moment of truth — maximum energy storage before the transition.',
      sv: 'Sanningens ögonblick — maximal energilagring innan övergången.',
    },
    idealPositions: {
      shoulderRotation: { min: 85, max: 100, unit: '°' },
      wristHinge: { min: 80, max: 100, unit: '°', note: '90° wrist cock is ideal' },
      clubPosition: 'Shaft points at or slightly left of target (from behind view)',
      leftWrist: 'Flat or slightly bowed — NOT cupped',
      leadKnee: 'Points at or behind ball, flexed, not straightened',
      headPosition: 'Stayed centered, may drift 1-2 inches toward trail side',
    },
    checkpoints: [
      'Club parallel or short of parallel (not crossing the line)',
      'Wrist fully hinged (~90°)',
      'Weight fully loaded on trail side',
      'Left wrist flat (not cupped/bent backward)',
      'Head has not lifted or dropped',
    ],
  },

  downswing: {
    name: { en: 'Transition & Downswing', sv: 'Övergång & Nedsving' },
    keyFrame: 5,
    description: {
      en: 'The kinematic sequence: ground → hips → torso → arms → club. This is where most amateurs fail.',
      sv: 'Den kinematiska kedjan: mark → höfter → bål → armar → klubba. Här misslyckas de flesta amatörer.',
    },
    idealPositions: {
      hipRotation: 'Hips begin rotating toward target BEFORE arms start down',
      hipClearance: { min: 35, max: 50, unit: '°', note: 'Hips open at impact' },
      lagAngle: 'Wrist angle maintained — hands lead the club head',
      weightShift: '70-80% shifting to lead foot',
      spineAngle: 'MAINTAINED — no early extension (hips thrusting toward ball)',
      slotting: 'Club drops into the "slot" — inside-out path',
    },
    checkpoints: [
      'Hips initiate the downswing, NOT the arms (ground-up sequence)',
      'Wrist lag maintained until hands are at hip height',
      'Club drops from inside — not over the top',
      'Weight transfers to lead foot',
      'Spine angle preserved — no early extension',
    ],
  },

  impact: {
    name: { en: 'Impact', sv: 'Träff' },
    keyFrame: 6,
    description: {
      en: 'The only moment that matters to the ball. Everything else is preparation for this.',
      sv: 'Det enda ögonblicket som spelar roll för bollen. Allt annat är förberedelse.',
    },
    idealPositions: {
      hipRotation: { min: 35, max: 50, unit: '°', note: 'Hips open 40-45° to target' },
      shoulderRotation: { min: 0, max: 15, unit: '°', note: 'Shoulders slightly open or square' },
      handPosition: 'Hands ahead of ball (shaft leaning forward)',
      headPosition: 'Behind the ball, eyes on impact point',
      leadArm: 'Straight, extended through the ball',
      weightDistribution: '75-85% on lead foot',
      hipSlide: 'Minimal — rotation dominant, not lateral slide',
    },
    checkpoints: [
      'Hands ahead of club head at impact (forward shaft lean)',
      'Hips rotated open (belt buckle pointing left of target for right-hander)',
      'Head behind the ball',
      'Weight on lead foot',
      'Lead arm extended, not collapsed',
    ],
  },

  followThrough: {
    name: { en: 'Follow-through', sv: 'Genomsving' },
    keyFrame: 7,
    description: {
      en: 'Full release of energy. A restricted follow-through indicates deceleration or steering.',
      sv: 'Full energifrisläppning. En begränsad genomsving indikerar retardation eller styrning.',
    },
    idealPositions: {
      armExtension: 'Both arms fully extended toward target (the "V")',
      chestRotation: 'Chest facing target or slightly past',
      clubRelease: 'Full release — club head has rotated past hands',
      weightTransfer: '90%+ on lead foot',
    },
    checkpoints: [
      'Full arm extension through the ball',
      'No "chicken wing" (lead elbow collapsing)',
      'Club releases naturally — not held off',
      'Body continuing to rotate toward target',
    ],
  },

  finish: {
    name: { en: 'Finish', sv: 'Avslut' },
    keyFrame: 8,
    description: {
      en: 'The finish reveals everything. A balanced finish = a controlled swing.',
      sv: 'Avslutet avslöjar allt. Balanserat avslut = kontrollerad sving.',
    },
    idealPositions: {
      balance: 'Standing tall on lead foot, completely balanced',
      beltBuckle: 'Facing target or slightly left',
      trailFoot: 'Up on toe, only toe touching ground',
      clubPosition: 'Over lead shoulder, relaxed',
      weight: '95%+ on lead foot',
      holdFinish: 'Should be able to hold finish position for 3+ seconds',
    },
    checkpoints: [
      'Fully balanced — can hold finish for 3 seconds',
      'Belt buckle facing target',
      'Trail foot up on toe',
      'Club resting naturally over lead shoulder',
      'No stumbling, rebalancing, or foot movement',
    ],
  },
};


// ============================================================
// 2. FAULT PROFILES — Common errors with cause-effect chains
// ============================================================

export const FAULT_PROFILES = [
  {
    id: 'over_the_top',
    name: { en: 'Over the Top', sv: 'Over the top (OTT)' },
    severity: 'critical',
    phases: ['downswing', 'impact'],
    description: {
      en: 'The club moves outside-in during the downswing, causing slices and pulls.',
      sv: 'Klubban rör sig utifrån-in under nedsvingen, orsakar slice och drag.',
    },
    causes: [
      'Upper body initiates downswing instead of hips',
      'Insufficient hip rotation/clearance',
      'Grip too tight, preventing natural slot',
      'Backswing too steep/upright',
    ],
    effects: ['Slice (open face + OTT path)', 'Pull (closed face + OTT path)', 'Loss of distance', 'Weak ball flight'],
    visualCues: [
      'Club shaft visible above hands in downswing (from face-on view)',
      'Right shoulder moves toward ball instead of rotating',
      'Divots point left of target',
    ],
    relatedDrills: ['pump_drill', 'headcover_drill', 'towel_under_arm'],
  },
  {
    id: 'early_extension',
    name: { en: 'Early Extension', sv: 'Tidig extension' },
    severity: 'critical',
    phases: ['downswing', 'impact'],
    description: {
      en: 'Hips thrust toward the ball during the downswing, losing spine angle.',
      sv: 'Höfterna skjuts mot bollen under nedsvingen, ryggradens vinkel förloras.',
    },
    causes: [
      'Insufficient core strength/awareness',
      'Trying to "hit" with the body instead of rotating',
      'Poor setup (standing too close or too far from ball)',
      'Lack of hip mobility',
    ],
    effects: ['Inconsistent contact (thin/fat shots)', 'Loss of power', 'Compensatory hand flipping at impact'],
    visualCues: [
      'Hips closer to ball at impact than at address',
      'Standing up through impact',
      'Belt line moves toward ball (visible from side view)',
    ],
    relatedDrills: ['wall_drill', 'chair_drill', 'butt_against_wall'],
  },
  {
    id: 'casting',
    name: { en: 'Casting / Early Release', sv: 'Kastning / Tidig release' },
    severity: 'major',
    phases: ['downswing'],
    description: {
      en: 'Releasing wrist angle too early in the downswing, losing lag and power.',
      sv: 'Frisläppning av handledsvinkeln för tidigt i nedsvingen, förlorar lag och kraft.',
    },
    causes: [
      'Trying to "hit at" the ball instead of swinging through',
      'Tension in hands/forearms',
      'Poor sequencing (arms before hips)',
      'Fear of not getting the club face back to square',
    ],
    effects: ['Significant distance loss', 'Higher ball flight than optimal', 'Weak impact position', 'Inconsistent contact'],
    visualCues: [
      'Hands and club head arrive at ball simultaneously (no forward shaft lean)',
      'Wrist angle has fully released before hands reach hip height',
    ],
    relatedDrills: ['lag_drill', 'pump_drill', 'half_swing_punch'],
  },
  {
    id: 'reverse_pivot',
    name: { en: 'Reverse Pivot', sv: 'Omvänd pivot' },
    severity: 'major',
    phases: ['backswing', 'top'],
    description: {
      en: 'Weight stays on or moves to the lead foot during backswing, then falls back on downswing.',
      sv: 'Vikten stannar på eller rör sig mot det ledande benet under baksvingen, faller sedan tillbaka.',
    },
    causes: [
      'Fear of losing balance',
      'Trying to keep head perfectly still',
      'Limited hip mobility',
      'Upper body lean toward target in backswing',
    ],
    effects: ['Loss of power (no weight transfer)', 'Steep downswing', 'Fat shots behind ball', 'Inconsistent ball striking'],
    visualCues: [
      'Lead shoulder dips down in backswing',
      'Head moves toward target in backswing',
      'Spine tilts toward target at top',
    ],
    relatedDrills: ['step_drill', 'pressure_shift_drill', 'back_foot_lift'],
  },
  {
    id: 'sway',
    name: { en: 'Sway', sv: 'Svajning' },
    severity: 'major',
    phases: ['backswing'],
    description: {
      en: 'Lateral hip movement away from target instead of rotation around the spine.',
      sv: 'Lateral höftrörelse bort från målet istället för rotation runt ryggraden.',
    },
    causes: [
      'Confusing weight shift with lateral movement',
      'Poor hip/core stability',
      'Flat backswing plane',
    ],
    effects: ['Inconsistent low point', 'Difficulty returning to ball', 'Fat/thin shots', 'Loss of power'],
    visualCues: [
      'Trail hip moves past outside of trail foot',
      'Entire body slides laterally (head moves significantly)',
    ],
    relatedDrills: ['wall_drill', 'resistance_band_hips', 'alignment_stick_hip'],
  },
  {
    id: 'chicken_wing',
    name: { en: 'Chicken Wing', sv: 'Kycklingvinge' },
    severity: 'moderate',
    phases: ['followThrough'],
    description: {
      en: 'Lead elbow collapses and bends outward after impact instead of extending.',
      sv: 'Ledarmbågen kollapsar och böjs utåt efter träffen istället för att sträckas ut.',
    },
    causes: [
      'Fear of hooking (holding off release)',
      'Body stops rotating, arms have to compensate',
      'Weak lead arm/shoulder',
      'Club face open, compensating to prevent slice',
    ],
    effects: ['Loss of distance', 'Weak fade/slice tendency', 'Poor compression'],
    visualCues: [
      'Lead elbow points away from body post-impact',
      'Lead arm bent/folded instead of extended through ball',
    ],
    relatedDrills: ['towel_under_arm', 'glove_under_arm', 'full_extension_drill'],
  },
  {
    id: 'loss_of_posture',
    name: { en: 'Loss of Posture', sv: 'Tappad hållning' },
    severity: 'major',
    phases: ['backswing', 'downswing'],
    description: {
      en: 'Spine angle changes during the swing — standing up or dipping.',
      sv: 'Ryggradens vinkel ändras under svingen — reser sig eller sjunker.',
    },
    causes: [
      'Lack of core stability',
      'Overactive lower body',
      'Trying to "lift" the ball',
      'Poor initial setup posture',
    ],
    effects: ['Inconsistent contact', 'Thin and fat shots', 'Loss of power and accuracy'],
    visualCues: [
      'Head height changes significantly during swing',
      'Standing taller at impact than address',
      'Rounding of shoulders in backswing',
    ],
    relatedDrills: ['mirror_drill', 'head_height_drill', 'chair_drill'],
  },
  {
    id: 'flat_backswing',
    name: { en: 'Too Flat / Too Upright', sv: 'För platt / för upprätt' },
    severity: 'moderate',
    phases: ['backswing'],
    description: {
      en: 'Swing plane is either too flat (around body) or too upright (lifting arms).',
      sv: 'Svingplanet är antingen för platt (runt kroppen) eller för upprätt (lyfter armarna).',
    },
    causes: [
      'Misunderstanding of swing plane',
      'Physical limitations (flexibility)',
      'Compensating for other faults',
    ],
    effects: ['Hooks (flat) or slices (upright)', 'Inconsistent path', 'Difficulty with ball-first contact'],
    visualCues: [
      'Flat: hands well below shoulder at top, club wraps around',
      'Upright: hands well above head, arms disconnected from body',
    ],
    relatedDrills: ['alignment_stick_plane', 'one_arm_drill', 'mirror_drill'],
  },
];


// ============================================================
// 3. SCORING RUBRIC — What each score range means
// ============================================================

export const SCORING_RUBRIC = {
  perCategory: {
    '90-100': {
      label: { en: 'Excellent', sv: 'Utmärkt' },
      criteria: 'All key checkpoints met. Position matches tour-level biomechanics. No visible compensations.',
    },
    '80-89': {
      label: { en: 'Good', sv: 'Bra' },
      criteria: 'Most checkpoints met. Minor deviations from ideal that don\'t significantly affect ball flight.',
    },
    '70-79': {
      label: { en: 'Adequate', sv: 'Godtagbar' },
      criteria: 'Fundamentally sound with 1-2 noticeable deviations. Room for improvement but workable.',
    },
    '60-69': {
      label: { en: 'Needs Work', sv: 'Behöver arbete' },
      criteria: 'Multiple deviations from ideal. 1 major fault present that affects consistency.',
    },
    '50-59': {
      label: { en: 'Significant Issues', sv: 'Betydande problem' },
      criteria: 'Fundamental issues in this phase. 2+ faults present, likely causing miss patterns.',
    },
    '0-49': {
      label: { en: 'Critical', sv: 'Kritiskt' },
      criteria: 'Major rebuild needed in this phase. Fundamental misunderstanding of the movement.',
    },
  },
  totalScore: {
    method: 'Weighted average of category scores',
    weights: {
      setup: 0.15,
      backswing: 0.20,
      transition: 0.25, // Most important — where most amateurs fail
      impact: 0.25,    // The only position that touches the ball
      followThrough: 0.15,
    },
    note: 'Transition & Impact are weighted highest because they have the most direct effect on ball flight.',
  },
};


// ============================================================
// 4. DRILL LIBRARY — Curated drills linked to faults
// ============================================================

export const DRILL_LIBRARY = {
  pump_drill: {
    name: { en: 'Pump Drill', sv: 'Pump-övning' },
    targetFaults: ['over_the_top', 'casting'],
    difficulty: 'beginner',
    equipment: 'Club only',
    instructions: {
      en: 'Take the club to the top of your backswing. Start the downswing by rotating your hips, then STOP when your hands reach hip height. Return to the top. Repeat 3 times, then complete the swing on the 4th rep. Focus: feel the hips initiate, not the arms.',
      sv: 'Ta klubban till toppen av baksvingen. Starta nedsvingen genom att rotera höfterna, STOPPA sedan när händerna når höfthöjd. Återgå till toppen. Upprepa 3 gånger, slutför svingen på 4:e repetitionen. Fokus: känn att höfterna initierar, inte armarna.',
    },
    reps: '3 pumps + 1 full swing × 10 sets',
  },
  headcover_drill: {
    name: { en: 'Headcover Under Trail Arm', sv: 'Headcover under bakre arm' },
    targetFaults: ['over_the_top', 'chicken_wing'],
    difficulty: 'beginner',
    equipment: 'Headcover or towel + club',
    instructions: {
      en: 'Place a headcover under your trail armpit. Make practice swings without dropping it. This keeps the trail elbow connected and prevents the club from going over the top.',
      sv: 'Placera ett headcover under din bakre armhåla. Gör övningssvingar utan att tappa det. Detta håller bakre armbågen ansluten och förhindrar klubban från att gå over the top.',
    },
    reps: '20 half swings, then 10 full swings',
  },
  towel_under_arm: {
    name: { en: 'Towel Under Lead Arm', sv: 'Handduk under ledande arm' },
    targetFaults: ['chicken_wing', 'over_the_top'],
    difficulty: 'beginner',
    equipment: 'Small towel + club',
    instructions: {
      en: 'Tuck a small towel under your lead armpit. Hit balls without dropping it through impact and into follow-through. This promotes connection and prevents the chicken wing.',
      sv: 'Stoppa en liten handduk under din ledande armhåla. Slå bollar utan att tappa den genom träff och genomsving. Detta främjar anslutning och förhindrar kycklingvingen.',
    },
    reps: '20 shots with 7-iron',
  },
  wall_drill: {
    name: { en: 'Wall/Chair Drill', sv: 'Vägg/Stolsövning' },
    targetFaults: ['early_extension', 'sway'],
    difficulty: 'beginner',
    equipment: 'Wall or chair',
    instructions: {
      en: 'Set up with your glutes touching a wall or chair back. Make practice swings while keeping your glutes in contact throughout. If your glutes lose contact during the downswing, you are early extending.',
      sv: 'Ställ dig med sätesmuskeln mot en vägg eller stolsrygg. Gör övningssvingar medan du håller kontakten hela tiden. Om sätet tappar kontakten under nedsvingen har du tidig extension.',
    },
    reps: '30 practice swings',
  },
  chair_drill: {
    name: { en: 'Chair Drill (Posture)', sv: 'Stolsövning (Hållning)' },
    targetFaults: ['early_extension', 'loss_of_posture'],
    difficulty: 'beginner',
    equipment: 'Chair',
    instructions: {
      en: 'Place a chair behind you so it touches your glutes at address. Swing without losing contact with the chair. This trains hip rotation vs. hip thrust.',
      sv: 'Placera en stol bakom dig så att den rör vid sätesmuskeln vid adress. Svinga utan att tappa kontakten med stolen. Detta tränar höftrotation istället för höftstöt.',
    },
    reps: '20 swings at 50% speed',
  },
  lag_drill: {
    name: { en: 'Lag Preservation Drill', sv: 'Lag-bevarande övning' },
    targetFaults: ['casting'],
    difficulty: 'intermediate',
    equipment: 'Club + alignment stick',
    instructions: {
      en: 'Grip down on the club so the butt end extends past your lead hip. Make slow-motion swings. If the shaft hits your side before impact, you are casting. The shaft should only reach your body well after impact.',
      sv: 'Greppa längre ner på klubban så att änden sticker förbi din ledande höft. Gör svingar i slowmotion. Om skaftet träffar din sida före träff kastar du. Skaftet ska bara nå din kropp en bra bit efter träff.',
    },
    reps: '15 slow swings, 10 at 70% speed',
  },
  step_drill: {
    name: { en: 'Step Drill (Weight Transfer)', sv: 'Steg-övning (viktöverföring)' },
    targetFaults: ['reverse_pivot'],
    difficulty: 'beginner',
    equipment: 'Club only',
    instructions: {
      en: 'Start with feet together. As you swing back, step your trail foot back. As you swing through, step your lead foot forward. This forces proper weight transfer.',
      sv: 'Börja med fötterna ihop. När du svingar bakåt, ta ett steg bakåt med bakre foten. När du svingar igenom, ta ett steg framåt med ledande foten. Detta tvingar fram korrekt viktöverföring.',
    },
    reps: '20 swings with 7-iron, start at 50% speed',
  },
  pressure_shift_drill: {
    name: { en: 'Pressure Shift Drill', sv: 'Tryckförskjutningsövning' },
    targetFaults: ['reverse_pivot', 'sway'],
    difficulty: 'beginner',
    equipment: 'Club only',
    instructions: {
      en: 'At address, lift your lead foot slightly. Swing back, feeling weight load into trail foot. At the top, plant lead foot firmly and swing through. Exaggerates the proper ground force sequence.',
      sv: 'Vid adress, lyft ledande foten lätt. Svinga bakåt, känn vikten ladda i bakre foten. Vid toppen, plantera ledande foten stadigt och svinga igenom. Överdriver den korrekta markraftsekvensen.',
    },
    reps: '15 swings with wedge or 9-iron',
  },
  mirror_drill: {
    name: { en: 'Mirror Check Drill', sv: 'Spegelövning' },
    targetFaults: ['loss_of_posture', 'flat_backswing'],
    difficulty: 'beginner',
    equipment: 'Mirror or window reflection',
    instructions: {
      en: 'Practice swing positions in front of a mirror. Check setup, halfway back, top, impact. Compare to ideal positions. Pause at each checkpoint for 3 seconds.',
      sv: 'Öva svingpositioner framför en spegel. Kontrollera setup, halvvägs, toppen, träff. Jämför med idealpositioner. Pausa vid varje kontrollpunkt i 3 sekunder.',
    },
    reps: '10 minutes, 3 times per week',
  },
  alignment_stick_plane: {
    name: { en: 'Alignment Stick Plane Drill', sv: 'Svingplansövning med riktstav' },
    targetFaults: ['flat_backswing', 'over_the_top'],
    difficulty: 'intermediate',
    equipment: 'Alignment stick + club',
    instructions: {
      en: 'Stick an alignment stick in the ground at a 45° angle, pointing at the ball-target line. Practice swinging the club along this plane. The club should stay close to the stick throughout.',
      sv: 'Sätt en riktstav i marken i 45° vinkel, riktad mot boll-mål-linjen. Öva att svinga klubban längs detta plan. Klubban ska hålla sig nära staven genomgående.',
    },
    reps: '20 practice swings, then 10 with ball',
  },
  half_swing_punch: {
    name: { en: 'Half Swing Punch Shot', sv: 'Halvsvings punch-slag' },
    targetFaults: ['casting', 'chicken_wing'],
    difficulty: 'intermediate',
    equipment: '7 or 8 iron',
    instructions: {
      en: 'Make half-backswing shots, focusing on hitting a low, punched shot with forward shaft lean at impact. Hands MUST lead the club head. Abbreviated follow-through.',
      sv: 'Gör halvbaksvingsslag med fokus på att slå ett lågt, punchat slag med framåtlutande skaft vid träff. Händerna MÅSTE leda klubbhuvudet. Förkortad genomsving.',
    },
    reps: '30 balls with 7-iron',
  },
  resistance_band_hips: {
    name: { en: 'Resistance Band Hip Drill', sv: 'Gummibandsövning för höfter' },
    targetFaults: ['sway', 'early_extension'],
    difficulty: 'intermediate',
    equipment: 'Resistance band',
    instructions: {
      en: 'Loop resistance band around thighs above knees. Make practice swings. The band prevents lateral sway and encourages rotational movement.',
      sv: 'Trä ett motståndsband runt låren ovanför knäna. Gör övningssvingar. Bandet förhindrar lateral svajning och uppmuntrar rotationsrörelse.',
    },
    reps: '20 swings at 60% speed',
  },
};


// ============================================================
// 5. HANDICAP MAP — Total score → estimated handicap range
// ============================================================

export const HANDICAP_MAP = [
  { minScore: 90, maxScore: 100, handicap: '0-5', label: { en: 'Scratch / Single Digit', sv: 'Scratch / Ensiffrig' } },
  { minScore: 80, maxScore: 89,  handicap: '5-12', label: { en: 'Low Handicap', sv: 'Lågt handicap' } },
  { minScore: 70, maxScore: 79,  handicap: '12-18', label: { en: 'Mid Handicap', sv: 'Medelhandicap' } },
  { minScore: 60, maxScore: 69,  handicap: '18-25', label: { en: 'High Handicap', sv: 'Högt handicap' } },
  { minScore: 50, maxScore: 59,  handicap: '25-36', label: { en: 'Beginner', sv: 'Nybörjare' } },
  { minScore: 0,  maxScore: 49,  handicap: '36+', label: { en: 'New Golfer', sv: 'Ny golfare' } },
];


// ============================================================
// HELPER: Build the full knowledge base as a string for Claude
// ============================================================

export function buildKnowledgeBasePrompt(language = 'en') {
  const lang = language === 'sv' ? 'sv' : 'en';

  let prompt = `## GOLF BIOMECHANICS REFERENCE FRAMEWORK
You MUST use this framework to guide your analysis. Do not make up your own criteria.

### IDEAL POSITIONS PER PHASE
`;

  // Phases
  Object.entries(SWING_PHASES).forEach(([key, phase]) => {
    prompt += `\n**${phase.name[lang]}** (Frame ${phase.keyFrame}):\n`;
    prompt += `${phase.description[lang]}\n`;
    prompt += `Checkpoints:\n`;
    phase.checkpoints.forEach((cp) => {
      prompt += `  - ${cp}\n`;
    });
    if (phase.idealPositions) {
      const posEntries = Object.entries(phase.idealPositions);
      posEntries.forEach(([posKey, pos]) => {
        if (typeof pos === 'object' && pos.min !== undefined) {
          prompt += `  - ${posKey}: ${pos.min}-${pos.max}${pos.unit} (${pos.note || ''})\n`;
        }
      });
    }
  });

  // Fault profiles
  prompt += `\n### COMMON FAULT PROFILES\nWhen you identify these faults, use their EXACT names and reference the cause-effect chains:\n`;
  FAULT_PROFILES.forEach((fault) => {
    prompt += `\n**${fault.name[lang]}** [${fault.severity}] — Phases: ${fault.phases.join(', ')}\n`;
    prompt += `${fault.description[lang]}\n`;
    prompt += `Visual cues: ${fault.visualCues.join('; ')}\n`;
    prompt += `Causes: ${fault.causes.join('; ')}\n`;
    prompt += `Effects: ${fault.effects.join('; ')}\n`;
  });

  // Scoring rubric
  prompt += `\n### SCORING RUBRIC (PER CATEGORY)\n`;
  prompt += `Use these criteria to assign scores — do NOT score intuitively:\n`;
  Object.entries(SCORING_RUBRIC.perCategory).forEach(([range, info]) => {
    prompt += `  ${range}: ${info.label[lang]} — ${info.criteria}\n`;
  });
  prompt += `\nTotal score = weighted average:\n`;
  Object.entries(SCORING_RUBRIC.totalScore.weights).forEach(([cat, weight]) => {
    prompt += `  ${cat}: ${(weight * 100).toFixed(0)}%\n`;
  });
  prompt += `${SCORING_RUBRIC.totalScore.note}\n`;

  // Handicap map
  prompt += `\n### SCORE → HANDICAP MAPPING\n`;
  HANDICAP_MAP.forEach((h) => {
    prompt += `  ${h.minScore}-${h.maxScore} → hcp ${h.handicap} (${h.label[lang]})\n`;
  });

  // Drill references
  prompt += `\n### AVAILABLE DRILLS\nWhen recommending drills, use ONLY these named drills and reference them by their exact ID:\n`;
  Object.entries(DRILL_LIBRARY).forEach(([id, drill]) => {
    prompt += `  - ${id}: "${drill.name[lang]}" — targets: ${drill.targetFaults.join(', ')} — ${drill.difficulty}\n`;
  });

  return prompt;
}
