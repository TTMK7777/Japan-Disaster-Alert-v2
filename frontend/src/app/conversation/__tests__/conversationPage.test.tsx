import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { metadata } from '@/app/conversation/page';
import ConversationPageClient from '@/app/conversation/ConversationPageClient';
import { phraseById } from '@/lib/conversationCards';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('/conversation（確認用の単独ページ）', () => {
  it('検索に載せない（noindex, nofollow）', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('?lang=th でタイ語の会話カードを出す', async () => {
    window.history.replaceState(null, '', '/conversation?lang=th');
    render(<ConversationPageClient />);
    await waitFor(() =>
      expect(screen.getByTestId('conv-categories')).toHaveTextContent('ฉุกเฉิน')
    );
    expect((screen.getByTestId('conv-language') as HTMLSelectElement).value).toBe('th');
  });

  it('?lang= が不正なら既存の判定に任せ、会話カードは出す', async () => {
    window.history.replaceState(null, '', '/conversation?lang=xx');
    render(<ConversationPageClient />);
    await waitFor(() => expect(screen.getByTestId('conv-categories')).toBeInTheDocument());
    const value = (screen.getByTestId('conv-language') as HTMLSelectElement).value;
    expect(phraseById('C01')!.text).toHaveProperty(value);
  });
});
