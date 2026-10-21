/**
 * テスト用: ポスターの QR の <svg> から、クワイエットゾーンを除いたモジュール行列を復元する。
 *
 * QrCodeSvg は黒モジュールを「M{x} {y}h{幅}v1h-{幅}z」の横長の矩形の連なりで描く。
 * 描かれた矩形をそのまま塗り直すので、描画側の座標の誤り（ずれ・欠け）も行列に現れる。
 */
export function svgToMatrix(svg: SVGSVGElement, quietZone: number): boolean[][] {
  const [, , w, h] = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
  if (!w || w !== h) throw new Error(`unexpected viewBox ${svg.getAttribute('viewBox')}`);
  const full = Array.from({ length: w }, () => new Array<boolean>(w).fill(false));
  const paths = Array.from(svg.querySelectorAll('path'));
  if (paths.length === 0) throw new Error('no <path> in QR svg');
  for (const path of paths) {
    const d = path.getAttribute('d') ?? '';
    const re = /M(\d+) (\d+)h(\d+)v1h-(\d+)z/g;
    let consumed = 0;
    for (const m of d.matchAll(re)) {
      const [x, y, len, back] = [m[1], m[2], m[3], m[4]].map(Number);
      if (len !== back) throw new Error(`open rect in path: ${m[0]}`);
      for (let i = 0; i < len; i++) full[y][x + i] = true;
      consumed += m[0].length;
    }
    if (consumed !== d.length) throw new Error('path has commands this parser does not understand');
  }
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const inQuiet = x < quietZone || y < quietZone || x >= w - quietZone || y >= w - quietZone;
      if (inQuiet && full[y][x]) throw new Error(`dark module in quiet zone at (${x}, ${y})`);
    }
  }
  return full.slice(quietZone, w - quietZone).map((row) => row.slice(quietZone, w - quietZone));
}
