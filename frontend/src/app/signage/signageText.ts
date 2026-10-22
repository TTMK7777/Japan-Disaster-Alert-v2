/**
 * ロビー・館内テレビ向けサイネージ（/signage）専用の文言。
 *
 * アプリ共通の辞書（src/i18n/translations.ts）にある文言（scope.* など）はそちらを
 * getTranslation で読む。ここにはサイネージにしか出ない文言だけを置く（/poster の
 * posterText.ts と同じ形。共通辞書を編集しない）。
 *
 * 対応言語はローテーションに使う 5 言語だけ。`?langs=` でこれ以外を指定しても無視する
 * （サイネージ固有の文言だけ英語に落ちて言語が混ざる表示を出さないため）。
 *
 * 書き方の約束:
 * - 取得できないときの文言は「無い」と読めないこと（「警報なし」と取り違えさせない）
 * - 気象警報・注意報は snapshot に入っていない。「表示していない」と書き、
 *   「出ていない」と読める表現を使わない
 * - `{time}` `{n}` `{level}` は呼び出し側で置き換える
 */

export const SIGNAGE_LANGUAGES = ['en', 'zh', 'zh-TW', 'ko', 'ja'] as const;
export type SignageLanguage = (typeof SIGNAGE_LANGUAGES)[number];

export interface SignageStrings {
  /** 見出しの後半（「東京都 の防災情報」の「の防災情報」側） */
  heading: string;
  /** 地域を指定していないときの地域名 */
  allJapan: string;
  /** 表示中の言語の名前（その言語自身で書く） */
  languageName: string;
  lastReceived: string;
  neverReceived: string;
  loading: string;
  /** 取得できない（「無い」とは書かない） */
  unavailable: string;
  unavailableDetail: string;
  /** 「最後に取得できた時刻: {time}」 */
  lastAvailableAt: string;
  /** 更新に失敗して前回の情報を出しているとき */
  staleNote: string;
  autoRotate: string;
  weatherNotShown: string;
  tsunamiTitle: string;
  tsunamiMajorWarning: string;
  tsunamiWarning: string;
  tsunamiAdvisory: string;
  tsunamiUnknown: string;
  tsunamiActionEvacuate: string;
  tsunamiActionAdvisory: string;
  tsunamiAreas: string;
  tsunamiNone: string;
  volcanoTitle: string;
  volcanoExtreme: string;
  volcanoLevel: string;
  volcanoOthers: string;
  volcanoNone: string;
  volcanoActionExtreme: string;
  quakeTitle: string;
  quakeEpicenterPending: string;
  quakeMaxIntensity: string;
  quakeNone: string;
  moreAlerts: string;
  qrCaption: string;
  source: string;
}

export const SIGNAGE_TEXT: Record<SignageLanguage, SignageStrings> = {
  en: {
    heading: 'Disaster information',
    allJapan: 'Japan',
    languageName: 'English',
    lastReceived: 'Last received',
    neverReceived: 'Not received yet',
    loading: 'Loading…',
    unavailable: 'Information unavailable',
    unavailableDetail: 'The latest information could not be received. This does not mean there is no warning.',
    lastAvailableAt: 'Last received: {time}',
    staleNote: 'Update failed. Showing information from {time}',
    autoRotate: 'Language changes every 15 seconds',
    weatherNotShown:
      'Weather warnings and advisories are not shown on this screen. Check the official Japan Meteorological Agency (JMA) website.',
    tsunamiTitle: 'Tsunami',
    tsunamiMajorWarning: 'Major Tsunami Warning',
    tsunamiWarning: 'Tsunami Warning',
    tsunamiAdvisory: 'Tsunami Advisory',
    tsunamiUnknown: 'Tsunami warning or advisory in effect',
    tsunamiActionEvacuate: 'Move to high ground now. Stay away from the coast and rivers.',
    tsunamiActionAdvisory: 'Get out of the water and leave the coast.',
    tsunamiAreas: '{n} coastal areas',
    tsunamiNone: 'No tsunami warnings or advisories in effect',
    volcanoTitle: 'Volcano',
    volcanoExtreme: 'Eruption Warning',
    volcanoLevel: 'Level {level}',
    volcanoOthers: 'Volcanic warnings in effect',
    volcanoNone: 'No volcanic warnings in effect',
    volcanoActionExtreme: 'Follow evacuation instructions from the municipality.',
    quakeTitle: 'Latest earthquake',
    quakeEpicenterPending: 'Epicenter under investigation',
    quakeMaxIntensity: 'Max. intensity',
    quakeNone: 'No recent earthquake data',
    moreAlerts: '+{n} more. Scan the QR code for details.',
    qrCaption: 'Scan for details in your language',
    source: 'Source: Japan Meteorological Agency (JMA) / P2PQuake',
  },
  zh: {
    heading: '防灾信息',
    allJapan: '日本全国',
    languageName: '简体中文',
    lastReceived: '最后接收',
    neverReceived: '尚未接收',
    loading: '正在加载…',
    unavailable: '无法获取信息',
    unavailableDetail: '无法接收最新信息。这并不表示没有警报。',
    lastAvailableAt: '最后获取时间：{time}',
    staleNote: '更新失败。正在显示 {time} 的信息',
    autoRotate: '每 15 秒切换语言',
    weatherNotShown: '本画面不显示气象警报和注意报。请查看日本气象厅官方网站。',
    tsunamiTitle: '海啸',
    tsunamiMajorWarning: '大海啸警报',
    tsunamiWarning: '海啸警报',
    tsunamiAdvisory: '海啸注意报',
    tsunamiUnknown: '海啸警报或注意报发布中',
    tsunamiActionEvacuate: '请立即前往高处。远离海岸和河流。',
    tsunamiActionAdvisory: '请离开水中，远离海岸。',
    tsunamiAreas: '{n} 个沿海区域',
    tsunamiNone: '目前没有发布海啸警报或注意报',
    volcanoTitle: '火山',
    volcanoExtreme: '喷发警报',
    volcanoLevel: '{level} 级',
    volcanoOthers: '发布中的火山警报',
    volcanoNone: '目前没有发布火山警报',
    volcanoActionExtreme: '请遵从市町村的避难指示。',
    quakeTitle: '最新地震',
    quakeEpicenterPending: '震源调查中',
    quakeMaxIntensity: '最大震度',
    quakeNone: '没有最近的地震数据',
    moreAlerts: '另有 {n} 条。详情请扫描二维码。',
    qrCaption: '扫码查看您的语言版本',
    source: '来源：日本气象厅 / P2P地震情报',
  },
  'zh-TW': {
    heading: '防災資訊',
    allJapan: '日本全國',
    languageName: '繁體中文',
    lastReceived: '最後接收',
    neverReceived: '尚未接收',
    loading: '載入中…',
    unavailable: '無法取得資訊',
    unavailableDetail: '無法接收最新資訊。這並不表示沒有警報。',
    lastAvailableAt: '最後取得時間：{time}',
    staleNote: '更新失敗。正在顯示 {time} 的資訊',
    autoRotate: '每 15 秒切換語言',
    weatherNotShown: '本畫面不顯示氣象警報與注意報。請查看日本氣象廳官方網站。',
    tsunamiTitle: '海嘯',
    tsunamiMajorWarning: '大海嘯警報',
    tsunamiWarning: '海嘯警報',
    tsunamiAdvisory: '海嘯注意報',
    tsunamiUnknown: '海嘯警報或注意報發布中',
    tsunamiActionEvacuate: '請立即前往高處。遠離海岸與河川。',
    tsunamiActionAdvisory: '請離開水中，遠離海岸。',
    tsunamiAreas: '{n} 個沿海區域',
    tsunamiNone: '目前沒有發布海嘯警報或注意報',
    volcanoTitle: '火山',
    volcanoExtreme: '噴發警報',
    volcanoLevel: '{level} 級',
    volcanoOthers: '發布中的火山警報',
    volcanoNone: '目前沒有發布火山警報',
    volcanoActionExtreme: '請遵從市町村的避難指示。',
    quakeTitle: '最新地震',
    quakeEpicenterPending: '震源調查中',
    quakeMaxIntensity: '最大震度',
    quakeNone: '沒有最近的地震資料',
    moreAlerts: '另有 {n} 則。詳情請掃描 QR 碼。',
    qrCaption: '掃描查看您的語言版本',
    source: '來源：日本氣象廳 / P2P地震情報',
  },
  ko: {
    heading: '방재 정보',
    allJapan: '일본 전국',
    languageName: '한국어',
    lastReceived: '마지막 수신',
    neverReceived: '아직 수신하지 못함',
    loading: '불러오는 중…',
    unavailable: '정보를 가져올 수 없습니다',
    unavailableDetail: '최신 정보를 받지 못했습니다. 경보가 없다는 뜻이 아닙니다.',
    lastAvailableAt: '마지막 수신 시각: {time}',
    staleNote: '업데이트 실패. {time}의 정보를 표시하고 있습니다',
    autoRotate: '15초마다 언어가 바뀝니다',
    weatherNotShown: '이 화면에는 기상 경보·주의보를 표시하지 않습니다. 일본 기상청 공식 사이트에서 확인하세요.',
    tsunamiTitle: '쓰나미',
    tsunamiMajorWarning: '대형 쓰나미 경보',
    tsunamiWarning: '쓰나미 경보',
    tsunamiAdvisory: '쓰나미 주의보',
    tsunamiUnknown: '쓰나미 경보 또는 주의보 발표 중',
    tsunamiActionEvacuate: '즉시 높은 곳으로 대피하세요. 해안과 강에서 멀리 떨어지세요.',
    tsunamiActionAdvisory: '물에서 나와 해안을 떠나세요.',
    tsunamiAreas: '연안 {n}개 구역',
    tsunamiNone: '현재 발표 중인 쓰나미 경보·주의보는 없습니다',
    volcanoTitle: '화산',
    volcanoExtreme: '분화 경보',
    volcanoLevel: '레벨 {level}',
    volcanoOthers: '발표 중인 화산 경보',
    volcanoNone: '현재 발표 중인 화산 경보는 없습니다',
    volcanoActionExtreme: '시정촌의 대피 지시에 따르세요.',
    quakeTitle: '최근 지진',
    quakeEpicenterPending: '진원 조사 중',
    quakeMaxIntensity: '최대 진도',
    quakeNone: '최근 지진 데이터가 없습니다',
    moreAlerts: '외 {n}건. 자세한 내용은 QR 코드를 스캔하세요.',
    qrCaption: '스캔하여 내 언어로 자세히 보기',
    source: '출처: 일본 기상청 / P2P지진정보',
  },
  ja: {
    heading: 'の防災情報',
    allJapan: '日本全国',
    languageName: '日本語',
    lastReceived: '最終受信',
    neverReceived: 'まだ受信していません',
    loading: '読み込み中…',
    unavailable: '情報を取得できません',
    unavailableDetail: '最新の情報を受信できていません。警報が出ていないという意味ではありません。',
    lastAvailableAt: '最後に取得できた時刻：{time}',
    staleNote: '更新に失敗しました。{time} 時点の情報を表示しています',
    autoRotate: '15 秒ごとに言語が切り替わります',
    weatherNotShown: '気象警報・注意報はこの画面では表示していません。公式（気象庁）で確認してください。',
    tsunamiTitle: '津波',
    tsunamiMajorWarning: '大津波警報',
    tsunamiWarning: '津波警報',
    tsunamiAdvisory: '津波注意報',
    tsunamiUnknown: '津波の警報・注意報が発表中',
    tsunamiActionEvacuate: 'ただちに高い所へ避難してください。海岸や川から離れてください。',
    tsunamiActionAdvisory: '海の中にいる人はすぐ上がって、海岸から離れてください。',
    tsunamiAreas: '沿岸 {n} 区域',
    tsunamiNone: '発表中の津波警報・注意報はありません',
    volcanoTitle: '火山',
    volcanoExtreme: '噴火警報',
    volcanoLevel: 'レベル{level}',
    volcanoOthers: '発表中の噴火警報',
    volcanoNone: '発表中の噴火警報はありません',
    volcanoActionExtreme: '市町村の避難指示に従ってください。',
    quakeTitle: '直近の地震',
    quakeEpicenterPending: '震源は調査中',
    quakeMaxIntensity: '最大震度',
    quakeNone: '直近の地震情報がありません',
    moreAlerts: 'ほか {n} 件。詳しくは QR コードから。',
    qrCaption: '読み取ると、あなたの言語で詳しく見られます',
    source: '出典：気象庁 / P2P地震情報',
  },
};

/** `{key}` を値で置き換える */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  );
}
