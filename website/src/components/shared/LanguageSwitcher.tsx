'use client';

import React from 'react';
import { useLang } from '@/lib/i18n/LanguageProvider';

export function LanguageSwitcher() {
  const { currentLang, setLanguage } = useLang();

  return (
    <div className="inline-flex items-center gap-1 bg-[#F4F4F0] border border-[#E7E7E2] rounded-full p-0.5 text-sm font-semibold text-[#0A0A0A]">
      <button
        onClick={() => setLanguage('en')}
        className={`px-2.5 py-1 rounded-full transition-all cursor-pointer ${
          currentLang === 'en'
            ? 'bg-[#0A0A0A] text-white shadow-xs'
            : 'text-[#66665E] hover:text-[#0A0A0A]'
        }`}
      >
        EN
      </button>
      <button
        onClick={() => setLanguage('de')}
        className={`px-2.5 py-1 rounded-full transition-all cursor-pointer ${
          currentLang === 'de'
            ? 'bg-[#0A0A0A] text-white shadow-xs'
            : 'text-[#66665E] hover:text-[#0A0A0A]'
        }`}
      >
        DE
      </button>
    </div>
  );
}
