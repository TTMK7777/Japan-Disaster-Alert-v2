'use client';

import { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { formatMagnitude, formatDepth } from '@/lib/earthquakeFormat';
import { IntensityBadge, IntensityScale, resolveIntensityData, glyph } from './IntensityGauge';
import TsunamiAlert from './TsunamiAlert';
import type { Earthquake } from '@/types/earthquake';
import { getTranslation, getLocale } from '@/i18n/translations';

interface EarthquakeMapProps {
  earthquakes: Earthquake[];
  language: string;
}

// 震度に応じた色を返す（色覚多様性対応版）
// 震度の配色は IntensityGauge の resolveIntensityData に一本化してある。
// 以前ここに独自のパレット（Tailwind 系の色）が複製されており、
// **同じ地震がマーカーとポップアップで違う色**で出ていた。さらに未知の震度を
// 震度1へフォールバックしていたため、「不明」なだけの地震が地図上で
// 最も穏やかな見た目になっていた — IntensityGauge が明示的に直した誤りの再現。
// 統合により地図も気象庁の震度配色（テレビ・自治体掲示と同じ）で出る。

// 色覚多様性対応のパターン。level は resolveIntensityData の並び
// （5弱=5, 5強=6, 6弱=7, 6強=8, 7=9。未知=0）
function patternFor(level: number): string | undefined {
  if (level >= 9) return 'cross';
  if (level >= 7) return 'dot';
  if (level >= 5) return 'stripe';
  return undefined;
}

// カスタムマーカーアイコンを作成
function createIntensityIcon(intensity: string): L.DivIcon {
  const config = resolveIntensityData(intensity);

  // サイズは震度に応じて変化（未知 = level 0 は最小サイズの無彩色）
  const baseSize = 24;
  const size = baseSize + Math.min(config.level * 3, 27);

  // パターン（色覚多様性対応）
  let patternHtml = '';
  if (patternFor(config.level) === 'stripe') {
    patternHtml = `
      <div style="position:absolute;top:50%;left:0;right:0;height:4px;background:rgba(0,0,0,0.3);transform:translateY(-50%) rotate(45deg);"></div>
    `;
  } else if (patternFor(config.level) === 'dot') {
    patternHtml = `
      <div style="position:absolute;top:50%;left:50%;width:8px;height:8px;background:rgba(255,255,255,0.5);border-radius:50%;transform:translate(-50%,-50%);"></div>
    `;
  } else if (patternFor(config.level) === 'cross') {
    patternHtml = `
      <div style="position:absolute;top:50%;left:0;right:0;height:3px;background:rgba(255,255,255,0.5);transform:translateY(-50%);"></div>
      <div style="position:absolute;left:50%;top:0;bottom:0;width:3px;background:rgba(255,255,255,0.5);transform:translateX(-50%);"></div>
    `;
  }

  // 震度5弱（level 5）以上はアニメーション
  const animation = config.level >= 5 ? 'animation: marker-pulse 1.5s ease-in-out infinite;' : '';

  return L.divIcon({
    className: 'earthquake-marker-enhanced',
    html: `
      <div style="
        position: relative;
        width: ${size}px;
        height: ${size}px;
        ${animation}
      ">
        <div style="
          width: 100%;
          height: 100%;
          background: ${config.color};
          border: 3px solid ${config.borderColor};
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: ${size * 0.45}px;
          color: ${config.textColor};
          box-shadow: 0 3px 8px rgba(0,0,0,0.3);
          overflow: hidden;
          position: relative;
        ">
          ${patternHtml}
          <span style="position:relative;z-index:1;">${glyph(intensity)}</span>
        </div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

// 影響範囲の円の色（マーカー・バッジと同じパレットから引く）
function getImpactCircleColor(intensity: string): string {
  return resolveIntensityData(intensity).color;
}

// 影響範囲の半径（km -> m）
function getImpactRadius(magnitude: number, depth: number): number {
  // マグニチュードと深さから影響範囲を概算
  const baseRadius = Math.pow(10, (magnitude - 2) / 2) * 10; // km
  const depthFactor = Math.max(0.5, 1 - depth / 200);
  return baseRadius * depthFactor * 1000; // メートルに変換
}

// Map translation keys to centralized translations
const MAP_KEYS = {
  intensity: 'map.intensity',
  magnitude: 'map.magnitude',
  depth: 'map.depth',
  time: 'map.time',
  tsunami: 'map.tsunami',
  legend: 'map.legend',
  noLocation: 'map.noLocation',
  showImpact: 'map.showImpact',
} as const;

// 地図をフィットさせるコンポーネント
function MapFitter({ earthquakes }: { earthquakes: Earthquake[] }) {
  const map = useMap();

  useEffect(() => {
    const validEqs = earthquakes.filter(eq => eq.latitude && eq.longitude);
    if (validEqs.length > 0) {
      const bounds = L.latLngBounds(validEqs.map(eq => [eq.latitude, eq.longitude]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
    } else {
      // データがない場合は日本を表示
      map.setView([36.5, 138.0], 5);
    }
  }, [earthquakes, map]);

  return null;
}

export default function EarthquakeMap({ earthquakes, language }: EarthquakeMapProps) {
  const [selectedEarthquake, setSelectedEarthquake] = useState<Earthquake | null>(null);
  const [showImpactCircles, setShowImpactCircles] = useState(true);

  // 日本の中心座標（デフォルト）
  const defaultCenter: [number, number] = [36.5, 138.0];
  const defaultZoom = 5;

  // 有効な座標を持つ地震のみフィルタリング（日本周辺の座標範囲でチェック）
  const validEarthquakes = useMemo(
    () => earthquakes.filter(eq =>
      eq.latitude && eq.longitude &&
      !isNaN(eq.latitude) && !isNaN(eq.longitude) &&
      eq.latitude >= 20 && eq.latitude <= 50 &&  // 日本の緯度範囲
      eq.longitude >= 120 && eq.longitude <= 155  // 日本の経度範囲
    ),
    [earthquakes]
  );

  const t = (key: keyof typeof MAP_KEYS) =>
    getTranslation(language, MAP_KEYS[key]);

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* コントロール */}
      <div className="p-2 bg-gray-50 border-b flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showImpactCircles}
            onChange={(e) => setShowImpactCircles(e.target.checked)}
            className="rounded"
          />
          <span className="text-gray-700">
            {t('showImpact')}
          </span>
        </label>

        {/* データなし警告 */}
        {validEarthquakes.length === 0 && (
          <span className="text-sm text-gray-500">{t('noLocation')}</span>
        )}
      </div>

      {/* 地図 */}
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        className="leaflet-container"
        scrollWheelZoom={true}
      >
        {/* 国土地理院タイル（無料） */}
        {/* crossOrigin: CORS で取得する。既定（crossorigin 無し）だと Service Worker が
            受け取るのは status 0 の opaque レスポンスで response.ok が常に false になり、
            タイルが一枚もキャッシュされずオフラインで地図が出ない（実測で確認済み） */}
        <TileLayer
          attribution='&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>'
          url="https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png"
          crossOrigin="anonymous"
        />

        {/* 地図を地震に合わせてフィット */}
        {validEarthquakes.length > 0 && <MapFitter earthquakes={validEarthquakes} />}

        {/* 影響範囲の円 */}
        {showImpactCircles && validEarthquakes.map((earthquake) => (
          <Circle
            key={`circle-${earthquake.id}`}
            center={[earthquake.latitude, earthquake.longitude]}
            radius={getImpactRadius(earthquake.magnitude, earthquake.depth)}
            pathOptions={{
              color: getImpactCircleColor(earthquake.max_intensity),
              fillColor: getImpactCircleColor(earthquake.max_intensity),
              fillOpacity: 0.15,
              weight: 1,
            }}
          />
        ))}

        {/* 地震マーカー */}
        {validEarthquakes.map((earthquake) => (
          <Marker
            key={earthquake.id}
            position={[earthquake.latitude, earthquake.longitude]}
            icon={createIntensityIcon(earthquake.max_intensity)}
            eventHandlers={{
              click: () => setSelectedEarthquake(earthquake),
            }}
          >
            <Popup minWidth={280} maxWidth={350}>
              <div className="text-sm space-y-3">
                {/* タイトル */}
                <h3 className="font-bold text-lg text-disaster-blue">
                  {language === 'ja' ? earthquake.location : (earthquake.location_translated || earthquake.location)}
                </h3>

                {/* メイン情報グリッド */}
                <div className="grid grid-cols-3 gap-2">
                  {/* 震度 */}
                  <div className="text-center p-2 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">{t('intensity')}</div>
                    <IntensityBadge intensity={earthquake.max_intensity} language={language} />
                  </div>

                  {/* マグニチュード */}
                  <div className="text-center p-2 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">{t('magnitude')}</div>
                    <div className="text-xl font-bold text-gray-800">{formatMagnitude(earthquake.magnitude)}</div>
                  </div>

                  {/* 深さ */}
                  <div className="text-center p-2 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">{t('depth')}</div>
                    {/* 震度速報の深さは -1（未確定）。素通しすると "-1km" が出る */}
                    <div className="text-xl font-bold text-gray-800">{formatDepth(earthquake.depth)}</div>
                  </div>
                </div>

                {/* 津波情報 */}
                <div>
                  <div className="text-xs text-gray-500 mb-1">{t('tsunami')}</div>
                  <TsunamiAlert warning={earthquake.tsunami_warning} language={language} compact />
                </div>

                {/* 発生時刻 */}
                <div className="flex items-center gap-2 text-gray-600">
                  <span className="text-xs">{t('time')}:</span>
                  <span className="font-medium">
                    {new Date(earthquake.time).toLocaleString(getLocale(language), {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* 凡例 */}
      <div className="p-3 border-t bg-gray-50">
        <p className="text-xs text-gray-600 mb-2 font-medium">{t('legend')}</p>

        {/* 震度スケール */}
        <IntensityScale currentIntensity={selectedEarthquake?.max_intensity} language={language} />

        {/* パターン説明（色覚多様性対応） */}
        <div className="mt-2 flex gap-4 text-[10px] text-gray-500">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-orange-400" style={{ background: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)' }} />
            5-/5+ (stripe)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-red-500 rounded-full relative">
              <span className="absolute inset-0 m-auto w-1.5 h-1.5 bg-white/50 rounded-full" />
            </span>
            6-/6+ (dot)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-purple-600 relative">
              <span className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/50 -translate-y-1/2" />
              <span className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/50 -translate-x-1/2" />
            </span>
            7 (cross)
          </span>
        </div>
      </div>
    </div>
  );
}
