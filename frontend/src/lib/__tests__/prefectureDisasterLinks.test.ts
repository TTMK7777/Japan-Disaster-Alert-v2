import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '@/i18n/translations';
import { PREFECTURES } from '@/lib/prefectures';
import {
  NATIONAL_TRAVELER_URL,
  PREFECTURE_DISASTER_LINKS,
  resolveOfficialLink,
} from '@/lib/prefectureDisasterLinks';

/**
 * 都道府県の公式防災ページへの対応付け。
 *
 * 警報タブの地域は**気象庁の府県予報区コード（6 桁）**で、「1 都道府県 = 1 予報区」ではない
 * （北海道 8・鹿児島 2・沖縄 4。CLAUDE.md「気象庁 API の落とし穴」3）。
 * 予報区から県を引けないと、宮古島・八重山・奄美を選んだ人が全国リンクに落ちる。
 */

/** backend の OFFICES_BY_PREFECTURE（警報 API が実際に使う予報区の正本）を読む */
function backendOfficesByPrefecture(): Record<string, string[]> {
  const source = readFileSync(
    join(process.cwd(), '..', 'backend', 'app', 'services', 'area_names.py'),
    'utf-8'
  );
  const block = source.split('OFFICES_BY_PREFECTURE')[1];
  const result: Record<string, string[]> = {};
  for (const m of block.matchAll(/^\s+'(\d\d)': \(([^)]*)\),/gm)) {
    result[m[1]] = [...m[2].matchAll(/'(\d{6})'/g)].map((x) => x[1]);
  }
  return result;
}

const JAPANESE = new Set(['ja', 'easy_ja']);
const linkOf = (pref: string) => PREFECTURE_DISASTER_LINKS.find((l) => l.pref === pref)!;

describe('都道府県データ', () => {
  it('47 都道府県が 1 件ずつある', () => {
    const prefs = PREFECTURE_DISASTER_LINKS.map((l) => l.pref);
    expect(prefs).toHaveLength(47);
    expect(new Set(prefs).size).toBe(47);
  });

  it('予報区の割り当てが backend（警報 API の正本）と一致する — 58 予報区', () => {
    const backend = backendOfficesByPrefecture();
    expect(Object.keys(backend)).toHaveLength(47);
    const frontend = Object.fromEntries(
      PREFECTURE_DISASTER_LINKS.map((l) => [l.pref, [...l.offices]])
    );
    expect(frontend).toEqual(backend);
    expect(Object.values(frontend).flat()).toHaveLength(58);
  });

  it('リンクはすべて https（http は新しいタブで警告や遮断の対象になる）', () => {
    const urls = [
      NATIONAL_TRAVELER_URL,
      ...PREFECTURE_DISASTER_LINKS.flatMap((l) => [l.disasterUrl, l.foreignUrl ?? l.disasterUrl]),
    ];
    for (const url of urls) expect(url, url).toMatch(/^https:\/\/[^\s'"]+$/);
  });

  it('全国リンクは JNTO Safety tips', () => {
    expect(NATIONAL_TRAVELER_URL).toBe('https://www.jnto.go.jp/safety-tips/eng/app.html');
  });
});

describe('resolveOfficialLink — 警報タブの全地域から県のリンクが引ける', () => {
  it.each(PREFECTURES.map((p) => [p.code, p.ja]))('%s (%s) → その県', (code) => {
    const link = resolveOfficialLink(code, 'ja');
    expect(link.kind).toBe('prefecture');
    if (link.kind !== 'prefecture') return;
    expect(link.pref).toBe(code.slice(0, 2));
    expect(link.url).toBe(linkOf(code.slice(0, 2)).disasterUrl);
  });

  it('58 の予報区すべてが、その予報区の属する県に引ける', () => {
    const backend = backendOfficesByPrefecture();
    for (const [pref, offices] of Object.entries(backend)) {
      for (const office of offices) {
        const link = resolveOfficialLink(office, 'en');
        expect(link.kind, office).toBe('prefecture');
        if (link.kind === 'prefecture') expect(link.pref, office).toBe(pref);
      }
    }
  });

  it.each([
    ['011000', '01', '宗谷（北海道の北端）'],
    ['014100', '01', '釧路・根室'],
    ['460040', '46', '奄美'],
    ['472000', '47', '大東島'],
    ['474000', '47', '八重山'],
  ])('セレクタに無い予報区 %s も県に引ける (%s / %s)', (code, pref) => {
    const link = resolveOfficialLink(code, 'en');
    expect(link).toMatchObject({ kind: 'prefecture', pref });
  });
});

describe('resolveOfficialLink — 当てはまらない地域は全国の旅行者向けリンク', () => {
  it.each([
    ['460000', '存在しない鹿児島の旧コード（先頭 2 桁は県に一致する）'],
    ['999999', '存在しないコード'],
    ['13', '2 桁の県コード'],
    ['1300000', '7 桁（市町村）'],
    ['', '空文字'],
    [' 130000', '前後に空白'],
  ])('%s (%s)', (code) => {
    expect(resolveOfficialLink(code, 'en')).toEqual({ kind: 'national', url: NATIONAL_TRAVELER_URL });
  });

  it.each([[null], [undefined]])('%s → 全国', (code) => {
    expect(resolveOfficialLink(code, 'ja')).toEqual({ kind: 'national', url: NATIONAL_TRAVELER_URL });
  });

  it('全国リンクは言語によらず同じ', () => {
    for (const { code } of LANGUAGES) {
      expect(resolveOfficialLink(null, code).url).toBe(NATIONAL_TRAVELER_URL);
    }
  });
});

describe('resolveOfficialLink — 言語で日本語ページと外国語ページを選ぶ', () => {
  // 17 通り = 16 言語 + 未対応の言語コード（URL 等で紛れ込んだもの）
  const languages = [...LANGUAGES.map((l) => l.code), 'pt'];

  it('外国語ページがある県: 日本語・やさしい日本語は防災ページ、それ以外は外国語ページ', () => {
    const tokyo = linkOf('13');
    expect(tokyo.foreignUrl).not.toBeNull();
    expect(tokyo.foreignUrl).not.toBe(tokyo.disasterUrl);
    for (const lang of languages) {
      const expected = JAPANESE.has(lang) ? tokyo.disasterUrl : tokyo.foreignUrl;
      expect(resolveOfficialLink('130000', lang).url, lang).toBe(expected);
    }
  });

  it('外国語ページが無い県（null）: どの言語でも防災ページ', () => {
    const nullPrefs = PREFECTURE_DISASTER_LINKS.filter((l) => l.foreignUrl === null);
    expect(nullPrefs.length).toBeGreaterThan(0);
    for (const link of nullPrefs) {
      for (const lang of languages) {
        expect(resolveOfficialLink(link.offices[0], lang).url, `${link.pref} ${lang}`).toBe(link.disasterUrl);
      }
    }
  });

  it('複数予報区の県は、どの予報区からでも同じページ', () => {
    for (const lang of ['ja', 'en']) {
      const urls = new Set(linkOf('47').offices.map((o) => resolveOfficialLink(o, lang).url));
      expect(urls.size, lang).toBe(1);
    }
  });
});
