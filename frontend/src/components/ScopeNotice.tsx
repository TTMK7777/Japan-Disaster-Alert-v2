import { getTranslation } from '@/i18n/translations';
import { PREFECTURES } from '@/lib/prefectures';
import { resolveOfficialLink } from '@/lib/prefectureDisasterLinks';

/**
 * 「このアプリが扱う範囲」の帯と、公式情報へのボタン。
 *
 * このアプリは気象庁の情報の中継で、**市町村が出す避難指示・避難所の開設状況は扱わない**。
 * 以前はそれがどの言語でも画面に書かれておらず、免責もフッターの「参考情報です」だけだった。
 * 訪日客が「このアプリに出ていない＝避難指示は出ていない」と読むと命に関わるため、
 * 初回表示で見える位置（タブの中身より上・全タブ共通）に範囲を書き、公式情報へ 1 タップで行けるようにする。
 *
 * 文言は 16 言語とも translations.ts の `scope.*`。訳文の意味の範囲（避難指示と避難所の開設状況の両方が対象外。
 * 気象庁の発表自体が非公式という意味にしない）は .team の翻訳メモに従い、ここで言い換えない。
 */

interface OfficialInfoLinkProps {
  language: string;
  /** 気象庁の府県予報区コード（6 桁）。未選択・表に無いコードなら全国の旅行者向けページ */
  areaCode: string | null | undefined;
  className?: string;
}

/** 県の公式防災ページ（無ければ全国の旅行者向けページ）へのボタン。外部サイトなので新しいタブで開く */
export function OfficialInfoLink({ language, areaCode, className = '' }: OfficialInfoLinkProps) {
  const link = resolveOfficialLink(areaCode, language);
  let label: string;
  if (link.kind === 'prefecture') {
    const pref = PREFECTURES.find((p) => p.code.startsWith(link.pref));
    // 県名は警報タブのセレクタと同じ表記（日本語・やさしい日本語は漢字、それ以外はローマ字）
    const japanese = language === 'ja' || language === 'easy_ja';
    const name = japanese ? pref?.ja : pref?.en;
    const suffix = name ? (japanese ? `（${name}）` : ` (${name})`) : '';
    label = `${getTranslation(language, 'scope.prefectureLink')}${suffix}`;
  } else {
    label = getTranslation(language, 'scope.travelerLink');
  }

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      data-link-kind={link.kind}
      className={`flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border-2 border-disaster-blue dark:border-blue-400 bg-white dark:bg-gray-900 px-3 py-2 text-center text-sm font-semibold text-disaster-blue dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-disaster-blue focus:ring-offset-2 ${className}`}
    >
      <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
      {/* 外部サイトへ出ることを示す矢印 */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
        <path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7zm5 16H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7z" />
      </svg>
    </a>
  );
}

interface ScopeNoticeProps {
  language: string;
  /** 利用者が選んだ地域（URL の ?pref= か警報タブのセレクタ）。null なら全国の旅行者向けページを案内する */
  prefCode: string | null;
}

export default function ScopeNotice({ language, prefCode }: ScopeNoticeProps) {
  const t = (key: string) => getTranslation(language, key);
  return (
    <section
      id="scope-notice"
      data-testid="scope-notice"
      aria-labelledby="scope-notice-heading"
      className="mb-4 rounded-lg border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800 p-3 space-y-2 text-gray-800 dark:text-gray-100"
    >
      <h2 id="scope-notice-heading" className="flex items-center gap-2 text-sm font-bold">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
        </svg>
        <span className="min-w-0">{t('dataSource')}</span>
      </h2>
      <p className="text-sm leading-relaxed">{t('scope.jmaRelay')}</p>
      {/* 誤解されると命に関わる側なので太字で */}
      <p className="text-base font-semibold leading-relaxed">{t('scope.notCovered')}</p>
      <OfficialInfoLink language={language} areaCode={prefCode} />
    </section>
  );
}
