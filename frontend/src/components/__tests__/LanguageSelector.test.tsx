import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LanguageSelector from '../LanguageSelector';
import { LANGUAGES } from '@/i18n/translations';

describe('LanguageSelector', () => {
  // 現在の言語が選択された状態でレンダリングされること
  it('現在の言語が選択された状態でレンダリングされる', () => {
    render(
      <LanguageSelector
        currentLanguage="ja"
        onLanguageChange={() => {}}
      />
    );

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('ja');
  });

  // 全16言語がオプションとして表示されること
  it('全16言語がオプションとして表示される', () => {
    render(
      <LanguageSelector
        currentLanguage="en"
        onLanguageChange={() => {}}
      />
    );

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(LANGUAGES.length);

    // 各言語のコードが正しくセットされていること
    LANGUAGES.forEach((lang) => {
      const option = options.find(
        (opt) => (opt as HTMLOptionElement).value === lang.code
      );
      expect(option).toBeDefined();
    });
  });

  // 言語を選択するとonLanguageChangeが呼ばれること
  it('言語を選択するとonLanguageChangeが呼ばれる', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <LanguageSelector
        currentLanguage="ja"
        onLanguageChange={onChange}
      />
    );

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'en');

    expect(onChange).toHaveBeenCalledWith('en');
  });

  // 異なる言語への切り替えが正しく動作すること
  it('複数言語への切り替えが正しく動作する', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <LanguageSelector
        currentLanguage="ja"
        onLanguageChange={onChange}
      />
    );

    const select = screen.getByRole('combobox');

    // 中国語に切り替え
    await user.selectOptions(select, 'zh');
    expect(onChange).toHaveBeenCalledWith('zh');

    // 韓国語に切り替え
    await user.selectOptions(select, 'ko');
    expect(onChange).toHaveBeenCalledWith('ko');
  });
});
