import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TransitLinks from '../TransitLinks';

/**
 * 交通リンク集の表示テスト。
 *
 * 固定するのは以下:
 *  - 取得に失敗してもページを壊さない（この節を出さないだけ）
 *  - 外部リンクに `rel="noopener noreferrer"` が付く
 *  - 利用者の言語で読めないリンクは、開く前にそれと分かる
 *  - 言語を切り替えたら取り直す
 */

const mockResponse = {
  title: 'Official Transit Information',
  available_in_label: 'Available in',
  groups: [
    {
      category: 'rail',
      label: 'Trains',
      links: [
        {
          id: 'jr-east',
          name: 'JR East',
          url: 'https://traininfo.jreast.co.jp/train_info/e/',
          languages: ['en', 'ja'],
          readable_in_user_language: true,
          area: 'Tokyo, Tohoku, Niigata',
        },
        {
          id: 'jr-west',
          name: 'JR West',
          url: 'https://trafficinfo.westjr.co.jp/',
          languages: ['ja'],
          readable_in_user_language: false,
          area: 'Osaka, Kyoto, Hiroshima',
        },
      ],
    },
  ],
};

describe('TransitLinks', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('見出しと分類が表示される', async () => {
    render(<TransitLinks language="en" />);

    expect(await screen.findByText('Official Transit Information')).toBeInTheDocument();
    expect(screen.getByText('Trains')).toBeInTheDocument();
  });

  it('リンクが正しい URL で開く', async () => {
    render(<TransitLinks language="en" />);

    const link = await screen.findByRole('link', { name: /JR East/ });
    expect(link).toHaveAttribute('href', 'https://traininfo.jreast.co.jp/train_info/e/');
  });

  it('外部リンクに noopener noreferrer が付く', async () => {
    render(<TransitLinks language="en" />);

    const link = await screen.findByRole('link', { name: /JR East/ });
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('自分の言語で読めないリンクには対応言語が表示される', async () => {
    render(<TransitLinks language="en" />);

    // JR West は日本語のみ → 開く前に分かるようにする
    expect(await screen.findByText(/Available in: ja/)).toBeInTheDocument();
  });

  it('読めるリンクには対応言語の注記を出さない', async () => {
    render(<TransitLinks language="en" />);
    await screen.findByRole('link', { name: /JR East/ });

    // 注記は JR West の1件だけ
    expect(screen.getAllByText(/Available in:/)).toHaveLength(1);
  });

  it('取得に失敗しても何も描画せずページを壊さない', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch;

    const { container } = render(<TransitLinks language="en" />);

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });

  it('HTTP エラーでも何も描画しない', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    const { container } = render(<TransitLinks language="en" />);

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });

  it('言語を指定してリクエストする', async () => {
    render(<TransitLinks language="th" />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('lang=th'));
    });
  });

  it('言語が変わったら取り直す', async () => {
    const { rerender } = render(<TransitLinks language="en" />);
    await screen.findByText('Official Transit Information');

    rerender(<TransitLinks language="ko" />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('lang=ko'));
    });
  });
});
