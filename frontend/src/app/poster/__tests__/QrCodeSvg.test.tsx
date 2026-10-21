import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import QrCodeSvg, { POSTER_QR_ERROR_CORRECTION, QR_QUIET_ZONE } from '../QrCodeSvg';
import { decodeQrMatrix } from './qrDecode';
import { svgToMatrix } from './qrSvg';

afterEach(cleanup);

function renderAndDecode(text: string) {
  const { container } = render(<QrCodeSvg text={text} label="QR" />);
  const svg = container.querySelector('svg') as SVGSVGElement;
  return decodeQrMatrix(svgToMatrix(svg, QR_QUIET_ZONE));
}

describe('QrCodeSvg（描いた SVG を独立したデコーダで読み戻す）', () => {
  it.each([
    'https://example.test/?pref=260000',
    'https://example.test/',
    'http://127.0.0.1:3000/?pref=016000',
    // Cloud Run の既定ドメインのような長い origin（バージョンが上がっても読める）
    'https://japan-disaster-alert-frontend-abcdefghij-an.a.run.app/?pref=471000',
  ])('%s をそのまま読める', (text) => {
    expect(renderAndDecode(text).text).toBe(text);
  });

  it('誤り訂正レベルは M 以上', () => {
    const { ecLevel } = renderAndDecode('https://example.test/?pref=260000');
    expect(['M', 'Q', 'H']).toContain(ecLevel);
    expect(ecLevel).toBe(POSTER_QR_ERROR_CORRECTION);
  });

  it('SVG で描く（印刷でにじまないよう crispEdges・白地つき）', () => {
    const { container } = render(<QrCodeSvg text="https://example.test/" label="QR" />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg).toBeTruthy();
    expect(svg.getAttribute('shape-rendering')).toBe('crispEdges');
    expect(svg.querySelector('rect')?.getAttribute('fill')).toBe('#fff');
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('QR');
  });

  it('デコーダは壊れた QR を通さない（デコーダが常に成功する偽グリーンでないこと）', () => {
    const { container } = render(<QrCodeSvg text="https://example.test/?pref=260000" label="QR" />);
    const matrix = svgToMatrix(container.querySelector('svg') as SVGSVGElement, QR_QUIET_ZONE);
    const n = matrix.length;
    // 右下隅（データ領域の先頭＝モード指示子のあたり）を 1 モジュールだけ反転する
    matrix[n - 1][n - 1] = !matrix[n - 1][n - 1];
    expect(() => decodeQrMatrix(matrix)).toThrow(/syndrome/);
  });
});
