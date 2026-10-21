import React from 'react';
import { getTranslation } from '@/i18n/translations';
import { formatLastSuccess, type FailureReason } from '@/lib/fetchFailure';

/**
 * 取得できなかったときの枠（B4a）。警報・地震・噴火警報・避難所で共通。
 *
 * 文言の置き方は .team/inbox/CDX/i18n-b4/README.md の条件に従う:
 * - 「取得できなかった」と「無いという意味ではない」は同じ枠に置く（後者だけを離さない）
 * - 緑・✅・「安全」と組み合わせない（色は琥珀、記号は ⚠）
 * - 「最後に取得できた時刻」は実際に取れた時刻だけ。初回で未取得なら出さない
 * - 「公式の情報を確認してください」は実際の公式導線（children）と並べる
 */
interface FetchFailureNoticeProps {
  language: string;
  /** 全体の失敗。partialAreas を渡すときは省略可 */
  reason?: FailureReason | null;
  /** 一部の地域だけ取れなかった（表示言語の地名） */
  partialAreas?: string[];
  /** この dataset を最後に取得できた時刻（ms）。未取得なら null */
  lastSuccessAt: number | null;
  onRetry?: () => void;
  /** 公式情報への導線（OfficialInfoLink や気象庁へのリンク） */
  children?: React.ReactNode;
  testId?: string;
  /** 見出し（「噴火警報」など、どの情報が取れなかったか） */
  heading?: string;
}

export default function FetchFailureNotice({
  language,
  reason = null,
  partialAreas = [],
  lastSuccessAt,
  onRetry,
  children,
  testId = 'fetch-failure',
  heading,
}: FetchFailureNoticeProps) {
  const t = (key: string) => getTranslation(language, key);
  const partial = !reason && partialAreas.length > 0;
  return (
    <div
      role="alert"
      data-testid={testId}
      data-reason={partial ? 'partial' : reason ?? undefined}
      className="rounded-lg border-2 border-amber-500 dark:border-amber-600 bg-amber-50 dark:bg-gray-800 p-4 space-y-2 text-gray-900 dark:text-gray-100"
    >
      <div className="flex items-start gap-2">
        <span className="text-xl shrink-0" aria-hidden="true">
          &#x26A0;&#xFE0F;
        </span>
        <div className="min-w-0 space-y-1">
          {heading && <p className="font-bold">{heading}</p>}
          {reason === 'timeout' && <p className="font-semibold">{t('status.timedOut')}</p>}
          {partial ? (
            <p className="font-semibold [overflow-wrap:anywhere]">
              {t('status.partialAreas').replace('{areas}', partialAreas.join(', '))}
            </p>
          ) : (
            <p className="font-semibold">{t('status.fetchFailed')}</p>
          )}
          <p className="font-semibold">{t('status.notMeaningNone')}</p>
          {lastSuccessAt !== null && (
            <p className="text-sm" data-testid={`${testId}-last-success`}>
              {t('status.lastSuccess').replace('{time}', formatLastSuccess(lastSuccessAt, language))}
            </p>
          )}
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-[44px] w-full rounded-lg bg-amber-700 px-4 py-2 font-semibold text-white hover:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
        >
          {t('status.retry')}
        </button>
      )}
      <p className="text-sm">{t('status.checkOfficial')}</p>
      {children}
    </div>
  );
}
