/**
 * 緊急連絡先: 本体（EmergencyContacts）とオフライン画面（public/offline.html / offline.js）の一致（B11）
 *
 * offline.html は静的ファイルで正本（src/lib/emergencyContacts.ts）を import できず、番号・URL を直書きしている。
 * 本体だけ・オフラインだけを直すと、電波の無いときにだけ古い番号が出る（気づく人がいない）。
 * ここでは「本体の描画結果 = 正本 = offline.html」を両側から固定する。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import EmergencyContacts, { contactsData } from '@/components/EmergencyContacts';
import { EMERGENCY_PHONE_NUMBERS, LINK_ORDER, emergencyLinkUrl } from '@/lib/emergencyContacts';
import { LANGUAGES, translations } from '@/i18n/translations';

const OFFLINE_HTML = readFileSync(join(process.cwd(), 'public', 'offline.html'), 'utf-8');
const OFFLINE_JS = readFileSync(join(process.cwd(), 'public', 'offline.js'), 'utf-8');
const SW_JS = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf-8');

const SOURCE_NUMBERS = Object.values(EMERGENCY_PHONE_NUMBERS).slice().sort();
/** 表示言語ごとの公式 URL の集合（医療機関検索だけ言語別） */
const sourceUrls = (code: string) => LINK_ORDER.map((id) => emergencyLinkUrl(id, code)).sort();
const JNTO = 'https://www.jnto.go.jp/emergency';

/** offline.js の T のフィールド名 → translations.ts のキー */
const OFFLINE_FIELD_KEYS: Record<string, string> = {
  fire: 'emergency.fire.name',
  fireDesc: 'emergency.fire.description',
  hotlineDesc: 'emergency.visitorHotline.description',
  message171Note: 'emergency.message171.note',
  web171: 'emergency.web171.name',
  web171Desc: 'emergency.web171.description',
  medicalSearch: 'emergency.medicalSearch.name',
  medicalSearchDesc: 'emergency.medicalSearch.description',
  consultation7119: 'emergency.consultation7119.name',
  consultation7119Desc: 'emergency.consultation7119.description',
  consultation7119Note: 'emergency.consultation7119.note',
  embassy: 'emergency.embassy.name',
  embassyDesc: 'emergency.embassy.description',
  onlineOnly: 'emergency.onlineOnly',
};

/** offline.html の要素 id → offline.js の T のフィールド名 */
const OFFLINE_ELEMENT_FIELDS: Record<string, string> = {
  'label-fire': 'fire',
  'desc-fire': 'fireDesc',
  'desc-hotline': 'hotlineDesc',
  'label-message171': 'message171',
  'note-message171': 'message171Note',
  'label-web171': 'web171',
  'desc-web171': 'web171Desc',
  'label-medicalSearch': 'medicalSearch',
  'desc-medicalSearch': 'medicalSearchDesc',
  'label-consultation7119': 'consultation7119',
  'desc-consultation7119': 'consultation7119Desc',
  'note-consultation7119': 'consultation7119Note',
  'label-embassy': 'embassy',
  'desc-embassy': 'embassyDesc',
  'links-online-only': 'onlineOnly',
};

function message171Name(code: string): string {
  const c = contactsData[code].sections.flatMap((s) => s.contacts).find((x) => x.id === 'message171');
  expect(c?.name, `${code} の 171 の名前`).toBeTruthy();
  return c!.name!;
}

/** 本体の 1 言語分の期待値（offline.js の T のフィールド名 → 文字列） */
function expectedOfflineFields(code: string): Record<string, string> {
  const out: Record<string, string> = { message171: message171Name(code) };
  for (const [field, key] of Object.entries(OFFLINE_FIELD_KEYS)) {
    const v = translations[code]?.[key];
    expect(v, `translations.ts の ${code} に ${key} が無い`).toBeTruthy();
    out[field] = v;
  }
  return out;
}

function offlineChunks(): Record<string, string> {
  const block = OFFLINE_JS.match(/var T = \{([\s\S]*?)\n {2}\};/);
  expect(block).not.toBeNull();
  const perLang = block![1].split(/\n {4}(?='?[a-zA-Z_-]+'?:\s*\{)/).filter((s) => s.trim());
  return Object.fromEntries(perLang.map((c) => [c.match(/^'?([a-zA-Z_-]+)'?:/)![1], c]));
}

/** offline.html を jsdom に流し込み、offline.js を実際に実行する（CSP と同じく外部ファイルとして） */
function bootOfflinePage(storedLang?: string) {
  // 自前の静的ファイルを DOMParser で読む（script 要素は実行されない。offline.js は下で明示的に実行）
  const parsed = new DOMParser().parseFromString(OFFLINE_HTML, 'text/html');
  parsed.querySelectorAll('script').forEach((el) => el.remove());
  document.body.replaceChildren(...Array.from(parsed.body.childNodes).map((n) => document.importNode(n, true)));
  localStorage.clear();
  if (storedLang) localStorage.setItem('disaster-app-lang', storedLang);
  new Function(OFFLINE_JS)();
}

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  localStorage.clear();
});

describe('電話番号: 本体 = 正本 = offline.html', () => {
  it.each(LANGUAGES.map((l) => [l.code]))('%s: 本体の tel: リンクの番号の集合が正本と一致する', (code) => {
    const { container } = render(createElement(EmergencyContacts, { language: code }));
    const hrefs = [...container.querySelectorAll('a[href^="tel:"]')].map((a) => a.getAttribute('href')!.slice(4));
    expect(hrefs.slice().sort()).toEqual(SOURCE_NUMBERS);
  });

  it('offline.html の tel: リンクの番号の集合が正本と一致し、表示の数字とリンク先が同じ', () => {
    const links = [...OFFLINE_HTML.matchAll(/<a\b[^>]*href="tel:([^"]+)"[^>]*>([^<]*)<\/a>/g)];
    expect(links.map((m) => m[1]).sort()).toEqual(SOURCE_NUMBERS);
    for (const m of links) expect(m[2].trim(), `tel:${m[1]} の表示`).toBe(m[1]);
  });

  it('#7119 は発信ボタンにしない（実施地域・受付時間が地域ごとに違う）', () => {
    const { container } = render(createElement(EmergencyContacts, { language: 'ja' }));
    expect(container.querySelector('a[href*="7119"][href^="tel:"]')).toBeNull();
    expect(OFFLINE_HTML).not.toMatch(/href="tel:[^"]*7119/);
  });
});

describe('公式 URL: 本体 = 正本 = offline.html', () => {
  it.each(LANGUAGES.map((l) => [l.code]))('%s: 本体の外部リンクの集合が正本と一致し、新しいタブ＋noopener noreferrer', (code) => {
    const { container } = render(createElement(EmergencyContacts, { language: code }));
    const anchors = [...container.querySelectorAll('a[href^="http"]')];
    expect(anchors.map((a) => a.getAttribute('href')).sort()).toEqual(sourceUrls(code));
    for (const a of anchors) {
      expect(a.getAttribute('target')).toBe('_blank');
      const rel = (a.getAttribute('rel') ?? '').split(/\s+/);
      expect(rel).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
    }
  });

  it('offline.html は URL を文字で載せる（リンクにしない）。JS 無しの静的文は英語版の集合と一致する', () => {
    const urls = [...OFFLINE_HTML.matchAll(/<span class="url"[^>]*>([^<]+)<\/span>/g)].map((m) => m[1].trim());
    expect(urls.sort()).toEqual(sourceUrls('en'));
  });

  it.each([
    ['ja', `${JNTO}/jpn/mi_guide.html`],
    ['easy_ja', `${JNTO}/jpn/mi_guide.html`],
    ['zh', `${JNTO}/chs/mi_guide.html`],
    ['zh-TW', `${JNTO}/chc/mi_guide.html`],
    ['ko', `${JNTO}/kor/mi_guide.html`],
    ['en', `${JNTO}/eng/mi_guide.html`],
    ['th', `${JNTO}/eng/mi_guide.html`],
    ['es', `${JNTO}/eng/mi_guide.html`],
    ['xx', `${JNTO}/eng/mi_guide.html`],
  ])('JNTO 医療機関検索は表示言語の版へ: %s', (code, url) => {
    expect(emergencyLinkUrl('medicalSearch', code)).toBe(url);
  });

  it.each(LANGUAGES.map((l) => [l.code]))('%s: offline.js の医療機関検索 URL が本体と同じ', (code) => {
    const chunk = offlineChunks()[code];
    expect(chunk).toContain(`medicalSearchUrl: ${JSON.stringify(emergencyLinkUrl('medicalSearch', code))}`);
  });
});

describe('名前・説明: 本体 = offline.js（16 言語）', () => {
  it.each(LANGUAGES.map((l) => [l.code]))('%s: offline.js に本体と同じ文が入っている', (code) => {
    const chunk = offlineChunks()[code];
    expect(chunk, `${code} のブロックが無い`).toBeDefined();
    for (const [field, value] of Object.entries(expectedOfflineFields(code))) {
      expect(chunk, `${code} の ${field}`).toContain(`${field}: ${JSON.stringify(value)}`);
    }
  });

  it.each(LANGUAGES.map((l) => [l.code]))('%s: 本体の緊急連絡タブに同じ名前・説明が出る', (code) => {
    const { container } = render(createElement(EmergencyContacts, { language: code }));
    const text = container.textContent ?? '';
    for (const [field, value] of Object.entries(expectedOfflineFields(code))) {
      if (field === 'onlineOnly') continue; // オフライン画面だけの文
      expect(text, `${code} の ${field}`).toContain(value);
    }
  });

  it('JS が動かなくても英語で読める（offline.html の静的文 = 本体の en）', () => {
    const en = expectedOfflineFields('en');
    for (const [id, field] of Object.entries(OFFLINE_ELEMENT_FIELDS)) {
      const m = OFFLINE_HTML.match(new RegExp(`id="${id}"[^>]*>([^<]*)<`));
      expect(m, `${id} の要素が見つからない`).not.toBeNull();
      const decoded = m![1].replace(/&amp;/g, '&').trim();
      expect(decoded, id).toBe(en[field]);
    }
  });

  it.each([['th'], ['easy_ja'], ['ja'], ['zh-TW']])('%s: offline.js を実行すると全要素が差し替わる', (code) => {
    bootOfflinePage(code);
    const expected = expectedOfflineFields(code);
    for (const [id, field] of Object.entries(OFFLINE_ELEMENT_FIELDS)) {
      expect(document.getElementById(id)?.textContent, id).toBe(expected[field]);
    }
    expect(document.getElementById('url-medicalSearch')?.textContent).toBe(emergencyLinkUrl('medicalSearch', code));
  });
});

describe('Service Worker', () => {
  it('オフライン画面を変えたのでキャッシュ名を v7 以上に上げてある', () => {
    const match = SW_JS.match(/const CACHE_NAME = 'disaster-alert-v(\d+)'/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(7);
  });
});
