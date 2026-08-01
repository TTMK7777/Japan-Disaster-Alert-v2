import { test, expect } from '@playwright/test';

/**
 * 交通の公式情報源の表示（実ブラウザ）。
 *
 * ユニットテストは fetch をモックするので、**実際にバックエンドから取れて
 * 描画されるか**は分からない。ここだけが「本当に画面に出ている」ことを見る。
 *
 * バックエンドが起動していない環境では取得に失敗し、コンポーネントは
 * 何も描画しない設計にしてある（ページ全体は壊さない）。そのため
 * 「節が出ない = 失敗」とは断定できない。API が生きていることを先に確かめてから
 * 表示を検証する。
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

test.describe('交通の公式情報源', () => {
  test('API が交通リンクを返す', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/transit-links?lang=en`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.title).toBeTruthy();
    expect(body.groups.length).toBeGreaterThan(0);

    const ids = body.groups.flatMap((g: { links: { id: string }[] }) =>
      g.links.map((l) => l.id)
    );
    expect(ids).toContain('jr-east');
  });

  test('緊急連絡タブに交通リンクが表示される', async ({ page, request }) => {
    // バックエンドが無い環境ではこのテストは意味を持たないので飛ばす
    const health = await request.get(`${API_BASE}/api/v1/transit-links?lang=en`).catch(() => null);
    test.skip(!health || health.status() !== 200, 'バックエンドが起動していない');

    await page.goto('/');
    await page.locator('#tab-emergency').click();

    const panel = page.locator('#tabpanel-emergency');
    const section = panel.locator('section[aria-labelledby="transit-links-heading"]');

    await expect(section).toBeVisible();
    // 事業者名は訳さずそのまま出す
    await expect(section.getByRole('link', { name: /JR East/ })).toBeVisible();
  });

  test('外部リンクが新しいタブで安全に開く', async ({ page, request }) => {
    const health = await request.get(`${API_BASE}/api/v1/transit-links?lang=en`).catch(() => null);
    test.skip(!health || health.status() !== 200, 'バックエンドが起動していない');

    await page.goto('/');
    await page.locator('#tab-emergency').click();

    const link = page
      .locator('section[aria-labelledby="transit-links-heading"]')
      .getByRole('link', { name: /JR East/ });

    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toHaveAttribute('href', /^https:\/\//);
  });

  test('言語を切り替えると見出しも切り替わる', async ({ page, request }) => {
    const health = await request.get(`${API_BASE}/api/v1/transit-links?lang=en`).catch(() => null);
    test.skip(!health || health.status() !== 200, 'バックエンドが起動していない');

    await page.goto('/');
    await page.locator('#tab-emergency').click();

    const heading = page.locator('#transit-links-heading');
    await expect(heading).toHaveText('交通の公式情報');

    await page.getByRole('combobox').first().selectOption('en');
    await expect(heading).toHaveText('Official Transit Information');
  });
});
