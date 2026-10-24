import type { Metadata } from 'next';
import SignageClient from './SignageClient';
import './signage.css';

/**
 * 宿のロビー・館内テレビに出しっぱなしにする表示（1920×1080 横・操作なし）。
 *
 * `/signage?pref=<府県予報区コード 6 桁>&langs=en,zh,ko,ja` で開く。
 * データは静的スナップショット（GET /api/v1/snapshot）だけを 60 秒ごとに取る。
 * 取得できない・古いときは「無い」と出さず「取得できません」と最後に取得できた時刻を出す。
 *
 * アプリ本体のナビゲーションには出さない（宿に URL を渡す運用）。検索にも載せない。
 */
export const metadata: Metadata = {
  title: 'Lobby display / ロビー表示',
  robots: { index: false, follow: false },
};

export default function SignagePage() {
  return <SignageClient />;
}
