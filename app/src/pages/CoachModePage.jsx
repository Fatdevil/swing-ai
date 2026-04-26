import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { getSetting, setSetting } from '../utils/storage';
import { getAuth } from 'firebase/auth';
import { COACHING_APPROACHES } from '../utils/referencePlayers';

/**
 * CoachModePage — Streamlined coaching onboarding
 *
 * NEW FLOW (inspired by real PGA coaching):
 * 1. User chooses a Coaching Approach (bento grid)
 * 2. User describes their goal (free text)
 * 3. Coach asks follow-up questions (conversational)
 * 4. Profile saved → Dashboard (film baseline, adjust settings)
 *
 * Reference Player + Personality = optional settings in Dashboard
 */

const APPROACH_ICONS = {
  minimal_fix: 'target',
  rebuild: 'construction',
  consistency: 'bar_chart',
  distance: 'fitness_center',
  shot_fix: 'medication',
};

const GOAL_PLACEHOLDERS = {
  minimal_fix: {
    en: 'E.g. "I hit a slight fade that I want to turn into a draw, but otherwise my swing feels good"',
    sv: 'T.ex. "Jag slår en lätt fade som jag vill göra till en draw, men annars känns svingen bra"',
  },
  rebuild: {
    en: 'E.g. "I want to build a modern, rotational swing from scratch. I\'m willing to start over"',
    sv: 'T.ex. "Jag vill bygga en modern, rotationsbaserad sving från grunden. Jag är redo att börja om"',
  },
  consistency: {
    en: 'E.g. "I hit great shots but then throw in a shank or duck hook out of nowhere"',
    sv: 'T.ex. "Jag slår bra slag men blandar in shank eller duck hook helt plötsligt"',
  },
  distance: {
    en: 'E.g. "I want to add 20 yards to my driver. I feel like I lose speed somewhere in the downswing"',
    sv: 'T.ex. "Jag vill lägga till 20 yards på drivern. Det känns som att jag tappar fart i nedsvingen"',
  },
  shot_fix: {
    en: 'E.g. "I have a persistent slice with my driver and long irons. Mid-irons are fine"',
    sv: 'T.ex. "Jag har en ihållande slice med driven och långa järn. Mellanklubbar funkar bra"',
  },
};

/**
 * Simple breadcrumbs — just shows approach chip + back button
 */
function StepHeader({ profile, language, onBack, stepNumber, title, subtitle }) {
  const sv = language === 'sv';
  const approach = profile.approach ? COACHING_APPROACHES[profile.approach] : null;
  const icon = profile.approach ? (APPROACH_ICONS[profile.approach] || 'psychology') : null;

  return (
    <div className="mb-6">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-on-surface-variant hover:text-primary-fixed transition-colors mb-4 group"
      >
        <span className="material-symbols-outlined text-lg group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
        <span className="text-xs uppercase tracking-widest font-bold">{sv ? 'Tillbaka' : 'Back'}</span>
      </button>

      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1.5">
          {[1, 2, 3].map(n => (
            <div key={n} className={`h-1 rounded-full transition-all ${
              n <= stepNumber ? 'w-8 bg-primary-fixed' : 'w-4 bg-primary-fixed/15'
            }`} />
          ))}
        </div>
        <span className="text-on-surface-variant/40 text-[10px] uppercase tracking-widest font-bold">
          {sv ? `Steg ${stepNumber}/3` : `Step ${stepNumber}/3`}
        </span>
      </div>

      {/* Approach chip */}
      {approach && (
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-2 bg-primary-fixed/10 border border-primary-fixed/20 rounded-full px-3 py-1.5">
            <span className="material-symbols-outlined text-primary-fixed text-sm">{icon}</span>
            <span className="text-primary-fixed text-xs font-bold uppercase tracking-wider">
              {approach.name[language]}
            </span>
          </div>
        </div>
      )}

      <h2 className="font-headline text-3xl font-extrabold tracking-tight mb-2">{title}</h2>
      <p className="text-on-surface-variant font-medium">{subtitle}</p>
    </div>
  );
}

export default function CoachModePage({ onBack, onNavigate }) {
  const { t, language } = useLanguage();
  const [profile, setProfile] = useState(() => loadProfile());
  const [step, setStep] = useState(profile.completed ? 'summary' : 'approach');
  const [chatMessages, setChatMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const sv = language === 'sv';

  // -- Profile persistence --
  function loadProfile() {
    const saved = getSetting('coaching_profile');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* fall through */ }
    }
    return {
      approach: null,
      approachCustom: '',
      referencePlayer: null,
      personality: null,
      specificGoal: '',
      conversationHistory: [],
      completed: false,
    };
  }

  function saveProfile(updated) {
    const newProfile = { ...profile, ...updated };
    setProfile(newProfile);
    setSetting('coaching_profile', JSON.stringify(newProfile));
    return newProfile;
  }

  // -- Step handlers --
  const handleApproachSelect = (approachId) => {
    saveProfile({
      approach: approachId,
      specificGoal: '',
      conversationHistory: [],
      completed: false,
    });
    setStep('goal');
  };

  const handleGoalSubmit = () => {
    if (!userInput.trim()) return;
    const updated = saveProfile({ specificGoal: userInput.trim() });
    setUserInput('');
    startConversation(updated);
  };

  const handleGoalSave = () => {
    if (!userInput.trim()) return;
    saveProfile({ specificGoal: userInput.trim(), completed: true });
    setUserInput('');
    setStep('summary');
  };

  const startConversation = async (currentProfile) => {
    setStep('chat');
    setIsThinking(true);

    const approach = COACHING_APPROACHES[currentProfile.approach];

    const systemPrompt = `You are a PGA-certified golf coach helping a new student. You are having a brief intake conversation (2-3 exchanges max) to understand their goals and current situation.

Context:
- Coaching approach: ${approach?.name?.[language] || 'Custom'} — ${approach?.promptInstructions || 'General coaching'}
- Their stated goal: "${currentProfile.specificGoal}"

Your task:
1. Acknowledge their goal warmly and show you understand
2. Ask 1-2 clarifying questions to better coach them. For example:
   - What's their typical miss? (slice, hook, fat, thin)
   - How long have they been playing?
   - What's their current handicap?
   - Do they have any physical limitations?
   - What club do they struggle with most?
3. Be conversational, encouraging, and brief
4. ${sv ? 'Respond in Swedish' : 'Respond in English'}

Respond with ONLY your coaching message. No JSON, no formatting.`;

    try {
      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: currentProfile.specificGoal,
          language,
          systemPromptOverride: systemPrompt,
        }),
      });

      const result = await response.json();
      if (result.error) throw new Error(result.error);
      
      const coachText = result.reply || '';
      setChatMessages([
        { role: 'user', text: currentProfile.specificGoal },
        { role: 'coach', text: coachText },
      ]);
    } catch {
      setChatMessages([
        { role: 'user', text: currentProfile.specificGoal },
        { role: 'coach', text: sv ? 'Kunde inte ansluta. Profilen sparades ändå.' : 'Could not connect. Your profile was saved anyway.' },
      ]);
    }
    setIsThinking(false);
  };

  const handleChatReply = async () => {
    if (!userInput.trim() || isThinking) return;
    const newUserMsg = { role: 'user', text: userInput.trim() };
    const updatedMessages = [...chatMessages, newUserMsg];
    setChatMessages(updatedMessages);
    setUserInput('');
    setIsThinking(true);

    const approach = COACHING_APPROACHES[profile.approach];

    const systemPrompt = `You are a PGA-certified golf coach. Continue this coaching intake conversation.
Context: Approach = ${approach?.name?.en || 'Custom'}, Goal = "${profile.specificGoal}".

Rules:
- If you now have enough info (after 2-3 exchanges total), end with a BRIEF summary of what you've understood about their game and say you're excited to see their swing on video
- If you need more clarification, ask ONE more question
- Be warm, professional, and encouraging
- DO NOT suggest which pro player they should emulate — focus on their individual needs
- ${sv ? 'Respond in Swedish' : 'Respond in English'}`;

    try {
      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const historyForApi = chatMessages.map((m) => ({
        role: m.role === 'coach' ? 'model' : 'user',
        content: m.text,
      }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: userInput.trim(),
          history: historyForApi,
          language,
          systemPromptOverride: systemPrompt,
        }),
      });

      const result = await response.json();
      if (result.error) throw new Error(result.error);

      const coachText = result.reply || '';
      saveProfile({
        conversationHistory: [...updatedMessages, { role: 'coach', text: coachText }],
      });
      setChatMessages([...updatedMessages, { role: 'coach', text: coachText }]);
    } catch {
      setChatMessages([...updatedMessages, {
        role: 'coach',
        text: sv ? 'Anslutningsfel. Försök igen.' : 'Connection error. Try again.',
      }]);
    }
    setIsThinking(false);
  };

  const handleFinalize = () => {
    saveProfile({ completed: true, conversationHistory: chatMessages });
    setStep('summary');
  };

  const handleReset = () => {
    setSetting('coaching_profile', null);
    setProfile({
      approach: null,
      approachCustom: '',
      referencePlayer: null,
      personality: null,
      specificGoal: '',
      conversationHistory: [],
      completed: false,
    });
    setChatMessages([]);
    setStep('approach');
  };

  const approachEntries = Object.entries(COACHING_APPROACHES);

  return (
    <div className="px-6 pt-8 pb-8 max-w-5xl mx-auto">

      {/* ====== STEP 1: Choose Approach ====== */}
      {step === 'approach' && (
        <div className="space-y-10">
          {/* Back to home */}
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-on-surface-variant hover:text-primary-fixed transition-colors group"
          >
            <span className="material-symbols-outlined text-lg group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
            <span className="text-xs uppercase tracking-widest font-bold">{sv ? 'Tillbaka' : 'Back'}</span>
          </button>

          <section>
            <h2 className="font-headline text-3xl font-extrabold tracking-tight mb-2">
              {sv ? 'Hur vill du bli coachad?' : 'How would you like to be coached?'}
            </h2>
            <p className="text-on-surface-variant font-medium">
              {sv ? 'Steg 1 av 3 — Välj din approach:' : 'Step 1 of 3 — Choose your approach:'}
            </p>
          </section>

          {/* Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {approachEntries.map(([id, approach]) => {
              const icon = APPROACH_ICONS[id] || 'psychology';


              return (
                <button
                  key={id}
                  onClick={() => handleApproachSelect(id)}
                  className="flex flex-col text-left p-6 rounded-lg bg-surface-container hover:bg-surface-container-high transition-all active:scale-[0.98] kinetic-gradient-border group relative overflow-hidden"
                >
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary-fixed/5 blur-3xl rounded-full" />
                  <div className="mb-6 flex items-center justify-between w-full">
                    <div className="p-3 bg-primary-fixed/10 rounded-full">
                      <span className="material-symbols-outlined text-primary-fixed text-3xl">{icon}</span>
                    </div>
                    <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary-fixed transition-colors">arrow_forward</span>
                  </div>
                  <h3 className="font-headline text-xl font-bold mb-3 uppercase tracking-tight text-on-surface">
                    {approach.name[language]}
                  </h3>
                  <p className="text-on-surface-variant text-sm leading-relaxed">
                    {approach.description[language]}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Coaching Intelligence Gauge */}
          {(() => {
            const hasApiKey = !!getSetting('anthropic_key');
            const hasApproach = !!profile.approach;
            const hasGoal = !!profile.specificGoal;
            const isComplete = profile.completed;

            let readiness = 0;
            if (hasApiKey) readiness += 25;
            if (hasApproach) readiness += 25;
            if (hasGoal) readiness += 25;
            if (isComplete) readiness += 25;

            const stepIndex = isComplete ? 3 : hasGoal ? 2 : hasApproach ? 1 : 0;
            const stepLabels = sv
              ? ['Approach', 'Mål', 'Kalibrering']
              : ['Approach', 'Goal', 'Calibration'];

            return (
              <div className="p-8 rounded-lg bg-surface-container-low relative overflow-hidden">
                <div
                  className="absolute inset-0 opacity-20"
                  style={{ background: `radial-gradient(circle at 70% 20%, #9DFF00 0%, transparent ${40 + readiness * 0.4}%)` }}
                />
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                  <div className="w-40 h-40 md:w-48 md:h-48 rounded-full border-4 border-primary-fixed/20 flex items-center justify-center p-4 shrink-0">
                    <div className="w-full h-full rounded-full bg-surface-container-high flex items-center justify-center relative">
                      <div className="flex flex-col items-center">
                        <span className="text-primary-fixed font-headline text-5xl font-black drop-shadow-[0_0_15px_rgba(157,255,0,0.4)]">
                          {readiness}%
                        </span>
                        <span className="text-on-surface-variant text-[9px] uppercase tracking-widest font-bold mt-1">
                          {sv ? 'Redo' : 'Ready'}
                        </span>
                      </div>
                      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(157,255,0,0.1)" strokeWidth="3" />
                        <circle
                          cx="50" cy="50" r="46" fill="none"
                          stroke="#9DFF00" strokeWidth="3" strokeLinecap="round"
                          strokeDasharray={`${readiness * 2.89} ${289 - readiness * 2.89}`}
                          className="transition-all duration-1000"
                        />
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1">
                    <span className="text-primary-fixed font-headline text-xs font-bold uppercase tracking-widest mb-2 block">
                      {sv ? 'Coaching-intelligens' : 'Coaching Intelligence'}
                    </span>
                    <h4 className="text-2xl font-bold font-headline mb-4 uppercase">
                      {readiness >= 80 ? (sv ? 'Redo att coacha' : 'Ready to Coach') : (sv ? 'Kom igång' : 'Get Started')}
                    </h4>
                    <div className="flex gap-3">
                      {stepLabels.map((label, i) => (
                        <div key={i} className="flex-1">
                          <div className={`h-1.5 rounded-full mb-1.5 transition-all duration-500 ${
                            i < stepIndex ? 'bg-primary-fixed' : 'bg-primary-fixed/15'
                          }`} />
                          <span className={`text-[9px] uppercase tracking-wider font-bold ${
                            i < stepIndex ? 'text-primary-fixed' : 'text-on-surface-variant/50'
                          }`}>
                            {label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ====== STEP 2: Describe Your Goal ====== */}
      {step === 'goal' && (
        <div className="space-y-8">
          <StepHeader
            profile={profile}
            language={language}
            onBack={() => setStep('approach')}
            stepNumber={2}
            title={sv ? 'Beskriv ditt mål' : 'Describe your goal'}
            subtitle={sv ? 'Var så specifik du kan — vad vill du förbättra?' : 'Be as specific as you can — what do you want to improve?'}
          />

          <textarea
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder={
              (profile.approach && GOAL_PLACEHOLDERS[profile.approach])
                ? GOAL_PLACEHOLDERS[profile.approach][language]
                : (sv ? 'Beskriv vad du vill uppnå...' : 'Describe what you want to achieve...')
            }
            className="w-full bg-surface-container border border-outline-variant/20 rounded-lg p-5 text-on-surface placeholder:text-on-surface-variant/40 h-36 resize-none focus:border-primary-fixed/40 outline-none transition-colors text-sm leading-relaxed"
          />

          {/* Primary: Chat with coach (recommended path) */}
          <button
            onClick={handleGoalSubmit}
            disabled={!userInput.trim()}
            className="w-full kinetic-gradient text-on-primary-fixed h-16 rounded-full flex items-center justify-center gap-3 font-headline font-bold uppercase tracking-widest text-sm active:scale-[0.98] transition-all disabled:opacity-30 shadow-[0_4px_20px_rgba(157,255,0,0.2)]"
          >
            <span className="material-symbols-outlined">chat</span>
            {sv ? 'Prata med coachen' : 'Talk to Coach'}
          </button>

          {/* Secondary: Quick save without chat */}
          <button
            onClick={handleGoalSave}
            disabled={!userInput.trim()}
            className="w-full border border-outline-variant/20 text-on-surface-variant h-12 rounded-full flex items-center justify-center gap-2 font-headline font-bold uppercase tracking-widest text-xs active:scale-[0.98] transition-all hover:bg-surface-container-high disabled:opacity-30"
          >
            <span className="material-symbols-outlined text-sm">save</span>
            {sv ? 'Spara utan chatt' : 'Save without chat'}
          </button>
        </div>
      )}

      {/* ====== STEP 3: Conversational Chat ====== */}
      {step === 'chat' && (
        <div className="space-y-6">
          <StepHeader
            profile={profile}
            language={language}
            onBack={() => setStep('goal')}
            stepNumber={3}
            title={sv ? 'Coachen vill veta mer' : 'Coach wants to know more'}
            subtitle={sv ? 'Svara på följdfrågorna — sen är du redo att filma din sving.' : 'Answer follow-up questions — then you\'re ready to film your swing.'}
          />

          {/* Chat messages */}
          <div className="space-y-4 min-h-[200px]">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-4 ${
                  msg.role === 'user'
                    ? 'bg-primary-fixed/10 border border-primary-fixed/15 rounded-tr-sm'
                    : 'bg-surface-container-high border border-outline-variant/10 rounded-tl-sm kinetic-gradient-border'
                }`}>
                  {msg.role === 'coach' && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-primary-fixed text-sm">psychology</span>
                      <span className="text-[10px] font-bold text-primary-fixed uppercase tracking-widest font-headline">AI Coach</span>
                    </div>
                  )}
                  <p className="text-on-surface text-sm leading-relaxed whitespace-pre-line">{msg.text}</p>
                </div>
              </div>
            ))}

            {isThinking && (
              <div className="flex justify-start">
                <div className="bg-surface-container-high border border-outline-variant/10 rounded-2xl rounded-tl-sm p-4">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary-fixed animate-spin text-sm">progress_activity</span>
                    <span className="text-on-surface-variant text-sm">
                      {sv ? 'Coachen tänker...' : 'Coach is thinking...'}
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input + send */}
          <div className="flex gap-2">
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleChatReply()}
              placeholder={sv ? 'Svara coachen...' : 'Reply to coach...'}
              disabled={isThinking}
              className="flex-1 bg-surface-container border border-outline-variant/20 rounded-full px-5 py-3 text-on-surface placeholder:text-on-surface-variant/40 text-sm focus:border-primary-fixed/40 outline-none disabled:opacity-50"
            />
            <button
              onClick={handleChatReply}
              disabled={!userInput.trim() || isThinking}
              className="bg-primary-fixed text-on-primary-fixed w-12 h-12 rounded-full flex items-center justify-center active:scale-95 disabled:opacity-30"
            >
              <span className="material-symbols-outlined">send</span>
            </button>
          </div>

          {/* Finalize */}
          <button
            onClick={handleFinalize}
            className="w-full kinetic-gradient text-on-primary-fixed h-14 rounded-full flex items-center justify-center gap-2 font-headline font-bold uppercase tracking-widest text-xs active:scale-[0.98] transition-all shadow-[0_4px_20px_rgba(157,255,0,0.2)]"
          >
            <span className="material-symbols-outlined text-sm">check</span>
            {sv ? 'Klar — visa dashboard' : 'Done — Show Dashboard'}
          </button>
        </div>
      )}

      {/* ====== DASHBOARD ====== */}
      {step === 'summary' && (
        <CoachDashboard
          profile={profile}
          language={language}
          onReset={handleReset}
          onNavigate={onNavigate}
          onProfileUpdate={(updated) => saveProfile(updated)}
        />
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
