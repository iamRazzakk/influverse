'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { Language } from '@/types';
import { dictionaryFor, type Translations } from './dictionary';

/**
 * Current UI language + its strings. Same behaviour as the old Redux lang slice:
 * starts in English and lives for the session of the tab.
 *
 *   const { t, currentLang, setLanguage } = useLang();
 */
interface LangContextValue {
  currentLang: Language;
  t: Translations;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
}

const LangContext = createContext<LangContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [currentLang, setCurrentLang] = useState<Language>('en');

  const setLanguage = useCallback((lang: Language) => setCurrentLang(lang), []);
  const toggleLanguage = useCallback(() => setCurrentLang((l) => (l === 'en' ? 'de' : 'en')), []);

  const value = useMemo(
    () => ({ currentLang, t: dictionaryFor(currentLang), setLanguage, toggleLanguage }),
    [currentLang, setLanguage, toggleLanguage],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const useLang = (): LangContextValue => {
  const value = useContext(LangContext);
  if (!value) throw new Error('useLang must be used inside <LanguageProvider>');
  return value;
};
