import { test, expect } from '@playwright/test';

test.describe('スモークテスト - 基本的な画面表示', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('ページが読み込まれ、タイトルが表示される', async ({ page }) => {
    // ページタイトル（meta title）の確認
    await expect(page).toHaveTitle(/災害対応AI|Disaster/);

    // アプリのh1タイトルが表示されること
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    // デフォルト言語は日本語
    await expect(heading).toHaveText('災害対応AI');
  });

  test('ヘッダーとナビゲーションタブが表示される', async ({ page }) => {
    // ヘッダーの存在確認
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // サブタイトルの確認
    await expect(page.getByText('多言語災害情報システム')).toBeVisible();

    // タブナビゲーションの確認
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();

    // tablistロールの存在
    const tablist = page.getByRole('tablist');
    await expect(tablist).toBeVisible();
  });

  test('5つのタブが存在する（地震・警報・緊急連絡・避難所・会話）', async ({ page }) => {
    const tabs = page.getByRole('tab');

    // 5つのタブが存在すること
    await expect(tabs).toHaveCount(5);

    // 各タブのテキスト確認（日本語デフォルト）
    await expect(page.getByRole('tab', { name: /地震/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /警報/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /緊急連絡/ })).toBeVisible();
    await expect(page.locator('#tab-shelter')).toBeVisible();
    await expect(page.locator('#tab-conversation')).toBeVisible();
  });

  test('フッターが表示される', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // データソース情報の確認
    await expect(footer.getByText('情報元: 気象庁、P2P地震情報')).toBeVisible();
  });

  test('最後に取得できた時刻の状態が表示される', async ({ page }) => {
    // 未取得も含め、ページを開いた時刻を取得時刻として表示しない状態表示。
    await expect(page.getByTestId('last-success')).toBeVisible();
  });
});


test('地域未選択では選択を促し、警報タブでも東京を既定表示しない', async ({ page }) => {
  await page.goto('/?lang=ja');
  await expect(page.getByTestId('region-picker')).toBeVisible();
  await page.locator('#tab-warning').click();
  await expect(page.getByTestId('warning-choose-region')).toBeVisible();
  await expect(page.locator('#tabpanel-warning select')).toHaveValue('');
});
