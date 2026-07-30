/**
 * オフラインページ (public/offline.html) の検証
 *
 * このページは停電・低回線で Service Worker が返す最後の砦なので、
 * 本体の言語一覧からドリフトしていないこと・外部リソースに依存しないことを
 * ビルドの外側（静的ファイル）に対して直接検査する。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '@/i18n/translations';

const OFFLINE_HTML = readFileSync(
  join(process.cwd(), 'public', 'offline.html'),
  'utf-8'
);
const SW_JS = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf-8');
const OFFLINE_JS = readFileSync(
  join(process.cwd(), 'public', 'offline.js'),
  'utf-8'
);

/** offline.html の LANGUAGES 配列から code を抜き出す */
function offlineLanguageCodes(): string[] {
  const block = OFFLINE_JS.match(/var LANGUAGES = \[([\s\S]*?)\];/);
  expect(block, 'offline.js に LANGUAGES 配列が見つからない').not.toBeNull();
  return [...block![1].matchAll(/code:\s*'([^']+)'/g)].map((m) => m[1]);
}

/** 翻訳オブジェクト T のブロックを取り出す */
function translationBlock(): string {
  const block = OFFLINE_JS.match(/var T = \{([\s\S]*?)\n  \};/);
  expect(block, 'offline.js に翻訳オブジェクト T が見つからない').not.toBeNull();
  return block![1];
}

/** 翻訳オブジェクト T のキー（言語コード）を抜き出す */
function offlineTranslationKeys(): string[] {
  return [...translationBlock().matchAll(/^    '?([a-zA-Z_-]+)'?:\s*\{$/gm)].map((m) => m[1]);
}

describe('offline.html の言語カバレッジ', () => {
  it('本体の LANGUAGES と同じ言語コードを持つ', () => {
    expect(offlineLanguageCodes().sort()).toEqual(LANGUAGES.map((l) => l.code).sort());
  });

  it('言語ボタンと翻訳データの言語が一致する', () => {
    expect(offlineTranslationKeys().sort()).toEqual(offlineLanguageCodes().sort());
  });

  it('全言語に必要なフィールドが揃っている', () => {
    const required = [
      'title', 'message', 'retry', 'guide',
      'step1', 'step2', 'step3',
      'emergency', 'police', 'fire', 'coast', 'hotline',
    ];
    // 言語ごとのブロックに分割して各フィールドの存在を確認
    const perLang = translationBlock()
      .split(/\n    (?='?[a-zA-Z_-]+'?:\s*\{)/)
      .filter((s) => s.trim());
    expect(perLang.length).toBe(offlineLanguageCodes().length);
    for (const chunk of perLang) {
      const code = chunk.match(/^'?([a-zA-Z_-]+)'?:/)![1];
      for (const field of required) {
        expect(chunk, `${code} に ${field} が無い`).toContain(`${field}:`);
      }
    }
  });
});

describe('offline.html の行動ガイド', () => {
  it('3ステップの行動指示の要素がある', () => {
    for (const id of ['step1', 'step2', 'step3']) {
      expect(OFFLINE_HTML).toContain(`id="${id}"`);
    }
  });

  it('日本の緊急連絡先が数字で埋め込まれている', () => {
    // 通信不能でも読めるよう、番号は静的に置く
    for (const number of ['110', '119', '118', '050-3816-2787']) {
      expect(OFFLINE_HTML).toContain(number);
    }
  });

  it('単なるオフライン通知で終わっていない（行動指示の枠がある）', () => {
    expect(OFFLINE_HTML).toContain('id="guide-title"');
  });
});

describe('offline.html の自己完結性', () => {
  it('外部ホストのリソースを読み込まない', () => {
    // 停電・低回線が前提なので、外部への参照は1つも許さない
    const externalRefs = OFFLINE_HTML.match(/(?:src|href)\s*=\s*["']https?:\/\/[^"']+/gi);
    expect(externalRefs, `外部参照: ${externalRefs?.join(', ')}`).toBeNull();
  });

  it('外部フォントを読み込まない', () => {
    expect(OFFLINE_HTML).not.toMatch(/@import|fonts\.googleapis|fonts\.gstatic/);
  });

  it('ブラウザ言語からの自動判定を持つ', () => {
    expect(OFFLINE_JS).toContain('navigator.languages');
  });

  it('本体で選択した言語を尊重する', () => {
    expect(OFFLINE_JS).toContain('disaster-app-lang');
  });
});

describe('Service Worker のプリキャッシュ', () => {
  it('offline.html がプリキャッシュ対象に含まれている', () => {
    const staticAssets = SW_JS.match(/const STATIC_ASSETS = \[([\s\S]*?)\];/);
    expect(staticAssets).not.toBeNull();
    expect(staticAssets![1]).toContain('/offline.html');
  });

  it('HTML リクエストの失敗時に offline.html を返す', () => {
    expect(SW_JS).toContain('OFFLINE_URL');
    expect(SW_JS).toMatch(/text\/html/);
  });

  it('OFFLINE_URL が offline.html を指している', () => {
    expect(SW_JS).toMatch(/const OFFLINE_URL = ['"]\/offline\.html['"]/);
  });
});

describe('CSP との整合（2026-07-30 の実測で発覚した事故の再発防止）', () => {
  it('offline.html にインラインスクリプトを書かない', () => {
    /**
     * middleware.ts の CSP は `script-src 'self' 'nonce-...'` なので
     * インラインスクリプトはブロックされる。Service Worker がキャッシュから
     * 返すときもレスポンスヘッダごとキャッシュされるため、
     * オフライン時も同様にブロックされ、ページが機能しなくなる。
     */
    expect(OFFLINE_HTML).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/i);
  });

  it('同一オリジンの外部スクリプトとして読み込む', () => {
    expect(OFFLINE_HTML).toMatch(/<script\s+src="\/offline\.js"\s*><\/script>/);
  });

  it('offline.js がプリキャッシュ対象に含まれている', () => {
    const staticAssets = SW_JS.match(/const STATIC_ASSETS = \[([\s\S]*?)\];/)![1];
    expect(staticAssets).toContain('/offline.js');
  });

  it('JS が動かなくても英語の行動指示が読める', () => {
    // CSP やスクリプト読み込み失敗時のフォールバック
    for (const id of ['step1', 'step2', 'step3']) {
      const m = OFFLINE_HTML.match(new RegExp(`<li id="${id}"[^>]*>([^<]*)</li>`));
      expect(m, `${id} の要素が見つからない`).not.toBeNull();
      expect(m![1].trim().length, `${id} が空`).toBeGreaterThan(10);
    }
  });

  it('イベントハンドラ属性に依存しない（onclick を使わない）', () => {
    // CSP の script-src に 'unsafe-inline' が無いため onclick 属性も実行されない
    expect(OFFLINE_HTML).not.toMatch(/\son[a-z]+\s*=/i);
  });
});
