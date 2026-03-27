/**
 * API Client — Frontend → Backend
 * =================================
 * All AI calls go through our Express backend.
 * No API keys on the client side.
 */

/**
 * Check which engines are configured on the backend
 */
export async function getEngineStatus() {
  try {
    const res = await fetch('/api/engines');
    return await res.json();
  } catch {
    return { claude: false, gemini: false, dualEngine: false };
  }
}

/**
 * Run full dual-engine analysis
 * @param {Object} params
 * @param {string|null} params.video - base64 video (for Gemini)
 * @param {Array} params.frames - [{phase, base64, measurements}] (for Claude)
 * @param {string} params.cameraAngle - 'side' | 'front' | 'dtl'
 * @param {string} params.language - 'en' | 'sv'
 * @param {boolean} params.guestMode
 * @param {Object|null} params.sequencing - TPI sequencing data
 * @param {string} params.knowledgeBase - golf knowledge prompt
 * @param {string} params.coachingProfile - user profile context
 * @param {string} params.coachingHistory - past sessions context
 * @returns {Object} Unified coaching response with _meta.dualEngine flag
 */
export async function analyzeSwing({
  video = null,
  frames,
  cameraAngle,
  language = 'sv',
  guestMode = false,
  sequencing = null,
  knowledgeBase = '',
  coachingProfile = '',
  coachingHistory = '',
  tier = 'basic',
}) {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video,
      frames,
      cameraAngle,
      language,
      guestMode,
      sequencing,
      knowledgeBase,
      coachingProfile,
      coachingHistory,
      tier,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Analysis failed (${response.status}): ${errorBody.slice(0, 200)}`);
  }

  return response.json();
}

/**
 * Convert a File object to base64 string
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
