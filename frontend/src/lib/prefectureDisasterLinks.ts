/**
 * 都道府県の公式防災ページ（警報タブのボタンと「このアプリが扱う範囲」の帯のリンク先）。
 *
 * このアプリは気象庁の情報の中継で、**市町村が出す避難指示・避難所の開設状況は扱わない**。
 * その情報へ 1 タップで行けるよう、県の公式ページへの導線を置く。
 * 県のページは避難指示そのものを出す保証はない（市町村が出す）が、県内市町村の発表への入口になる。
 *
 * - キーは**気象庁の府県予報区コード（6 桁）**。警報タブの `?pref=` と同じ値。
 *   「1 都道府県 = 1 予報区」ではない（北海道 8・鹿児島 2・沖縄 4）ので、県ごとに予報区を列挙する。
 *   `offices` は backend の OFFICES_BY_PREFECTURE（app/services/area_names.py）と一致させる
 *   （ずれると lib/__tests__/prefectureDisasterLinks.test.ts が落ちる）
 * - 先頭 2 桁で県を推測しない。存在しない `460000` も「46」になってしまうため、表に無いコードは全国リンクに落とす
 * - 出典: 2026-10-21 の調査（各県サイトから公式ページを特定）。URL の到達性は
 *   `python scripts/verify_prefecture_links.py` で実測する。リンクを足したり直したりしたら必ず通すこと
 */

/** 全国の旅行者向け公式情報（観光庁監修 Safety tips の JNTO 案内ページ）。どの県にも当てはまらないとき */
export const NATIONAL_TRAVELER_URL = 'https://www.jnto.go.jp/safety-tips/eng/app.html';

export interface PrefectureDisasterLink {
  /** 都道府県コード（JIS X 0401 の 2 桁） */
  pref: string;
  /** この県に属する気象庁の府県予報区コード（6 桁） */
  offices: readonly string[];
  /** 県の公式防災ページ（日本語） */
  disasterUrl: string;
  /** 外国人向けの防災ページ。無い県は null（防災ページに落とす） */
  foreignUrl: string | null;
}

export const PREFECTURE_DISASTER_LINKS: readonly PrefectureDisasterLink[] = [
  {
    pref: '01', // 北海道
    offices: ['011000', '012000', '013000', '014030', '014100', '015000', '016000', '017000'],
    disasterUrl: 'https://www.pref.hokkaido.lg.jp/category/d007/c032/s116/',
    foreignUrl: 'https://www.pref.hokkaido.lg.jp/ss/tsk/tabunka/link.html',
  },
  {
    pref: '02', // 青森県
    offices: ['020000'],
    disasterUrl: 'https://bousai.pref.aomori.lg.jp/',
    foreignUrl: null,
  },
  {
    pref: '03', // 岩手県
    offices: ['030000'],
    disasterUrl: 'https://iwate-bousai.my.salesforce-sites.com/',
    foreignUrl: 'https://www.pref.iwate.jp/kyouikubunka/kokusai/tabunka/1033497/index.html',
  },
  {
    pref: '04', // 宮城県
    offices: ['040000'],
    disasterUrl: 'https://miyagi-bousai.my.salesforce-sites.com/',
    foreignUrl: 'https://www.pref.miyagi.jp/site/tabunka/bosai-handbook.html',
  },
  {
    pref: '05', // 秋田県
    offices: ['050000'],
    disasterUrl: 'https://www.bousai-akita.jp/',
    foreignUrl: null,
  },
  {
    pref: '06', // 山形県
    offices: ['060000'],
    disasterUrl: 'https://www.pref.yamagata.jp/020072/bosai/kochibou/index.html',
    foreignUrl: null,
  },
  {
    pref: '07', // 福島県
    offices: ['070000'],
    disasterUrl: 'https://www.pref.fukushima.lg.jp/site/bousai/index-2.html',
    foreignUrl: 'https://www.pref.fukushima.lg.jp/sec/16005e/kokusai-saigai.html',
  },
  {
    pref: '08', // 茨城県
    offices: ['080000'],
    disasterUrl: 'https://www.bousai.ibaraki.jp/',
    foreignUrl: 'https://www.bousai.ibaraki.jp/',
  },
  {
    pref: '09', // 栃木県
    offices: ['090000'],
    disasterUrl: 'https://www.pref.tochigi.lg.jp/kurashi/bousai/',
    foreignUrl: 'https://www.pref.tochigi.lg.jp/english/foreignlanguage.html',
  },
  {
    pref: '10', // 群馬県
    offices: ['100000'],
    disasterUrl: 'https://pref-gunma-bousai.my.salesforce-sites.com/',
    foreignUrl: 'https://www.pref.gunma.jp/site/tabunka/list164-875.html',
  },
  {
    pref: '11', // 埼玉県
    offices: ['110000'],
    disasterUrl: 'https://www.pref.saitama.lg.jp/theme/anzen/index.html',
    foreignUrl: 'https://www.pref.saitama.lg.jp/a0306/bousai-news-links.html',
  },
  {
    pref: '12', // 千葉県
    offices: ['120000'],
    disasterUrl: 'https://www.bousai.pref.chiba.lg.jp/',
    foreignUrl: 'https://www.pref.chiba.lg.jp/international/index.html',
  },
  {
    pref: '13', // 東京都
    offices: ['130000'],
    disasterUrl: 'https://www.bousai.metro.tokyo.lg.jp/',
    foreignUrl: 'https://www.bousai.metro.tokyo.lg.jp/sub/1005794.html',
  },
  {
    pref: '14', // 神奈川県
    offices: ['140000'],
    disasterUrl: 'https://www.bousai.pref.kanagawa.jp/',
    foreignUrl: 'https://www.pref.kanagawa.jp/docs/k2w/saigaiji-english.html',
  },
  {
    pref: '15', // 新潟県
    offices: ['150000'],
    disasterUrl: 'https://www.bousai.pref.niigata.jp/contents/index.html',
    foreignUrl: 'https://www.pref.niigata.lg.jp/sec/kikitaisaku/gaikokujin.html',
  },
  {
    pref: '16', // 富山県
    offices: ['160000'],
    disasterUrl: 'https://www.pref.toyama.jp/bousaianzen/index.html',
    foreignUrl: 'https://www.pref.toyama.jp/foreignlanguage.html',
  },
  {
    pref: '17', // 石川県
    offices: ['170000'],
    disasterUrl: 'https://www.pref.ishikawa.lg.jp/kurashi/anzen/bosai/index.html',
    foreignUrl: 'https://www.pref.ishikawa.lg.jp/foreign/index.html',
  },
  {
    pref: '18', // 福井県
    offices: ['180000'],
    disasterUrl: 'https://www.bousai.pref.fukui.lg.jp/dis_portal/index.html',
    foreignUrl: null,
  },
  {
    pref: '19', // 山梨県
    offices: ['190000'],
    disasterUrl: 'https://www.pref.yamanashi.jp/bosai/index.html',
    foreignUrl: 'https://www.pref.yamanashi.jp/kokusai-tabunka/info/saigai.html',
  },
  {
    pref: '20', // 長野県
    offices: ['200000'],
    disasterUrl: 'https://www.pref.nagano.lg.jp/bosaianzen/index.html',
    foreignUrl: 'https://www.pref.nagano.lg.jp/government/index.html',
  },
  {
    pref: '21', // 岐阜県
    offices: ['210000'],
    disasterUrl: 'https://www.pref.gifu.lg.jp/page/13241.html',
    foreignUrl: 'https://www.pref.gifu.lg.jp/page/356424.html',
  },
  {
    pref: '22', // 静岡県
    offices: ['220000'],
    disasterUrl: 'https://www.pref.shizuoka.jp/bosaikinkyu/index.html',
    foreignUrl: 'https://www.pref.shizuoka.jp/multilingual/index.html',
  },
  {
    pref: '23', // 愛知県
    offices: ['230000'],
    disasterUrl: 'https://www.pref.aichi.jp/site/aichisaigai-portal/',
    foreignUrl: 'https://www.pref.aichi.jp/site/aichisaigai-portal/',
  },
  {
    pref: '24', // 三重県
    offices: ['240000'],
    disasterUrl: 'https://www.pref.mie.lg.jp/s_bosai/bosai/index.htm',
    foreignUrl: 'https://www.pref.mie.lg.jp/TOPICS/m0011500307.htm',
  },
  {
    pref: '25', // 滋賀県
    offices: ['250000'],
    disasterUrl: 'https://dis-shiga.jp/',
    foreignUrl: 'https://dis-shiga.jp/',
  },
  {
    pref: '26', // 京都府
    offices: ['260000'],
    disasterUrl: 'https://www.bousai.pref.kyoto.lg.jp/',
    foreignUrl: 'https://www.pref.kyoto.jp/kokusai/10100030.html',
  },
  {
    pref: '27', // 大阪府
    offices: ['270000'],
    disasterUrl: 'https://www.osaka-bousai.net/',
    foreignUrl: 'https://www.pref.osaka.lg.jp/kokusai/tabunka/index.html',
  },
  {
    pref: '28', // 兵庫県
    offices: ['280000'],
    disasterUrl: 'https://www.bousai.pref.hyogo.lg.jp/dis_portal/',
    foreignUrl: 'https://web.pref.hyogo.lg.jp/kk40/pa20_000000001.html',
  },
  {
    pref: '29', // 奈良県
    offices: ['290000'],
    disasterUrl: 'https://www.bosai.pref.nara.jp/',
    foreignUrl: 'https://www.bosai.pref.nara.jp/dis_portal/?lang=en',
  },
  {
    pref: '30', // 和歌山県
    offices: ['300000'],
    disasterUrl: 'https://bousai-wakayama.jp/dis_portal/',
    foreignUrl: 'https://www.pref.wakayama.lg.jp/prefg/022300/d00208701.html',
  },
  {
    pref: '31', // 鳥取県
    offices: ['310000'],
    disasterUrl: 'https://www.pref.tottori.lg.jp/kikikanrihp/',
    foreignUrl: 'https://www.pref.tottori.lg.jp/281691.htm',
  },
  {
    pref: '32', // 島根県
    offices: ['320000'],
    disasterUrl: 'https://www.bousai-shimane.jp/',
    foreignUrl: 'https://www.pref.shimane.lg.jp/emergency/gaikokujinnsienn/',
  },
  {
    pref: '33', // 岡山県
    offices: ['330000'],
    disasterUrl: 'https://www.bousai.pref.okayama.jp/',
    foreignUrl: 'https://www.pref.okayama.jp/page/detail-31559.html',
  },
  {
    pref: '34', // 広島県
    offices: ['340000'],
    disasterUrl: 'https://www.bousai.pref.hiroshima.lg.jp/',
    foreignUrl: 'https://live-in-hiroshima.jp/disaster/',
  },
  {
    pref: '35', // 山口県
    offices: ['350000'],
    disasterUrl: 'https://www.bousai.pref.yamaguchi.lg.jp/',
    foreignUrl: 'https://www.pref.yamaguchi.lg.jp/soshiki/95/17523.html',
  },
  {
    pref: '36', // 徳島県
    offices: ['360000'],
    disasterUrl: 'https://www.pref.tokushima.lg.jp/anshin',
    foreignUrl: 'https://www.pref.tokushima.lg.jp/foreignlanguage',
  },
  {
    pref: '37', // 香川県
    offices: ['370000'],
    disasterUrl: 'https://www.bousai-kagawa.jp/dis_portal/',
    foreignUrl: 'https://www.pref.kagawa.lg.jp/kokusai/live_together/m_disaster/guidebook.html',
  },
  {
    pref: '38', // 愛媛県
    offices: ['380000'],
    disasterUrl: 'https://www.pref.ehime.jp/site/bousai/',
    foreignUrl: 'https://www.pref.ehime.jp/page/70379.html',
  },
  {
    pref: '39', // 高知県
    offices: ['390000'],
    disasterUrl: 'https://kochi-bousai.my.site.com/',
    foreignUrl: 'https://www.pref.kochi.lg.jp/doc/saigaisonae/',
  },
  {
    pref: '40', // 福岡県
    offices: ['400000'],
    disasterUrl: 'https://www.pref.fukuoka.lg.jp/life/1/1/3/',
    foreignUrl: 'https://www.pref.fukuoka.lg.jp/contents/bousaihandbook-36.html',
  },
  {
    pref: '41', // 佐賀県
    offices: ['410000'],
    disasterUrl: 'https://www.pref.saga.lg.jp/bousai/default.html',
    foreignUrl: null,
  },
  {
    pref: '42', // 長崎県
    offices: ['420000'],
    disasterUrl: 'https://www.bousai.pref.nagasaki.jp/',
    foreignUrl: 'https://www.pref.nagasaki.jp/bunrui/anzen-anshin/bosai-kokuminhogo/bosai/bousaigyosei/',
  },
  {
    pref: '43', // 熊本県
    offices: ['430000'],
    disasterUrl: 'https://portal.bousai.pref.kumamoto.jp/',
    foreignUrl: 'https://www.pref.kumamoto.jp/soshiki/222/273536.html',
  },
  {
    pref: '44', // 大分県
    offices: ['440000'],
    disasterUrl: 'https://www.pref.oita.jp/site/bosaiportal/',
    foreignUrl: 'https://www.pref.oita.jp/soshiki/13550/bousaigaikokuzinn.html',
  },
  {
    pref: '45', // 宮崎県
    offices: ['450000'],
    disasterUrl: 'https://www.pref.miyazaki.lg.jp/bosai/index.html',
    foreignUrl: 'https://www.pref.miyazaki.lg.jp/kokusai-keizaikoryu/kanko/koryu/englishi_index-02.html',
  },
  {
    pref: '46', // 鹿児島県
    offices: ['460040', '460100'],
    disasterUrl: 'https://www.pref.kagoshima.jp/bosai/saigai/bousaiportal.html',
    foreignUrl: 'https://www.pref.kagoshima.jp/ab12/tabunka_kyousei/saigai_link.html',
  },
  {
    pref: '47', // 沖縄県
    offices: ['471000', '472000', '473000', '474000'],
    disasterUrl: 'https://www.pref.okinawa.lg.jp/bosaianzen/bosai/index.html',
    foreignUrl: 'https://www.pref.okinawa.lg.jp/bosaianzen/bosai/1003555/1003560.html',
  },
];

export type OfficialLink =
  | { kind: 'prefecture'; pref: string; url: string }
  | { kind: 'national'; url: string };

/** 日本語のページをそのまま読める言語 */
const JAPANESE_READERS: ReadonlySet<string> = new Set(['ja', 'easy_ja']);

const BY_OFFICE: ReadonlyMap<string, PrefectureDisasterLink> = new Map(
  PREFECTURE_DISASTER_LINKS.flatMap((link) => link.offices.map((office) => [office, link] as const))
);

/**
 * 予報区コードと表示言語から、案内する公式ページを決める。
 *
 * 日本語・やさしい日本語なら県の防災ページ、それ以外は外国語ページを優先し、無ければ防災ページ。
 * 予報区が表に無い（未選択・存在しないコード）ときは全国の旅行者向けページ。
 */
export function resolveOfficialLink(areaCode: string | null | undefined, language: string): OfficialLink {
  const link = areaCode ? BY_OFFICE.get(areaCode) : undefined;
  if (!link) return { kind: 'national', url: NATIONAL_TRAVELER_URL };
  const url = JAPANESE_READERS.has(language) ? link.disasterUrl : link.foreignUrl ?? link.disasterUrl;
  return { kind: 'prefecture', pref: link.pref, url };
}
