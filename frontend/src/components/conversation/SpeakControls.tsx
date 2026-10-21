'use client';

import { useEffect, useRef, useState } from 'react';
import { findVoice, getSpeechSynthesis } from '@/lib/speechVoice';
import DualText, { type DualTextProps } from './DualText';

/**
 * `locale` を読める端末の音声を探す。
 * 戻り値: undefined = まだ調べていない（SSR・初回描画）／ null = 読めない／ voice = 読める。
 *
 * Chrome などは音声一覧を非同期で読み込むため、最初の getVoices() が空でも
 * `voiceschanged` で届いた時点で読み直す。依存は locale（文字列）だけ。
 */
function useVoice(locale: string): SpeechSynthesisVoice | null | undefined {
  const [state, setState] = useState<{ locale: string; voice: SpeechSynthesisVoice | null } | null>(null);

  useEffect(() => {
    const synth = getSpeechSynthesis();
    if (!synth) {
      setState({ locale, voice: null });
      return;
    }
    const update = () => setState({ locale, voice: findVoice(synth.getVoices(), locale) });
    update();
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', update);
      return () => synth.removeEventListener('voiceschanged', update);
    }
    // addEventListener を持たない古い実装
    const previous = synth.onvoiceschanged;
    synth.onvoiceschanged = update;
    return () => {
      if (synth.onvoiceschanged === update) synth.onvoiceschanged = previous;
    };
  }, [locale]);

  return state?.locale === locale ? state.voice : undefined;
}

export interface SpeakControlsProps {
  /** 読み上げる本文 */
  text: string;
  /** 読み上げの言語（BCP47。例 'ja-JP'） */
  locale: string;
  readAloud: DualTextProps;
  stop: DualTextProps;
  noVoice: DualTextProps;
}

/**
 * 読み上げ／停止。押したときだけ読む（勝手に読まない）。
 * その言語の音声が無い端末ではボタンを出さず、文字を見せて伝えられる旨の注記を出す。
 *
 * 呼び出し側は表示する文ごとに key を変えること（文が変わったら読み上げを止めるため）。
 */
export default function SpeakControls({ text, locale, readAloud, stop, noVoice }: SpeakControlsProps) {
  const voice = useVoice(locale);
  const [speaking, setSpeaking] = useState(false);
  const currentRef = useRef<SpeechSynthesisUtterance | null>(null);

  // 画面を閉じた・別の文に変わったときは読み上げを止める
  useEffect(() => {
    return () => {
      if (currentRef.current) {
        currentRef.current = null;
        getSpeechSynthesis()?.cancel();
      }
    };
  }, []);

  if (voice === undefined) return null;

  if (voice === null) {
    return (
      <p
        data-testid="conv-no-voice"
        className="rounded-xl border border-gray-300 bg-gray-100 px-4 py-3 text-base text-gray-800"
      >
        <DualText {...noVoice} secondaryClassName="block text-sm text-gray-700" />
      </p>
    );
  }

  const speak = () => {
    const synth = getSpeechSynthesis();
    if (!synth) return;
    // 読みかけがあれば止めてから読む（キューに積まない）
    synth.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = locale;
    utterance.voice = voice;
    const done = () => {
      // cancel() で止めた前の読み上げの終了通知で、今の状態を消さない
      if (currentRef.current !== utterance) return;
      currentRef.current = null;
      setSpeaking(false);
    };
    utterance.onend = done;
    utterance.onerror = done;
    currentRef.current = utterance;
    setSpeaking(true);
    synth.speak(utterance);
  };

  const stopSpeaking = () => {
    currentRef.current = null;
    getSpeechSynthesis()?.cancel();
    setSpeaking(false);
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        type="button"
        data-testid="conv-speak"
        onClick={speak}
        className="flex min-h-[64px] items-center gap-2 rounded-xl border-2 border-blue-700 bg-white px-3 py-2 text-left text-blue-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
      >
        <SpeakerIcon />
        <DualText {...readAloud} primaryClassName="block text-lg font-bold" secondaryClassName="block text-sm text-gray-700" />
      </button>
      {speaking && (
        <button
          type="button"
          data-testid="conv-stop"
          onClick={stopSpeaking}
          className="flex min-h-[64px] items-center gap-2 rounded-xl border-2 border-blue-700 bg-white px-3 py-2 text-left text-blue-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
        >
          <span aria-hidden="true" className="inline-block h-6 w-6 shrink-0 rounded-sm bg-blue-700" />
          <DualText {...stop} primaryClassName="block text-lg font-bold" secondaryClassName="block text-sm text-gray-700" />
        </button>
      )}
    </div>
  );
}

function SpeakerIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" strokeLinecap="round" />
    </svg>
  );
}
