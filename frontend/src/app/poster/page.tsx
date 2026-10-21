import type { Metadata } from 'next';
import PosterClient from './PosterClient';
import './poster.css';

/**
 * 宿のフロントに貼る QR ポスター（A4 縦）を、宿のスタッフが自分で印刷するページ。
 *
 * `/poster?pref=<府県予報区コード 6 桁>` で開く。QR の中身は `<origin>/?pref=<コード>`
 * （言語は付けない＝訪日客のブラウザ言語で自動判定）。
 *
 * アプリ本体のナビゲーションには出さない（スタッフに URL を渡す運用）。検索にも載せない。
 */
export const metadata: Metadata = {
  title: 'QR poster for hotel staff / やどの スタッフ むけ QR ポスター',
  robots: { index: false, follow: false },
};

export default function PosterPage() {
  return <PosterClient />;
}
