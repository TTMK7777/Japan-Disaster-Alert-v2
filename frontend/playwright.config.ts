import { defineConfig } from '@playwright/test';
import path from 'node:path';

const inCI = Boolean(process.env.CI);
const frontendServer = {
  // CSP が dev の react-refresh を拒否するため、本番ビルドで検証する。
  command: 'npm run start -- --hostname 127.0.0.1 --port 3001',
  url: 'http://localhost:3001',
  reuseExistingServer: false,
  timeout: 60_000,
};

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  globalTimeout: 10 * 60 * 1000,
  forbidOnly: inCI,
  workers: inCI ? 2 : undefined,
  retries: inCI ? 1 : 0,
  use: {
    baseURL: frontendServer.url,
    locale: 'ja-JP',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  // CI では交通リンクの実 API テストも省略せず、専用バックエンドを管理する。
  // ローカルでは別ターミナルで backend を起動してから実行する。
  webServer: inCI ? [
    {
      command: 'python -m uvicorn app.main:app --host 127.0.0.1 --port 8000',
      cwd: path.resolve(__dirname, '../backend'),
      url: 'http://localhost:8000/api/v1/transit-links?lang=en',
      reuseExistingServer: false,
      timeout: 60_000,
      env: { ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '' },
    },
    frontendServer,
  ] : frontendServer,
});
