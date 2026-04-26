import { useLanguage } from '../i18n/LanguageContext';

const tabs = [
  { id: 'home', icon: 'dashboard', labelKey: 'home' },
  { id: 'record', icon: 'videocam', labelKey: 'record' },
  { id: 'compare', icon: 'compare', labelKey: 'compare' },
  { id: 'coach', icon: 'psychology', labelKey: 'coach' },
  { id: 'library', icon: 'video_library', labelKey: 'library' },
  { id: 'profile', icon: 'person', labelKey: 'profile' },
];

export default function BottomNavBar({ activePage, onNavigate }) {
  const { t } = useLanguage();

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 w-full z-50 bg-background/80 backdrop-blur-2xl border-t border-white/5 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]"
    >
      <div className="flex justify-around items-center h-20 px-4 w-full max-w-7xl mx-auto pb-safe">
        {tabs.map((tab) => {
          const isActive = activePage === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onNavigate(tab.id)}
              aria-label={t(tab.labelKey)}       {/* U1: skärmläsare läser ut sidnamnet */}
              aria-current={isActive ? 'page' : undefined} {/* U1: markerar aktiv sida */}
              className={`flex flex-col items-center justify-center transition-all active:scale-90 duration-300 ease-out ${
                isActive
                  ? 'text-primary-fixed bg-primary-fixed/10 rounded-full py-1 px-4'
                  : 'text-on-surface-variant hover:text-white'
              }`}
            >
              <span
                aria-hidden="true" {/* U1: ikonen är dekorativ — etiketten bebärs av aria-label ovan */}
                className={isActive ? 'material-symbols-filled' : 'material-symbols-outlined'}
              >
                {tab.icon}
              </span>
              <span className="font-label text-[10px] font-bold uppercase tracking-widest mt-1" aria-hidden="true">
                {t(tab.labelKey)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
