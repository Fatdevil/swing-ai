/**
 * SWING_AI — Express Backend
 * ===========================
 * Serves static Vite build + API endpoints for dual engine analysis.
 * API keys stored in environment variables (Railway).
 *
 * Endpoints:
 *   POST /api/analyze  — Full dual-engine analysis (Gemini + Claude → Summarizer)
 *   GET  /api/health    — Health check
 */

// ─── Early startup logging (before any imports that might crash) ──
console.log('[STARTUP] Server process starting...');
console.log('[STARTUP] Node version:', process.version);
console.log('[STARTUP] PORT env:', process.env.PORT);
console.log('[STARTUP] CWD:', process.cwd());

// Catch uncaught errors at process level
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err.stack || err.message);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { analyzeMotion, analyzeFullSwing } from './gemini.js';
import { analyzePosition, summarizeAnalysis } from './claude.js';
import { requireAuth } from './auth.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { validateRequest, analyzeSchema, challengeSchema } from './schemaValidation.js';

console.log('[STARTUP] All imports loaded successfully');

// ─── withRetry — Exponential Backoff ─────────────────────────
/**
 * ST3/P3 FIX: Wraps en async funktion med exponential backoff retry.
 * Återförsöker vid transienta fel (429, 503, nätverksfel).
 * @param {Function} fn          — async funktion att köra
 * @param {number}   maxRetries  — max antal återförsök (default 3)
 * @param {number}   baseDelayMs — initial fördröjning i ms (default 1000)
 */
async function withRetry(fn, maxRetries = 3, baseDelayMs = 1000) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isTransient =
        err?.status === 429 ||
        err?.status === 503 ||
        err?.message?.includes('RESOURCE_EXHAUSTED') ||
        err?.message?.includes('overloaded') ||
        err?.code === 'ECONNRESET' ||
        err?.code === 'ETIMEDOUT';

      if (!isTransient || attempt === maxRetries) throw err;

      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
      console.warn(`[retry] Attempt ${attempt + 1}/${maxRetries} failed (${err.message}), retrying in ${Math.round(delay)}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ──────────────────────────────────────────────

// S2: Helmet med aktiverad CSP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.googleusercontent.com"],
      connectSrc: ["'self'", "https://*.googleapis.com", "https://*.firebaseio.com", "wss://*.firebaseio.com", "https://cdn.jsdelivr.net"],
      mediaSrc: ["'self'", "blob:"],
      workerSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// S1: CORS begränsad till kända origins
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGIN
    ? process.env.ALLOWED_ORIGIN.split(',')
    : ['http://localhost:5173', 'http://localhost:3001', 'https://swing-ai-production.up.railway.app']
);
app.use(cors({
  origin: (origin, callback) => {
    // Tillåt requests utan origin (t.ex. curl, Railway health checks)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    console.warn('[CORS] Blocked request from disallowed origin:', origin);
    // Return false instead of throwing an error, so static files can still be served 
    // (though API requests will be blocked by the browser)
    callback(null, false);
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  credentials: false,
}));

app.use(express.json({ limit: '10mb' })); // Reduced JSON limit now that video is multipart

// S4: Multer med MIME-validering — godtar bara videofiler
const ALLOWED_VIDEO_MIMETYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/ogg',
];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max video size
  fileFilter: (req, file, cb) => {
    if (ALLOWED_VIDEO_MIMETYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      console.warn('[upload] Rejected file with MIME type:', file.mimetype);
      cb(new Error(`Invalid file type: ${file.mimetype}. Only video files are accepted.`), false);
    }
  },
});

// Rate limiting — prevents API key abuse
// ─── Health Check (BEFORE rate limiter — Railway checks frequently) ──
app.get('/api/health', (req, res) => {
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  res.json({
    status: 'ok',
    engines: {
      claude: hasAnthropic ? 'configured' : 'missing',
      gemini: hasGemini ? 'configured' : 'missing',
      dualEngine: hasAnthropic && hasGemini,
    },
    timestamp: new Date().toISOString(),
  });
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 30,              // 30 requests per minute for general API
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — try again in a minute' },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 5,               // 5 AI analysis requests per minute (expensive)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many analysis requests — please wait before trying again' },
});

app.use('/api/', apiLimiter);
app.use('/api/analyze', aiLimiter, requireAuth); // SECURED via Firebase ID token
app.use('/api/chat', rateLimit({ windowMs: 60_000, max: 15, message: { error: 'Chat rate limit reached' } }), requireAuth); // SECURED

// Serve static Vite build
const staticPath = join(__dirname, '..', 'app', 'dist');
app.use(express.static(staticPath));

// ─── Engine Status (for frontend to know what's available) ───
// S7: Skyddad med requireAuth — exponerar ej konfigurationsdetaljer publikt
app.get('/api/engines', requireAuth, (req, res) => {
  // Returnerar alltid true om vi nått hit (nycklar måste finnas för att tjänsten ska fungera)
  // Avslöjar ej om enskilda nycklar saknas till okända anropare
  res.json({
    claude: Boolean(process.env.ANTHROPIC_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    dualEngine: Boolean(process.env.ANTHROPIC_API_KEY && process.env.GEMINI_API_KEY),
  });
});

// ─── AI Coach Chat (Gemini Flash + Coaching Context) ─────────

app.post('/api/chat', async (req, res) => {
  try {
    // S6: systemPromptOverride tas ej emot längre (prompt injection prevention)
    const { message, history = [], language = 'sv', coachingContext = null } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Missing message' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    const sv = language === 'sv';
    const langInstruction = sv
      ? 'Svara alltid på svenska. Använd du-form.'
      : 'Always respond in English. Be concise but helpful.';

    let systemPrompt = '';

    // S6: systemPromptOverride borttagen — klienten kan ej styra systemprompten
    // (Förhindrar prompt injection via API)
    {
      // Build personality from coaching context or default
      const personalityBlock = coachingContext?.personalityInstructions
        ? `## YOUR COACHING STYLE\n${coachingContext.personalityInstructions}`
        : `## YOUR COACHING STYLE\nYou are a professional, encouraging PGA-certified coach. Be clear, precise, and supportive.`;

      // Build profile block
      const profileBlock = coachingContext?.profileCtx
        ? `## STUDENT PROFILE${coachingContext.profileCtx}`
        : '';

      // Build history block
      const historyBlock = coachingContext?.historyCtx || '';

      systemPrompt = `Du är SWING AI Coach — en expert inom golf som alltid finns tillgänglig.

${personalityBlock}

## Dina kunskapsområden:
- Golfteknik (sving, putting, chipping, pitching, bunker)
- Biomechanik och kroppshållning (TPI-baserad analys)
- Regler och etikett
- Mentalträning och kurshantering
- Utrustning och passform
- Träningsövningar och drills (pumpövning, väggövning, lag-drill, etc.)
- Skadeprevention och uppvärmning
- Handikapp och scoring

${profileBlock}

${historyBlock}

## Regler:
- Ge konkreta, actionerbara svar
- Använd golftermer men förklara dem
- Håll svaren korta (2-3 meningar max, om inte frågan kräver mer)
- Om du vet studentens mål/profil, relatera svaren till deras specifika situation
- Om du vet deras senaste analys, referera till deras faktiska poäng och brister
- Om någon frågar om sin sving utan analysdata, tipsa om att ladda upp en video
- ${langInstruction}`;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    // A2 FIX: Chat-modell via env-variabel
    const chatModel = process.env.GEMINI_FLASH_MODEL || 'gemini-2.5-flash-preview-04-17';
    const model = genAI.getGenerativeModel({
      model: chatModel,
      systemInstruction: systemPrompt
    });

    // Build chat history for multi-turn
    const chatHistory = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    const chat = model.startChat({
      history: chatHistory,
    });

    const result = await chat.sendMessage(message);
    const reply = result.response.text();

    res.json({ reply });

  } catch (err) {
    console.error('[chat] Error:', err.message);
    res.status(500).json({ error: err.message || 'Chat failed' });
  }
});

// ─── Challenge Evaluation (Anthropic) ──────────────────────────

import { evaluateChallenge } from './claude.js';
import { buildChallengePrompt } from './challengeUtils.js';

app.post('/api/challenge', aiLimiter, requireAuth, validateRequest(challengeSchema), async (req, res) => {
  try {
    const { frames, challengeId, language } = req.body;
    
    const systemPrompt = buildChallengePrompt(challengeId, language);
    const result = await evaluateChallenge(frames, systemPrompt);
    res.json(result);
  } catch (err) {
    console.error('[challenge] Error:', err.message);
    res.status(500).json({ error: err.message || 'Challenge failed' });
  }
});

const uploadMiddleware = upload.single('video');

// ─── Full Dual-Engine Analysis ──────────────────────────────

app.post('/api/analyze', (req, res, next) => {
  uploadMiddleware(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: 'Video upload error: ' + err.message });
    } else if (err) {
      return res.status(500).json({ error: 'Server error during upload: ' + err.message });
    }
    next();
  });
}, validateRequest(analyzeSchema), async (req, res) => {
  const startTime = Date.now();

  try {
    const {
      cameraAngle,
      language,
      guestMode,
      knowledgeBase,
      coachingProfile,
      coachingHistory,
      tier,
      frames,
      sequencing
    } = req.body;

    // Keep video as raw buffer — only convert to base64 when Gemini needs it
    let videoBuffer = req.file ? req.file.buffer : null;
    let videoMimeType = req.file ? req.file.mimetype : null;

    const {
      video: fallbackVideo, // in case someone still sends it in JSON (already base64)
    } = req.body;

    let cachedVideoDataUri = null;
    const getVideoDataUri = () => {
      if (cachedVideoDataUri) return cachedVideoDataUri;
      if (videoBuffer) {
        cachedVideoDataUri = `data:${videoMimeType};base64,${videoBuffer.toString('base64')}`;
        return cachedVideoDataUri;
      }
      return fallbackVideo || null;
    };
    const hasVideo = Boolean(videoBuffer || fallbackVideo);

    const isGuest = guestMode;

    if (!frames || frames.length === 0) {
      // For basic tier with video, frames are optional (Gemini analyzes video directly)
      if (tier === 'basic' && hasVideo) {
        console.log('[analyze] Basic tier with video but no frames — proceeding with video-only analysis');
      } else {
        return res.status(400).json({ error: 'Missing frames data. Please re-record your swing.' });
      }
    }

    const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
    const hasGemini = Boolean(process.env.GEMINI_API_KEY);

    console.log(`[analyze] Start — tier=${tier}, engines: claude=${hasAnthropic}, gemini=${hasGemini && hasVideo}, frames=${frames.length}, angle=${cameraAngle}`);

    let geminiResult = null;
    let claudeResult = null;
    let usedEngines = [];

    // ── BASIC TIER: Gemini full analysis only ──
    if (tier === 'basic') {
      if (!hasGemini) {
        return res.status(400).json({ error: 'Basic tier requires a Gemini API key. Set GEMINI_API_KEY in environment.' });
      }
      if (!hasVideo) {
        // No video available — auto-fallback to Claude frame analysis if available
        if (hasAnthropic && frames.length > 0) {
          console.log('[analyze] Basic tier: no video, auto-fallback to premium (Claude frames)');
          tier = 'premium';
          // Fall through to premium tier below
        } else {
          return res.status(400).json({ error: 'No video data received. Please re-record or upload your swing video.' });
        }
      }
    }

    // ── BASIC TIER (with video) ──
    if (tier === 'basic') {

      try {
        // P3/ST3 FIX: withRetry hanterar 429/503/nätverksfel med exponential backoff
        geminiResult = await withRetry(() => analyzeFullSwing(getVideoDataUri(), cameraAngle, language, knowledgeBase));
        usedEngines.push('gemini');
      } catch (err) {
        console.error('[Gemini Full] Error after retries:', err.message);
        return res.status(500).json({ error: 'Gemini analysis failed: ' + err.message });
      }

      const elapsed = Date.now() - startTime;
      console.log(`[analyze] Basic done in ${elapsed}ms`);

      return res.json({
        ...geminiResult,
        _meta: {
          tier: 'basic',
          dualEngine: false,
          enginesUsed: usedEngines,
          processingTimeMs: elapsed,
        },
      });
    }

    // ── PREMIUM TIER: Dual Engine (Gemini motion + Claude position → Summarizer) ──
    const promises = [];

    if (hasGemini && hasVideo) {
      promises.push(
        // P3/ST3 FIX: withRetry för Gemini motion analysis
        withRetry(() => analyzeMotion(getVideoDataUri(), cameraAngle, language))
          .then(r => { geminiResult = r; usedEngines.push('gemini'); })
          .catch(err => { console.error('[Gemini] Error after retries:', err.message); })
      );
    }

    if (hasAnthropic) {
      promises.push(
        // P3/ST3 FIX: withRetry för Claude position analysis
        withRetry(() => analyzePosition(frames, cameraAngle, language, knowledgeBase, {
          guestMode: isGuest,
          coachingProfile,
          coachingHistory,
          sequencing,
        }))
          .then(r => { claudeResult = r; usedEngines.push('claude'); })
          .catch(err => { console.error('[Claude] Error after retries:', err.message); })
      );
    }

    // Wait for both to finish
    await Promise.allSettled(promises);

    if (!geminiResult && !claudeResult) {
      return res.status(500).json({
        error: 'Both AI engines failed. Check API keys and try again.',
      });
    }

    let finalResult;
    let dualEngine = false;

    // Dual engine: both succeeded → summarize
    if (geminiResult && claudeResult) {
      console.log('[analyze] Both engines succeeded — running summarizer...');
      try {
        finalResult = await summarizeAnalysis(geminiResult, claudeResult, language);
        dualEngine = true;
      } catch (err) {
        console.error('[Summarizer] Error:', err.message);
        finalResult = {
          ...claudeResult,
          motionAnalysis: geminiResult,
          dualEngineInsights: [],
          coachingSummary: geminiResult.motionSummary || '',
        };
        dualEngine = true;
      }
    }
    // Single engine fallback: only Claude
    else if (claudeResult) {
      finalResult = claudeResult;
    }
    else if (geminiResult) {
      finalResult = {
        totalScore: geminiResult.overallMotionGrade || 50,
        estimatedHandicap: null,
        recommendedDrill: null,
        causalChain: null,
        biomechanics: {},
        motionAnalysis: geminiResult,
        categories: [],
        faultsDetected: geminiResult.keyMotionFaults || [],
        coachingSummary: geminiResult.motionSummary || '',
      };
    }

    const elapsed = Date.now() - startTime;
    console.log(`[analyze] Done in ${elapsed}ms — engines used: ${usedEngines.join(', ')}, dualEngine=${dualEngine}`);

    res.json({
      ...finalResult,
      _meta: {
        tier: 'premium',
        dualEngine,
        enginesUsed: usedEngines,
        processingTimeMs: elapsed,
      },
    });

  } catch (err) {
    console.error('[analyze] Unhandled error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ─── SPA Fallback (must be last) ─────────────────────────────

app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.sendFile(join(staticPath, 'index.html'));
});

// ─── Start Server ────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🏌️ SWING_AI Backend running on 0.0.0.0:${PORT}`);
  console.log(`   Claude:  ${process.env.ANTHROPIC_API_KEY ? '✅ configured' : '❌ missing ANTHROPIC_API_KEY'}`);
  console.log(`   Gemini:  ${process.env.GEMINI_API_KEY ? '✅ configured' : '❌ missing GEMINI_API_KEY'}`);
  console.log(`   Static:  ${staticPath}\n`);
});
