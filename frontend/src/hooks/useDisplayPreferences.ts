'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getBrowserLanguages,
  isSupportedLanguage,
  resolveInitialLanguage,
} from '@/i18n/detectLanguage';
import { isPrefectureCode } from '@/lib/prefectures';
import {
  LANG_PARAM,
  PREF_PARAM,
  readLangParam,
  readPrefParam,
  replaceQueryParam,
} from '@/lib/urlPreferences';
import type { SupportedLanguage } from '@/i18n/types';

export const LANGUAGE_STORAGE_KEY = 'disaster-app-lang';

/**
 * 表示言語と地域（警報タブの都道府県）を決め、保存と URL の同期を受け持つ。
 *
 * 初期言語の優先順位:
 *   1. URL の `?lang=`（宿の QR・外部サイトからのリンク）
 *   2. 利用者が以前自分で選んだ言語（localStorage）
 *   3. ブラウザの言語設定からの推定（該当なしは英語）
 *
 * **URL 由来の値は保存しない。** 保存すると、QR を一度読んだだけでその端末の
 * 以後の既定言語が固定されてしまう。利用者が画面で選び直したときだけ保存する。
 * 地域はそもそも保存しない（従来どおり）。
 *
 * 利用者が画面で言語・地域を変えたら URL のクエリを今の状態に合わせる
 * （共有したリンクが今の表示を再現する）。開いただけでは URL を書き換えない。
 *
 * `prefCode` は URL で有効な地域が指定されていない限り null（WarningBanner の既定に任せる）。
 */
export function useDisplayPreferences() {
  // SSR と初回描画は 'ja'。hydration mismatch を避けるため、決定はマウント後に行う
  const [language, setLanguage] = useState<SupportedLanguage>('ja');
  // 初期言語の決定（URL / 保存値 / ブラウザ推定）が完了したか
  const [languageResolved, setLanguageResolved] = useState(false);
  // 表示中の言語が URL 由来か（URL 由来なら保存しない）
  const [languageFromUrl, setLanguageFromUrl] = useState(false);
  const [prefCode, setPrefCode] = useState<string | null>(null);

  // 注意: 保存エフェクトより先に宣言しないと、マウント時に保存済みの言語が
  // デフォルトの 'ja' で上書きされてしまう
  useEffect(() => {
    const search = window.location.search;
    const urlLanguage = readLangParam(search);
    setLanguage(
      urlLanguage ??
        resolveInitialLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY), getBrowserLanguages())
    );
    setLanguageFromUrl(urlLanguage !== null);
    setPrefCode(readPrefParam(search));
    setLanguageResolved(true);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === 'easy_ja' ? 'ja' : language;
    // 初期解決が済むまでは保存しない。SSR 既定値の 'ja' を「利用者の明示選択」として
    // 書き込むと、次回以降ブラウザ言語の推定が効かなくなる。
    // URL 由来の言語も保存しない（上のコメント参照）
    if (languageResolved && !languageFromUrl) {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    }
  }, [language, languageResolved, languageFromUrl]);

  /** 利用者が画面で言語を選んだとき。許可リスト外の値は無視する */
  const selectLanguage = useCallback((lang: string) => {
    if (!isSupportedLanguage(lang)) return;
    setLanguage(lang);
    setLanguageFromUrl(false);
    replaceQueryParam(LANG_PARAM, lang);
  }, []);

  /** 利用者が画面で地域を選んだとき。許可リスト外の値は無視する */
  const selectPref = useCallback((code: string) => {
    if (!isPrefectureCode(code)) return;
    setPrefCode(code);
    replaceQueryParam(PREF_PARAM, code);
  }, []);

  return { language, prefCode, selectLanguage, selectPref };
}
