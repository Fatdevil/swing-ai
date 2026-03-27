import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { getSetting } from '../utils/storage';
import { getCoachingHistory, buildCoachingHistoryPrompt } from '../utils/coachingHistory';
import { COACHING_APPROACHES, REFERENCE_PLAYERS, COACH_PERSONALITIES } from '../utils/referencePlayers';

/**
 * CoachChat — Conversational coaching assistant
 * Full-context chat with Claude that knows:
 * - Latest analysis results, scores, faults, drills
 * - Coaching profile (approach, player, goals)
 * - Session history and trends
 *
 * Used from Coach Dashboard and Results page.
 */

const CHAT_STORAGE_KEY = 'coach_chat_messages';

function loadChatHistory() {
  try {
    return JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveChatHistory(messages) {
  try {
    // Keep last 30 messages to prevent storage bloat
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-30)));
  } catch { /* ignore */ }
}

/**
 * Build a contextual system prompt for the coaching chat
 */
async function buildChatSystemPrompt(analysisData, language) {
  const sv = language === 'sv';

  // Coaching profile
  const profile = getSetting('coaching_profile') || {};
  const approach = profile.approach ? COACHING_APPROACHES[profile.approach] : null;
  const player = profile.referencePlayer ? REFERENCE_PLAYERS[profile.referencePlayer] : null;
  const personality = profile.personality ? COACH_PERSONALITIES[profile.personality] : COACH_PERSONALITIES.technical_pro;

  let profileCtx = '';
  if (approach) {
    profileCtx += `\nCoaching approach: ${approach.name[language]} — ${approach.description[language]}`;
  }
  if (player) {
    profileCtx += `\nReference player: ${player.name} (${player.style[language]})`;
  }
  if (profile.specificGoal) {
    profileCtx += `\nUser's stated goal: ${profile.specificGoal}`;
  }

  // Coaching history
  let historyCtx = '';
  try {
    const history = await getCoachingHistory();
    historyCtx = buildCoachingHistoryPrompt(history, language);
  } catch { /* ignore */ }

  // Latest analysis context
  let analysisCtx = '';
  if (analysisData?.coaching) {
    const c = analysisData.coaching;
    analysisCtx = `\n## LATEST ANALYSIS (just completed)
Total Score: ${analysisData.totalScore}/100

Categories:
${(c.categories || []).map(cat => `- ${cat.name}: ${cat.score}/100${cat.tips?.length ? ` — Tips: ${cat.tips.join('; ')}` : ''}`).join('\n')}

Faults detected:
${(c.faultsDetected || []).map(f => `- ${f.fault} (${f.severity}): ${f.description}`).join('\n')}

${c.recommendedDrill ? `Recommended drill: ${c.recommendedDrill.id} — "${c.recommendedDrill.name}" — Reason: ${c.recommendedDrill.reason}` : ''}

Coach summary: ${c.overallAssessment || c.summary || ''}
Priority focus: ${c.priorityFocus || ''}`;
  }

  return `You are an expert golf coach having a conversation with your student. You have deep knowledge of golf biomechanics and coaching methodology.

## YOUR PERSONALITY
${personality.promptInstructions}
- ${sv ? 'Respond entirely in Swedish. Use du-form.' : 'Respond entirely in English.'}

## STUDENT PROFILE${profileCtx || '\nNo coaching profile set up yet.'}

${historyCtx}

${analysisCtx}

## GUIDELINES
- Keep responses concise (2-4 paragraphs max) unless asked to elaborate
- Reference their actual scores and faults, not generic advice
- When suggesting alternative drills, explain WHY and HOW
- If they ask about something outside your analysis data, say so honestly
- Use relevant golf terminology but explain it when needed`;
}

export default function CoachChat({ analysisData, onClose }) {
  const { language } = useLanguage();
  const sv = language === 'sv';
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Load history + build system prompt on mount
  useEffect(() => {
    const saved = loadChatHistory();
    if (saved.length > 0) {
      setMessages(saved);
    } else {
      // Initial greeting
      setMessages([{
        role: 'assistant',
        content: sv
          ? 'Hej! 👋 Jag är din coach. Fråga mig vad som helst om din sving, dina övningar, eller vad du vill förbättra. Jag har full koll på din senaste analys och dina mål.'
          : 'Hey! 👋 I\'m your coach. Ask me anything about your swing, your drills, or what you want to improve. I have full context of your latest analysis and goals.',
        timestamp: Date.now(),
      }]);
    }

    buildChatSystemPrompt(analysisData, language).then(setSystemPrompt);
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  async function handleSend() {
    const text = input.trim();
    if (!text || isThinking) return;

    const apiKey = getSetting('anthropic_key');
    if (!apiKey) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: sv ? '⚠️ API-nyckel saknas. Gå till Profil → Inställningar för att lägga till din Anthropic-nyckel.' : '⚠️ API key missing. Go to Profile → Settings to add your Anthropic key.',
        timestamp: Date.now(),
      }]);
      return;
    }

    const userMsg = { role: 'user', content: text, timestamp: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsThinking(true);

    try {
      // Build message history for Claude (only role + content)
      const apiMessages = newMessages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }));

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: systemPrompt,
          messages: apiMessages,
        }),
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const data = await response.json();
      const reply = data.content?.[0]?.text || (sv ? 'Inget svar.' : 'No response.');

      const assistantMsg = { role: 'assistant', content: reply, timestamp: Date.now() };
      const updated = [...newMessages, assistantMsg];
      setMessages(updated);
      saveChatHistory(updated);

    } catch (err) {
      console.error('Coach chat error:', err);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: sv ? `⚠️ Fel: ${err.message}` : `⚠️ Error: ${err.message}`,
        timestamp: Date.now(),
      }]);
    } finally {
      setIsThinking(false);
    }
  }

  function handleClearHistory() {
    const initial = [{
      role: 'assistant',
      content: sv
        ? 'Konversation rensad. Fråga mig vad som helst om din sving!'
        : 'Conversation cleared. Ask me anything about your swing!',
      timestamp: Date.now(),
    }];
    setMessages(initial);
    saveChatHistory(initial);
  }

  // Quick suggestions
  const quickSuggestions = sv ? [
    'Förklara min största svaghet',
    'Ge mig en annan övning',
    'Varför slicear jag?',
    'Vad ska jag fokusera på vid nästa träning?',
  ] : [
    'Explain my biggest weakness',
    'Give me a different drill',
    'Why do I slice?',
    'What should I focus on next practice?',
  ];

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background/95 backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10 bg-surface-container-low shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-fixed/15 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary-fixed text-xl">psychology</span>
          </div>
          <div>
            <h2 className="font-headline font-bold text-on-surface text-sm uppercase tracking-wider">
              {sv ? 'Din Coach' : 'Your Coach'}
            </h2>
            <span className="text-[10px] text-primary-fixed font-bold uppercase tracking-widest flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-fixed animate-pulse" />
              {sv ? 'Online' : 'Online'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClearHistory}
            className="p-2 text-on-surface-variant hover:text-on-surface transition-colors rounded-full hover:bg-surface-container"
            title={sv ? 'Rensa historik' : 'Clear history'}
          >
            <span className="material-symbols-outlined text-lg">delete_sweep</span>
          </button>
          <button
            onClick={onClose}
            className="p-2 text-on-surface-variant hover:text-on-surface transition-colors rounded-full hover:bg-surface-container"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[85%] ${
              msg.role === 'user'
                ? 'bg-primary-fixed text-on-primary-fixed rounded-2xl rounded-br-md'
                : 'bg-surface-container rounded-2xl rounded-bl-md'
            } px-4 py-3`}>
              {msg.role === 'assistant' && (
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="material-symbols-outlined text-primary-fixed text-xs">psychology</span>
                  <span className="text-[9px] font-bold text-primary-fixed uppercase tracking-widest">Coach</span>
                </div>
              )}
              <p className={`text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user' ? 'text-on-primary-fixed' : 'text-on-surface'
              }`}>
                {msg.content}
              </p>
              <span className={`text-[9px] block mt-1.5 ${
                msg.role === 'user' ? 'text-on-primary-fixed/50' : 'text-on-surface-variant/50'
              }`}>
                {new Date(msg.timestamp).toLocaleTimeString(sv ? 'sv-SE' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}

        {/* Thinking indicator */}
        {isThinking && (
          <div className="flex justify-start">
            <div className="bg-surface-container rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="material-symbols-outlined text-primary-fixed text-xs">psychology</span>
                <span className="text-[9px] font-bold text-primary-fixed uppercase tracking-widest">Coach</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-primary-fixed/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-primary-fixed/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-primary-fixed/40 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick suggestions (only when few messages) */}
      {messages.length <= 2 && !isThinking && (
        <div className="px-5 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
          {quickSuggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => { setInput(s); inputRef.current?.focus(); }}
              className="shrink-0 text-xs text-primary-fixed border border-primary-fixed/20 rounded-full px-3 py-1.5 hover:bg-primary-fixed/10 transition-colors whitespace-nowrap"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="px-5 py-4 border-t border-outline-variant/10 bg-surface-container-low shrink-0">
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={sv ? 'Skriv till coachen...' : 'Message your coach...'}
            disabled={isThinking}
            className="flex-1 bg-surface-container border border-outline-variant/20 rounded-full px-5 py-3 text-on-surface placeholder:text-on-surface-variant/40 text-sm focus:border-primary-fixed/40 outline-none disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isThinking}
            className="bg-primary-fixed text-on-primary-fixed w-12 h-12 rounded-full flex items-center justify-center active:scale-95 disabled:opacity-30 transition-all shadow-[0_2px_10px_rgba(157,255,0,0.2)]"
          >
            <span className="material-symbols-outlined">send</span>
          </button>
        </div>
      </div>
    </div>
  );
}
