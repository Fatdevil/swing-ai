import { createContext, useContext, useState } from 'react';
import { translations } from './translations';

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(
    () => localStorage.getItem('swing_ai_lang') || 'sv'
  );

  const changeLanguage = (lang) => {
    setLanguage(lang);
    localStorage.setItem('swing_ai_lang', lang);
  };

  const t = (key, vars = {}) => {
    let str = translations[language]?.[key] || translations.en[key] || key;
    Object.entries(vars).forEach(([k, v]) => {
      str = str.replace(`{${k}}`, v);
    });
    return str;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
