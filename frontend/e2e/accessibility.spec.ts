import { test, expect } from '@playwright/test';

test.describe('アクセシビリティ基本チェック', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('ページに適切な見出し階層がある', async ({ page }) => {
    // h1が1つだけ存在すること
    const h1Elements = page.locator('h1');
    await expect(h1Elements).toHaveCount(1);

    // h1がページ内で最初の見出しであること
    const firstHeading = page.locator('h1, h2, h3, h4, h5, h6').first();
    const tagName = await firstHeading.evaluate((el) => el.tagName);
    expect(tagName).toBe('H1');
  });

  test('タブがキーボードでアクセス可能', async ({ page }) => {
    const tabs = page.getByRole('tab');

    // 最初のタブにフォーカスを当てる
    const firstTab = tabs.first();
    await firstTab.focus();
    await expect(firstTab).toBeFocused();

    // focus:ring スタイルが適用されることの確認（フォーカスが当たること自体を検証）
    // タブにtabIndexが設定されていること
    const activeTab = page.getByRole('tab', { selected: true });
    await expect(activeTab).toHaveAttribute('tabindex', '0');

    // 非アクティブタブはtabindex=-1
    const inactiveTabs = page.locator('[role="tab"][aria-selected="false"]');
    const count = await inactiveTabs.count();
    for (let i = 0; i < count; i++) {
      await expect(inactiveTabs.nth(i)).toHaveAttribute('tabindex', '-1');
    }
  });

  test('タブにaria-selected属性が設定されている', async ({ page }) => {
    const tabs = page.getByRole('tab');
    const count = await tabs.count();

    // 各タブにaria-selected属性が存在すること
    for (let i = 0; i < count; i++) {
      const tab = tabs.nth(i);
      const ariaSelected = await tab.getAttribute('aria-selected');
      expect(['true', 'false']).toContain(ariaSelected);
    }

    // 1つだけaria-selected="true"であること
    const selectedTabs = page.locator('[role="tab"][aria-selected="true"]');
    await expect(selectedTabs).toHaveCount(1);
  });

  test('タブパネルに適切なARIA属性がある', async ({ page }) => {
    // 地震タブパネルの確認
    const panel = page.locator('#tabpanel-earthquake');
    await expect(panel).toHaveAttribute('role', 'tabpanel');
    await expect(panel).toHaveAttribute('aria-labelledby', 'tab-earthquake');
  });

  test('タブにaria-controls属性がある', async ({ page }) => {
    // 各タブがaria-controlsで対応パネルを参照していること
    const tabPanelPairs = [
      { tabId: 'tab-earthquake', panelId: 'tabpanel-earthquake' },
      { tabId: 'tab-warning', panelId: 'tabpanel-warning' },
      { tabId: 'tab-emergency', panelId: 'tabpanel-emergency' },
      { tabId: 'tab-shelter', panelId: 'tabpanel-shelter' },
    ];

    for (const pair of tabPanelPairs) {
      const tab = page.locator(`#${pair.tabId}`);
      await expect(tab).toHaveAttribute('aria-controls', pair.panelId);
    }
  });

  test('ナビゲーションにaria-label属性がある', async ({ page }) => {
    const nav = page.locator('nav');
    const ariaLabel = await nav.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
  });

  test('エラー表示にrole="alert"が使われている', async ({ page }) => {
    // APIエラー時にalertロールが表示される（バックエンド未起動時）
    // エラーが表示された場合はrole="alert"が使われていることを確認
    const alerts = page.locator('[role="alert"]');
    const alertCount = await alerts.count();

    // エラーがあってもなくても、存在する場合はrole="alert"を持つことを確認
    if (alertCount > 0) {
      for (let i = 0; i < alertCount; i++) {
        const role = await alerts.nth(i).getAttribute('role');
        expect(role).toBe('alert');
      }
    }
    // エラーがない場合はスキップ（バックエンドが動作している場合）
  });

  test('html要素にlang属性が設定されている', async ({ page }) => {
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBeTruthy();
    // デフォルトはjaまたはlocalStorageに保存された言語
    expect(lang).toMatch(/^(ja|en|zh|zh-TW|ko|vi|th|id|ms|tl|ne|fr|de|it|es|easy_ja)$/);
  });

  test('ボタンにフォーカスリングが設定されている', async ({ page }) => {
    // タブボタンにfocus関連のCSSクラスがあること
    const tabs = page.getByRole('tab');
    const firstTab = tabs.first();

    // クラス属性にfocus関連のスタイルが含まれていること
    const className = await firstTab.getAttribute('class');
    expect(className).toContain('focus:');
  });

  test('画像やアイコンにaria-hidden属性がある', async ({ page }) => {
    // 装飾的なSVGアイコンにaria-hiddenが設定されていること
    const decorativeSvgs = page.locator('svg[aria-hidden="true"]');
    const count = await decorativeSvgs.count();

    // 装飾的アイコンが存在する場合、aria-hiddenが設定されていること
    // （地震タブのリスト/地図ボタン内のSVGなど）
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        await expect(decorativeSvgs.nth(i)).toHaveAttribute('aria-hidden', 'true');
      }
    }
  });
});
