'use client';

import { useEffect, useRef, useState } from 'react';
import { getTranslation } from '@/i18n/translations';
import { PREFECTURES, isPrefectureCode, prefectureDisplayName } from '@/lib/prefectures';
import { estimatePrefectureCode } from '@/lib/geoPrefecture';

/**
 * 「どこの情報を見ているか」を常に見せる帯と、地域の選択（B8）。
 *
 * - 地域が決まっていれば「{pref}の情報を表示中」＋「地域を変更」
 * - 未選択なら「地域を選んでください」と選択 UI を出す。**黙って東京などを表示しない**
 *   （以前は警報タブが東京を既定にしており、訪日客がどこの情報か分からないまま東京の警報を見ていた）
 *
 * ## 現在地から選ぶ
 *
 * `navigator.geolocation` の座標から**端末内だけで**都道府県を推定する（lib/geoPrefecture.ts）。
 * 座標はどこにも送らない（逆ジオコーダ API を使わない・保存もしない）。推定は県境で外れうるので、
 * 「この地域で合っていますか」と候補を出して利用者が確定する。
 * 拒否・タイムアウト・非対応・国外は、理由を出して手動選択に戻す。
 */

/** 位置の取得条件。都道府県が分かれば足りるので高精度（GPS 起動・電池消費）は求めない */
export const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 10 * 60 * 1000,
};

type GeoStatus = 'idle' | 'locating' | 'failed' | 'unknown';

interface RegionBarProps {
  language: string;
  prefCode: string | null;
  /** マウント後の地域の決定が済んだか。済む前は何も出さない（「選んでください」を一瞬出さない） */
  prefResolved: boolean;
  onSelect: (code: string) => void;
}

const buttonBase =
  'min-h-[44px] rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-disaster-blue focus:ring-offset-2';

export default function RegionBar({ language, prefCode, prefResolved, onSelect }: RegionBarProps) {
  const t = (key: string) => getTranslation(language, key);
  const [editing, setEditing] = useState(false);
  const [geo, setGeo] = useState<GeoStatus>('idle');
  const [candidate, setCandidate] = useState<string | null>(null);
  // 進行中の位置取得の世代。手動で選んだ後・アンマウント後に遅れて返った結果を捨てる
  const requestRef = useRef(0);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    const ref = requestRef;
    return () => {
      ref.current += 1;
    };
  }, []);

  if (!prefResolved) return null;

  const japanese = language === 'ja' || language === 'easy_ja';
  const showPicker = prefCode === null || editing;

  const choose = (code: string) => {
    if (!isPrefectureCode(code)) return;
    requestRef.current += 1;
    setCandidate(null);
    setGeo('idle');
    setEditing(false);
    onSelect(code);
  };

  const locate = () => {
    setCandidate(null);
    const geolocation = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
    if (!geolocation || typeof geolocation.getCurrentPosition !== 'function') {
      setGeo('failed');
      return;
    }
    const id = ++requestRef.current;
    setGeo('locating');
    try {
      geolocation.getCurrentPosition(
        (position) => {
          if (id !== requestRef.current) return;
          const code = estimatePrefectureCode(position.coords.latitude, position.coords.longitude);
          if (code) {
            setCandidate(code);
            setGeo('idle');
          } else {
            setGeo('unknown');
          }
        },
        () => {
          if (id !== requestRef.current) return;
          setGeo('failed');
        },
        GEOLOCATION_OPTIONS
      );
    } catch {
      setGeo('failed');
    }
  };

  if (!showPicker) {
    const name = prefectureDisplayName(prefCode, language) ?? '';
    return (
      <section
        id="region-bar"
        data-testid="region-bar"
        className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0 text-disaster-blue dark:text-blue-300">
          <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
        </svg>
        <p className="flex-1 min-w-0 font-bold [overflow-wrap:anywhere]">{t('region.showing').replace('{pref}', name)}</p>
        <button
          type="button"
          id="region-change"
          onClick={() => setEditing(true)}
          className={`${buttonBase} shrink-0 border-2 border-disaster-blue dark:border-blue-400 bg-white dark:bg-gray-900 text-disaster-blue dark:text-blue-300`}
        >
          {t('region.change')}
        </button>
      </section>
    );
  }

  const candidateName = prefectureDisplayName(candidate, language);
  return (
    <section
      id="region-picker"
      data-testid="region-picker"
      aria-labelledby="region-picker-heading"
      className="mb-4 space-y-3 rounded-lg border-2 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-gray-800 p-3 text-gray-900 dark:text-gray-100"
    >
      <h2 id="region-picker-heading" className="text-base font-bold">
        {prefCode === null ? t('region.choose') : t('region.change')}
      </h2>
      {prefCode === null && <p className="text-sm">{t('region.chooseHint')}</p>}

      <div className="space-y-1">
        <button
          type="button"
          id="region-locate"
          onClick={locate}
          disabled={geo === 'locating'}
          className={`${buttonBase} w-full bg-disaster-blue text-white hover:bg-blue-700 disabled:opacity-70`}
        >
          {geo === 'locating' ? t('region.locating') : t('region.useLocation')}
        </button>
        <p className="text-xs text-gray-700 dark:text-gray-300">{t('region.privacy')}</p>
      </div>

      <div aria-live="polite">
        {candidate !== null && candidateName !== null && (
          <div data-testid="region-candidate" className="space-y-2 rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-900 p-3">
            <p className="text-sm">{t('region.confirm')}</p>
            <p className="text-lg font-bold">{candidateName}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                id="region-confirm-yes"
                onClick={() => choose(candidate)}
                className={`${buttonBase} flex-1 bg-disaster-blue text-white hover:bg-blue-700`}
              >
                {t('region.confirmYes')}
              </button>
              <button
                type="button"
                id="region-confirm-no"
                onClick={() => {
                  setCandidate(null);
                  selectRef.current?.focus();
                }}
                className={`${buttonBase} flex-1 border-2 border-gray-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100`}
              >
                {t('region.confirmNo')}
              </button>
            </div>
          </div>
        )}
        {(geo === 'failed' || geo === 'unknown') && (
          <p data-testid="region-geo-error" className="text-sm font-semibold text-red-700 dark:text-red-300">
            {t(geo === 'failed' ? 'region.locationFailed' : 'region.locationUnknown')}
          </p>
        )}
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">{t('warning.selectArea')}</span>
        <select
          id="region-select"
          ref={selectRef}
          value={prefCode ?? ''}
          onChange={(e) => choose(e.target.value)}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
        >
          <option value="" disabled>
            {t('region.placeholder')}
          </option>
          {PREFECTURES.map((p) => (
            <option key={p.code} value={p.code}>
              {japanese ? p.ja : `${p.en} (${p.ja})`}
            </option>
          ))}
        </select>
      </label>

      {prefCode !== null && (
        <button
          type="button"
          id="region-close"
          onClick={() => {
            requestRef.current += 1;
            setCandidate(null);
            setGeo('idle');
            setEditing(false);
          }}
          className={`${buttonBase} w-full border border-gray-400 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100`}
        >
          {t('region.close')}
        </button>
      )}
    </section>
  );
}
