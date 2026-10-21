import { useMemo } from 'react';
import { create as createQr } from 'qrcode';

/**
 * 誤り訂正レベル。M（15%）以上が条件。宿のフロントに貼るポスターは汚れ・折れ・
 * テープ・光の反射を受けるので、一段上の Q（25%）にする。
 */
export const POSTER_QR_ERROR_CORRECTION = 'Q' as const;

/** QR の周囲に必要な白い余白（クワイエットゾーン）。規格の推奨値 4 モジュール */
export const QR_QUIET_ZONE = 4;

/**
 * 黒モジュールを横方向の連なりごとに 1 つの矩形にまとめた SVG の path を作る。
 *
 * qrcode の文字列出力（toString）や innerHTML は使わず、モジュール行列から自分で描く
 * （React の要素として出すので HTML の差し込みが要らない）。
 */
export function qrSvgPath(text: string): { size: number; d: string } {
  const { modules } = createQr(text, { errorCorrectionLevel: POSTER_QR_ERROR_CORRECTION });
  const n = modules.size;
  const dark = (row: number, col: number) => modules.data[row * n + col] === 1;
  let d = '';
  for (let row = 0; row < n; row++) {
    let col = 0;
    while (col < n) {
      if (!dark(row, col)) {
        col++;
        continue;
      }
      const start = col;
      while (col < n && dark(row, col)) col++;
      const len = col - start;
      d += `M${start + QR_QUIET_ZONE} ${row + QR_QUIET_ZONE}h${len}v1h-${len}z`;
    }
  }
  return { size: n + QR_QUIET_ZONE * 2, d };
}

interface QrCodeSvgProps {
  text: string;
  /** 読み上げ用のラベル */
  label: string;
  className?: string;
}

/** QR コードを SVG で描く（印刷で拡大してもにじまない） */
export default function QrCodeSvg({ text, label, className }: QrCodeSvgProps) {
  const { size, d } = useMemo(() => qrSvgPath(text), [text]);
  return (
    <svg
      data-testid="poster-qr"
      className={className}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
