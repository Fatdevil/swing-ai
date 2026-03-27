/**
 * Gemini 2.5 Pro — Motion Analysis (Video)
 * ==========================================
 * Analyzes full swing video for: tempo, sequencing, rhythm,
 * casting, transition quality, dynamic balance.
 *
 * Uses Google Generative AI SDK with video input.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Analyze swing motion from video
 * @param {string} videoBase64 - base64-encoded video (with or without data URI prefix)
 * @param {string} cameraAngle - 'side' | 'front' | 'dtl'
 * @param {string} language - 'en' | 'sv'
 * @returns {Object} Motion analysis JSON
 */
export async function analyzeMotion(videoBase64, cameraAngle, language = 'sv') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro-preview-06-05' });

  const langInstruction = language === 'sv'
    ? 'Respond entirely in Swedish.'
    : 'Respond entirely in English.';

  const cameraAngleDesc = {
    side: 'side view (face-on)',
    front: 'front-facing view',
    dtl: 'down-the-line view (behind the golfer)',
  }[cameraAngle] || 'side view';

  const prompt = `You are an elite PGA golf coach specializing in MOVEMENT ANALYSIS. You have been given a video of a golf swing from a ${cameraAngleDesc}.

Your UNIQUE role is to analyze the MOTION and DYNAMICS — things that can only be seen in video, not still images:

## YOUR FOCUS AREAS (Motion-Specific):
1. **Tempo & Rhythm**: Backswing-to-downswing time ratio (tour average ≈ 3:1). Is the swing rushed, smooth, or deliberate?
2. **Kinematic Sequencing**: In what order do body segments accelerate? Ideal: hips → torso → arms → hands. Report the actual sequence you observe.
3. **Transition Quality**: How smooth is the backswing-to-downswing transition? Is there a pause at the top? Any lunging or rushing?
4. **Casting / Early Release**: Do the wrists release too early in the downswing? This causes power loss.
5. **Dynamic Balance**: Does the golfer maintain balance through the swing? Any stumbling in the finish?
6. **Acceleration Pattern**: Does speed build progressively or spike erratically?
7. **Weight Transfer Flow**: Can you see weight shifting smoothly from trail foot to lead foot?

## RESPONSE FORMAT
Valid JSON only — no markdown, no code fences:

{
  "tempoRatio": <estimated backswing:downswing ratio as number, e.g. 2.8>,
  "tempoGrade": "<excellent/good/fair/poor>",
  "tempoNotes": "<detailed observation about rhythm and timing>",
  "sequencingOrder": ["<actual order, e.g. 'hips', 'torso', 'arms', 'hands'>"],
  "sequencingCorrect": <true/false>,
  "sequencingNotes": "<what you observe about the kinematic chain>",
  "transitionQuality": "<smooth/abrupt/rushed/deliberate>",
  "transitionNotes": "<detailed observation>",
  "castingDetected": <true/false>,
  "castingNotes": "<evidence for or against casting>",
  "dynamicBalance": "<excellent/good/fair/poor>",
  "balanceNotes": "<finish position stability observation>",
  "accelerationPattern": "<progressive/erratic/decelerating>",
  "weightTransfer": "<good/restricted/reverse>",
  "overallMotionGrade": <0-100 score for motion quality>,
  "keyMotionFaults": [
    {
      "fault": "<motion fault name>",
      "severity": "<high/medium/low>",
      "evidence": "<what you see in the video>"
    }
  ],
  "motionSummary": "<2-3 sentence summary of the motion analysis>"
}

## CRITICAL
- Focus ONLY on what video reveals that still images cannot
- Be precise with tempo ratio estimation
- ${langInstruction}`;

  // Strip data URI prefix if present
  const cleanBase64 = videoBase64.replace(/^data:video\/\w+;base64,/, '');

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: 'video/mp4',
        data: cleanBase64,
      },
    },
    { text: prompt },
  ]);

  const text = result.response.text();
  const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('Gemini JSON parse error:', text.slice(0, 500));
    throw new Error('Could not parse Gemini response');
  }
}
