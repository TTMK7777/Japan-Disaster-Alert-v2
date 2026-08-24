/**
 * 全画面の緊急警報を出す/出さないの判断を固定する。
 *
 * この判断は両方向に実害がある。出しすぎれば誤報で信頼を失い、
 * 出さなすぎれば最も助けが要る場面で沈黙する。
 */
import { describe, it, expect } from 'vitest';
import {
  toSeverity,
  selectAlert,
  shouldDisplay,
  canAutoDismiss,
  type TsunamiLike,
} from '../emergencyAlert';

const tsunami = (id: string, warning_level: string): TsunamiLike => ({ id, warning_level });

describe('警報レベルの対応', () => {
  it('大津波警報は最上位の重大度になる', () => {
    expect(toSeverity('major_warning')).toBe('emergency');
  });

  it('津波警報と注意報がそれぞれの段階になる', () => {
    expect(toSeverity('warning')).toBe('warning');
    expect(toSeverity('advisory')).toBe('advisory');
  });

  it('津波の心配なしでは全画面警報を出さない', () => {
    // ここで表示すると「警報が無いこと」を全画面の警報として出すことになる
    expect(toSeverity('none')).toBeNull();
  });

  it('知らない値は表示しない側に倒す', () => {
    // 気象庁側に新しい区分が増えたとき、未知を「警報」と解釈して
    // 誤って全画面を出すより、出さずに他の画面へ委ねる方が安全
    expect(toSeverity('some_new_level_from_jma')).toBeNull();
    expect(toSeverity('')).toBeNull();
  });
});

describe('複数の津波情報からの選択', () => {
  it('何も無ければ出さない', () => {
    expect(selectAlert([])).toBeNull();
  });

  it('none だけなら出さない', () => {
    expect(selectAlert([tsunami('a', 'none'), tsunami('b', 'none')])).toBeNull();
  });

  it('最も重いものを選ぶ', () => {
    const picked = selectAlert([
      tsunami('a', 'advisory'),
      tsunami('b', 'major_warning'),
      tsunami('c', 'warning'),
    ]);
    expect(picked?.id).toBe('b');
    expect(picked?.severity).toBe('emergency');
  });

  it('軽いものが先頭でも重いものが勝つ', () => {
    // 先頭を採るだけの実装だと、注意報を見せて安心させてしまう
    const picked = selectAlert([tsunami('advisory-first', 'advisory'), tsunami('big', 'major_warning')]);
    expect(picked?.id).toBe('big');
  });

  it('none が混ざっていても重いものを拾える', () => {
    const picked = selectAlert([tsunami('none', 'none'), tsunami('w', 'warning')]);
    expect(picked?.id).toBe('w');
  });
});

describe('閉じたあとの抑制', () => {
  it('閉じた警報は再表示しない', () => {
    // SSE は10秒ごとに届くので、抑制しないと閉じた直後に出続けて操作できなくなる
    const alert = selectAlert([tsunami('t1', 'warning')])!;
    expect(shouldDisplay(alert, new Set())).toBe(true);
    expect(shouldDisplay(alert, new Set([alert.dismissKey]))).toBe(false);
  });

  it('閉じたあとにレベルが上がったら必ず再表示する', () => {
    // **ここが最も重要。** id だけで抑制すると、注意報を閉じた人には
    // その後の大津波警報が二度と出ない
    const advisory = selectAlert([tsunami('same-event', 'advisory')])!;
    const dismissed = new Set([advisory.dismissKey]);

    const upgraded = selectAlert([tsunami('same-event', 'major_warning')])!;
    expect(shouldDisplay(upgraded, dismissed)).toBe(true);
  });

  it('別の津波は前の抑制に影響されない', () => {
    const first = selectAlert([tsunami('t1', 'warning')])!;
    const second = selectAlert([tsunami('t2', 'warning')])!;
    expect(shouldDisplay(second, new Set([first.dismissKey]))).toBe(true);
  });

  it('同じ警報を閉じ直しても抑制は効いたまま', () => {
    const alert = selectAlert([tsunami('t1', 'advisory')])!;
    const dismissed = new Set([alert.dismissKey]);
    const again = selectAlert([tsunami('t1', 'advisory')])!;
    expect(shouldDisplay(again, dismissed)).toBe(false);
  });
});

describe('自動で閉じてよいか', () => {
  it('津波警報と大津波警報は自動で閉じない', () => {
    // 全画面を占有してでも見てもらう設計なのに、見ていなくても
    // 数秒で消えるのでは意味がない
    expect(canAutoDismiss('emergency')).toBe(false);
    expect(canAutoDismiss('warning')).toBe(false);
  });

  it('注意報は自動で引っ込めてよい', () => {
    expect(canAutoDismiss('advisory')).toBe(true);
  });
});

// --- 見出しがレベルを正しく表すか（コンポーネント側の表と突合） ---
import { TSUNAMI_TITLES } from '../../components/EmergencyAlert';

describe('津波の見出し', () => {
  const LANGS = ['ja','en','zh','zh-TW','ko','vi','th','id','ms','tl','ne','fr','de','it','es','easy_ja'];

  it('3段階すべてで別の日本語名になる', () => {
    // レベルに関わらず「津波警報」と出していた時期があり、
    // 大津波警報を過小に、注意報を過大に伝えていた
    const names = [
      TSUNAMI_TITLES.emergency.ja,
      TSUNAMI_TITLES.warning.ja,
      TSUNAMI_TITLES.advisory.ja,
    ];
    expect(new Set(names).size).toBe(3);
    expect(TSUNAMI_TITLES.emergency.ja).toBe('大津波警報');
    expect(TSUNAMI_TITLES.warning.ja).toBe('津波警報');
    expect(TSUNAMI_TITLES.advisory.ja).toBe('津波注意報');
  });

  it('英語は気象庁の公式訳に一致する', () => {
    expect(TSUNAMI_TITLES.emergency.en).toBe('Major Tsunami Warning');
    expect(TSUNAMI_TITLES.warning.en).toBe('Tsunami Warning');
    expect(TSUNAMI_TITLES.advisory.en).toBe('Tsunami Advisory');
  });

  it.each(['emergency','warning','advisory'] as const)('%s は16言語すべてを持つ', (level) => {
    for (const lang of LANGS) {
      expect(TSUNAMI_TITLES[level][lang], `${level}/${lang} が欠けている`).toBeTruthy();
    }
  });

  it.each(LANGS)('%s では3段階が互いに異なる', (lang) => {
    // 訳し分けを怠って同じ語を3段に使うと、レベルの違いが利用者に伝わらない
    const names = [
      TSUNAMI_TITLES.emergency[lang],
      TSUNAMI_TITLES.warning[lang],
      TSUNAMI_TITLES.advisory[lang],
    ];
    expect(new Set(names).size, `${lang}: ${names.join(' / ')}`).toBe(3);
  });
});
