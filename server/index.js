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

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { analyzeMotion, analyzeFullSwing } from './gemini.js';
import { analyzePosition, summarizeAnalysis } from './claude.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));  // Large limit for video + frames

// Serve static Vite build
const staticPath = join(__dirname, '..', 'app', 'dist');
app.use(express.static(staticPath));

// ─── Health Check ────────────────────────────────────────────

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

// ─── Engine Status (for frontend to know what's available) ───

app.get('/api/engines', (req, res) => {
  res.json({
    claude: Boolean(process.env.ANTHROPIC_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    dualEngine: Boolean(process.env.ANTHROPIC_API_KEY && process.env.GEMINI_API_KEY),
  });
});

// ─── Full Dual-Engine Analysis ──────────────────────────────

app.post('/api/analyze', async (req, res) => {
  const startTime = Date.now();

  try {
    const {
      video,          // base64 encoded video (for Gemini)
      frames,         // [{phase, base64, measurements}] (for Claude)
      cameraAngle,    // 'side' | 'front' | 'dtl'
      language = 'sv',
      guestMode = false,
      sequencing = null,
      knowledgeBase = '',
      coachingProfile = '',
      coachingHistory = '',
      tier = 'basic', // 'basic' (Gemini only) or 'premium' (Dual Engine)
    } = req.body;

    if (!frames || frames.length === 0) {
      return res.status(400).json({ error: 'Missing frames data' });
    }

    const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
    const hasGemini = Boolean(process.env.GEMINI_API_KEY);

    console.log(`[analyze] Start — tier=${tier}, engines: claude=${hasAnthropic}, gemini=${hasGemini && Boolean(video)}, frames=${frames.length}, angle=${cameraAngle}`);

    let geminiResult = null;
    let claudeResult = null;
    let usedEngines = [];

    // ── BASIC TIER: Gemini full analysis only ──
    if (tier === 'basic') {
      if (!hasGemini || !video) {
        return res.status(400).json({ error: 'Basic tier requires Gemini API key and video' });
      }

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
          guestMode,
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

app.listen(PORT, () => {
  console.log(`\n🏌️ SWING_AI Backend running on port ${PORT}`);
  console.log(`   Claude:  ${process.env.ANTHROPIC_API_KEY ? '✅ configured' : '❌ missing ANTHROPIC_API_KEY'}`);
  console.log(`   Gemini:  ${process.env.GEMINI_API_KEY ? '✅ configured' : '❌ missing GEMINI_API_KEY'}`);
  console.log(`   Static:  ${staticPath}\n`);
});
