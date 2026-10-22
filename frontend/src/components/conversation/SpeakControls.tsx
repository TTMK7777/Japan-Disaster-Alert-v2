'use client';

import { useEffect, useRef, useState } from 'react';
import { findVoice, getSpeechSynthesis, isInterruption, isOffline } from '@/lib/speechVoice';
import DualText, { type DualTextProps } from './DualText';

/**
 * `locale` を読める端末の音声を探す。
 * 戻り値: undefined = まだ調べていない（SSR・初回描画）／ null = 読めない／ voice = 読める。
 *
 * Chrome などは音声一覧を非同期で読み込むため、最初の getVoices() が空でも
 * `voiceschanged` で届いた時点で読み直す。依存は locale（文字列）だけ。
 *
 * 電波が無いとき（navigator.onLine === false）は端末内の音声だけを候補にし、
 * `online` / `offline` の切り替わりでも読み直す。
 */
function useVoice(locale: string): SpeechSynthesisVoice | null | undefined {
  const [state, setState] = useState<{ locale: string; voice: SpeechSynthesisVoice | null } | null>(null);

  useEffect(() => {
    const synth = getSpeechSynthesis();
    if (!synth) {
      setState({ locale, voice: null });
      return;
    }
    const update = () =>
      setState({ locale, voice: findVoice(synth.getVoices(), locale, { offline: isOffline() }) });
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    let detachVoices: () => void;
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', update);
      detachVoices = () => synth.removeEventListener('voiceschanged', update);
    } else {
      // addEventListener を持たない古い実装
      const previous = synth.onvoiceschanged;
      synth.onvoiceschanged = update;
      detachVoices = () => {
        if (synth.onvoiceschanged === update) synth.onvoiceschanged = previous;
      };
    }
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      detachVoices();
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
 * 読み上げが失敗したとき（停止・割り込み以外のエラー）も同じ注記に切り替える。
 *
 * 呼び出し側は表示する文ごとに key を変えること（文が変わったら読み上げを止めるため）。
 */
export default function SpeakControls({ text, locale, readAloud, stop, noVoice }: SpeakControlsProps) {
  const voice = useVoice(locale);
  const [speaking, setSpeaking] = useState(false);
  // 読み上げが失敗した（このカードでは以後ボタンを出さず注記にする）
  const [failed, setFailed] = useState(false);
  const currentRef = useRef<SpeechSynthesisUtterance | null>(null);
  const hasVoice = voice !== null && voice !== undefined;

  // 画面を閉じた・別の文に変わったときは読み上げを止める
  useEffect(() => {
    return () => {
      if (currentRef.current) {
        currentRef.current = null;
        getSpeechSynthesis()?.cancel();
      }
    };
  }, []);

  // 読み上げ中に使える音声が無くなった（電波が切れた等）ら止める
  useEffect(() => {
    if (!hasVoice && currentRef.current) {
      currentRef.current = null;
      getSpeechSynthesis()?.cancel();
      setSpeaking(false);
    }
  }, [hasVoice]);

  if (voice === undefined) return null;

  if (voice === null || failed) {
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
    utterance.onerror = (event: Pick<SpeechSynthesisErrorEvent, 'error'>) => {
      const isCurrent = currentRef.current === utterance;
      done();
      // 何も聞こえないまま黙って終わらせない。停止・割り込みは利用者の操作なので失敗にしない
      if (isCurrent && !isInterruption(event?.error)) setFailed(true);
    };
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
