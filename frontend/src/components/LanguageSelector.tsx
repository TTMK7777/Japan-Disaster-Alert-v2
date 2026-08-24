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
    // 幅を絞る。以前は無制限で、狭い画面ではヘッダー幅の半分近くを占めて
    // タイトルと接続表示を押し潰していた。閉じている間は溢れた分を省略し、
    // 開けばネイティブのピッカーが全言語をフル表示するので選択は妨げられない
    <select
      value={currentLanguage}
      onChange={(e) => onLanguageChange(e.target.value)}
      className="max-w-[7.5rem] md:max-w-none truncate bg-white/20 text-white border border-white/30 rounded-lg px-2 py-2 md:px-3 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-white/50"
    >
      {LANGUAGES.map((lang) => (
        <option key={lang.code} value={lang.code} className="text-gray-900">
          {lang.flag} {lang.name}
        </option>
      ))}
    </select>
  );
}
