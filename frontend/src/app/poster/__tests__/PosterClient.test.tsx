import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { readFileSync } from 'fs';
import path from 'path';
import PosterClient from '../PosterClient';
import { metadata } from '../page';
import { QR_QUIET_ZONE } from '../QrCodeSvg';
import { decodeQrMatrix } from './qrDecode';
import { svgToMatrix } from './qrSvg';

function setUrl(pathAndQuery: string) {
  window.history.replaceState(null, '', pathAndQuery);
}

async function renderPoster() {
  render(<PosterClient />);
  const svg = (await screen.findByTestId('poster-qr')) as unknown as SVGSVGElement;
  return svg;
}

function qrText(): string {
  const svg = screen.getByTestId('poster-qr') as unknown as SVGSVGElement;
  return decodeQrMatrix(svgToMatrix(svg, QR_QUIET_ZONE)).text;
}

function shownUrl(): string {
  return screen.getByTestId('poster-qr-url').textContent ?? '';
}

function areaSelect(): HTMLSelectElement {
  const controls = document.querySelector('.poster-controls') as HTMLElement;
  return within(controls).getByRole('combobox') as HTMLSelectElement;
}

beforeEach(() => {
  setUrl('/poster');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PosterClient: QR の中身', () => {
  const origin = () => window.location.origin;

  it('?pref=260000 なら origin + /?pref=260000（言語なし）を QR に入れ、同じ URL を文字でも出す', async () => {
    setUrl('/poster?pref=260000');
    await renderPoster();
    expect(qrText()).toBe(`${origin()}/?pref=260000`);
    expect(shownUrl()).toBe(`${origin()}/?pref=260000`);
    expect(qrText()).not.toMatch(/lang=/);
    expect(areaSelect().value).toBe('260000');
  });

  it('pref 未指定なら / だけ（地域を固定しない）', async () => {
    await renderPoster();
    expect(qrText()).toBe(`${origin()}/`);
    expect(shownUrl()).toBe(`${origin()}/`);
    expect(areaSelect().value).toBe('');
  });

  it.each(['460000', 'abc', '%3Cscript%3E', ''])('無効な pref（%s）なら / だけ', async (raw) => {
    setUrl(`/poster?pref=${raw}`);
    await renderPoster();
    expect(qrText()).toBe(`${origin()}/`);
  });

  it('前後に空白のある pref は取り除いて使う', async () => {
    setUrl('/poster?pref=%20260000%20');
    await renderPoster();
    expect(qrText()).toBe(`${origin()}/?pref=260000`);
  });

  it('ページの URL に lang があっても QR には入れない', async () => {
    setUrl('/poster?lang=ko&pref=130000');
    await renderPoster();
    expect(qrText()).toBe(`${origin()}/?pref=130000`);
  });

  it('地域セレクタで選び直すと QR・表示 URL・ページの URL が変わる', async () => {
    setUrl('/poster?pref=260000');
    await renderPoster();

    fireEvent.change(areaSelect(), { target: { value: '016000' } });
    expect(qrText()).toBe(`${origin()}/?pref=016000`);
    expect(shownUrl()).toBe(`${origin()}/?pref=016000`);
    expect(window.location.search).toBe('?pref=016000');

    fireEvent.change(areaSelect(), { target: { value: '' } });
    expect(qrText()).toBe(`${origin()}/`);
    expect(window.location.search).toBe('');
  });
});

describe('PosterClient: 操作部', () => {
  it('「印刷する」で window.print を呼ぶ', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    await renderPoster();
    fireEvent.click(within(document.querySelector('.poster-controls') as HTMLElement).getByRole('button'));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('セレクタ・印刷ボタン・URL 表示は印刷されない領域（.poster-controls）にあり、ポスター本体には無い', async () => {
    await renderPoster();
    const controls = document.querySelector('.poster-controls') as HTMLElement;
    const sheet = document.querySelector('.poster-sheet') as HTMLElement;
    expect(controls).toContainElement(screen.getByRole('combobox'));
    expect(controls).toContainElement(screen.getByRole('button'));
    expect(controls).toContainElement(screen.getByTestId('poster-qr-url'));
    expect(sheet).toContainElement(screen.getByTestId('poster-qr') as unknown as HTMLElement);
    expect(controls.contains(sheet)).toBe(false);
  });
});

describe('PosterClient: 文言（英語＋やさしい日本語）', () => {
  it.each([
    'FOR HOTEL STAFF',
    'Help guests open local alerts',
    'Scan once. No install.',
    'Language selected automatically',
    'Staff checklist',
    'Place at reception.',
    'Show guests the QR.',
    'やどの スタッフへ',
    'この まちの じょうほうを あんない',
    'スタッフの やること',
    'フロントに おいて ください。',
    'おきゃくさまに QR を みせて ください。',
    // 下部の範囲明示: .team/inbox/CDX/i18n-b8 の scope.jmaRelay（改訂版）
    'This app relays warnings and information issued by the Japan Meteorological Agency. For evacuation, follow instructions from your local municipality.',
    'このアプリは、気象庁が出した警報や情報を伝えます。避難するときは、今いる市・町・村の指示に従ってください。',
    // .team/inbox/CDX/i18n の scope.notCovered
    'This app does not provide evacuation orders or information on whether evacuation shelters are open.',
    'この アプリでは、「にげて ください」という まちの しじや、ひなんじょに いま はいれるかは わかりません。',
  ])('ポスター本体に「%s」がある', async (text) => {
    await renderPoster();
    const sheet = document.querySelector('.poster-sheet') as HTMLElement;
    expect(within(sheet).getByText(text)).toBeInTheDocument();
  });

  it('英語の要素には lang="en"、やさしい日本語には lang="ja" を付ける（読み上げ用）', async () => {
    await renderPoster();
    expect(screen.getByText('Scan once. No install.').closest('[lang]')?.getAttribute('lang')).toBe('en');
    expect(screen.getByText('スタッフの やること').closest('[lang]')?.getAttribute('lang')).toBe('ja');
  });
});

describe('poster.css（印刷）', () => {
  const css = readFileSync(path.join(__dirname, '..', 'poster.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const compact = css.replace(/\s+/g, ' ');

  /** `@media print { ... }` の中身（入れ子の括弧を数えて取り出す） */
  function printBlock(): string {
    const start = compact.indexOf('@media print');
    expect(start).toBeGreaterThanOrEqual(0);
    let depth = 0;
    let i = compact.indexOf('{', start);
    const open = i;
    for (; i < compact.length; i++) {
      if (compact[i] === '{') depth++;
      if (compact[i] === '}' && --depth === 0) break;
    }
    return compact.slice(open + 1, i);
  }

  it('印刷時は操作部（.poster-controls）を display:none にする', () => {
    expect(printBlock()).toMatch(/\.poster-controls\s*\{[^}]*display:\s*none/);
  });

  it('A4 縦・余白つきで印刷する', () => {
    expect(compact).toMatch(/@page\s*\{[^}]*size:\s*A4 portrait/);
    expect(compact).toMatch(/@page\s*\{[^}]*margin:/);
  });
});

describe('poster/page.tsx の metadata', () => {
  it('検索エンジンに載せない（noindex）', () => {
    expect(metadata.robots).toMatchObject({ index: false });
  });
});

describe('PosterClient: B8（印字する URL・地域名・開けない URL の警告・公開 URL の優先）', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('QR と同じ URL をポスター本体にも文字で印字する', async () => {
    setUrl('/poster?pref=260000');
    await renderPoster();
    const sheet = document.querySelector('.poster-sheet') as HTMLElement;
    expect(within(sheet).getByTestId('poster-sheet-url').textContent).toBe(qrText());
  });

  it('地域名をポスター本体に出す（英語はローマ字・やさしい日本語は漢字）。未指定なら「スマホで選ぶ」', async () => {
    setUrl('/poster?pref=471000');
    await renderPoster();
    const area = screen.getByTestId('poster-area');
    expect(area).toHaveTextContent('Area: Okinawa');
    expect(area).toHaveTextContent('ちいき: 沖縄県');
    fireEvent.change(areaSelect(), { target: { value: '' } });
    expect(screen.getByTestId('poster-area')).toHaveTextContent('Area: choose on your phone');
  });

  it('origin が localhost（jsdom の既定）なら画面上に警告を出す。警告は印刷されない操作部の中', async () => {
    await renderPoster();
    expect(window.location.hostname).toBe('localhost');
    const warning = screen.getByTestId('poster-local-warning');
    expect(warning).toHaveTextContent('This URL cannot be opened from other devices.');
    expect(warning.closest('.poster-controls')).not.toBeNull();
    expect(warning.closest('.poster-sheet')).toBeNull();
  });

  it('NEXT_PUBLIC_SITE_URL があればそれで QR を作り、警告は出さない', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://alert.example.jp/');
    setUrl('/poster?pref=130000');
    await renderPoster();
    expect(qrText()).toBe('https://alert.example.jp/?pref=130000');
    expect(shownUrl()).toBe('https://alert.example.jp/?pref=130000');
    expect(screen.getByTestId('poster-sheet-url').textContent).toBe('https://alert.example.jp/?pref=130000');
    expect(screen.queryByTestId('poster-local-warning')).toBeNull();
  });

  it('NEXT_PUBLIC_SITE_URL 自体が私設 IP なら警告する（公開 URL の設定ミスに気づける）', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://192.168.0.10:3000');
    await renderPoster();
    expect(qrText()).toBe('http://192.168.0.10:3000/');
    expect(screen.getByTestId('poster-local-warning')).toBeInTheDocument();
  });
});
