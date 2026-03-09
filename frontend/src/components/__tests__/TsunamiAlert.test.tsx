import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TsunamiAlert from '../TsunamiAlert';

describe('TsunamiAlert', () => {
  // 津波なし（安全）の表示テスト
  it('津波リスクなしの場合「津波の心配なし」を表示する', () => {
    render(<TsunamiAlert warning="なし" language="ja" />);

    expect(screen.getByText('津波の心配なし')).toBeInTheDocument();
    expect(screen.getByText('安全です')).toBeInTheDocument();
  });

  it('英語で "No Tsunami Risk" を表示する', () => {
    render(<TsunamiAlert warning="None" language="en" />);

    expect(screen.getByText('No Tsunami Risk')).toBeInTheDocument();
    expect(screen.getByText('Safe')).toBeInTheDocument();
  });

  // 津波注意報の表示テスト
  it('津波注意報を正しく表示する', () => {
    render(<TsunamiAlert warning="津波注意報" language="ja" />);

    expect(screen.getByText('津波注意報')).toBeInTheDocument();
    expect(screen.getByText('海岸から離れてください')).toBeInTheDocument();
    expect(screen.getByText('予想される津波の高さ: 1m以下')).toBeInTheDocument();
  });

  // 津波警報の表示テスト
  it('津波警報の場合、避難アクションを表示する', () => {
    render(<TsunamiAlert warning="津波警報" language="ja" />);

    expect(screen.getByText('津波警報')).toBeInTheDocument();
    expect(screen.getByText('今すぐ高台へ避難！')).toBeInTheDocument();
    // 避難所検索ボタンが表示されること
    expect(screen.getByText('避難所を探す')).toBeInTheDocument();
  });

  // 大津波警報の表示テスト
  it('大津波警報を最大レベルで表示する', () => {
    render(<TsunamiAlert warning="大津波警報" language="ja" />);

    expect(screen.getByText('大津波警報')).toBeInTheDocument();
    expect(screen.getByText('最大限の警戒！今すぐ避難！')).toBeInTheDocument();
    expect(screen.getByText('予想される津波の高さ: 3m以上')).toBeInTheDocument();
  });

  // 英語での警報レベルテスト
  it('英語でのwarningレベルを正しく判定する', () => {
    render(<TsunamiAlert warning="Tsunami Warning" language="en" />);

    expect(screen.getByText('TSUNAMI WARNING')).toBeInTheDocument();
    expect(screen.getByText('Evacuate to high ground NOW!')).toBeInTheDocument();
  });

  it('英語でのmajorレベルを正しく判定する', () => {
    render(<TsunamiAlert warning="Major Tsunami Warning" language="en" />);

    expect(screen.getByText('MAJOR TSUNAMI WARNING')).toBeInTheDocument();
    expect(screen.getByText('MAXIMUM ALERT! Evacuate NOW!')).toBeInTheDocument();
  });

  // コンパクトモードのテスト
  it('コンパクトモードで簡略表示する', () => {
    render(<TsunamiAlert warning="なし" language="ja" compact />);

    // タイトルは表示されるが、詳細やボタンは表示されない
    expect(screen.getByText('津波の心配なし')).toBeInTheDocument();
    // コンパクトモードではrole="alert"が存在しない
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('コンパクトモードで警報を表示する', () => {
    render(<TsunamiAlert warning="津波警報" language="ja" compact />);

    expect(screen.getByText('津波警報')).toBeInTheDocument();
    // コンパクトモードでは避難所ボタンが表示されない
    expect(screen.queryByText('避難所を探す')).not.toBeInTheDocument();
  });

  // 多言語フォールバックテスト
  it('未対応言語はenにフォールバックする', () => {
    render(<TsunamiAlert warning="なし" language="pt" />);

    // 英語にフォールバック
    expect(screen.getByText('No Tsunami Risk')).toBeInTheDocument();
  });

  // aria属性のテスト
  it('警報時にaria-live="assertive"が設定される', () => {
    render(<TsunamiAlert warning="津波警報" language="ja" />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });

  it('安全時にaria-live="polite"が設定される', () => {
    const { container } = render(<TsunamiAlert warning="なし" language="ja" />);

    const alertDiv = container.querySelector('[aria-live="polite"]');
    expect(alertDiv).toBeInTheDocument();
  });
});
