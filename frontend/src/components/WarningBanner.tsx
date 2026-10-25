'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL } from '@/config/api';
import { getTranslation, getLocale } from '@/i18n/translations';
import { formatRelativeTime } from '@/lib/relativeTime';
import { PREFECTURES } from '@/lib/prefectures';
import { OfficialInfoLink } from '@/components/ScopeNotice';
import FetchFailureNotice from '@/components/FetchFailureNotice';
import {
  createTimedAbort,
  classifyFetchError,
  parseFailedAreas,
  readSwCache,
  type FailureReason,
  type TimedAbort,
} from '@/lib/fetchFailure';
import {
  normalizeSeverity,
  SEVERITY_STYLES,
  cardClassName,
  metaClassName,
  badgeClassName,
  continuingBadgeClassName,
} from '@/lib/warningSeverity';

interface Warning {
  id: string;
  type: string;
  title: string;
  title_translated?: string;
  description: string;
  description_translated?: string;
  area: string;
  issued_at: string;
  /** 継続中の警報か。継続中は issued_at が最終更新時刻であって発表時刻ではない */
  is_continuing?: boolean;
  severity: string;
}

interface WarningBannerProps {
  /**
   * 表示する地域。後から変わったらその地域に切り替える（URL の ?pref= を反映するため）。
   * 未指定（null / undefined）なら**取りに行かず「地域を選んでください」を出す**。
   * 以前は東京（130000）を既定にしており、どこの情報か分からないまま東京の警報が出ていた（B8）
   */
  areaCode?: string | null;
  language?: string;
  /**
   * 取得できた警報と、その取得に使った地域コード（ページ全体の特別警報の帯が使う）。
   * partial は一部の予報区が取れなかった応答（取れた分に特別警報が無くても「なし」と確定できない）。
   * 取得失敗は onWarningsFailure で通知する
   */
  onWarningsUpdate?: (warnings: Warning[], areaCode: string, status: { partial: boolean }) => void;
  /** 現在の地域で取得に失敗したときに呼ぶ（自己中断は除く） */
  onWarningsFailure?: (areaCode: string) => void;
  /** 利用者がセレクタで地域を変えたときに呼ぶ（URL の同期用） */
  onAreaCodeChange?: (code: string) => void;
}

// Translation keys mapped to centralized translations.ts
const WARNING_KEYS = {
  title: 'warning.title',
  noWarnings: 'warning.noWarnings',
  loading: 'loading',
  error: 'warning.error',
  retry: 'common.retry',
  issuedAt: 'warning.issuedAt',
  // 継続中の警報向け。中央の翻訳表に16言語で既にあるものを流用する
  lastUpdate: 'lastUpdate',
  continuing: 'warning.continuing',
  // 階級ラベル (特別警報 / 警報 / 注意報) のキーは lib/warningSeverity.ts の
  // labelKey が持つ。階級と表示の対応を 1 箇所に集めるためここには置かない
  selectArea: 'warning.selectArea',
} as const;

// HIGH #11: PrefectureSelector をレンダー外に定義
interface PrefectureSelectorProps {
  /** 未選択は空文字（先頭の「都道府県を選ぶ」を出す） */
  selectedAreaCode: string;
  onAreaCodeChange: (code: string) => void;
  language: string;
}

function PrefectureSelector({ selectedAreaCode, onAreaCodeChange, language }: PrefectureSelectorProps) {
  const label = getTranslation(language, WARNING_KEYS.selectArea);
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
        {label}
      </label>
      <select
        value={selectedAreaCode}
        onChange={(e) => onAreaCodeChange(e.target.value)}
        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        {selectedAreaCode === '' && (
          <option value="" disabled>
            {getTranslation(language, 'region.placeholder')}
          </option>
        )}
        {PREFECTURES.map((pref) => (
          <option key={pref.code} value={pref.code}>
            {language === 'ja' || language === 'easy_ja' ? pref.ja : `${pref.en} (${pref.ja})`}
          </option>
        ))}
      </select>
    </div>
  );
}

/** 取得の期限。過ぎたら「時間内に応答がない」失敗として出す（黙って緑にしない） */
export const WARNING_FETCH_TIMEOUT_MS = 10_000;

export default function WarningBanner({
  areaCode: initialAreaCode = null,
  language = 'ja',
  onWarningsUpdate,
  onWarningsFailure,
  onAreaCodeChange,
}: WarningBannerProps) {
  const [warnings, setWarnings] = useState<Warning[]>([]);
  // warnings がどの地域のものか（別地域の前回値を今の地域の「前回確認」として出さない）
  const [dataAreaCode, setDataAreaCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(initialAreaCode !== null);
  // 取得の失敗（全体）。**再取得が成功したときだけ解除する**
  const [failure, setFailure] = useState<FailureReason | null>(null);
  // 一部の予報区だけ取れなかった（表示言語の地名）
  const [partialAreas, setPartialAreas] = useState<string[]>([]);
  // 最後に取得できた地域と時刻
  const [lastSuccess, setLastSuccess] = useState<{ code: string; at: number } | null>(null);
  const [selectedAreaCode, setSelectedAreaCode] = useState<string | null>(initialAreaCode);

  // HIGH #10: onWarningsUpdate を ref で保持し deps から除外
  const onWarningsUpdateRef = useRef(onWarningsUpdate);
  onWarningsUpdateRef.current = onWarningsUpdate;
  const onWarningsFailureRef = useRef(onWarningsFailure);
  onWarningsFailureRef.current = onWarningsFailure;
  const onAreaCodeChangeRef = useRef(onAreaCodeChange);
  onAreaCodeChangeRef.current = onAreaCodeChange;

  // 親が渡す地域が変わったら追従する（依存は文字列なので参照の揺れでは再実行されない）。
  // 親が同じ値を渡し続ける限りは何もしないので、利用者の選択は上書きされない
  useEffect(() => {
    setSelectedAreaCode(initialAreaCode);
  }, [initialAreaCode]);

  // 地域が変わったら前の地域の失敗表示は持ち越さない
  useEffect(() => {
    setFailure(null);
    setPartialAreas([]);
  }, [selectedAreaCode]);

  const handleAreaCodeChange = useCallback((code: string) => {
    setSelectedAreaCode(code);
    onAreaCodeChangeRef.current?.(code);
  }, []);

  const t = useCallback(
    (key: keyof typeof WARNING_KEYS) =>
      getTranslation(language, WARNING_KEYS[key]),
    [language]
  );

  // 現在選択中の都道府県情報を取得
  const selectedPrefecture = PREFECTURES.find(p => p.code === selectedAreaCode);
  // 表外のコードが渡っても見出しに "undefined" を出さない
  const prefectureName = (language === 'ja' || language === 'easy_ja'
    ? selectedPrefecture?.ja
    : selectedPrefecture?.en) ?? selectedAreaCode;

  // **前回の取得を必ず中断してから始める。** 都道府県セレクタを素早く
  // A→B と切り替えたとき、A のレスポンスが遅れて後着すると
  // setWarnings(A のデータ) が勝ち、見出しは B のまま A の警報一覧が出る —
  // 災害情報アプリで**別地域の警報を今の地域のものとして見せてしまう**
  const fetchRef = useRef<TimedAbort | null>(null);
  const fetchWarnings = useCallback(async () => {
    fetchRef.current?.abort();
    // 地域が未選択なら取りに行かない（東京などで埋めない）
    if (selectedAreaCode === null) {
      fetchRef.current = null;
      setLoading(false);
      setFailure(null);
      setPartialAreas([]);
      setWarnings([]);
      return;
    }
    const request = createTimedAbort(WARNING_FETCH_TIMEOUT_MS);
    fetchRef.current = request;
    setLoading(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/alerts?area_code=${encodeURIComponent(selectedAreaCode)}&lang=${encodeURIComponent(language)}`,
        { signal: request.signal }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch warnings: ${response.status}`);
      }
      // SW がキャッシュから返した応答は「今取れた」ものではない（B4b）。失敗として扱い、前の表示を保つ
      if (readSwCache(response).fromCache) throw new Error('served from service worker cache');

      const data = await response.json();
      if (request.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      // 配列でない本文を「0 件」にしない
      if (!Array.isArray(data)) throw new Error('Unexpected warnings payload');
      const failedAreas = parseFailedAreas(response);
      setWarnings(data);
      setDataAreaCode(selectedAreaCode);
      setPartialAreas(failedAreas);
      setFailure(null);
      setLastSuccess({ code: selectedAreaCode, at: Date.now() });
      onWarningsUpdateRef.current?.(data, selectedAreaCode, { partial: failedAreas.length > 0 });
    } catch (err) {
      // 自分で中断した分（地域の切替・アンマウント）は表示しない。期限超過は失敗として出す
      if (fetchRef.current !== request || (request.signal.aborted && !request.timedOut())) return;
      const reason = classifyFetchError(request, err);
      if (reason === null) return;
      console.error('Warning fetch error:', err);
      setFailure(reason);
      onWarningsFailureRef.current?.(selectedAreaCode);
    } finally {
      request.clear();
      if (fetchRef.current === request) setLoading(false);
    }
  }, [selectedAreaCode, language]);

  useEffect(() => {
    fetchWarnings();
    if (selectedAreaCode === null) return;
    // 5分ごとに更新
    const interval = setInterval(fetchWarnings, 5 * 60 * 1000);
    return () => {
      clearInterval(interval);
      fetchRef.current?.abort();
      fetchRef.current = null;
    };
  }, [fetchWarnings, selectedAreaCode]);

  if (selectedAreaCode === null) {
    return (
      <div className="space-y-3" data-testid="warning-choose-region">
        <div className="p-4 bg-amber-50 dark:bg-gray-800 border-2 border-amber-400 dark:border-amber-600 rounded-lg text-gray-900 dark:text-gray-100">
          <h3 className="font-bold">{getTranslation(language, 'region.choose')}</h3>
          <p className="mt-1 text-sm">{getTranslation(language, 'region.chooseHint')}</p>
        </div>
        <PrefectureSelector selectedAreaCode="" onAreaCodeChange={handleAreaCodeChange} language={language} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse">
        <div className="h-6 bg-gray-300 dark:bg-gray-600 rounded w-1/3 mb-2"></div>
        <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-2/3"></div>
      </div>
    );
  }

  // この地域で前に取れた警報（失敗時に「前回確認」として残す）
  const shownWarnings = dataAreaCode === selectedAreaCode ? warnings : [];
  const lastSuccessAt = lastSuccess && lastSuccess.code === selectedAreaCode ? lastSuccess.at : null;

  const selector = (
    <PrefectureSelector
      selectedAreaCode={selectedAreaCode}
      onAreaCodeChange={handleAreaCodeChange}
      language={language}
    />
  );

  // 取得できなかった（全体の失敗・期限超過・一部の予報区の欠落）。緑の「警報なし」は出さない
  if (failure || partialAreas.length > 0) {
    return (
      <div className="space-y-3">
        {selector}
        <FetchFailureNotice
          language={language}
          reason={failure}
          partialAreas={failure ? [] : partialAreas}
          lastSuccessAt={failure ? lastSuccessAt : null}
          onRetry={fetchWarnings}
          testId="warning-fetch-failure"
          heading={`${t('title')} - ${prefectureName}`}
        >
          {/* 取得に失敗したときこそ公式情報が要る */}
          <OfficialInfoLink language={language} areaCode={selectedAreaCode} />
        </FetchFailureNotice>
        {shownWarnings.length > 0 && renderWarningList(shownWarnings)}
      </div>
    );
  }

  if (shownWarnings.length === 0) {
    return (
      <div className="space-y-3">
        {selector}
        {/* このアプリは避難指示・避難所の開設状況を扱わない。「警報なし」を「避難指示なし」と
            読ませないよう、選んだ県の公式防災ページへ 1 タップで行けるようにする */}
        <OfficialInfoLink language={language} areaCode={selectedAreaCode} />
        {/* 緑の「警報なし」は、**すべての予報区を取得できて 0 件だったときだけ** */}
        <div className="p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-2xl">✅</span>
            <div>
              <h3 className="font-bold text-green-800 dark:text-green-200">{t('title')} - {prefectureName}</h3>
              <p className="text-green-700 dark:text-green-300">{t('noWarnings')}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {selector}
      <OfficialInfoLink language={language} areaCode={selectedAreaCode} />
      {renderWarningList(shownWarnings)}
    </div>
  );

  function renderWarningList(list: Warning[]) {
    return (
      <>
      <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100">{t('title')} - {prefectureName}</h3>
      {/* 一覧であることを支援技術に伝える。従来はカードが平置きで、しかも全件に
          role="alert" が付いていたため、注意報が並ぶ日は読み上げが割り込みで埋まった */}
      <ul className="space-y-3">
      {list.map((warning) => {
        // 継続中の警報では相対時刻を出さない。気象庁は内容が変わらない限り
        // reportDatetime を更新しないため、伊豆諸島の注意報のように 3 か月前の
        // 日時が入る。単独の「3 か月前」は**情報が古い＝壊れている**と読まれるが、
        // 実際には「今も出ている」。継続中であることは下のバッジで前面に出す。
        const relativeIssuedAt = warning.is_continuing
          ? ''
          : formatRelativeTime(warning.issued_at, getLocale(language));
        // 気象庁の 3 階級へ畳む。medium と low はどちらも「注意報」だが、
        // 従来はラベルが同じまま黄と青に塗り分けられていた（lib/warningSeverity.ts 参照）
        const severity = normalizeSeverity(warning.severity);
        const style = SEVERITY_STYLES[severity];
        const severityLabel = style.labelKey ? getTranslation(language, style.labelKey) : '';
        // key は id 単体。index を混ぜると 5 分ごとのポーリングで並びが
        // 変わったとき、内容が同じ警報の <li> まで別要素として再マウントされ、
        // role="alert" が付いた項目をスクリーンリーダーが読み上げ直す
        return (
        <li key={warning.id}>
        <div
          className={`p-4 rounded-lg ${cardClassName(severity)}${
            severity === 'extreme' ? ' animate-pulse motion-reduce:animate-none' : ''
          }`}
          /* 警報以上だけが読み上げに割り込む。role="alert" は暗黙に assertive なので
             aria-live は明示しない（両方書くと意図が競合する） */
          {...(style.interrupts ? { role: 'alert' } : {})}
        >
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden="true">
              {style.icon}
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                {severityLabel && (
                  <span data-badge="severity" className={`px-2 py-0.5 text-xs font-bold rounded ${badgeClassName(severity)}`}>
                    {severityLabel}
                  </span>
                )}
                {warning.is_continuing && (
                  <span data-badge="continuing" className={`px-2 py-0.5 text-xs font-bold rounded ${continuingBadgeClassName(severity)}`}>
                    {t('continuing')}
                  </span>
                )}
                <h4 className="font-bold">
                  {language !== 'ja' && warning.title_translated
                    ? warning.title_translated
                    : warning.title}
                </h4>
              </div>
              {/* 本文は二次情報ではないので見出しと同じコントラストで出す。
                  従来の opacity-90 は下地と混ざって実効 3.28:1 まで落ちていた */}
              <div className="mt-1 text-sm space-y-1">
                {(language !== 'ja' && warning.description_translated
                  ? warning.description_translated
                  : warning.description
                ).split('\n').map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
              {/* 継続中の警報は「発表時刻」ではなく「最終更新」を出す。
                  気象庁は変化がない限り reportDatetime を更新しないため、
                  3か月前の日時を「発表時刻」として見せると、たった今出た警報に見える。
                  併せて経過時間を添える（Intl.RelativeTimeFormat が言語別に処理するので
                  16言語ぶんの文言を用意しなくてよい） */}
              <p className={`mt-2 text-xs ${metaClassName(severity)}`}>
                {warning.area} | {warning.is_continuing ? t('lastUpdate') : t('issuedAt')}:{' '}
                {new Date(warning.issued_at).toLocaleString(getLocale(language))}
                {relativeIssuedAt && <span className="ml-1">({relativeIssuedAt})</span>}
              </p>
            </div>
          </div>
        </div>
        </li>
        );
      })}
      </ul>
      </>
    );
  }
}
