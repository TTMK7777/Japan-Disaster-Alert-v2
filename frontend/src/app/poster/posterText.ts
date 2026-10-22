/**
 * 宿のフロントに貼る QR ポスターの文言。**英語＋やさしい日本語のみ**（印刷物なので 1 枚に 2 言語）。
 *
 * 訪日客が開くアプリ本体は 16 言語だが、ポスターは「スタッフが貼る・客に QR を見せる」ための
 * 案内なので、ここだけは 2 言語で固定する（デザインの正: .team/inbox/CDX/mockups/poster-a.*）。
 *
 * 下部の範囲明示 2 文はアプリ本体と同じ文面を使う:
 * - jmaRelay   … .team/inbox/CDX/i18n-b8/translations.json の scope.jmaRelay（改訂版・肯定形）
 * - notCovered … .team/inbox/CDX/i18n/translations.json の scope.notCovered
 */

export interface BilingualText {
  en: string;
  easyJa: string;
}

export const POSTER_TEXT = {
  badge: { en: 'FOR HOTEL STAFF', easyJa: 'やどの スタッフへ' },
  headline: { en: 'Help guests open local alerts', easyJa: 'この まちの じょうほうを あんない' },
  scan: { en: 'Scan once. No install.', easyJa: 'よみとる だけ。アプリは いりません。' },
  language: { en: 'Language selected automatically', easyJa: 'ことばは じどうで えらばれます' },
  checklistTitle: { en: 'Staff checklist', easyJa: 'スタッフの やること' },
  checklist: [
    { en: 'Place at reception.', easyJa: 'フロントに おいて ください。' },
    { en: 'Show guests the QR.', easyJa: 'おきゃくさまに QR を みせて ください。' },
  ],
  jmaRelay: {
    en: 'This app relays warnings and information issued by the Japan Meteorological Agency. For evacuation, follow instructions from your local municipality.',
    easyJa: 'このアプリは、気象庁が出した警報や情報を伝えます。避難するときは、今いる市・町・村の指示に従ってください。',
  },
  notCovered: {
    en: 'This app does not provide evacuation orders or information on whether evacuation shelters are open.',
    easyJa: 'この アプリでは、「にげて ください」という まちの しじや、ひなんじょに いま はいれるかは わかりません。',
  },
  qrLabel: { en: 'QR code to open local disaster alerts', easyJa: 'さいがい じょうほうを ひらく QR' },
  // QR の下に印字する。QR が読めない端末でも URL を打てるように
  urlLabel: { en: 'Or open', easyJa: 'または この URL を ひらく' },
  // 地域。{pref} にはセレクタと同じ表記（英語はローマ字・やさしい日本語は漢字）を入れる
  area: { en: 'Area: {pref}', easyJa: 'ちいき: {pref}' },
  areaChoose: { en: 'Area: choose on your phone', easyJa: 'ちいき: スマホで えらんで ください' },
} satisfies Record<string, BilingualText | BilingualText[]>;

/** 画面上部の操作部（印刷されない）。スタッフ向け */
export const POSTER_CONTROLS_TEXT = {
  heading: { en: 'QR poster for hotel staff', easyJa: 'やどの スタッフ むけ QR ポスター' },
  note: { en: 'This panel is not printed.', easyJa: 'この ぶぶんは いんさつ されません。' },
  area: { en: 'Area', easyJa: 'ちいき' },
  noArea: { en: 'No fixed area (all Japan)', easyJa: 'ちいきを きめない' },
  url: { en: 'QR link', easyJa: 'QR の なかみ' },
  print: { en: 'Print', easyJa: 'いんさつ する' },
  preparing: { en: 'Preparing QR…', easyJa: 'じゅんび ちゅう' },
  // origin が localhost・私設 IP のとき（画面だけ。印刷されない）
  localOnly: { en: 'This URL cannot be opened from other devices.', easyJa: 'この URL は ほかの たんまつ から ひらけません。' },
  localOnlyHint: {
    en: 'Open this page from the public URL (or build with NEXT_PUBLIC_SITE_URL) before printing.',
    easyJa: 'こうかい されている URL で この ページを ひらいてから いんさつ して ください。',
  },
} satisfies Record<string, BilingualText>;
