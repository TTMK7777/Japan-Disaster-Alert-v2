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
import { readStorage, writeStorage } from '@/lib/safeStorage';

export const LANGUAGE_STORAGE_KEY = 'disaster-app-lang';
/** 利用者が画面で選んだ地域（府県予報区コード 6 桁）。URL 由来の地域は保存しない */
export const PREF_STORAGE_KEY = 'disaster-app-pref';

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
 *
 * 地域の優先順位: URL の `?pref=` > 利用者が以前画面で選んだ地域（保存値）> 未選択（null）。
 * **未選択を東京などの既定値で埋めない**（B8）。以前は WarningBanner が黙って東京（130000）を出しており、
 * 訪日客が「どこの情報か分からないまま東京の警報を見る」状態になっていた。
 * 地域も URL 由来は保存しない（宿の QR を一度読んだだけで端末の地域が固定されないように）。
 *
 * 利用者が画面で言語・地域を変えたら URL のクエリを今の状態に合わせる
 * （共有したリンクが今の表示を再現する）。開いただけでは URL を書き換えない。
 *
 * `prefCode` は URL・保存値のどちらにも有効な地域が無ければ null（未選択）。
 * `prefResolved` はマウント後の決定が済んだか（済む前に「地域を選んでください」を一瞬出さないため）。
 */
export function useDisplayPreferences() {
  // SSR と初回描画は 'ja'。hydration mismatch を避けるため、決定はマウント後に行う
  const [language, setLanguage] = useState<SupportedLanguage>('ja');
  // 初期言語の決定（URL / 保存値 / ブラウザ推定）が完了したか
  const [languageResolved, setLanguageResolved] = useState(false);
  // 表示中の言語が URL 由来か（URL 由来なら保存しない）
  const [languageFromUrl, setLanguageFromUrl] = useState(false);
  const [prefCode, setPrefCode] = useState<string | null>(null);
  const [prefResolved, setPrefResolved] = useState(false);

  // 注意: 保存エフェクトより先に宣言しないと、マウント時に保存済みの言語が
  // デフォルトの 'ja' で上書きされてしまう
  useEffect(() => {
    const search = window.location.search;
    const urlLanguage = readLangParam(search);
    setLanguage(
      urlLanguage ??
        resolveInitialLanguage(readStorage(LANGUAGE_STORAGE_KEY), getBrowserLanguages())
    );
    setLanguageFromUrl(urlLanguage !== null);
    const savedPref = readStorage(PREF_STORAGE_KEY);
    setPrefCode(readPrefParam(search) ?? (isPrefectureCode(savedPref) ? savedPref : null));
    setPrefResolved(true);
    setLanguageResolved(true);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === 'easy_ja' ? 'ja' : language;
    // 初期解決が済むまでは保存しない。SSR 既定値の 'ja' を「利用者の明示選択」として
    // 書き込むと、次回以降ブラウザ言語の推定が効かなくなる。
    // URL 由来の言語も保存しない（上のコメント参照）
    if (languageResolved && !languageFromUrl) {
      writeStorage(LANGUAGE_STORAGE_KEY, language);
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
    writeStorage(PREF_STORAGE_KEY, code);
    replaceQueryParam(PREF_PARAM, code);
  }, []);

  return { language, prefCode, prefResolved, selectLanguage, selectPref };
}
