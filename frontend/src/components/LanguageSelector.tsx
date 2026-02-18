'use client';

import { LANGUAGES } from '@/i18n/translations';

interface LanguageSelectorProps {
  currentLanguage: string;
  onLanguageChange: (lang: string) => void;
}

export default function LanguageSelector({
  currentLanguage,
  onLanguageChange,
}: LanguageSelectorProps) {
  return (
    <select
      value={currentLanguage}
      onChange={(e) => onLanguageChange(e.target.value)}
      className="bg-white/20 text-white border border-white/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
    >
      {LANGUAGES.map((lang) => (
        <option key={lang.code} value={lang.code} className="text-gray-900">
          {lang.flag} {lang.name}
        </option>
      ))}
    </select>
  );
}
