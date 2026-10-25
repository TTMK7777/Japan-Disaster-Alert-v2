import { describe, expect, it } from 'vitest';
import { readSwCache } from '../fetchFailure';

const DATE = 'Wed, 21 Oct 2026 00:00:00 GMT';
const SAVED = '2026-10-21T00:01:00.000Z';
const response = (values: Record<string, string>) => ({ headers: new Headers(values) });

describe('readSwCache — 旧キャッシュの取得時刻', () => {
  it('保存時刻があれば HTTP Date より優先する', () => {
    expect(readSwCache(response({ 'X-SW-Cache': '1', 'X-SW-Cached-At': SAVED, Date: DATE })))
      .toEqual({ fromCache: true, cachedAt: Date.parse(SAVED) });
  });

  it.each([undefined, '', 'invalid'])('保存時刻が %s なら HTTP Date を推定時刻に使う', (saved) => {
    const headers: Record<string, string> = { 'X-SW-Cache': '1', Date: DATE };
    if (saved !== undefined) headers['X-SW-Cached-At'] = saved;
    expect(readSwCache(response(headers))).toEqual({ fromCache: true, cachedAt: Date.parse(DATE) });
  });

  it.each([undefined, '', 'invalid'])('HTTP Date が %s で保存時刻も不明なら時刻を捏造しない', (date) => {
    const headers: Record<string, string> = { 'X-SW-Cache': '1' };
    if (date !== undefined) headers.Date = date;
    expect(readSwCache(response(headers))).toEqual({ fromCache: true, cachedAt: null });
  });

  it('通常応答は Date や保存時刻があってもキャッシュとしない', () => {
    expect(readSwCache(response({ Date: DATE, 'X-SW-Cached-At': SAVED })))
      .toEqual({ fromCache: false, cachedAt: null });
  });

  it('ヘッダがない応答も通常応答として扱う', () => {
    expect(readSwCache({})).toEqual({ fromCache: false, cachedAt: null });
  });
});
