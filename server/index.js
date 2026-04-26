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

console.log('[STARTUP] All imports loaded successfully');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ──────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Don't block our own frontend assets if needed
  crossOriginEmbedderPolicy: false,
}));
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Reduced JSON limit now that video is multipart

// Configure Multer for video upload (stored in memory as buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max video size
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

app.get('/api/engines', (req, res) => {
  res.json({
    claude: Boolean(process.env.ANTHROPIC_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    dualEngine: Boolean(process.env.ANTHROPIC_API_KEY && process.env.GEMINI_API_KEY),
  });
});

// ─── AI Coach Chat (Gemini Flash + Coaching Context) ─────────

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [], language = 'sv', coachingContext = null, systemPromptOverride = null } = req.body;

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

    if (systemPromptOverride) {
      // If the client provides a full system prompt (e.g. for coach onboarding)
      systemPrompt = systemPromptOverride;
    } else {
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

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash-preview-04-17',
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

app.post('/api/challenge', aiLimiter, requireAuth, async (req, res) => {
  try {
    const { frames, systemPrompt } = req.body;
    
    if (!frames || !systemPrompt) {
      return res.status(400).json({ error: 'Missing frames or systemPrompt' });
    }
    
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Anthropic API key not configured for Challenges' });
    }

    const result = await evaluateChallenge(frames, systemPrompt);
    res.json(result);
  } catch (err) {
    console.error('[challenge] Error:', err.message);
    res.status(500).json({ error: err.message || 'Challenge failed' });
  }
});

// ─── Full Dual-Engine Analysis ──────────────────────────────

app.post('/api/analyze', upload.single('video'), async (req, res) => {
  const startTime = Date.now();

  try {
    const {
      cameraAngle,
      language = 'sv',
      guestMode = 'false',
      knowledgeBase = '',
      coachingProfile = '',
      coachingHistory = '',
    } = req.body;
    let tier = req.body.tier || 'basic';

    // Multer places the file in req.file, we must convert it back to Base64 for Gemini/Claude if needed.
    // Or send it directly if SDK supports it.
    let videoStr = null;
    if (req.file) {
      videoStr = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    const {
      video: fallbackVideo, // in case someone still sends it in JSON
    } = req.body;

    const video = videoStr || fallbackVideo;

    let frames = [];
    if (req.body.frames) {
      try {
        frames = JSON.parse(req.body.frames);
      } catch (e) {
        console.error('[analyze] Failed to parse frames JSON:', e.message);
        frames = [];
      }
    }

    // ── INPUT VALIDATION ──
    const MAX_FRAMES = 16;
    const MAX_FRAME_SIZE = 5 * 1024 * 1024; // 5MB per frame (base64)

    if (frames.length > MAX_FRAMES) {
      return res.status(400).json({ error: `Too many frames (${frames.length}). Maximum is ${MAX_FRAMES}.` });
    }

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      if (!frame.phase || typeof frame.phase !== 'string') {
        return res.status(400).json({ error: `Frame ${i + 1} missing valid 'phase' field.` });
      }
      if (!frame.base64 || typeof frame.base64 !== 'string') {
        return res.status(400).json({ error: `Frame ${i + 1} missing valid 'base64' field.` });
      }
      if (frame.base64.length > MAX_FRAME_SIZE) {
        return res.status(400).json({ error: `Frame ${i + 1} exceeds max size (${(frame.base64.length / 1024 / 1024).toFixed(1)}MB > 5MB).` });
      }
    }

    let sequencing = null;
    if (req.body.sequencing) {
      try {
        sequencing = JSON.parse(req.body.sequencing);
      } catch (e) {
        console.error('[analyze] Failed to parse sequencing JSON:', e.message);
        sequencing = null;
      }
    }

    const isGuest = guestMode === 'true';

    if (!frames || frames.length === 0) {
      // For basic tier with video, frames are optional (Gemini analyzes video directly)
      if (tier === 'basic' && video) {
        console.log('[analyze] Basic tier with video but no frames — proceeding with video-only analysis');
      } else {
        return res.status(400).json({ error: 'Missing frames data. Please re-record your swing.' });
      }
    }

    const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
    const hasGemini = Boolean(process.env.GEMINI_API_KEY);

    console.log(`[analyze] Start — tier=${tier}, engines: claude=${hasAnthropic}, gemini=${hasGemini && Boolean(video)}, frames=${frames.length}, angle=${cameraAngle}`);

    let geminiResult = null;
    let claudeResult = null;
    let usedEngines = [];

    // ── BASIC TIER: Gemini full analysis only ──
    if (tier === 'basic') {
      if (!hasGemini) {
        return res.status(400).json({ error: 'Basic tier requires a Gemini API key. Set GEMINI_API_KEY in environment.' });
      }
      if (!video) {
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
        geminiResult = await analyzeFullSwing(video, cameraAngle, language, knowledgeBase);
        usedEngines.push('gemini');
      } catch (err) {
        console.error('[Gemini Full] Error:', err.message);
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

    if (hasGemini && video) {
      promises.push(
        analyzeMotion(video, cameraAngle, language)
          .then(r => { geminiResult = r; usedEngines.push('gemini'); })
          .catch(err => { console.error('[Gemini] Error:', err.message); })
      );
    }

    if (hasAnthropic) {
      promises.push(
        analyzePosition(frames, cameraAngle, language, knowledgeBase, {
          guestMode: isGuest,
          coachingProfile,
          coachingHistory,
          sequencing,
        })
          .then(r => { claudeResult = r; usedEngines.push('claude'); })
          .catch(err => { console.error('[Claude] Error:', err.message); })
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
    // Single engine fallback: only Gemini (shouldn't happen in premium, but just in case)
    else if (geminiResult) {
      finalResult = {
        totalScore: geminiResult.overallMotionGrade || 50,
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
  res.sendFile(join(staticPath, 'index.html'));
});

// ─── Start Server ────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🏌️ SWING_AI Backend running on 0.0.0.0:${PORT}`);
  console.log(`   Claude:  ${process.env.ANTHROPIC_API_KEY ? '✅ configured' : '❌ missing ANTHROPIC_API_KEY'}`);
  console.log(`   Gemini:  ${process.env.GEMINI_API_KEY ? '✅ configured' : '❌ missing GEMINI_API_KEY'}`);
  console.log(`   Static:  ${staticPath}\n`);
});
