import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../auth/AuthContext';

export default function TopAppBar() {
  const { language, setLanguage } = useLanguage();
  const { user } = useAuth();

  return (
    <header className="fixed top-0 w-full z-50 bg-background/70 backdrop-blur-xl border-b border-white/10 shadow-[0_0_20px_rgba(157,255,0,0.08)]">
      <div className="flex justify-between items-center px-6 h-16 w-full max-w-7xl mx-auto">
        {/* Profile Avatar */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-container-high border border-outline-variant/20 flex items-center justify-center">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="material-symbols-outlined text-on-surface-variant text-lg">person</span>
            )}
          </div>
        </div>

        {/* Logo */}
        <h1 className="font-headline tracking-tighter uppercase font-bold text-xl text-primary-fixed tracking-widest">
          SWING_AI
        </h1>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {/* Language Toggle */}
          <button
            onClick={() => setLanguage(language === 'sv' ? 'en' : 'sv')}
            className="text-on-surface-variant hover:text-primary-fixed transition-colors text-xs font-label font-bold uppercase tracking-widest bg-surface-container-high px-2 py-1 rounded-full"
          >
            {language === 'sv' ? 'EN' : 'SV'}
          </button>

          {/* Settings */}
          <button className="text-on-surface-variant hover:text-primary-fixed transition-colors active:scale-95 duration-200">
            <span className="material-symbols-outlined">settings</span>
          </button>
        </div>
      </div>
    </header>
  );
}
