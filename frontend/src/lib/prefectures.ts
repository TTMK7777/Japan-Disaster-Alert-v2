/**
 * 警報タブの都道府県セレクタに並べる地域。
 *
 * `code` は気象庁の府県予報区コード（6 桁の文字列）。警報 API の `area_code` と
 * URL の `?pref=` はこの値をそのまま使う。**文字列のまま扱う**こと（北海道の
 * `016000` は数値にすると前ゼロが落ちて別の値になる）。
 */
export const PREFECTURES: { code: string; ja: string; en: string }[] = [
  { code: '016000', ja: '北海道', en: 'Hokkaido' },
  { code: '020000', ja: '青森県', en: 'Aomori' },
  { code: '030000', ja: '岩手県', en: 'Iwate' },
  { code: '040000', ja: '宮城県', en: 'Miyagi' },
  { code: '050000', ja: '秋田県', en: 'Akita' },
  { code: '060000', ja: '山形県', en: 'Yamagata' },
  { code: '070000', ja: '福島県', en: 'Fukushima' },
  { code: '080000', ja: '茨城県', en: 'Ibaraki' },
  { code: '090000', ja: '栃木県', en: 'Tochigi' },
  { code: '100000', ja: '群馬県', en: 'Gunma' },
  { code: '110000', ja: '埼玉県', en: 'Saitama' },
  { code: '120000', ja: '千葉県', en: 'Chiba' },
  { code: '130000', ja: '東京都', en: 'Tokyo' },
  { code: '140000', ja: '神奈川県', en: 'Kanagawa' },
  { code: '150000', ja: '新潟県', en: 'Niigata' },
  { code: '160000', ja: '富山県', en: 'Toyama' },
  { code: '170000', ja: '石川県', en: 'Ishikawa' },
  { code: '180000', ja: '福井県', en: 'Fukui' },
  { code: '190000', ja: '山梨県', en: 'Yamanashi' },
  { code: '200000', ja: '長野県', en: 'Nagano' },
  { code: '210000', ja: '岐阜県', en: 'Gifu' },
  { code: '220000', ja: '静岡県', en: 'Shizuoka' },
  { code: '230000', ja: '愛知県', en: 'Aichi' },
  { code: '240000', ja: '三重県', en: 'Mie' },
  { code: '250000', ja: '滋賀県', en: 'Shiga' },
  { code: '260000', ja: '京都府', en: 'Kyoto' },
  { code: '270000', ja: '大阪府', en: 'Osaka' },
  { code: '280000', ja: '兵庫県', en: 'Hyogo' },
  { code: '290000', ja: '奈良県', en: 'Nara' },
  { code: '300000', ja: '和歌山県', en: 'Wakayama' },
  { code: '310000', ja: '鳥取県', en: 'Tottori' },
  { code: '320000', ja: '島根県', en: 'Shimane' },
  { code: '330000', ja: '岡山県', en: 'Okayama' },
  { code: '340000', ja: '広島県', en: 'Hiroshima' },
  { code: '350000', ja: '山口県', en: 'Yamaguchi' },
  { code: '360000', ja: '徳島県', en: 'Tokushima' },
  { code: '370000', ja: '香川県', en: 'Kagawa' },
  { code: '380000', ja: '愛媛県', en: 'Ehime' },
  { code: '390000', ja: '高知県', en: 'Kochi' },
  { code: '400000', ja: '福岡県', en: 'Fukuoka' },
  { code: '410000', ja: '佐賀県', en: 'Saga' },
  { code: '420000', ja: '長崎県', en: 'Nagasaki' },
  { code: '430000', ja: '熊本県', en: 'Kumamoto' },
  { code: '440000', ja: '大分県', en: 'Oita' },
  { code: '450000', ja: '宮崎県', en: 'Miyazaki' },
  // 460000 は気象庁に存在しないコードで 404 になっていた（警報が常にゼロ件）。
  // 鹿児島県は「奄美地方」と「それ以外」に分かれており、460100 が本土側。
  { code: '460100', ja: '鹿児島県', en: 'Kagoshima' },
  { code: '471000', ja: '沖縄県', en: 'Okinawa' },
];

const PREFECTURE_CODES: ReadonlySet<string> = new Set(PREFECTURES.map((p) => p.code));

/** セレクタに存在する都道府県コードか（URL などの外部入力を通す許可リスト） */
export function isPrefectureCode(value: unknown): value is string {
  return typeof value === 'string' && PREFECTURE_CODES.has(value);
}

/**
 * 画面に出す地域名。警報タブのセレクタ・公式リンクと同じ表記規則
 * （日本語・やさしい日本語は漢字、それ以外は気象庁のローマ字表記）。
 * 訳文の `{pref}` に差し込んで使う（日本語県名に文を連結しない）。表に無いコードは null。
 */
export function prefectureDisplayName(code: string | null | undefined, language: string): string | null {
  const pref = PREFECTURES.find((p) => p.code === code);
  if (!pref) return null;
  return language === 'ja' || language === 'easy_ja' ? pref.ja : pref.en;
}
