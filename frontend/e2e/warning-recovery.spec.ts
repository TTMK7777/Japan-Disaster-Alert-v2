import { test, expect } from '@playwright/test';

// 本番 React で WarningBanner → page → useSpecialWarning の配線を検証する。
// 外部 API の稼働状態には依存せず、警報 API の応答だけを制御する。
// SW の fetch は page.route の対象外。通信を制御するこのテストだけ登録を止める。
test.use({ serviceWorkers: 'block' });
test('警報タブの取得失敗を上部帯に反映し、再取得成功で未確認を解消する', async ({ page }) => {
  let fail = false;
  let alertRequests = 0;
  await page.route('**/api/v1/alerts?**', async (route) => {
    alertRequests += 1;
    await route.fulfill({
      status: fail ? 503 : 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: fail ? JSON.stringify({ detail: 'temporarily unavailable' }) : '[]',
    });
  });
  await page.goto('/?pref=130000&lang=ja');
  await expect.poll(() => alertRequests).toBeGreaterThan(0);
  // 警報タブの成功表示を待ち、前回「なし」が確定した状態を作る。
  await page.locator('#tab-warning').click();
  await expect(page.locator('#tabpanel-warning')).toContainText('現在、警報・注意報は発表されていません');
  await page.locator('#tab-earthquake').click();
  await expect(page.locator('#tabpanel-earthquake')).toBeVisible();
  fail = true;
  await page.locator('#tab-warning').click();
  await expect(page.getByTestId('warning-fetch-failure')).toBeVisible();
  await expect(page.getByTestId('special-warning-unconfirmed')).toBeVisible();
  await expect(page.getByTestId('special-warning-band')).toHaveCount(0);
  fail = false;
  await page.getByTestId('warning-fetch-failure').getByRole('button').click();
  await expect(page.getByTestId('warning-fetch-failure')).toHaveCount(0);
  await expect(page.getByTestId('special-warning-unconfirmed')).toHaveCount(0);
  await expect(page.getByTestId('special-warning-band')).toHaveCount(0);
});
