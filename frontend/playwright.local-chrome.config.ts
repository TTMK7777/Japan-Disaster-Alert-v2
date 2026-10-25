import { defineConfig } from '@playwright/test';
import config from './playwright.config';

// ダウンロード不要の導入済み Chrome。production 起動等の契約は共通設定を使う。
export default defineConfig({
  ...config,
  retries: 0,
  use: { ...config.use, channel: 'chrome' },
});
