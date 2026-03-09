import { test, expect } from '@playwright/test';

test.describe('タブナビゲーション', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('デフォルトで地震タブが選択されている', async ({ page }) => {
    const earthquakeTab = page.getByRole('tab', { name: /地震/ });

    // aria-selected="true" であること
    await expect(earthquakeTab).toHaveAttribute('aria-selected', 'true');

    // 地震タブパネルが表示されていること
    const panel = page.locator('#tabpanel-earthquake');
    await expect(panel).toBeVisible();
  });

  test('警報タブをクリックすると警報コンテンツが表示される', async ({ page }) => {
    const warningTab = page.getByRole('tab', { name: /警報/ });
    await warningTab.click();

    // 警報タブが選択状態になること
    await expect(warningTab).toHaveAttribute('aria-selected', 'true');

    // 地震タブは非選択になること
    const earthquakeTab = page.getByRole('tab', { name: /地震/ });
    await expect(earthquakeTab).toHaveAttribute('aria-selected', 'false');

    // 警報パネルが表示されること
    const panel = page.locator('#tabpanel-warning');
    await expect(panel).toBeVisible();
  });

  test('緊急連絡タブをクリックすると緊急連絡コンテンツが表示される', async ({ page }) => {
    const emergencyTab = page.getByRole('tab', { name: /緊急連絡/ });
    await emergencyTab.click();

    await expect(emergencyTab).toHaveAttribute('aria-selected', 'true');

    const panel = page.locator('#tabpanel-emergency');
    await expect(panel).toBeVisible();
  });

  test('避難所タブをクリックすると避難所コンテンツが表示される', async ({ page }) => {
    const shelterTab = page.getByRole('tab', { name: /避難所/ });
    await shelterTab.click();

    await expect(shelterTab).toHaveAttribute('aria-selected', 'true');

    const panel = page.locator('#tabpanel-shelter');
    await expect(panel).toBeVisible();
  });

  test('タブ切り替え時にアクティブ状態が正しく遷移する', async ({ page }) => {
    const tabs = [
      { name: /地震/, panelId: 'tabpanel-earthquake' },
      { name: /警報/, panelId: 'tabpanel-warning' },
      { name: /緊急連絡/, panelId: 'tabpanel-emergency' },
      { name: /避難所/, panelId: 'tabpanel-shelter' },
    ];

    for (const tab of tabs) {
      const tabButton = page.getByRole('tab', { name: tab.name });
      await tabButton.click();

      // クリックしたタブが選択状態
      await expect(tabButton).toHaveAttribute('aria-selected', 'true');

      // 対応するパネルが表示
      await expect(page.locator(`#${tab.panelId}`)).toBeVisible();

      // 他のタブはすべて非選択
      for (const otherTab of tabs) {
        if (otherTab.panelId !== tab.panelId) {
          const otherButton = page.getByRole('tab', { name: otherTab.name });
          await expect(otherButton).toHaveAttribute('aria-selected', 'false');
        }
      }
    }
  });

  test('地震タブにリスト/地図切り替えボタンがある', async ({ page }) => {
    // 地震タブがデフォルトで選択されている
    const panel = page.locator('#tabpanel-earthquake');
    await expect(panel).toBeVisible();

    // リスト・地図切り替えボタンの存在確認
    await expect(page.getByRole('button', { name: /リスト/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /地図/ })).toBeVisible();
  });
});
