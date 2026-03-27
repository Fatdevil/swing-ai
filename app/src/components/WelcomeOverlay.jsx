import { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { getSetting, setSetting } from '../utils/storage';

/**
 * WelcomeOverlay — First-time onboarding for new users
 * Shown once on first visit, dismissed permanently.
 * 3-step intro: Film → Analyze → Improve
 */
export default function WelcomeOverlay() {
  const { language } = useLanguage();
  const sv = language === 'sv';
  const [visible, setVisible] = useState(() => !getSetting('onboarding_done'));
  const [step, setStep] = useState(0);

  if (!visible) return null;

  const steps = [
    {
      icon: 'videocam',
      title: sv ? 'Filma din sving' : 'Film Your Swing',
      desc: sv
        ? 'Ladda upp en video av din golfsving från valfri vinkel. AI:n analyserar varje frame.'
        : 'Upload a video of your golf swing from any angle. The AI analyzes every frame.',
      color: '#9DFF00',
    },
    {
      icon: 'psychology',
      title: sv ? 'Få AI-coaching' : 'Get AI Coaching',
      desc: sv
        ? 'Avancerad pose-analys, vinkelberäkningar och TPI-sekvensering. Din personliga PGA-coach.'
        : 'Advanced pose analysis, angle measurements, and TPI sequencing. Your personal PGA coach.',
      color: '#00BFFF',
    },
    {
      icon: 'trending_up',
      title: sv ? 'Förbättra dig' : 'Track & Improve',
      desc: sv
        ? 'Spåra din utveckling, lås upp milestones och följ rekommenderade drills.'
        : 'Track your progress, unlock milestones, and follow recommended drills.',
      color: '#FFB800',
    },
  ];

  const handleDismiss = () => {
    setSetting('onboarding_done', true);
    setVisible(false);
  };

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-xl flex items-center justify-center p-6">
      <div className="max-w-sm w-full space-y-8 text-center">
        {/* Logo */}
        <div>
          <h1 className="font-headline text-3xl font-black tracking-tighter text-primary-fixed">
            SWING_AI
          </h1>
          <p className="text-on-surface-variant text-xs uppercase tracking-widest mt-1">
            {sv ? 'AI Golfcoach' : 'AI Golf Coach'}
          </p>
        </div>

        {/* Step icon */}
        <div className="flex justify-center">
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center"
            style={{ background: `${current.color}15`, border: `2px solid ${current.color}30` }}
          >
            <span className="material-symbols-outlined text-5xl" style={{ color: current.color }}>
              {current.icon}
            </span>
          </div>
        </div>

        {/* Step content */}
        <div className="space-y-3">
          <h2 className="font-headline text-2xl font-extrabold uppercase tracking-tight">
            {current.title}
          </h2>
          <p className="text-on-surface-variant text-sm leading-relaxed px-4">
            {current.desc}
          </p>
        </div>

        {/* Step dots */}
        <div className="flex justify-center gap-2">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all ${
                i === step
                  ? 'w-8 h-2 bg-primary-fixed'
                  : 'w-2 h-2 bg-primary-fixed/20'
              }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="space-y-3 pt-2">
          <button
            onClick={isLast ? handleDismiss : () => setStep(s => s + 1)}
            className="w-full kinetic-gradient text-on-primary-fixed h-14 rounded-full flex items-center justify-center gap-2 font-headline font-bold uppercase tracking-widest text-sm active:scale-[0.98] transition-all shadow-[0_4px_20px_rgba(157,255,0,0.2)]"
          >
            {isLast
              ? (sv ? 'Kom igång' : 'Get Started')
              : (sv ? 'Nästa' : 'Next')}
            <span className="material-symbols-outlined text-lg">
              {isLast ? 'rocket_launch' : 'arrow_forward'}
            </span>
          </button>

          {!isLast && (
            <button
              onClick={handleDismiss}
              className="text-on-surface-variant/50 text-xs uppercase tracking-widest font-bold hover:text-on-surface-variant transition-colors"
            >
              {sv ? 'Hoppa över' : 'Skip'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
