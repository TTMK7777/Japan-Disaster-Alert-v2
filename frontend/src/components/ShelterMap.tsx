'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ShelterIcon, LocationIcon } from './icons/DisasterIcons';

interface Shelter {
  id: string;
  name: string;
  name_translated?: Record<string, string>;
  address: string;
  address_translated?: Record<string, string>;
  latitude: number;
  longitude: number;
  distance?: number; // km
  capacity?: number;
  type: ShelterType[];
  facilities: ShelterFacility[];
  status: 'open' | 'closed' | 'full' | 'unknown';
  phone?: string;
}

type ShelterType = 'earthquake' | 'tsunami' | 'flood' | 'landslide' | 'fire' | 'general';
type ShelterFacility = 'barrier_free' | 'pet_friendly' | 'medical' | 'parking' | 'toilet' | 'wifi';

interface ShelterMapProps {
  language: string;
}

// 避難所タイプのアイコン色
const shelterTypeColors: Record<ShelterType, string> = {
  earthquake: '#FF6B35',
  tsunami: '#1E40AF',
  flood: '#0EA5E9',
  landslide: '#78716C',
  fire: '#DC2626',
  general: '#16A34A',
};

// ステータス色
const statusColors = {
  open: '#22C55E',
  closed: '#6B7280',
  full: '#F59E0B',
  unknown: '#9CA3AF',
};

// 多言語テキスト
const translations: Record<string, Record<string, string>> = {
  findLocation: {
    ja: '現在地を取得',
    en: 'Get my location',
    zh: '获取当前位置',
    'zh-TW': '取得目前位置',
    ko: '현재 위치 가져오기',
    vi: 'Lấy vị trí của tôi',
    th: 'รับตำแหน่งของฉัน',
    id: 'Dapatkan lokasi saya',
    ms: 'Dapatkan lokasi saya',
    tl: 'Kunin ang aking lokasyon',
    ne: 'मेरो स्थान प्राप्त गर्नुहोस्',
    fr: 'Obtenir ma position',
    de: 'Meinen Standort ermitteln',
    it: 'Ottieni la mia posizione',
    es: 'Obtener mi ubicaci\u00f3n',
    easy_ja: 'いまの ばしょを しらべる',
  },
  locating: {
    ja: '位置情報を取得中...',
    en: 'Getting location...',
    zh: '正在获取位置...',
    'zh-TW': '正在取得位置...',
    ko: '위치 가져오는 중...',
    vi: 'Đang lấy vị trí...',
    th: 'กำลังรับตำแหน่ง...',
    id: 'Mendapatkan lokasi...',
    ms: 'Mendapatkan lokasi...',
    tl: 'Kinukuha ang lokasyon...',
    ne: 'स्थान प्राप्त गर्दै...',
    fr: 'Localisation en cours...',
    de: 'Standort wird ermittelt...',
    it: 'Ottenimento posizione...',
    es: 'Obteniendo ubicaci\u00f3n...',
    easy_ja: 'ばしょを さがしています...',
  },
  nearestShelters: {
    ja: '最寄りの避難所',
    en: 'Nearest Shelters',
    zh: '最近的避难所',
    'zh-TW': '最近的避難所',
    ko: '가장 가까운 대피소',
    vi: 'Nơi trú ẩn gần nhất',
    th: 'ที่พักพิงใกล้ที่สุด',
    id: 'Tempat pengungsian terdekat',
    ms: 'Tempat perlindungan terdekat',
    tl: 'Pinakamalapit na evacuation center',
    ne: 'नजिकको आश्रयस्थल',
    fr: 'Abris les plus proches',
    de: 'N\u00e4chste Notunterk\u00fcnfte',
    it: 'Rifugi pi\u00f9 vicini',
    es: 'Refugios m\u00e1s cercanos',
    easy_ja: 'ちかくの ひなんじょ',
  },
  distance: {
    ja: '距離',
    en: 'Distance',
    zh: '距离',
    'zh-TW': '距離',
    ko: '거리',
    vi: 'Khoảng cách',
    th: 'ระยะทาง',
    id: 'Jarak',
    ms: 'Jarak',
    tl: 'Layo',
    ne: 'दूरी',
    fr: 'Distance',
    de: 'Entfernung',
    it: 'Distanza',
    es: 'Distancia',
    easy_ja: 'きょり',
  },
  capacity: {
    ja: '収容人数',
    en: 'Capacity',
    zh: '容量',
    'zh-TW': '容量',
    ko: '수용 인원',
    vi: 'Sức chứa',
    th: 'ความจุ',
    id: 'Kapasitas',
    ms: 'Kapasiti',
    tl: 'Kapasidad',
    ne: 'क्षमता',
    fr: 'Capacit\u00e9',
    de: 'Kapazit\u00e4t',
    it: 'Capacit\u00e0',
    es: 'Capacidad',
    easy_ja: 'なんにん はいれるか',
  },
  navigate: {
    ja: 'ナビ開始',
    en: 'Navigate',
    zh: '导航',
    'zh-TW': '導航',
    ko: '길안내',
    vi: 'Dẫn đường',
    th: 'นำทาง',
    id: 'Navigasi',
    ms: 'Navigasi',
    tl: 'Mag-navigate',
    ne: 'मार्गदर्शन',
    fr: 'Naviguer',
    de: 'Navigieren',
    it: 'Naviga',
    es: 'Navegar',
    easy_ja: 'みちあんない',
  },
  open: {
    ja: '開設中',
    en: 'Open',
    zh: '开放',
    'zh-TW': '開放',
    ko: '운영중',
    vi: 'Mở cửa',
    th: 'เปิด',
    id: 'Buka',
    ms: 'Buka',
    tl: 'Bukas',
    ne: 'खुला',
    fr: 'Ouvert',
    de: 'Ge\u00f6ffnet',
    it: 'Aperto',
    es: 'Abierto',
    easy_ja: 'あいてる',
  },
  closed: {
    ja: '閉鎖中',
    en: 'Closed',
    zh: '关闭',
    'zh-TW': '關閉',
    ko: '폐쇄',
    vi: 'Đóng cửa',
    th: 'ปิด',
    id: 'Tutup',
    ms: 'Tutup',
    tl: 'Sarado',
    ne: 'बन्द',
    fr: 'Ferm\u00e9',
    de: 'Geschlossen',
    it: 'Chiuso',
    es: 'Cerrado',
    easy_ja: 'しまってる',
  },
  full: {
    ja: '満員',
    en: 'Full',
    zh: '已满',
    'zh-TW': '已滿',
    ko: '만원',
    vi: 'Đầy',
    th: 'เต็ม',
    id: 'Penuh',
    ms: 'Penuh',
    tl: 'Puno',
    ne: 'भरिएको',
    fr: 'Complet',
    de: 'Voll',
    it: 'Pieno',
    es: 'Lleno',
    easy_ja: 'いっぱい',
  },
  barrierFree: { ja: 'バリアフリー', en: 'Barrier-free', zh: '无障碍', 'zh-TW': '無障礙', ko: '배리어프리', vi: 'Kh\u00f4ng r\u00e0o c\u1ea3n', th: 'ไร้อุปสรรค', id: 'Bebas hambatan', ms: 'Tanpa halangan', tl: 'Walang hadlang', ne: 'अवरोधमुक्त', fr: 'Accessible', de: 'Barrierefrei', it: 'Senza barriere', es: 'Sin barreras', easy_ja: 'くるまいす OK' },
  petFriendly: { ja: 'ペット可', en: 'Pets OK', zh: '可携带宠物', 'zh-TW': '可攜帶寵物', ko: '반려동물 가능', vi: 'Cho ph\u00e9p th\u00fa c\u01b0ng', th: 'สัตว์เลี้ยงได้', id: 'Hewan peliharaan OK', ms: 'Haiwan peliharaan OK', tl: 'Pets OK', ne: 'पाल्तु जनावर ठीक', fr: 'Animaux accept\u00e9s', de: 'Haustiere erlaubt', it: 'Animali ammessi', es: 'Mascotas OK', easy_ja: 'ペット OK' },
  medical: { ja: '医療設備', en: 'Medical', zh: '医疗设施', 'zh-TW': '醫療設施', ko: '의료시설', vi: 'Y t\u1ebf', th: 'การแพทย์', id: 'Medis', ms: 'Perubatan', tl: 'Medikal', ne: 'चिकित्सा', fr: 'M\u00e9dical', de: 'Medizinisch', it: 'Medico', es: 'M\u00e9dico', easy_ja: 'いしゃ あり' },
  parking: { ja: '駐車場', en: 'Parking', zh: '停车场', 'zh-TW': '停車場', ko: '주차장', vi: 'B\u00e3i \u0111\u1ed7 xe', th: 'ที่จอดรถ', id: 'Parkir', ms: 'Tempat letak kereta', tl: 'Parking', ne: 'पार्किङ', fr: 'Parking', de: 'Parkplatz', it: 'Parcheggio', es: 'Aparcamiento', easy_ja: 'くるま おける' },
  yourLocation: { ja: '現在地', en: 'Your Location', zh: '当前位置', 'zh-TW': '目前位置', ko: '현재 위치', vi: 'V\u1ecb tr\u00ed c\u1ee7a b\u1ea1n', th: 'ตำแหน่งของคุณ', id: 'Lokasi Anda', ms: 'Lokasi anda', tl: 'Iyong lokasyon', ne: 'तपाईंको स्थान', fr: 'Votre position', de: 'Ihr Standort', it: 'La tua posizione', es: 'Tu ubicaci\u00f3n', easy_ja: 'いまの ばしょ' },
  go: { ja: '出発', en: 'Go', zh: '出发', 'zh-TW': '出發', ko: '출발', vi: '\u0110i', th: 'ไป', id: 'Pergi', ms: 'Pergi', tl: 'Punta', ne: 'जानुहोस्', fr: 'Aller', de: 'Los', it: 'Vai', es: 'Ir', easy_ja: 'いく' },
  all: { ja: '全て', en: 'All', zh: '全部', 'zh-TW': '全部', ko: '전체', vi: 'T\u1ea5t c\u1ea3', th: 'ทั้งหมด', id: 'Semua', ms: 'Semua', tl: 'Lahat', ne: 'सबै', fr: 'Tout', de: 'Alle', it: 'Tutti', es: 'Todos', easy_ja: 'ぜんぶ' },
  earthquakeFilter: { ja: '地震', en: 'Earthquake', zh: '地震', 'zh-TW': '地震', ko: '지진', vi: '\u0110\u1ed9ng \u0111\u1ea5t', th: 'แผ่นดินไหว', id: 'Gempa', ms: 'Gempa bumi', tl: 'Lindol', ne: 'भूकम्प', fr: 'S\u00e9isme', de: 'Erdbeben', it: 'Terremoto', es: 'Terremoto', easy_ja: 'じしん' },
  tsunamiFilter: { ja: '津波', en: 'Tsunami', zh: '海啸', 'zh-TW': '海嘯', ko: '쓰나미', vi: 'S\u00f3ng th\u1ea7n', th: 'สึนามิ', id: 'Tsunami', ms: 'Tsunami', tl: 'Tsunami', ne: 'सुनामी', fr: 'Tsunami', de: 'Tsunami', it: 'Tsunami', es: 'Tsunami', easy_ja: 'つなみ' },
  floodFilter: { ja: '洪水', en: 'Flood', zh: '洪水', 'zh-TW': '洪水', ko: '홍수', vi: 'L\u0169 l\u1ee5t', th: 'น้ำท่วม', id: 'Banjir', ms: 'Banjir', tl: 'Baha', ne: 'बाढी', fr: 'Inondation', de: '\u00dcberschwemmung', it: 'Alluvione', es: 'Inundaci\u00f3n', easy_ja: 'こうずい' },
  fireFilter: { ja: '火災', en: 'Fire', zh: '火灾', 'zh-TW': '火災', ko: '화재', vi: 'H\u1ecfa ho\u1ea1n', th: 'ไฟไหม้', id: 'Kebakaran', ms: 'Kebakaran', tl: 'Sunog', ne: 'आगलागी', fr: 'Incendie', de: 'Brand', it: 'Incendio', es: 'Incendio', easy_ja: 'かじ' },
};

// サンプル避難所データ（実際はAPIから取得）
const sampleShelters: Shelter[] = [
  {
    id: '1',
    name: '渋谷区立神宮前小学校',
    name_translated: { en: 'Jingumae Elementary School', zh: '神宫前小学', ko: '진구마에 초등학교' },
    address: '東京都渋谷区神宮前4-20-1',
    address_translated: { en: '4-20-1 Jingumae, Shibuya, Tokyo' },
    latitude: 35.6687,
    longitude: 139.7052,
    capacity: 500,
    type: ['earthquake', 'fire'],
    facilities: ['barrier_free', 'toilet', 'wifi'],
    status: 'open',
  },
  {
    id: '2',
    name: '港区立御成門小学校',
    name_translated: { en: 'Onarimon Elementary School', zh: '御成门小学' },
    address: '東京都港区芝公園3-2-4',
    address_translated: { en: '3-2-4 Shiba Park, Minato, Tokyo' },
    latitude: 35.6570,
    longitude: 139.7504,
    capacity: 300,
    type: ['earthquake', 'tsunami', 'flood'],
    facilities: ['barrier_free', 'pet_friendly', 'parking'],
    status: 'open',
  },
  {
    id: '3',
    name: '新宿区立戸塚第一小学校',
    name_translated: { en: 'Totsuka Daiichi Elementary School' },
    address: '東京都新宿区西早稲田1-1-1',
    address_translated: { en: '1-1-1 Nishiwaseda, Shinjuku, Tokyo' },
    latitude: 35.7081,
    longitude: 139.7199,
    capacity: 400,
    type: ['earthquake', 'fire'],
    facilities: ['toilet', 'wifi'],
    status: 'full',
  },
];

// カスタムマーカー作成
function createShelterMarker(shelter: Shelter): L.DivIcon {
  const primaryType = shelter.type[0] || 'general';
  const color = statusColors[shelter.status];
  const typeColor = shelterTypeColors[primaryType];

  return L.divIcon({
    className: 'shelter-marker',
    html: `
      <div style="
        position: relative;
        width: 36px;
        height: 36px;
      ">
        <div style="
          width: 36px;
          height: 36px;
          background: ${typeColor};
          border: 3px solid ${color};
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        ">
          <span style="color: white; font-size: 20px;">🏠</span>
        </div>
        <div style="
          position: absolute;
          bottom: -4px;
          right: -4px;
          width: 14px;
          height: 14px;
          background: ${color};
          border-radius: 50%;
          border: 2px solid white;
        "></div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
}

// 現在地マーカー
function createCurrentLocationMarker(): L.DivIcon {
  return L.divIcon({
    className: 'current-location-marker',
    html: `
      <div style="
        width: 24px;
        height: 24px;
        background: #3B82F6;
        border: 4px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(59,130,246,0.5);
        animation: pulse 2s infinite;
      "></div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

// 地図を現在地にパンするコンポーネント
function MapPanner({ position }: { position: [number, number] | null }) {
  const map = useMap();

  useEffect(() => {
    if (position) {
      map.flyTo(position, 15, { duration: 1 });
    }
  }, [map, position]);

  return null;
}

// 距離計算
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // 地球の半径（km）
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function ShelterMap({ language }: ShelterMapProps) {
  const [currentLocation, setCurrentLocation] = useState<[number, number] | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [shelters, setShelters] = useState<Shelter[]>(sampleShelters);
  const [selectedShelter, setSelectedShelter] = useState<Shelter | null>(null);
  const [filterType, setFilterType] = useState<ShelterType | 'all'>('all');

  const t = useCallback(
    (key: keyof typeof translations) =>
      translations[key][language as keyof typeof translations[typeof key]] || translations[key].en,
    [language]
  );

  // 現在地取得
  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported');
      return;
    }

    setIsLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCurrentLocation([latitude, longitude]);
        setIsLocating(false);

        // 避難所に距離を追加
        setShelters((prev) =>
          prev
            .map((s) => ({
              ...s,
              distance: calculateDistance(latitude, longitude, s.latitude, s.longitude),
            }))
            .sort((a, b) => (a.distance || 0) - (b.distance || 0))
        );
      },
      (error) => {
        setLocationError(error.message);
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // Google Maps ナビゲーション
  const openNavigation = useCallback((shelter: Shelter) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${shelter.latitude},${shelter.longitude}&travelmode=walking`;
    window.open(url, '_blank');
  }, []);

  // フィルタリング
  const filteredShelters =
    filterType === 'all' ? shelters : shelters.filter((s) => s.type.includes(filterType));

  // デフォルト中心（東京）
  const defaultCenter: [number, number] = currentLocation || [35.6812, 139.7671];

  return (
    <div className="space-y-4">
      {/* コントロールパネル */}
      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        {/* 現在地ボタン */}
        <button
          onClick={getCurrentLocation}
          disabled={isLocating}
          className={`w-full py-3 px-4 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors ${
            isLocating
              ? 'bg-gray-200 text-gray-500 cursor-wait'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isLocating ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
              {t('locating')}
            </>
          ) : (
            <>
              <LocationIcon size={20} />
              {t('findLocation')}
            </>
          )}
        </button>

        {locationError && (
          <div className="text-red-600 text-sm text-center">{locationError}</div>
        )}

        {/* フィルター */}
        <div className="flex flex-wrap gap-2">
          {(['all', 'earthquake', 'tsunami', 'flood', 'fire'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              aria-label={type === 'all' ? t('all') : type === 'earthquake' ? t('earthquakeFilter') : type === 'tsunami' ? t('tsunamiFilter') : type === 'flood' ? t('floodFilter') : t('fireFilter')}
              className={`px-4 py-2.5 min-h-[44px] rounded-full text-sm font-medium transition-colors ${
                filterType === type
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {type === 'all' ? `🏠 ${t('all')}` : type === 'earthquake' ? `🌋 ${t('earthquakeFilter')}` : type === 'tsunami' ? `🌊 ${t('tsunamiFilter')}` : type === 'flood' ? `💧 ${t('floodFilter')}` : `🔥 ${t('fireFilter')}`}
            </button>
          ))}
        </div>
      </div>

      {/* 地図 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <MapContainer center={defaultCenter} zoom={13} className="leaflet-container" scrollWheelZoom={true}>
          <TileLayer
            attribution='&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>'
            url="https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png"
          />

          <MapPanner position={currentLocation} />

          {/* 現在地マーカー */}
          {currentLocation && (
            <>
              <Marker position={currentLocation} icon={createCurrentLocationMarker()}>
                <Popup>
                  <div className="text-center font-medium">
                    {t('yourLocation')}
                  </div>
                </Popup>
              </Marker>
              <Circle
                center={currentLocation}
                radius={1000}
                pathOptions={{ color: '#3B82F6', fillColor: '#3B82F6', fillOpacity: 0.1 }}
              />
            </>
          )}

          {/* 避難所マーカー */}
          {filteredShelters.map((shelter) => (
            <Marker
              key={shelter.id}
              position={[shelter.latitude, shelter.longitude]}
              icon={createShelterMarker(shelter)}
              eventHandlers={{
                click: () => setSelectedShelter(shelter),
              }}
            >
              <Popup>
                <div className="min-w-[200px]">
                  <h3 className="font-bold text-lg mb-1">
                    {shelter.name_translated?.[language] || shelter.name}
                  </h3>
                  <p className="text-sm text-gray-600 mb-2">
                    {shelter.address_translated?.[language] || shelter.address}
                  </p>

                  {/* ステータスバッジ */}
                  <span
                    className="inline-block px-2 py-0.5 rounded-full text-xs font-medium text-white mb-2"
                    style={{ backgroundColor: statusColors[shelter.status] }}
                  >
                    {t(shelter.status as keyof typeof translations)}
                  </span>

                  {/* 距離 */}
                  {shelter.distance !== undefined && (
                    <p className="text-sm text-gray-600 mb-2">
                      {t('distance')}: {shelter.distance.toFixed(1)}km
                    </p>
                  )}

                  {/* 施設アイコン */}
                  <div className="flex gap-2 mb-3">
                    {shelter.facilities.includes('barrier_free') && (
                      <span title={t('barrierFree')}>♿</span>
                    )}
                    {shelter.facilities.includes('pet_friendly') && (
                      <span title={t('petFriendly')}>🐕</span>
                    )}
                    {shelter.facilities.includes('medical') && (
                      <span title={t('medical')}>🏥</span>
                    )}
                    {shelter.facilities.includes('parking') && (
                      <span title={t('parking')}>🅿️</span>
                    )}
                  </div>

                  {/* ナビボタン */}
                  <button
                    onClick={() => openNavigation(shelter)}
                    className="w-full py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                  >
                    {t('navigate')} 🗺️
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* 最寄りの避難所リスト */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold text-lg mb-3">{t('nearestShelters')}</h3>
        <div className="space-y-3">
          {filteredShelters.slice(0, 5).map((shelter) => (
            <div
              key={shelter.id}
              className={`p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                selectedShelter?.id === shelter.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setSelectedShelter(shelter)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: statusColors[shelter.status] }}
                    />
                    <h4 className="font-medium">
                      {shelter.name_translated?.[language] || shelter.name}
                    </h4>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {shelter.address_translated?.[language] || shelter.address}
                  </p>
                  <div className="flex gap-1 mt-2">
                    {shelter.facilities.slice(0, 4).map((f) => (
                      <span key={f} className="text-xs">
                        {f === 'barrier_free' ? '♿' : f === 'pet_friendly' ? '🐕' : f === 'medical' ? '🏥' : '🅿️'}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  {shelter.distance !== undefined && (
                    <span className="text-lg font-bold text-blue-600">
                      {shelter.distance.toFixed(1)}km
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openNavigation(shelter);
                    }}
                    className="block mt-2 px-3 py-1 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700"
                  >
                    {t('go')}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
