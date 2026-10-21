import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import ScopeNotice, { OfficialInfoLink } from '../ScopeNotice';
import { LANGUAGES, translations, getTranslation } from '@/i18n/translations';
import { NATIONAL_TRAVELER_URL, PREFECTURE_DISASTER_LINKS } from '@/lib/prefectureDisasterLinks';

/**
 * 「このアプリが扱う範囲」の帯。
 *
 * このアプリは気象庁の情報の中継で、**市町村が出す避難指示・避難所の開設状況は扱わない**。
 * 書いていないと「このアプリに出ていない＝避難指示は出ていない」と読まれる（命に関わる誤解）。
 *
 * 文言は getTranslation 経由だと英語・日本語にフォールバックして欠落が見えなくなるので、
 * ここでは**各言語の表そのもの**（translations[lang]）から期待値を取る。キーを 1 言語消せば落ちる。
 */

const SCOPE_KEYS = ['scope.jmaRelay', 'scope.notCovered', 'scope.prefectureLink', 'scope.travelerLink'];

afterEach(cleanup);

function own(lang: string, key: string): string {
  const value = translations[lang]?.[key];
  expect(typeof value === 'string' && value.trim().length > 0, `${lang} に ${key} が無い`).toBe(true);
  return value as string;
}

describe('ScopeNotice — 16 言語', () => {
  it.each(LANGUAGES.map((l) => [l.code]))('%s: 中継・扱わない範囲・全国リンクを自分の言語で出す', (lang) => {
    render(<ScopeNotice language={lang} prefCode={null} />);
    const band = screen.getByTestId('scope-notice');
    expect(within(band).getByText(own(lang, 'scope.jmaRelay'))).toBeInTheDocument();
    expect(within(band).getByText(own(lang, 'scope.notCovered'))).toBeInTheDocument();
    const link = within(band).getByRole('link');
    expect(link).toHaveTextContent(own(lang, 'scope.travelerLink'));
    expect(link).toHaveAttribute('href', NATIONAL_TRAVELER_URL);
  });

  it('16 言語すべてが 4 キーを自分の訳で持つ（英語の流用ではない）', () => {
    for (const { code } of LANGUAGES) {
      for (const key of SCOPE_KEYS) {
        own(code, key);
        if (code !== 'en') expect(translations[code][key], `${code} ${key}`).not.toBe(translations.en[key]);
      }
    }
  });
});

describe('ScopeNotice — 地域のリンク', () => {
  const tokyo = PREFECTURE_DISASTER_LINKS.find((l) => l.pref === '13')!;
  const okinawa = PREFECTURE_DISASTER_LINKS.find((l) => l.pref === '47')!;

  it('地域が決まっていれば県のリンク（英語は外国語ページ・県名つき）', () => {
    render(<ScopeNotice language="en" prefCode="130000" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', tokyo.foreignUrl!);
    expect(link).toHaveTextContent(translations.en['scope.prefectureLink']);
    expect(link).toHaveTextContent('Tokyo');
  });

  it('セレクタに無い予報区（八重山 474000）でも沖縄県のリンク', () => {
    render(<ScopeNotice language="ja" prefCode="474000" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', okinawa.disasterUrl);
    expect(link).toHaveTextContent('沖縄県');
  });

  it('存在しないコードは全国リンク', () => {
    render(<ScopeNotice language="en" prefCode="460000" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', NATIONAL_TRAVELER_URL);
    expect(link).toHaveTextContent(translations.en['scope.travelerLink']);
  });

  it('言語を切り替えると文言とリンク先が追従する', () => {
    const { rerender } = render(<ScopeNotice language="ja" prefCode="130000" />);
    expect(screen.getByRole('link')).toHaveAttribute('href', tokyo.disasterUrl);
    expect(screen.getByText(translations.ja['scope.notCovered'])).toBeInTheDocument();

    rerender(<ScopeNotice language="th" prefCode="130000" />);
    expect(screen.getByRole('link')).toHaveAttribute('href', tokyo.foreignUrl!);
    expect(screen.getByText(translations.th['scope.notCovered'])).toBeInTheDocument();
    expect(screen.queryByText(translations.ja['scope.notCovered'])).toBeNull();
  });
});

describe('OfficialInfoLink — 外部リンクの作法', () => {
  it.each([[null], ['130000'], ['999999']])('%s: 新しいタブ・opener と referrer を渡さない', (code) => {
    render(<OfficialInfoLink language="en" areaCode={code} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('target', '_blank');
    const rel = (link.getAttribute('rel') ?? '').split(/\s+/);
    expect(rel).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
  });
});

describe('ScopeNotice — 地域未選択の案内（B8）', () => {
  it('未選択なら「地域を選ぶと公式ページが切り替わる」をリンクのそばに出し、選択済みなら出さない', () => {
    const { rerender } = render(<ScopeNotice language="en" prefCode={null} />);
    expect(screen.getByTestId('official-switch-hint')).toHaveTextContent(
      getTranslation('en', 'region.officialSwitchHint')
    );
    rerender(<ScopeNotice language="en" prefCode="130000" />);
    expect(screen.queryByTestId('official-switch-hint')).toBeNull();
  });

  it('scope.jmaRelay は肯定形の新しい文言', () => {
    render(<ScopeNotice language="ja" prefCode={null} />);
    expect(screen.getByTestId('scope-notice')).toHaveTextContent('このアプリは、気象庁が発表した警報・情報をお伝えします。');
  });
});
