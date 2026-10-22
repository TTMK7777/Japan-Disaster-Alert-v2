import type { Metadata } from 'next';
import ConversationPageClient from './ConversationPageClient';

/**
 * 会話カードの動作確認用ページ（`/conversation?lang=th` など）。
 *
 * 本体のタブに組み込むまでの仮置き。アプリのナビゲーションには出さず、検索にも載せない。
 */
export const metadata: Metadata = {
  title: 'Conversation cards / 会話カード',
  robots: { index: false, follow: false },
};

export default function ConversationPage() {
  return <ConversationPageClient />;
}
