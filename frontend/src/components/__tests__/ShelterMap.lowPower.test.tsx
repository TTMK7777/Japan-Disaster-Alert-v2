import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { getTranslation } from '@/i18n/translations';

/**
 * 低電力モードでは避難所タブを開いただけで地図タイルを読み込まない。
 * 地図タイルは 1 画面で数十枚の画像取得になり、回線と電池を最も食う。
 * 利用者が「地図を表示」を押したときだけ読み込む。現在地ボタンと一覧は地図なしでも使える。
 */

vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('leaflet', () => ({ default: { divIcon: vi.fn(() => ({})) } }));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: () => null,
  Popup: () => null,
  Circle: () => null,
  useMap: () => ({ flyTo: vi.fn() }),
}));

import ShelterMap from '../ShelterMap';

describe('ShelterMap — 地図の遅延読み込み', () => {
  it('通常は地図を出す（従来どおり）', () => {
    render(<ShelterMap language="ja" />);
    expect(screen.getByTestId('tile-layer')).toBeInTheDocument();
  });

  it('deferMap なら押されるまで地図タイルを出さない', () => {
    render(<ShelterMap language="ja" deferMap />);
    expect(screen.queryByTestId('tile-layer')).toBeNull();
    expect(screen.queryByTestId('map-container')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: getTranslation('ja', 'lowPower.showMap') }));
    expect(screen.getByTestId('tile-layer')).toBeInTheDocument();
  });

  it('一度出した地図は deferMap に変わっても消さない（利用者の選択を優先）', () => {
    const { rerender } = render(<ShelterMap language="ja" />);
    rerender(<ShelterMap language="ja" deferMap />);
    expect(screen.getByTestId('tile-layer')).toBeInTheDocument();
  });
});
