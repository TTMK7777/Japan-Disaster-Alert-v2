/**
 * /signage の表示ロジック（React に依存しない純関数）。
 *
 * データは静的スナップショット GET /api/v1/snapshot だけを使う（動的 API・SSE は叩かない。
 * max-instances=1 では災害時に落ちるため。docs/dev/touchpoints-2026.md §4）。
 * スキーマ: backend/app/snapshot_models.py / docs/dev/snapshot-schema.json
 *
 * いちばん大事な約束: **信用できないデータで「無い」と言わない。**
 * - dataset が error → 「取得できません」＋最後に取得できた時刻
 * - stale で items が空 → 同上（古い「なし」を出さない）
 * - stale で items がある → 出し続ける（発表中の警報を隠す方が危ない）＋前回時点の注記
 * - 取得から 15 分（バックエンドの SNAPSHOT_STALE_LIMIT_SECONDS）を過ぎたら、
 *   クライアント側で取り直せていなくても「取得できません」に落とす
 */
import { PREFECTURES } from '@/lib/prefectures';
import { resolveSiteUrl } from '@/lib/shareMetadata';
import { SIGNAGE_LANGUAGES, SIGNAGE_TEXT, type SignageLanguage } from './signageText';

export const SNAPSHOT_PATH = '/api/v1/snapshot';
/** 取り直す間隔。バックエンドの SNAPSHOT_MAX_AGE_SECONDS（60 秒）に合わせる */
export const POLL_INTERVAL_MS = 60_000;
/** 1 回の取得の上限 */
export const FETCH_TIMEOUT_MS = 20_000;
/** 言語を切り替える間隔 */
export const ROTATE_INTERVAL_MS = 15_000;
/** 取得成功からこれを過ぎたデータは出さない。バックエンドの SNAPSHOT_STALE_LIMIT_SECONDS（15 分）と同じ */
export const STALE_LIMIT_MS = 15 * 60_000;
/** 帯で出す警報の上限（超えた分は「ほか N 件」にまとめる。最上段固定の帯は上限に関係なく全部出す） */
export const MAX_ALERT_BANDS = 3;
export const LANGS_PARAM = 'langs';
export const DEFAULT_SIGNAGE_LANGS: readonly SignageLanguage[] = SIGNAGE_LANGUAGES;

const SUPPORTED_MAJOR_VERSION = '1';

// ---------------------------------------------------------------------------
// snapshot の解釈
// ---------------------------------------------------------------------------

export type DatasetName = 'earthquakes' | 'tsunami' | 'volcano_warnings';
export type DatasetStatus = 'ok' | 'stale' | 'error';
export type TsunamiLevel = 'major_warning' | 'warning' | 'advisory' | 'unknown';

export interface QuakeItem {
  id: string;
  occurredAt: number | null;
  locationJa: string | null;
  magnitude: number | null;
  maxIntensity: string | null;
}

export interface TsunamiItem {
  eventId: string;
  level: TsunamiLevel;
  areaCount: number;
  epicenterJa: string | null;
  epicenterEn: string | null;
  reportedAt: string | null;
}

export interface VolcanoItem {
  code: string;
  nameJa: string;
  nameEn: string | null;
  alertLevel: number | null;
  warningNameJa: string;
  severity: string;
}

export interface ParsedDataset<T> {
  status: DatasetStatus;
  fetchedAt: number | null;
  items: T[] | null;
}

export interface ParsedSnapshot {
  generatedAt: number;
  datasets: {
    earthquakes: ParsedDataset<QuakeItem>;
    tsunami: ParsedDataset<TsunamiItem>;
    volcano_warnings: ParsedDataset<VolcanoItem>;
  };
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function time(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

const TSUNAMI_LEVELS: ReadonlySet<string> = new Set(['major_warning', 'warning', 'advisory', 'unknown']);

function parseQuake(raw: unknown): QuakeItem | null {
  if (!isObj(raw)) return null;
  return {
    id: str(raw.id) ?? '',
    occurredAt: time(raw.occurred_at),
    locationJa: str(raw.location_ja),
    magnitude: num(raw.magnitude),
    maxIntensity: str(raw.max_intensity),
  };
}

function parseTsunami(raw: unknown): TsunamiItem | null {
  if (!isObj(raw)) return null;
  const level = typeof raw.warning_level === 'string' && TSUNAMI_LEVELS.has(raw.warning_level)
    ? (raw.warning_level as TsunamiLevel)
    : 'unknown'; // 知らない値でも発表中として出す（見落とさない側）
  return {
    eventId: str(raw.event_id) ?? '',
    level,
    areaCount: Array.isArray(raw.areas) ? raw.areas.length : 0,
    epicenterJa: str(raw.epicenter_ja),
    epicenterEn: str(raw.epicenter_en),
    reportedAt: str(raw.report_datetime),
  };
}

function parseVolcano(raw: unknown): VolcanoItem | null {
  if (!isObj(raw)) return null;
  const nameJa = str(raw.volcano_name_ja);
  if (nameJa === null) return null;
  return {
    code: str(raw.volcano_code) ?? nameJa,
    nameJa,
    nameEn: str(raw.volcano_name_en),
    alertLevel: num(raw.alert_level),
    warningNameJa: str(raw.warning_name_ja) ?? '',
    severity: str(raw.severity) ?? 'high',
  };
}

function parseDataset<T>(raw: unknown, parseItem: (v: unknown) => T | null): ParsedDataset<T> | null {
  if (!isObj(raw)) return null;
  const status = raw.status;
  if (status === 'error') return { status, fetchedAt: null, items: null };
  if (status !== 'ok' && status !== 'stale') return null;
  const fetchedAt = time(raw.fetched_at);
  if (fetchedAt === null || !Array.isArray(raw.items)) return null;
  const items: T[] = [];
  for (const item of raw.items) {
    const parsed = parseItem(item);
    // 1 件でも読めない item があれば、その dataset は信用しない（読めた分だけで「なし」に見せない）
    if (parsed === null) return { status: 'error', fetchedAt: null, items: null };
    items.push(parsed);
  }
  return { status, fetchedAt, items };
}

/** snapshot の JSON を読む。形が違えば null（＝取得失敗として扱う） */
export function parseSnapshot(raw: unknown): ParsedSnapshot | null {
  if (!isObj(raw) || !isObj(raw.datasets)) return null;
  if (typeof raw.schema_version !== 'string' || raw.schema_version.split('.')[0] !== SUPPORTED_MAJOR_VERSION) {
    return null;
  }
  const generatedAt = time(raw.generated_at);
  if (generatedAt === null) return null;
  const earthquakes = parseDataset(raw.datasets.earthquakes, parseQuake);
  const tsunami = parseDataset(raw.datasets.tsunami, parseTsunami);
  const volcano = parseDataset(raw.datasets.volcano_warnings, parseVolcano);
  if (!earthquakes || !tsunami || !volcano) return null;
  return { generatedAt, datasets: { earthquakes, tsunami, volcano_warnings: volcano } };
}

// ---------------------------------------------------------------------------
// 取得結果の記憶
// ---------------------------------------------------------------------------

export interface SnapshotMemory {
  snapshot: ParsedSnapshot | null;
  /** いま持っている版（generated_at）を最初に受け取ったクライアント時刻 */
  receivedAt: number | null;
  /** 直近の取得が成功したか。null = まだ 1 回も試していない */
  lastAttemptOk: boolean | null;
  /** dataset ごとの「最後に取得に成功した時刻」（error の版を受け取っても消さない） */
  lastKnownFetchedAt: Record<DatasetName, number | null>;
}

export const INITIAL_MEMORY: SnapshotMemory = {
  snapshot: null,
  receivedAt: null,
  lastAttemptOk: null,
  lastKnownFetchedAt: { earthquakes: null, tsunami: null, volcano_warnings: null },
};

export type FetchResult = { ok: true; snapshot: ParsedSnapshot } | { ok: false };

const DATASET_NAMES: readonly DatasetName[] = ['earthquakes', 'tsunami', 'volcano_warnings'];

export function applyFetchResult(memory: SnapshotMemory, result: FetchResult, now: number): SnapshotMemory {
  if (!result.ok) return { ...memory, lastAttemptOk: false };
  const incoming = result.snapshot;
  const current = memory.snapshot;
  if (current && incoming.generatedAt < current.generatedAt) {
    // Service Worker のキャッシュなどから古い版が返ってきた。新しい情報は得られていない
    return { ...memory, lastAttemptOk: false };
  }
  if (current && incoming.generatedAt === current.generatedAt) {
    // 同じ版（304 で返った等）。受信時刻は最初に受け取ったときのまま（古さを過小に見積もらない）
    return { ...memory, lastAttemptOk: true };
  }
  const lastKnownFetchedAt = { ...memory.lastKnownFetchedAt };
  for (const name of DATASET_NAMES) {
    const fetchedAt = incoming.datasets[name].fetchedAt;
    const known = lastKnownFetchedAt[name];
    if (fetchedAt !== null && (known === null || fetchedAt > known)) lastKnownFetchedAt[name] = fetchedAt;
  }
  return { snapshot: incoming, receivedAt: now, lastAttemptOk: true, lastKnownFetchedAt };
}

/**
 * snapshot を 1 回取る。失敗（通信・HTTP ステータス・JSON・形の不一致）はすべて { ok: false }。
 *
 * `cache: 'no-cache'` でブラウザに ETag の再検証（If-None-Match）をさせる。自前で
 * If-None-Match を付けると CORS のプリフライトが要るヘッダーになり、バックエンドの
 * allow_headers に無いので失敗する。
 */
export async function fetchSnapshot(url: string, signal: AbortSignal): Promise<FetchResult> {
  try {
    const response = await fetch(url, { cache: 'no-cache', signal });
    if (!response.ok) return { ok: false };
    const snapshot = parseSnapshot(await response.json());
    return snapshot ? { ok: true, snapshot } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/**
 * 画面に出す「最終受信」。dataset のいずれかを最後に取得できた時刻（包みの generated_at ではない。
 * 中身が全部 error でも包みは毎分届くので、generated_at を出すと新しく見えてしまう）
 */
export function lastReceivedAt(memory: SnapshotMemory): number | null {
  const times = DATASET_NAMES.flatMap((name) => {
    const t = memory.lastKnownFetchedAt[name];
    return t === null ? [] : [t];
  });
  return times.length > 0 ? Math.max(...times) : null;
}

export type DatasetView<T> =
  | { kind: 'loading' }
  | { kind: 'unavailable'; lastFetchedAt: number | null }
  | { kind: 'ok'; items: T[]; fetchedAt: number }
  | { kind: 'stale'; items: T[]; fetchedAt: number };

type ItemOf<N extends DatasetName> = ParsedSnapshot['datasets'][N] extends ParsedDataset<infer T> ? T : never;

/**
 * データの古さ。テレビの時計のずれに引きずられないよう 2 通りで測り、大きい方を使う。
 * - サーバー基準: 受信からの経過（クライアント時計の差分）＋受信時点でのサーバー上の古さ
 * - クライアント時計基準: いま − 取得時刻（SW のキャッシュから古い版が来た場合を捕まえる）
 */
function dataAgeMs(fetchedAt: number, generatedAt: number, receivedAt: number, now: number): number {
  const serverRelative = now - receivedAt + (generatedAt - fetchedAt);
  const clientClock = now - fetchedAt;
  return Math.max(serverRelative, clientClock);
}

export function datasetView<N extends DatasetName>(
  memory: SnapshotMemory,
  name: N,
  now: number
): DatasetView<ItemOf<N>> {
  const { snapshot, receivedAt } = memory;
  if (snapshot === null || receivedAt === null) {
    return memory.lastAttemptOk === null ? { kind: 'loading' } : { kind: 'unavailable', lastFetchedAt: null };
  }
  const unavailable = { kind: 'unavailable' as const, lastFetchedAt: memory.lastKnownFetchedAt[name] };
  const ds = snapshot.datasets[name] as ParsedDataset<ItemOf<N>>;
  if (ds.status === 'error' || ds.fetchedAt === null || ds.items === null) return unavailable;
  if (dataAgeMs(ds.fetchedAt, snapshot.generatedAt, receivedAt, now) > STALE_LIMIT_MS) return unavailable;
  const stale = ds.status === 'stale' || memory.lastAttemptOk === false;
  if (!stale) return { kind: 'ok', items: ds.items, fetchedAt: ds.fetchedAt };
  if (ds.items.length === 0) return { kind: 'unavailable', lastFetchedAt: ds.fetchedAt };
  return { kind: 'stale', items: ds.items, fetchedAt: ds.fetchedAt };
}

// ---------------------------------------------------------------------------
// 警報の帯
// ---------------------------------------------------------------------------

/** special = 特別警報級（紫）/ warning = 警報（赤）/ advisory = 注意報（黄） */
export type AlertTone = 'special' | 'warning' | 'advisory';

export type AlertBand =
  | { key: string; source: 'tsunami'; tone: AlertTone; pinned: boolean; item: TsunamiItem }
  | { key: string; source: 'volcano'; tone: AlertTone; pinned: boolean; item: VolcanoItem };

const TONE_RANK: Record<AlertTone, number> = { special: 0, warning: 1, advisory: 2 };
const SOURCE_RANK = { tsunami: 0, volcano: 1 } as const;

function tsunamiTone(level: TsunamiLevel): AlertTone {
  if (level === 'major_warning') return 'special';
  if (level === 'advisory') return 'advisory';
  return 'warning'; // warning と unknown（不明でも警報として出す）
}

/**
 * 帯で出す警報。津波は全段階、火山は特別警報級（severity=extreme）だけ。
 * 最上段に固定（pinned）するのは特別警報級と津波警報。
 */
export function buildAlertBands(tsunamiItems: readonly TsunamiItem[], volcanoItems: readonly VolcanoItem[]): AlertBand[] {
  const bands: AlertBand[] = [];
  tsunamiItems.forEach((item, i) => {
    const tone = tsunamiTone(item.level);
    bands.push({ key: `t-${item.eventId}-${i}`, source: 'tsunami', tone, pinned: tone !== 'advisory', item });
  });
  volcanoItems.forEach((item, i) => {
    if (item.severity !== 'extreme') return;
    bands.push({ key: `v-${item.code}-${i}`, source: 'volcano', tone: 'special', pinned: true, item });
  });
  return bands
    .map((band, index) => ({ band, index }))
    .sort(
      (a, b) =>
        TONE_RANK[a.band.tone] - TONE_RANK[b.band.tone] ||
        SOURCE_RANK[a.band.source] - SOURCE_RANK[b.band.source] ||
        a.index - b.index
    )
    .map(({ band }) => band);
}

/** 帯に出さない火山（特別警報級でないもの）。1 行の要約に出す */
export function otherVolcanoes(volcanoItems: readonly VolcanoItem[]): VolcanoItem[] {
  return volcanoItems.filter((item) => item.severity !== 'extreme');
}

/** 固定の帯は全部、それ以外は合計 maxBands 本まで。残りは件数だけ返す */
export function limitBands(
  bands: readonly AlertBand[],
  maxBands: number = MAX_ALERT_BANDS
): { shown: AlertBand[]; hiddenCount: number } {
  const pinned = bands.filter((b) => b.pinned);
  const rest = bands.filter((b) => !b.pinned);
  const room = Math.max(0, maxBands - pinned.length);
  return { shown: [...pinned, ...rest.slice(0, room)], hiddenCount: Math.max(0, rest.length - room) };
}

// ---------------------------------------------------------------------------
// 画面に収まらないときの詰め方
// ---------------------------------------------------------------------------

/** この本数以上の帯が出るときは、はじめから 2 段目の言語を省く */
export const DENSE_BAND_COUNT = 3;
/** 詰め方の段階の上限（段階ごとの中身は densityFlags） */
export const MAX_DENSITY = 7;

export interface DensityFlags {
  /** 帯の 2 段目の言語を出さない */
  hideSecondary: boolean;
  /** 帯を 1 列にする（行動の呼びかけを見出しの下に全幅で出す。狭い右列で何行にも折り返さない） */
  stacked: boolean;
  /** 警報の帯の補足（区域数・震源・時刻）を出さない。「取得できません」の時刻は消さない */
  hideDetail: boolean;
  /** limitBands に渡す本数（固定の帯はこれを超えても全部出る） */
  maxBands: number;
  /** 行動の呼びかけ・「警報が無いという意味ではない」を最初の 1 か所だけに出す */
  actionOnlyFirst: boolean;
  /** 地震の欄を出さない。「取得できません」の欄は消さない */
  hideQuake: boolean;
  hideHeading: boolean;
}

/**
 * 文字を小さくせずに収めるための段階。画面ではみ出しを測り、収まるまで 1 段ずつ上げる。
 * 省く順は「なくても判断を誤らないもの」から。警報の帯の見出し・取得できない旨・
 * 気象警報を扱わない旨・出典は最後まで消さない。
 */
export function densityFlags(level: number, bandCount: number): DensityFlags {
  return {
    hideSecondary: level >= 1 || bandCount >= DENSE_BAND_COUNT,
    stacked: level >= 2,
    hideDetail: level >= 3,
    maxBands: level >= 4 ? 0 : MAX_ALERT_BANDS,
    actionOnlyFirst: level >= 5,
    hideQuake: level >= 6,
    hideHeading: level >= 7,
  };
}

// ---------------------------------------------------------------------------
// URL・表示の小物
// ---------------------------------------------------------------------------

/** `?langs=en,zh,ko,ja` を読む。対応外・重複は捨て、何も残らなければ既定 */
export function parseLangsParam(search: string): SignageLanguage[] {
  const raw = new URLSearchParams(search).get(LANGS_PARAM);
  if (!raw) return [...DEFAULT_SIGNAGE_LANGS];
  const out: SignageLanguage[] = [];
  for (const part of raw.split(',')) {
    const wanted = part.trim().toLowerCase();
    const lang = SIGNAGE_LANGUAGES.find((l) => l.toLowerCase() === wanted);
    if (lang && !out.includes(lang)) out.push(lang);
  }
  return out.length > 0 ? out : [...DEFAULT_SIGNAGE_LANGS];
}

const JST_OFFSET_MS = 9 * 60 * 60_000;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** JST の「HH:MM JST」。`now` と JST の日付が違えば「M/D HH:MM JST」 */
export function formatJst(ms: number, now: number): string {
  const d = new Date(ms + JST_OFFSET_MS);
  const n = new Date(now + JST_OFFSET_MS);
  const hm = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} JST`;
  const sameDay =
    d.getUTCFullYear() === n.getUTCFullYear() && d.getUTCMonth() === n.getUTCMonth() && d.getUTCDate() === n.getUTCDate();
  return sameDay ? hm : `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${hm}`;
}

const INTENSITY_LATIN: Record<string, string> = { '5弱': '5-', '5強': '5+', '6弱': '6-', '6強': '6+' };

/** 震度の表記。日本語以外では 5弱 → 5- のように書く */
export function formatIntensity(value: string, lang: SignageLanguage): string {
  if (lang === 'ja') return value;
  return INTENSITY_LATIN[value] ?? value;
}

/** 漢字の地名がそのまま読める言語 */
const KANJI_LANGS: ReadonlySet<SignageLanguage> = new Set(['ja', 'zh', 'zh-TW']);

export function regionName(pref: string | null, lang: SignageLanguage): string {
  const p = pref === null ? undefined : PREFECTURES.find((x) => x.code === pref);
  if (!p) return SIGNAGE_TEXT[lang].allJapan;
  return KANJI_LANGS.has(lang) ? p.ja : p.en;
}

/** 漢字圏以外では英語名があれば英語名を使う */
export function volcanoName(item: VolcanoItem, lang: SignageLanguage): string {
  return KANJI_LANGS.has(lang) || !item.nameEn ? item.nameJa : item.nameEn;
}

export function tsunamiEpicenter(item: TsunamiItem, lang: SignageLanguage): string | null {
  return KANJI_LANGS.has(lang) ? item.epicenterJa ?? item.epicenterEn : item.epicenterEn ?? item.epicenterJa;
}

/** QR の origin。NEXT_PUBLIC_SITE_URL（http/https のみ）を優先し、無ければ開いているページの origin */
export function resolveSignageOrigin(siteUrlRaw: string | null | undefined, windowOrigin: string): string {
  return resolveSiteUrl(siteUrlRaw)?.origin ?? windowOrigin;
}

/** 言語ごとの焼き付き対策のずらし（px）。0〜3 を巡回 */
export function burnInOffset(rotationCount: number): number {
  return rotationCount % 4;
}
