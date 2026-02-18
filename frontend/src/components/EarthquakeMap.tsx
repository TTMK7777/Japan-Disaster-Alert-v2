'use client';

import { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { IntensityBadge, IntensityScale } from './IntensityGauge';
import TsunamiAlert, { TsunamiLevelIndicator } from './TsunamiAlert';
import type { Earthquake } from '@/types/earthquake';

interface EarthquakeMapProps {
  earthquakes: Earthquake[];
  language: string;
}

// 震度に応じた色を返す（色覚多様性対応版）
const intensityConfig: Record<string, { color: string; borderColor: string; textColor: string; pattern?: string }> = {
  '1': { color: '#E5E7EB', borderColor: '#9CA3AF', textColor: '#374151' },
  '2': { color: '#93C5FD', borderColor: '#3B82F6', textColor: '#1E40AF' },
  '3': { color: '#3B82F6', borderColor: '#1D4ED8', textColor: 'white' },
  '4': { color: '#FDE047', borderColor: '#CA8A04', textColor: '#713F12' },
  '5弱': { color: '#FBBF24', borderColor: '#D97706', textColor: '#713F12', pattern: 'stripe' },
  '5強': { color: '#F97316', borderColor: '#C2410C', textColor: 'white', pattern: 'stripe' },
  '6弱': { color: '#EF4444', borderColor: '#B91C1C', textColor: 'white', pattern: 'dot' },
  '6強': { color: '#DC2626', borderColor: '#991B1B', textColor: 'white', pattern: 'dot' },
  '7': { color: '#7C3AED', borderColor: '#5B21B6', textColor: 'white', pattern: 'cross' },
};

// カスタムマーカーアイコンを作成（改善版：より大きく、パターン付き）
function createIntensityIcon(intensity: string): L.DivIcon {
  const config = intensityConfig[intensity] || intensityConfig['1'];

  // サイズは震度に応じて変化
  const baseSize = 24;
  const intensityNum = parseInt(intensity.replace(/[弱強]/g, '')) || 1;
  const size = baseSize + Math.min(intensityNum * 4, 24);

  // パターン（色覚多様性対応）
  let patternHtml = '';
  if (config.pattern === 'stripe') {
    patternHtml = `
      <div style="position:absolute;top:50%;left:0;right:0;height:4px;background:rgba(0,0,0,0.3);transform:translateY(-50%) rotate(45deg);"></div>
    `;
  } else if (config.pattern === 'dot') {
    patternHtml = `
      <div style="position:absolute;top:50%;left:50%;width:8px;height:8px;background:rgba(255,255,255,0.5);border-radius:50%;transform:translate(-50%,-50%);"></div>
    `;
  } else if (config.pattern === 'cross') {
    patternHtml = `
      <div style="position:absolute;top:50%;left:0;right:0;height:3px;background:rgba(255,255,255,0.5);transform:translateY(-50%);"></div>
      <div style="position:absolute;left:50%;top:0;bottom:0;width:3px;background:rgba(255,255,255,0.5);transform:translateX(-50%);"></div>
    `;
  }

  // 震度5以上はアニメーション
  const animation = intensityNum >= 5 ? 'animation: marker-pulse 1.5s ease-in-out infinite;' : '';

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
          <span style="position:relative;z-index:1;">${intensity.replace('弱', '-').replace('強', '+')}</span>
        </div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

// 影響範囲の円の色
function getImpactCircleColor(intensity: string): string {
  const config = intensityConfig[intensity];
  return config?.color || '#9CA3AF';
}

// 影響範囲の半径（km -> m）
function getImpactRadius(magnitude: number, depth: number): number {
  // マグニチュードと深さから影響範囲を概算
  const baseRadius = Math.pow(10, (magnitude - 2) / 2) * 10; // km
  const depthFactor = Math.max(0.5, 1 - depth / 200);
  return baseRadius * depthFactor * 1000; // メートルに変換
}

// 多言語テキスト
const mapTranslations: Record<string, Record<string, string>> = {
  intensity: { ja: '震度', en: 'Intensity', zh: '震度', ko: '진도', vi: 'Cường độ', ne: 'तीव्रता', easy_ja: 'しんど' },
  magnitude: { ja: 'マグニチュード', en: 'Magnitude', zh: '震级', ko: '규모', vi: 'Độ lớn', ne: 'परिमाण', easy_ja: 'マグニチュード' },
  depth: { ja: '深さ', en: 'Depth', zh: '深度', ko: '깊이', vi: 'Độ sâu', ne: 'गहिराई', easy_ja: 'ふかさ' },
  time: { ja: '発生時刻', en: 'Time', zh: '发生时间', ko: '발생 시간', vi: 'Thời gian', ne: 'समय', easy_ja: 'じこく' },
  tsunami: { ja: '津波', en: 'Tsunami', zh: '海啸', ko: '쓰나미', vi: 'Sóng thần', ne: 'सुनामी', easy_ja: 'つなみ' },
  legend: { ja: '凡例', en: 'Legend', zh: '图例', ko: '범례', vi: 'Chú thích', ne: 'संकेत', easy_ja: 'めやす' },
  noLocation: { ja: '位置情報なし', en: 'No location data', zh: '无位置信息', ko: '위치 정보 없음', vi: 'Không có vị trí', ne: 'स्थान छैन', easy_ja: 'ばしょの じょうほう なし' },
};

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

  const t = (key: keyof typeof mapTranslations) =>
    mapTranslations[key][language as keyof typeof mapTranslations[typeof key]] || mapTranslations[key].en;

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
            {language === 'ja' ? '影響範囲を表示' : language === 'easy_ja' ? 'えいきょう はんい' : 'Show impact area'}
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
        <TileLayer
          attribution='&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>'
          url="https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png"
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
                    <div className="text-xl font-bold text-gray-800">M{earthquake.magnitude}</div>
                  </div>

                  {/* 深さ */}
                  <div className="text-center p-2 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">{t('depth')}</div>
                    <div className="text-xl font-bold text-gray-800">{earthquake.depth}km</div>
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
                    {new Date(earthquake.time).toLocaleString(language === 'ja' ? 'ja-JP' : 'en-US', {
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
