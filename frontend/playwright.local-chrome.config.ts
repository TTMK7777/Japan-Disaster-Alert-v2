import { defineConfig } from '@playwright/test';

/**
 * ローカル検証用。**Playwright の chromium を落とさず、既にインストール済みの
 * Google Chrome を使う**。
 *
 * `npx playwright install` が使えない環境（ブラウザのダウンロードを避けたい／
 * `npx` が使えない）でも E2E を実行できるようにするためのもの。
 * CI は既定の `playwright.config.ts` を使う。
 *
 *     node ./node_modules/@playwright/test/cli.js test --config playwright.local-chrome.config.ts
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3001',
    // **ロケールを固定する。** 初回訪問時はブラウザ言語から表示言語を推定するため
    // （src/i18n/detectLanguage.ts）、これが無いと実行環境の言語で UI の文字列が変わり、
    // 日本語の文言を探すテストが軒並み落ちる。実際に 28 件中 12 件が壊れていた。
    locale: 'ja-JP',
    channel: 'chrome',
    screenshot: 'only-on-failure',
  },
  webServer: {
    // **本番ビルドで動かす。** `npm run dev` だと middleware の CSP が
    // react-refresh の eval を弾いてクライアント React が動かず、
    // useEffect が一切実行されない（= fetch も走らない）。
    command: 'npm run start -- -p 3001',
    port: 3001,
    reuseExistingServer: false,
    timeout: 60000,
  },
});
