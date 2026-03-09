import { test, expect } from '@playwright/test';

test.describe('言語切り替え', () => {
  test.beforeEach(async ({ page }) => {
    // localStorageをクリアして日本語デフォルトにリセット
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('disaster-app-lang'));
    await page.reload();
  });

  test('言語セレクターが表示される', async ({ page }) => {
    const selector = page.locator('select');
    await expect(selector).toBeVisible();

    // 16言語のオプションがあること
    const options = selector.locator('option');
    await expect(options).toHaveCount(16);
  });

  test('デフォルトは日本語', async ({ page }) => {
    // タイトルが日本語であること
    await expect(page.locator('h1')).toHaveText('災害対応AI');

    // セレクターの値が 'ja' であること
    const selector = page.locator('select');
    await expect(selector).toHaveValue('ja');
  });

  test('英語に切り替えるとUI文が変わる', async ({ page }) => {
    const selector = page.locator('select');

    // 英語に切り替え
    await selector.selectOption('en');

    // タイトルが英語に変わること
    await expect(page.locator('h1')).toHaveText('Disaster AI');

    // タブテキストが英語に変わること
    await expect(page.getByRole('tab', { name: /Quakes/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Alerts/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /SOS/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Shelters/ })).toBeVisible();

    // サブタイトルが英語であること
    await expect(page.getByText('Multilingual Disaster Info')).toBeVisible();

    // html lang属性が更新されること
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('中国語（簡体字）に切り替えるとUI文が変わる', async ({ page }) => {
    const selector = page.locator('select');

    // 中国語に切り替え
    await selector.selectOption('zh');

    // タイトルが中国語に変わること
    await expect(page.locator('h1')).toHaveText('灾害应对AI');

    // タブテキストが中国語に変わること
    await expect(page.getByRole('tab', { name: /地震信息/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /警报/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /紧急电话/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /避难所/ })).toBeVisible();
  });

  test('言語がタブナビゲーション後も維持される', async ({ page }) => {
    const selector = page.locator('select');

    // 英語に切り替え
    await selector.selectOption('en');
    await expect(page.locator('h1')).toHaveText('Disaster AI');

    // 各タブをクリックして言語が維持されることを確認
    const alertsTab = page.getByRole('tab', { name: /Alerts/ });
    await alertsTab.click();
    await expect(page.locator('h1')).toHaveText('Disaster AI');

    const sosTab = page.getByRole('tab', { name: /SOS/ });
    await sosTab.click();
    await expect(page.locator('h1')).toHaveText('Disaster AI');

    const sheltersTab = page.getByRole('tab', { name: /Shelters/ });
    await sheltersTab.click();
    await expect(page.locator('h1')).toHaveText('Disaster AI');

    // セレクターの値も英語のまま
    await expect(selector).toHaveValue('en');
  });

  test('言語選択がlocalStorageに保存される', async ({ page }) => {
    const selector = page.locator('select');

    // 英語に切り替え
    await selector.selectOption('en');

    // localStorageに保存されていることを確認
    const savedLang = await page.evaluate(() =>
      localStorage.getItem('disaster-app-lang')
    );
    expect(savedLang).toBe('en');
  });

  test('やさしい日本語に切り替えるとUI文が変わる', async ({ page }) => {
    const selector = page.locator('select');

    // やさしい日本語に切り替え
    await selector.selectOption('easy_ja');

    // タイトルがやさしい日本語に変わること
    await expect(page.locator('h1')).toHaveText('さいがい じょうほう');

    // タブテキストがやさしい日本語に変わること
    await expect(page.getByRole('tab', { name: /じしん/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /けいほう/ })).toBeVisible();
  });
});
