'use client';

import ConversationCards from '@/components/ConversationCards';
import { conversationUiText } from '@/data/conversationUiText';
import { useDisplayPreferences } from '@/hooks/useDisplayPreferences';
import { LANGUAGES, getLocale } from '@/i18n/translations';

/**
 * 表示言語は本体と同じ決め方（`?lang=` → 保存値 → ブラウザ推定）。
 * 画面で選び直すと `?lang=` も書き換わる（useDisplayPreferences の既存の動作）。
 */
export default function ConversationPageClient() {
  const { language, selectLanguage } = useDisplayPreferences();
  const title = conversationUiText(language, 'title');
  const titleJa = conversationUiText('ja', 'title');

  return (
    <main id="main-content" className="min-h-dvh bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-2xl px-4 py-5">
        <header className="mb-4 flex items-start justify-between gap-3">
          <h1 className="min-w-0 break-words">
            <span lang={getLocale(language)} className="block text-2xl font-black">
              {title}
            </span>
            {title !== titleJa && (
              <span lang="ja-JP" className="block text-base font-medium text-gray-700">
                {titleJa}
              </span>
            )}
          </h1>
          <label className="shrink-0">
            <span className="sr-only">Language / 言語</span>
            <select
              data-testid="conv-language"
              value={language}
              onChange={(e) => selectLanguage(e.target.value)}
              className="max-w-[9rem] min-h-[48px] truncate rounded-xl border-2 border-blue-700 bg-white px-2 text-base font-bold text-blue-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </header>
        <ConversationCards language={language} />
      </div>
    </main>
  );
}
