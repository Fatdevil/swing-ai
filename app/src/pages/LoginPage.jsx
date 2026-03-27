import { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { signInWithGoogle, signInWithApple } from '../firebase';

/**
 * LoginPage — Premium auth screen
 * Google + Apple Sign In with SWING_AI branding
 */
export default function LoginPage() {
  const { language } = useLanguage();
  const sv = language === 'sv';
  const [loading, setLoading] = useState(null); // 'google' | 'apple' | null
  const [error, setError] = useState('');

  const handleGoogle = async () => {
    setLoading('google');
    setError('');
    try {
      await signInWithGoogle();
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(sv ? 'Inloggning misslyckades. Försök igen.' : 'Sign in failed. Please try again.');
      }
    }
    setLoading(null);
  };

  const handleApple = async () => {
    setLoading('apple');
    setError('');
    try {
      await signInWithApple();
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(sv ? 'Inloggning misslyckades. Försök igen.' : 'Sign in failed. Please try again.');
      }
    }
    setLoading(null);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Background glows */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-20 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #9DFF00 0%, transparent 70%)' }}
      />
      <div
        className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full opacity-10 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #0066FF 0%, transparent 70%)' }}
      />

      {/* Content */}
      <div className="relative z-10 w-full max-w-sm space-y-12">
        {/* Logo & Brand */}
        <div className="text-center space-y-4">
          {/* Icon */}
          <div className="w-20 h-20 mx-auto rounded-2xl bg-primary-fixed/10 border border-primary-fixed/20 flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-primary-fixed text-4xl">sports_golf</span>
          </div>

          <h1 className="font-headline text-4xl font-black tracking-tight">
            <span className="text-primary-fixed">SWING</span>
            <span className="text-on-surface">_AI</span>
          </h1>
          <p className="text-on-surface-variant text-sm font-medium max-w-xs mx-auto leading-relaxed">
            {sv
              ? 'AI-driven svinganalys. Personlig coaching. Bli bättre, snabbare.'
              : 'AI-powered swing analysis. Personal coaching. Get better, faster.'}
          </p>
        </div>

        {/* Features */}
        <div className="space-y-3">
          {[
            { icon: 'videocam', text: sv ? 'Analysera din sving med AI' : 'Analyze your swing with AI' },
            { icon: 'psychology', text: sv ? 'Personlig coach med 3 personligheter' : 'Personal coach with 3 personalities' },
            { icon: 'emoji_events', text: sv ? 'Challenges — tävla mot proffsen' : 'Challenges — compete against the pros' },
          ].map((f, i) => (
            <div key={i} className="flex items-center gap-3 text-on-surface-variant text-sm">
              <span className="material-symbols-outlined text-primary-fixed text-lg">{f.icon}</span>
              <span>{f.text}</span>
            </div>
          ))}
        </div>

        {/* Auth buttons */}
        <div className="space-y-3">
          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={loading !== null}
            className="w-full h-14 rounded-full bg-white text-gray-800 font-bold text-sm flex items-center justify-center gap-3 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg"
          >
            {loading === 'google' ? (
              <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            {sv ? 'Fortsätt med Google' : 'Continue with Google'}
          </button>

          {/* Apple */}
          <button
            onClick={handleApple}
            disabled={loading !== null}
            className="w-full h-14 rounded-full bg-black text-white font-bold text-sm flex items-center justify-center gap-3 active:scale-[0.98] transition-all disabled:opacity-50 border border-white/10"
          >
            {loading === 'apple' ? (
              <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
            ) : (
              <svg width="18" height="20" viewBox="0 0 17 20" fill="white">
                <path d="M13.545 10.239c-.022-2.234 1.826-3.31 1.91-3.362-1.04-1.519-2.66-1.728-3.236-1.752-1.375-.14-2.69.812-3.389.812-.7 0-1.78-.793-2.926-.771-1.505.022-2.895.876-3.668 2.225-1.565 2.717-.4 6.739 1.125 8.941.744 1.079 1.634 2.29 2.802 2.247 1.124-.045 1.55-.729 2.908-.729 1.36 0 1.747.729 2.94.706 1.21-.022 1.98-1.099 2.722-2.18.856-1.25 1.21-2.462 1.232-2.525-.027-.012-2.364-.907-2.387-3.6l-.033.008zM11.32 3.48C11.944 2.72 12.37 1.68 12.252.62c-.9.037-1.993.6-2.64 1.36-.579.67-1.087 1.74-.951 2.766.999.078 2.02-.51 2.66-1.266z"/>
              </svg>
            )}
            {sv ? 'Fortsätt med Apple' : 'Continue with Apple'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Terms */}
        <p className="text-center text-on-surface-variant/40 text-[10px] leading-relaxed">
          {sv
            ? 'Genom att logga in godkänner du våra villkor och integritetspolicy.'
            : 'By signing in you agree to our Terms of Service and Privacy Policy.'}
        </p>
      </div>
    </div>
  );
}
