import { describe, expect, it } from 'vitest';
import { findVoice } from '@/lib/speechVoice';

function v(lang: string, localService = true) {
  return { lang, localService, name: `voice-${lang}-${localService}` };
}

describe('findVoice（その言語の音声があるか）', () => {
  it('音声が 0 件なら null', () => {
    expect(findVoice([], 'th-TH')).toBeNull();
  });

  it('同じ言語の音声が無ければ null', () => {
    expect(findVoice([v('en-US'), v('ja-JP')], 'th-TH')).toBeNull();
  });

  it('地域違いでも同じ言語なら使う（ms-MY 指定に ms）', () => {
    expect(findVoice([v('ms')], 'ms-MY')?.lang).toBe('ms');
  });

  it('完全一致を地域違いより優先する', () => {
    expect(findVoice([v('en-GB'), v('en-US')], 'en-US')?.lang).toBe('en-US');
  });

  it('端末内の音声を通信が要る音声より優先する（電波が無くても読める）', () => {
    const voice = findVoice([v('ja-JP', false), v('ja-JP', true)], 'ja-JP');
    expect(voice?.localService).toBe(true);
  });

  it('アンダースコア区切り・大文字小文字の違いを吸収する（Android の th_TH）', () => {
    expect(findVoice([v('th_TH')], 'th-TH')?.lang).toBe('th_TH');
  });

  it('簡体字中国語に繁体字・香港の音声を当てない', () => {
    expect(findVoice([v('zh-TW'), v('zh-HK')], 'zh-CN')).toBeNull();
    expect(findVoice([v('zh-TW'), v('zh-CN')], 'zh-CN')?.lang).toBe('zh-CN');
  });

  it('繁體中文（台湾）に簡体字・広東語（香港）の音声を当てない', () => {
    expect(findVoice([v('zh-CN'), v('zh-HK')], 'zh-TW')).toBeNull();
    expect(findVoice([v('zh-CN'), v('zh-Hant-TW')], 'zh-TW')?.lang).toBe('zh-Hant-TW');
  });

  it('フィリピノ語は fil と tl のどちらの表記も受ける', () => {
    expect(findVoice([v('fil-PH')], 'fil-PH')?.lang).toBe('fil-PH');
    expect(findVoice([v('tl-PH')], 'fil-PH')?.lang).toBe('tl-PH');
  });
});
