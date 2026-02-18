'use client';

import React, { useState, useCallback } from 'react';
import { TileLayer, LayersControl } from 'react-leaflet';

interface HazardMapLayerProps {
  language?: string;
  onLayerChange?: (activeLayers: string[]) => void;
}

// 多言語対応のテキスト
const translations: Record<string, Record<string, string>> = {
  ja: {
    flood: '洪水浸水想定区域',
    tsunami: '津波浸水想定区域',
    landslide: '土砂災害警戒区域',
    stormSurge: '高潮浸水想定区域',
    hazardLayers: 'ハザードマップレイヤー',
    baseMap: '基本地図',
    showHazard: 'ハザードマップを表示',
  },
  en: {
    flood: 'Flood Inundation Area',
    tsunami: 'Tsunami Inundation Area',
    landslide: 'Landslide Warning Area',
    stormSurge: 'Storm Surge Inundation Area',
    hazardLayers: 'Hazard Map Layers',
    baseMap: 'Base Map',
    showHazard: 'Show Hazard Map',
  },
  easy_ja: {
    flood: 'こうずい の きけんな ばしょ',
    tsunami: 'つなみ の きけんな ばしょ',
    landslide: 'どしゃさいがい の きけんな ばしょ',
    stormSurge: 'たかしお の きけんな ばしょ',
    hazardLayers: 'きけんな ばしょ の ちず',
    baseMap: 'きほんの ちず',
    showHazard: 'きけんな ばしょを みる',
  },
  zh: {
    flood: '洪水淹没预测区域',
    tsunami: '海啸淹没预测区域',
    landslide: '泥石流警戒区域',
    stormSurge: '风暴潮淹没预测区域',
    hazardLayers: '危险地图图层',
    baseMap: '基础地图',
    showHazard: '显示危险地图',
  },
  ko: {
    flood: '홍수 침수 예상 구역',
    tsunami: '쓰나미 침수 예상 구역',
    landslide: '산사태 경계 구역',
    stormSurge: '폭풍 해일 침수 예상 구역',
    hazardLayers: '재해 지도 레이어',
    baseMap: '기본 지도',
    showHazard: '재해 지도 표시',
  },
};

// ハザードマップのタイルURL（国土地理院ハザードマップポータル）
const hazardTileLayers = {
  // 洪水浸水想定区域（計画規模）
  flood: {
    url: 'https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png',
    attribution: '国土地理院ハザードマップポータル',
    opacity: 0.6,
  },
  // 津波浸水想定区域
  tsunami: {
    url: 'https://disaportaldata.gsi.go.jp/raster/04_tsunami_newlegend_data/{z}/{x}/{y}.png',
    attribution: '国土地理院ハザードマップポータル',
    opacity: 0.6,
  },
  // 土砂災害警戒区域
  landslide: {
    url: 'https://disaportaldata.gsi.go.jp/raster/05_dosekiryukeikaikuiki/{z}/{x}/{y}.png',
    attribution: '国土地理院ハザードマップポータル',
    opacity: 0.6,
  },
  // 高潮浸水想定区域
  stormSurge: {
    url: 'https://disaportaldata.gsi.go.jp/raster/03_hightide_l2_shinsuishin_data/{z}/{x}/{y}.png',
    attribution: '国土地理院ハザードマップポータル',
    opacity: 0.6,
  },
};

export default function HazardMapLayer({
  language = 'ja',
  onLayerChange,
}: HazardMapLayerProps) {
  const [activeLayers, setActiveLayers] = useState<string[]>([]);

  const t = useCallback(
    (key: keyof typeof translations.ja) =>
      translations[language]?.[key] || translations.ja[key],
    [language]
  );

  const handleLayerToggle = (layerId: string, isActive: boolean) => {
    const newLayers = isActive
      ? [...activeLayers, layerId]
      : activeLayers.filter((l) => l !== layerId);
    setActiveLayers(newLayers);
    onLayerChange?.(newLayers);
  };

  return (
    <LayersControl position="topright">
      {/* 基本地図 */}
      <LayersControl.BaseLayer checked name={t('baseMap')}>
        <TileLayer
          attribution='&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>'
          url="https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png"
        />
      </LayersControl.BaseLayer>

      {/* 洪水浸水想定区域 */}
      <LayersControl.Overlay name={`🌊 ${t('flood')}`}>
        <TileLayer
          url={hazardTileLayers.flood.url}
          attribution={hazardTileLayers.flood.attribution}
          opacity={hazardTileLayers.flood.opacity}
          eventHandlers={{
            add: () => handleLayerToggle('flood', true),
            remove: () => handleLayerToggle('flood', false),
          }}
        />
      </LayersControl.Overlay>

      {/* 津波浸水想定区域 */}
      <LayersControl.Overlay name={`🌊 ${t('tsunami')}`}>
        <TileLayer
          url={hazardTileLayers.tsunami.url}
          attribution={hazardTileLayers.tsunami.attribution}
          opacity={hazardTileLayers.tsunami.opacity}
          eventHandlers={{
            add: () => handleLayerToggle('tsunami', true),
            remove: () => handleLayerToggle('tsunami', false),
          }}
        />
      </LayersControl.Overlay>

      {/* 土砂災害警戒区域 */}
      <LayersControl.Overlay name={`⛰️ ${t('landslide')}`}>
        <TileLayer
          url={hazardTileLayers.landslide.url}
          attribution={hazardTileLayers.landslide.attribution}
          opacity={hazardTileLayers.landslide.opacity}
          eventHandlers={{
            add: () => handleLayerToggle('landslide', true),
            remove: () => handleLayerToggle('landslide', false),
          }}
        />
      </LayersControl.Overlay>

      {/* 高潮浸水想定区域 */}
      <LayersControl.Overlay name={`🌀 ${t('stormSurge')}`}>
        <TileLayer
          url={hazardTileLayers.stormSurge.url}
          attribution={hazardTileLayers.stormSurge.attribution}
          opacity={hazardTileLayers.stormSurge.opacity}
          eventHandlers={{
            add: () => handleLayerToggle('stormSurge', true),
            remove: () => handleLayerToggle('stormSurge', false),
          }}
        />
      </LayersControl.Overlay>
    </LayersControl>
  );
}

// ハザードレベルの凡例コンポーネント
export function HazardLegend({ language = 'ja' }: { language?: string }) {
  const legendItems = {
    flood: [
      { color: '#fef9c3', label: language === 'ja' ? '0.5m未満' : '<0.5m' },
      { color: '#fde68a', label: language === 'ja' ? '0.5-1m' : '0.5-1m' },
      { color: '#f59e0b', label: language === 'ja' ? '1-2m' : '1-2m' },
      { color: '#ea580c', label: language === 'ja' ? '2-3m' : '2-3m' },
      { color: '#dc2626', label: language === 'ja' ? '3-5m' : '3-5m' },
      { color: '#7c2d12', label: language === 'ja' ? '5m以上' : '>5m' },
    ],
    tsunami: [
      { color: '#bfdbfe', label: language === 'ja' ? '0.3m未満' : '<0.3m' },
      { color: '#60a5fa', label: language === 'ja' ? '0.3-1m' : '0.3-1m' },
      { color: '#3b82f6', label: language === 'ja' ? '1-2m' : '1-2m' },
      { color: '#2563eb', label: language === 'ja' ? '2-5m' : '2-5m' },
      { color: '#1d4ed8', label: language === 'ja' ? '5-10m' : '5-10m' },
      { color: '#1e3a8a', label: language === 'ja' ? '10m以上' : '>10m' },
    ],
  };

  return (
    <div className="bg-white/90 p-2 rounded shadow text-xs">
      <div className="font-bold mb-1">
        {language === 'ja' ? '浸水深' : 'Inundation Depth'}
      </div>
      <div className="space-y-0.5">
        {legendItems.flood.map((item, idx) => (
          <div key={idx} className="flex items-center gap-1">
            <span
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: item.color }}
            />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
