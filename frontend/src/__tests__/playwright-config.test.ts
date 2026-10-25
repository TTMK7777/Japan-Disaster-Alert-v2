import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('Playwright の実行契約', () => {
  it('CI は本番フロントと実バックエンドを起動し既存サーバーを流用しない', async () => {
    vi.stubEnv('CI', 'true');
    vi.resetModules();
    const { default: config } = await import('../../playwright.config');
    const servers = [config.webServer].flat();
    expect(servers).toHaveLength(2);
    expect(servers.some(s => s?.command.includes('npm run start'))).toBe(true);
    expect(servers.some(s => s?.command.includes('uvicorn app.main:app'))).toBe(true);
    expect(servers.every(s => s?.reuseExistingServer === false)).toBe(true);
    expect(config.use?.locale).toBe('ja-JP');
    expect(config.workers).toBe(2);
    expect(config.forbidOnly).toBe(true);
  });

  it('CI 以外も dev を使わず、バックエンド起動はローカル利用者に委ねる', async () => {
    vi.stubEnv('CI', '');
    vi.resetModules();
    const { default: config } = await import('../../playwright.config');
    const servers = [config.webServer].flat();
    expect(servers).toHaveLength(1);
    expect(servers[0]?.command).toContain('npm run start');
    expect(servers[0]?.command).not.toContain('npm run dev');
    expect(servers[0]?.reuseExistingServer).toBe(false);
  });

  it('ローカル Chrome 設定も同じ本番サーバーを使う', async () => {
    vi.stubEnv('CI', '');
    vi.resetModules();
    const { default: config } = await import('../../playwright.local-chrome.config');
    expect(config.use?.channel).toBe('chrome');
    expect(config.retries).toBe(0);
    expect([config.webServer].flat()[0]?.command).toContain('npm run start');
  });
});
