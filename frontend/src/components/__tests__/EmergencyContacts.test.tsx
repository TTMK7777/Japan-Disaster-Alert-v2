import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EmergencyContacts from '../EmergencyContacts';

describe('EmergencyContacts', () => {
  // 日本語での緊急連絡先表示テスト
  it('日本語の緊急連絡先を表示する', () => {
    render(<EmergencyContacts language="ja" />);

    // タイトル
    expect(screen.getByText('緊急連絡先')).toBeInTheDocument();
    expect(screen.getByText('災害時にお使いください')).toBeInTheDocument();
  });

  // 緊急番号が正しく表示されること
  it('110, 119, 118 の緊急番号が表示される', () => {
    render(<EmergencyContacts language="ja" />);

    expect(screen.getByText('110')).toBeInTheDocument();
    expect(screen.getByText('119')).toBeInTheDocument();
    expect(screen.getByText('118')).toBeInTheDocument();
  });

  // 電話リンクが正しく設定されていること
  it('電話番号がtel:リンクとして設定される', () => {
    render(<EmergencyContacts language="ja" />);

    const links = screen.getAllByRole('link');
    const telLinks = links.filter(
      (link) => link.getAttribute('href')?.startsWith('tel:')
    );

    // 少なくとも緊急通報3つ + 相談2つ = 5つのtel:リンク
    expect(telLinks.length).toBeGreaterThanOrEqual(5);

    // 110, 119, 118 へのリンクが存在
    expect(telLinks.some((l) => l.getAttribute('href') === 'tel:110')).toBe(true);
    expect(telLinks.some((l) => l.getAttribute('href') === 'tel:119')).toBe(true);
    expect(telLinks.some((l) => l.getAttribute('href') === 'tel:118')).toBe(true);
  });

  // 英語表示テスト
  it('英語で緊急連絡先を表示する', () => {
    render(<EmergencyContacts language="en" />);

    expect(screen.getByText('Emergency Contacts')).toBeInTheDocument();
    expect(screen.getByText('Use during disasters')).toBeInTheDocument();
    expect(screen.getByText('Police')).toBeInTheDocument();
    expect(screen.getByText('Fire/Ambulance')).toBeInTheDocument();
    expect(screen.getByText('Coast Guard')).toBeInTheDocument();
  });

  // 中国語表示テスト
  it('中国語で緊急連絡先を表示する', () => {
    render(<EmergencyContacts language="zh" />);

    expect(screen.getByText('紧急联系电话')).toBeInTheDocument();
    expect(screen.getByText('灾害时使用')).toBeInTheDocument();
  });

  // 韓国語表示テスト
  it('韓国語で緊急連絡先を表示する', () => {
    render(<EmergencyContacts language="ko" />);

    expect(screen.getByText('긴급 연락처')).toBeInTheDocument();
    expect(screen.getByText('재해 시 사용')).toBeInTheDocument();
  });

  // 未対応言語はenにフォールバック
  it('未対応の言語はenにフォールバックする', () => {
    render(<EmergencyContacts language="de" />);

    // 英語にフォールバック
    expect(screen.getByText('Emergency Contacts')).toBeInTheDocument();
    expect(screen.getByText('Police')).toBeInTheDocument();
  });

  // Japan Visitor Hotline が全言語で表示されること
  it('Japan Visitor Hotline が表示される', () => {
    render(<EmergencyContacts language="ja" />);

    expect(screen.getByText('Japan Visitor Hotline')).toBeInTheDocument();
    expect(screen.getByText('050-3816-2787')).toBeInTheDocument();
  });

  // Tipsセクションの表示テスト
  it('安全のヒント（Tips）が表示される', () => {
    render(<EmergencyContacts language="ja" />);

    expect(screen.getByText('Tips')).toBeInTheDocument();
    expect(
      screen.getByText('日本語が話せない場合は「English please」と伝えてください')
    ).toBeInTheDocument();
  });

  it('英語のTipsが表示される', () => {
    render(<EmergencyContacts language="en" />);

    expect(screen.getByText('Tips')).toBeInTheDocument();
    expect(
      screen.getByText('Say "English please" if you need English support')
    ).toBeInTheDocument();
  });

  // セクション構造のテスト
  it('緊急通報と災害相談のセクションが表示される', () => {
    render(<EmergencyContacts language="ja" />);

    expect(screen.getByText('緊急通報')).toBeInTheDocument();
    expect(screen.getByText('災害・観光相談')).toBeInTheDocument();
  });

  // アクセシビリティテスト
  it('電話リンクにaria-labelが設定されている', () => {
    render(<EmergencyContacts language="en" />);

    const policeLink = screen.getByLabelText('Call Police at 110');
    expect(policeLink).toBeInTheDocument();
  });
});
