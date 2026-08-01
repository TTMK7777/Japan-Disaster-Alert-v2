import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3001',
    // **ロケールを固定する。** 初回訪問時はブラウザ言語から表示言語を推定するため
    // （src/i18n/detectLanguage.ts）、これが無いと実行環境の言語で UI の文字列が変わり、
    // 日本語の文言を探すテストが軒並み落ちる。実際に 28 件中 12 件が壊れていた。
    locale: 'ja-JP',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    port: 3001,
    reuseExistingServer: true,
    timeout: 60000,
  },
});
