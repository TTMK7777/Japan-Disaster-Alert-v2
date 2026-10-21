/**
 * 端末の読み上げ（Web Speech API の speechSynthesis）に関する判定。
 *
 * 読み上げは補助。音声が無い端末・言語でも文字の表示は必ず残す。
 * ここでは「その言語を読める音声が端末にあるか」だけを決める。
 */

type VoiceLike = Pick<SpeechSynthesisVoice, 'lang' | 'localService'>;

function normalizeTag(tag: string): string {
  return tag.replace(/_/g, '-').toLowerCase();
}

function primary(tag: string): string {
  const p = tag.split('-')[0];
  // フィリピノ語は fil / tl の両方の表記がある
  return p === 'tl' ? 'fil' : p;
}

/** 繁体字（台湾）の音声か。香港・マカオは広東語の音声なので含めない */
function isTaiwanChinese(tag: string): boolean {
  return /^zh-(tw|hant(-tw)?)$/.test(tag) || tag.startsWith('zh-hant-tw');
}

function isOtherNonMandarinSimplified(tag: string): boolean {
  return /^zh-(tw|hk|mo|hant|yue)/.test(tag) || tag.startsWith('yue');
}

function compatible(voiceTag: string, targetTag: string): boolean {
  if (primary(voiceTag) !== primary(targetTag)) return false;
  if (primary(targetTag) !== 'zh') return true;
  const wantTaiwan = isTaiwanChinese(targetTag);
  return wantTaiwan ? isTaiwanChinese(voiceTag) : !isOtherNonMandarinSimplified(voiceTag);
}

/**
 * `locale`（例 'th-TH'）を読める音声を返す。無ければ null。
 * 優先: 完全一致 > 同じ言語。同順位なら端末内の音声（電波が無くても読める）を先に。
 */
export function findVoice<V extends VoiceLike>(voices: readonly V[], locale: string): V | null {
  const target = normalizeTag(locale);
  let best: V | null = null;
  let bestScore = -1;
  for (const voice of voices) {
    const tag = normalizeTag(voice.lang || '');
    if (!tag || !compatible(tag, target)) continue;
    const score = (tag === target ? 2 : 0) + (voice.localService ? 1 : 0);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}

/** speechSynthesis と SpeechSynthesisUtterance の両方がある環境だけ返す */
export function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  const synth = (window as Window & { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
  const Utterance = (window as Window & { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
  if (!synth || typeof Utterance !== 'function') return null;
  return synth;
}
