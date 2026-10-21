import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConversationCards from '@/components/ConversationCards';
import { phraseById } from '@/lib/conversationCards';

/**
 * jsdom には speechSynthesis が無い。読み上げのテストでは最小限の偽物を入れ、
 * それ以外のテストでは「無い」状態を明示的に作る（実行環境の差で緑にならないように）。
 */
type FakeVoice = { lang: string; localService: boolean; name: string };

class FakeUtterance {
  text: string;
  lang = '';
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

function installSpeech(initialVoices: FakeVoice[]) {
  let voices = initialVoices;
  const listeners = new Set<() => void>();
  const synth = {
    getVoices: vi.fn(() => voices),
    speak: vi.fn(),
    cancel: vi.fn(),
    addEventListener: vi.fn((type: string, cb: () => void) => {
      if (type === 'voiceschanged') listeners.add(cb);
    }),
    removeEventListener: vi.fn((type: string, cb: () => void) => {
      if (type === 'voiceschanged') listeners.delete(cb);
    }),
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true, writable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    value: FakeUtterance,
    configurable: true,
    writable: true,
  });
  return {
    synth,
    setVoices(next: FakeVoice[]) {
      voices = next;
      act(() => listeners.forEach((cb) => cb()));
    },
    lastUtterance(): FakeUtterance {
      const calls = synth.speak.mock.calls;
      return calls[calls.length - 1][0] as FakeUtterance;
    },
  };
}

function removeSpeech() {
  delete (window as unknown as Record<string, unknown>).speechSynthesis;
  delete (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance;
}

const voice = (lang: string): FakeVoice => ({ lang, localService: true, name: lang });

function openVisitorCard(categoryId: string, phraseId: string) {
  fireEvent.click(document.querySelector(`[data-category="${categoryId}"]`)!);
  fireEvent.click(
    within(screen.getByTestId('conv-phrase-list')).getByRole('button', {
      name: new RegExp(escapeRe(phraseTextFor(phraseId))),
    })
  );
  return screen.getByRole('dialog');
}

let currentLang = 'th';
function phraseTextFor(id: string) {
  const p = phraseById(id)!;
  return (p.text as Record<string, string>)[currentLang];
}
function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

beforeEach(() => {
  removeSpeech();
  currentLang = 'th';
});

afterEach(() => {
  cleanup();
  removeSpeech();
});

describe('ConversationCards: スタッフに見せる', () => {
  it('カテゴリは命に関わる順に並び、先頭は緊急', () => {
    render(<ConversationCards language="th" />);
    const cats = [...screen.getByTestId('conv-categories').querySelectorAll('[data-category]')].map(
      (el) => el.getAttribute('data-category')
    );
    expect(cats.slice(0, 5)).toEqual(['emergency', 'injury', 'medication', 'allergy', 'family']);
  });

  it('どのカテゴリを開いても、スタッフ→訪日客の文は出ない', () => {
    render(<ConversationCards language="th" />);
    const cats = [...screen.getByTestId('conv-categories').querySelectorAll('[data-category]')].map(
      (el) => el.getAttribute('data-category')!
    );
    for (const cat of cats) {
      fireEvent.click(document.querySelector(`[data-category="${cat}"]`)!);
      const ids = [
        ...screen.getByTestId('conv-phrase-list').querySelectorAll('[data-phrase-id]'),
      ].map((el) => el.getAttribute('data-phrase-id')!);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) expect(phraseById(id)!.direction).toBe('visitor-to-staff');
      fireEvent.click(screen.getByTestId('conv-back'));
    }
  });

  it('文を選ぶと全画面で 日本語・タイ語・英語 の 3 段（各行に lang 属性）', () => {
    render(<ConversationCards language="th" />);
    const dialog = openVisitorCard('injury', 'C05');
    const lines = [...dialog.querySelectorAll('[data-line-role]')];
    const c05 = phraseById('C05')!;
    expect(lines.map((l) => l.textContent)).toEqual([c05.text.ja, c05.text.th, c05.text.en]);
    expect(lines.map((l) => l.getAttribute('lang'))).toEqual(['ja-JP', 'th-TH', 'en-US']);
  });

  it('英語の利用者には英語を 2 回出さない', () => {
    currentLang = 'en';
    render(<ConversationCards language="en" />);
    const dialog = openVisitorCard('injury', 'C05');
    const texts = [...dialog.querySelectorAll('[data-line-role]')].map((l) => l.textContent);
    expect(texts).toEqual([phraseById('C05')!.text.ja, phraseById('C05')!.text.en]);
  });

  it('「ほかの文を選ぶ」で全画面表示を閉じる', () => {
    render(<ConversationCards language="th" />);
    openVisitorCard('injury', 'C05');
    fireEvent.click(screen.getByTestId('conv-close'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('ConversationCards: スタッフが返す', () => {
  it('相手の文を残し、スタッフ→訪日客の文だけを並べる（同じカテゴリが先頭）', () => {
    render(<ConversationCards language="th" />);
    openVisitorCard('injury', 'C05');
    fireEvent.click(screen.getByTestId('conv-to-staff'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('conv-visitor-said')).toHaveTextContent(phraseById('C05')!.text.ja);
    const ids = [...screen.getByTestId('conv-staff-list').querySelectorAll('[data-phrase-id]')].map(
      (el) => el.getAttribute('data-phrase-id')!
    );
    expect(ids.slice(0, 2)).toEqual(['C06', 'C09']);
    for (const id of ids) expect(phraseById(id)!.direction).toBe('staff-to-visitor');
  });

  it('文を選ぶと訪日客の言語＋英語で大きく出て、はい／いいえ／わかりません で返せる', () => {
    render(<ConversationCards language="th" />);
    fireEvent.click(screen.getByTestId('conv-mode-staff'));
    fireEvent.click(document.querySelector('[data-phrase-id="C06"]')!);
    const dialog = screen.getByRole('dialog');
    const c06 = phraseById('C06')!;
    const large = [...dialog.querySelectorAll('[data-line-role="visitor"],[data-line-role="english"]')];
    expect(large.map((l) => l.textContent)).toEqual([c06.text.th, c06.text.en]);
    expect(dialog.querySelector('[data-line-role="staff"]')).toHaveTextContent(c06.text.ja);

    const answers = [...dialog.querySelectorAll('[data-answer-id]')].map((el) => el.getAttribute('data-answer-id'));
    expect(answers).toEqual(['C32', 'C34', 'C35']);

    // 訪日客が「はい」を選ぶ → スタッフに見せるカードに切り替わる
    fireEvent.click(dialog.querySelector('[data-answer-id="C32"]')!);
    const next = screen.getByRole('dialog');
    expect(next.querySelector('[data-line-role="staff"]')).toHaveTextContent(phraseById('C32')!.text.ja);
  });

  it('「訪日客の画面へ」で訪日客のモードに戻る', () => {
    render(<ConversationCards language="th" />);
    fireEvent.click(screen.getByTestId('conv-mode-staff'));
    fireEvent.click(screen.getByTestId('conv-back-to-visitor'));
    expect(screen.getByTestId('conv-categories')).toBeInTheDocument();
  });
});

describe('ConversationCards: 読み上げ', () => {
  it('speechSynthesis が無い環境では読み上げボタンを出さず、文字で伝えられる注記を出す', () => {
    expect('speechSynthesis' in window).toBe(false);
    render(<ConversationCards language="th" />);
    const dialog = openVisitorCard('injury', 'C05');
    expect(within(dialog).queryByTestId('conv-speak')).toBeNull();
    expect(within(dialog).getByTestId('conv-no-voice')).toBeInTheDocument();
  });

  it('その言語の音声が無ければボタンを出さない（スタッフの返事をタイ語で読む音声が無い）', () => {
    installSpeech([voice('ja-JP'), voice('en-US')]);
    render(<ConversationCards language="th" />);
    fireEvent.click(screen.getByTestId('conv-mode-staff'));
    fireEvent.click(document.querySelector('[data-phrase-id="C06"]')!);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByTestId('conv-speak')).toBeNull();
    expect(within(dialog).getByTestId('conv-no-voice')).toBeInTheDocument();
  });

  it('スタッフに見せるカードは日本語の音声で、押したときだけ読む。停止で cancel する', () => {
    const speech = installSpeech([voice('ja-JP')]);
    render(<ConversationCards language="th" />);
    const dialog = openVisitorCard('injury', 'C05');
    expect(speech.synth.speak).not.toHaveBeenCalled(); // 勝手に読まない
    expect(within(dialog).queryByTestId('conv-stop')).toBeNull();

    fireEvent.click(within(dialog).getByTestId('conv-speak'));
    expect(speech.synth.speak).toHaveBeenCalledTimes(1);
    const u = speech.lastUtterance();
    expect(u.text).toBe(phraseById('C05')!.text.ja);
    expect(u.lang).toBe('ja-JP');

    speech.synth.cancel.mockClear(); // 読み始めの前に前の読み上げを消す呼び出しと区別する
    fireEvent.click(within(dialog).getByTestId('conv-stop'));
    expect(speech.synth.cancel).toHaveBeenCalled();
    expect(within(dialog).queryByTestId('conv-stop')).toBeNull();
  });

  it('読み終わったら停止ボタンを消す', () => {
    const speech = installSpeech([voice('ja-JP')]);
    render(<ConversationCards language="th" />);
    const dialog = openVisitorCard('injury', 'C05');
    fireEvent.click(within(dialog).getByTestId('conv-speak'));
    expect(within(dialog).getByTestId('conv-stop')).toBeInTheDocument();
    act(() => speech.lastUtterance().onend?.());
    expect(within(dialog).queryByTestId('conv-stop')).toBeNull();
  });

  it('スタッフの返事は訪日客の言語の音声で読む', () => {
    const speech = installSpeech([voice('th-TH'), voice('ja-JP')]);
    render(<ConversationCards language="th" />);
    fireEvent.click(screen.getByTestId('conv-mode-staff'));
    fireEvent.click(document.querySelector('[data-phrase-id="C06"]')!);
    fireEvent.click(within(screen.getByRole('dialog')).getByTestId('conv-speak'));
    expect(speech.lastUtterance().text).toBe(phraseById('C06')!.text.th);
    expect(speech.lastUtterance().lang).toBe('th-TH');
  });

  it('音声一覧が後から届いたら（voiceschanged）ボタンを出す', () => {
    const speech = installSpeech([]);
    render(<ConversationCards language="th" />);
    const dialog = openVisitorCard('injury', 'C05');
    expect(within(dialog).queryByTestId('conv-speak')).toBeNull();
    speech.setVoices([voice('ja-JP')]);
    expect(within(dialog).getByTestId('conv-speak')).toBeInTheDocument();
  });

  it('読み上げ中にカードを閉じたら読み上げも止める', () => {
    const speech = installSpeech([voice('ja-JP')]);
    render(<ConversationCards language="th" />);
    const dialog = openVisitorCard('injury', 'C05');
    fireEvent.click(within(dialog).getByTestId('conv-speak'));
    speech.synth.cancel.mockClear();
    fireEvent.click(screen.getByTestId('conv-close'));
    expect(speech.synth.cancel).toHaveBeenCalled();
  });
});
