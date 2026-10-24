import { getTranslation } from '@/i18n/translations';
import { prefectureDisplayName } from '@/lib/prefectures';

interface SpecialWarningBandProps {
  language: string;
  /** 特別警報が出ている地域（選択中の地域）。表に無いコードなら出さない */
  prefCode: string;
  /** 「警報を見る」— アプリ内の警報タブへ移る（外部の公式ページではない） */
  onView: () => void;
  /**
   * 特別警報が出ているかを確認できていない（判定が無い地域で取れなかった）。
   * 特別警報の帯とは別の見た目・別の文言で出す（出ていると誤読させない）
   */
  unconfirmed?: boolean;
}

/**
 * 選択中の地域に特別警報が出ているときの帯。**どのタブを開いていても**画面上部（sticky の塊）に出す。
 *
 * 特別警報は「数十年に一度」の危険で、地震タブや避難所タブを見ている間に出ても気づけないと命に関わる。
 * 警報タブの一覧だけでは、そのタブを開かない限り見えない。
 *
 * 文言は訳文の `{pref}` に地域名を差し込む（日本語県名に文を連結しない）。React のテキストとして入れるので
 * HTML として解釈されない。
 */
export default function SpecialWarningBand({ language, prefCode, onView, unconfirmed = false }: SpecialWarningBandProps) {
  const name = prefectureDisplayName(prefCode, language);
  if (name === null) return null;
  if (unconfirmed) {
    return (
      <div
        id="special-warning-unconfirmed"
        data-testid="special-warning-unconfirmed"
        role="status"
        className="bg-amber-100 text-amber-950 border-b-4 border-amber-500"
      >
        <div className="max-w-4xl mx-auto flex flex-wrap items-center gap-2 px-3 py-2 md:px-4">
          <span aria-hidden="true" className="text-xl">❓</span>
          <p className="flex-1 min-w-0 font-bold leading-snug [overflow-wrap:anywhere]">
            {getTranslation(language, 'warning.specialUnconfirmed').replace('{pref}', name)}
          </p>
          <button
            type="button"
            id="special-warning-view"
            onClick={onView}
            className="min-h-[44px] shrink-0 rounded-lg bg-amber-900 px-3 py-2 text-sm font-bold text-white hover:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-900 focus:ring-offset-2 focus:ring-offset-amber-100"
          >
            {getTranslation(language, 'warning.view')}
          </button>
        </div>
      </div>
    );
  }
  const message = getTranslation(language, 'warning.specialBanner').replace('{pref}', name);
  return (
    <div
      id="special-warning-band"
      data-testid="special-warning-band"
      role="alert"
      className="bg-purple-900 text-white border-b-4 border-red-500"
    >
      <div className="max-w-4xl mx-auto flex flex-wrap items-center gap-2 px-3 py-2 md:px-4">
        <span aria-hidden="true" className="text-xl">⚠️</span>
        <p className="flex-1 min-w-0 font-bold leading-snug [overflow-wrap:anywhere]">{message}</p>
        <button
          type="button"
          id="special-warning-view"
          onClick={onView}
          className="min-h-[44px] shrink-0 rounded-lg bg-white px-3 py-2 text-sm font-bold text-purple-900 hover:bg-purple-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-purple-900"
        >
          {getTranslation(language, 'warning.view')}
        </button>
      </div>
    </div>
  );
}
