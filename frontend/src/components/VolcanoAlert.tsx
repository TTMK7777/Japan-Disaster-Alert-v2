'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '@/config/api';

interface Volcano {
  code: number;
  name: string;
  name_en?: string;
  latitude?: number;
  longitude?: number;
  alert_level?: number;
  alert_level_text?: string;
  is_monitored: boolean;
}

interface VolcanoWarning {
  volcano_code: number;
  volcano_name?: string;
  alert_level: number;
  alert_level_name: string;
  severity: string;
  action: string;
  issued_at: string;
  headline?: string;
}

interface VolcanoAlertProps {
  language?: string;
  showAll?: boolean;
  onVolcanoSelect?: (volcano: Volcano) => void;
}

// 多言語対応のテキスト
const translations: Record<string, Record<string, string>> = {
  ja: {
    title: '火山情報',
    monitoredVolcanoes: '常時観測火山',
    alertLevel: '噴火警戒レベル',
    noAlerts: '現在、噴火警報は発表されていません',
    loading: '読み込み中...',
    error: '情報を取得できませんでした',
    retry: '再試行',
    level1: '活火山であることに留意',
    level2: '火口周辺規制',
    level3: '入山規制',
    level4: '高齢者等避難',
    level5: '避難',
    action: '推奨される行動',
  },
  en: {
    title: 'Volcano Information',
    monitoredVolcanoes: 'Monitored Volcanoes',
    alertLevel: 'Volcanic Alert Level',
    noAlerts: 'No volcanic warnings currently in effect',
    loading: 'Loading...',
    error: 'Failed to load information',
    retry: 'Retry',
    level1: 'Potential for increased activity',
    level2: 'Do not approach the crater',
    level3: 'Do not climb the mountain',
    level4: 'Prepare to evacuate (elderly, etc.)',
    level5: 'Evacuate',
    action: 'Recommended Action',
  },
  easy_ja: {
    title: 'かざん じょうほう',
    monitoredVolcanoes: 'みている かざん',
    alertLevel: 'かざんの あんぜんレベル',
    noAlerts: 'いま、かざんの けいほうは ありません',
    loading: 'よみこみちゅう...',
    error: 'じょうほうを とれませんでした',
    retry: 'もういちど',
    level1: 'かざんです。きをつけて',
    level2: 'かこうに ちかづかないで',
    level3: 'やまに のぼらないで',
    level4: 'おとしより などは にげる じゅんび',
    level5: 'にげてください',
    action: 'やること',
  },
  zh: {
    title: '火山信息',
    monitoredVolcanoes: '常时观测火山',
    alertLevel: '火山警戒级别',
    noAlerts: '目前没有发布火山警报',
    loading: '加载中...',
    error: '无法获取信息',
    retry: '重试',
    level1: '请注意这是活火山',
    level2: '火山口周边管制',
    level3: '禁止入山',
    level4: '老年人等避难准备',
    level5: '避难',
    action: '建议行动',
  },
  'zh-TW': {
    title: '火山資訊',
    monitoredVolcanoes: '常時觀測火山',
    alertLevel: '火山警戒級別',
    noAlerts: '目前沒有發布火山警報',
    loading: '載入中...',
    error: '無法取得資訊',
    retry: '重試',
    level1: '請注意這是活火山',
    level2: '火山口周邊管制',
    level3: '禁止入山',
    level4: '老年人等避難準備',
    level5: '避難',
    action: '建議行動',
  },
  ko: {
    title: '화산 정보',
    monitoredVolcanoes: '상시 관측 화산',
    alertLevel: '화산 경계 레벨',
    noAlerts: '현재 화산 경보가 발령되지 않았습니다',
    loading: '로딩 중...',
    error: '정보를 가져올 수 없습니다',
    retry: '재시도',
    level1: '활화산임을 유의',
    level2: '화구 주변 규제',
    level3: '입산 규제',
    level4: '고령자 등 대피 준비',
    level5: '대피',
    action: '권장 행동',
  },
  vi: {
    title: 'Th\u00f4ng tin N\u00fai l\u1eeda',
    monitoredVolcanoes: 'N\u00fai l\u1eeda \u0111\u01b0\u1ee3c gi\u00e1m s\u00e1t',
    alertLevel: 'M\u1ee9c c\u1ea3nh b\u00e1o n\u00fai l\u1eeda',
    noAlerts: 'Hi\u1ec7n kh\u00f4ng c\u00f3 c\u1ea3nh b\u00e1o n\u00fai l\u1eeda',
    loading: '\u0110ang t\u1ea3i...',
    error: 'Kh\u00f4ng th\u1ec3 t\u1ea3i th\u00f4ng tin',
    retry: 'Th\u1eed l\u1ea1i',
    level1: 'L\u01b0u \u00fd \u0111\u00e2y l\u00e0 n\u00fai l\u1eeda \u0111ang ho\u1ea1t \u0111\u1ed9ng',
    level2: 'Kh\u00f4ng ti\u1ebfp c\u1eadn mi\u1ec7ng n\u00fai l\u1eeda',
    level3: 'Kh\u00f4ng leo n\u00fai',
    level4: 'Ng\u01b0\u1eddi cao tu\u1ed5i chu\u1ea9n b\u1ecb s\u01a1 t\u00e1n',
    level5: 'S\u01a1 t\u00e1n',
    action: 'H\u00e0nh \u0111\u1ed9ng khuy\u1ebfn ngh\u1ecb',
  },
  th: {
    title: '\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e20\u0e39\u0e40\u0e02\u0e32\u0e44\u0e1f',
    monitoredVolcanoes: '\u0e20\u0e39\u0e40\u0e02\u0e32\u0e44\u0e1f\u0e17\u0e35\u0e48\u0e40\u0e1d\u0e49\u0e32\u0e23\u0e30\u0e27\u0e31\u0e07',
    alertLevel: '\u0e23\u0e30\u0e14\u0e31\u0e1a\u0e40\u0e15\u0e37\u0e2d\u0e19\u0e20\u0e31\u0e22\u0e20\u0e39\u0e40\u0e02\u0e32\u0e44\u0e1f',
    noAlerts: '\u0e44\u0e21\u0e48\u0e21\u0e35\u0e04\u0e33\u0e40\u0e15\u0e37\u0e2d\u0e19\u0e20\u0e39\u0e40\u0e02\u0e32\u0e44\u0e1f\u0e43\u0e19\u0e02\u0e13\u0e30\u0e19\u0e35\u0e49',
    loading: '\u0e01\u0e33\u0e25\u0e31\u0e07\u0e42\u0e2b\u0e25\u0e14...',
    error: '\u0e44\u0e21\u0e48\u0e2a\u0e32\u0e21\u0e32\u0e23\u0e16\u0e42\u0e2b\u0e25\u0e14\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e44\u0e14\u0e49',
    retry: '\u0e25\u0e2d\u0e07\u0e2d\u0e35\u0e01\u0e04\u0e23\u0e31\u0e49\u0e07',
    level1: '\u0e42\u0e1b\u0e23\u0e14\u0e17\u0e23\u0e32\u0e1a\u0e27\u0e48\u0e32\u0e40\u0e1b\u0e47\u0e19\u0e20\u0e39\u0e40\u0e02\u0e32\u0e44\u0e1f\u0e17\u0e35\u0e48\u0e22\u0e31\u0e07\u0e21\u0e35\u0e1e\u0e25\u0e31\u0e07',
    level2: '\u0e2d\u0e22\u0e48\u0e32\u0e40\u0e02\u0e49\u0e32\u0e43\u0e01\u0e25\u0e49\u0e1b\u0e32\u0e01\u0e1b\u0e25\u0e48\u0e2d\u0e07',
    level3: '\u0e2d\u0e22\u0e48\u0e32\u0e02\u0e36\u0e49\u0e19\u0e20\u0e39\u0e40\u0e02\u0e32',
    level4: '\u0e1c\u0e39\u0e49\u0e2a\u0e39\u0e07\u0e2d\u0e32\u0e22\u0e38\u0e40\u0e15\u0e23\u0e35\u0e22\u0e21\u0e2d\u0e1e\u0e22\u0e1e',
    level5: '\u0e2d\u0e1e\u0e22\u0e1e',
    action: '\u0e01\u0e32\u0e23\u0e1b\u0e0f\u0e34\u0e1a\u0e31\u0e15\u0e34\u0e17\u0e35\u0e48\u0e41\u0e19\u0e30\u0e19\u0e33',
  },
  id: {
    title: 'Informasi Gunung Berapi',
    monitoredVolcanoes: 'Gunung Berapi yang Dipantau',
    alertLevel: 'Tingkat Siaga Gunung Berapi',
    noAlerts: 'Tidak ada peringatan gunung berapi saat ini',
    loading: 'Memuat...',
    error: 'Gagal memuat informasi',
    retry: 'Coba lagi',
    level1: 'Perhatikan bahwa ini gunung berapi aktif',
    level2: 'Jangan mendekati kawah',
    level3: 'Jangan mendaki gunung',
    level4: 'Lansia siap-siap evakuasi',
    level5: 'Evakuasi',
    action: 'Tindakan yang Direkomendasikan',
  },
  ms: {
    title: 'Maklumat Gunung Berapi',
    monitoredVolcanoes: 'Gunung Berapi yang Dipantau',
    alertLevel: 'Tahap Amaran Gunung Berapi',
    noAlerts: 'Tiada amaran gunung berapi pada masa ini',
    loading: 'Memuatkan...',
    error: 'Gagal memuat maklumat',
    retry: 'Cuba lagi',
    level1: 'Sila ambil perhatian ini gunung berapi aktif',
    level2: 'Jangan dekati kawah',
    level3: 'Jangan mendaki gunung',
    level4: 'Warga emas bersedia untuk pemindahan',
    level5: 'Pindah',
    action: 'Tindakan Disyorkan',
  },
  tl: {
    title: 'Impormasyon tungkol sa Bulkan',
    monitoredVolcanoes: 'Mga Bulkang Minomonitor',
    alertLevel: 'Antas ng Babala sa Bulkan',
    noAlerts: 'Walang babala sa bulkan sa ngayon',
    loading: 'Naglo-load...',
    error: 'Hindi ma-load ang impormasyon',
    retry: 'Subukan muli',
    level1: 'Tandaan na ito ay aktibong bulkan',
    level2: 'Huwag lumapit sa bunganga',
    level3: 'Huwag umakyat sa bundok',
    level4: 'Mga matatanda maghanda sa paglikas',
    level5: 'Lumikas',
    action: 'Inirerekomendang Aksyon',
  },
  ne: {
    title: '\u091c\u094d\u0935\u093e\u0932\u093e\u092e\u0941\u0916\u0940 \u091c\u093e\u0928\u0915\u093e\u0930\u0940',
    monitoredVolcanoes: '\u0928\u093f\u0930\u0940\u0915\u094d\u0937\u0923 \u0917\u0930\u093f\u090f\u0915\u093e \u091c\u094d\u0935\u093e\u0932\u093e\u092e\u0941\u0916\u0940',
    alertLevel: '\u091c\u094d\u0935\u093e\u0932\u093e\u092e\u0941\u0916\u0940 \u091a\u0947\u0924\u093e\u0935\u0928\u0940 \u0938\u094d\u0924\u0930',
    noAlerts: '\u0939\u093e\u0932 \u0915\u0941\u0928\u0948 \u091c\u094d\u0935\u093e\u0932\u093e\u092e\u0941\u0916\u0940 \u091a\u0947\u0924\u093e\u0935\u0928\u0940 \u091b\u0948\u0928',
    loading: '\u0932\u094b\u0921 \u0939\u0941\u0901\u0926\u0948\u091b...',
    error: '\u091c\u093e\u0928\u0915\u093e\u0930\u0940 \u0932\u094b\u0921 \u0917\u0930\u094d\u0928 \u0938\u0915\u093f\u090f\u0928',
    retry: '\u092a\u0941\u0928: \u092a\u094d\u0930\u092f\u093e\u0938',
    level1: '\u092f\u094b \u0938\u0915\u094d\u0930\u093f\u092f \u091c\u094d\u0935\u093e\u0932\u093e\u092e\u0941\u0916\u0940 \u0939\u094b \u092d\u0928\u094d\u0928\u0947 \u0927\u094d\u092f\u093e\u0928 \u0926\u093f\u0928\u0941\u0939\u094b\u0938\u094d',
    level2: '\u0915\u094d\u0930\u0947\u091f\u0930\u092e\u093e \u0928\u091c\u093e\u0928\u0941\u0939\u094b\u0938\u094d',
    level3: '\u092a\u0939\u093e\u0921\u092e\u093e \u0928\u091a\u0922\u094d\u0928\u0941\u0939\u094b\u0938\u094d',
    level4: '\u091c\u094d\u092f\u0947\u0937\u094d\u0920\u093e \u0928\u093e\u0917\u0930\u093f\u0915 \u0938\u094d\u0925\u093e\u0928\u093e\u0928\u094d\u0924\u0930\u0923\u0915\u094b \u0924\u092f\u093e\u0930\u0940',
    level5: '\u0938\u094d\u0925\u093e\u0928\u093e\u0928\u094d\u0924\u0930\u0923',
    action: '\u0938\u093f\u092b\u093e\u0930\u093f\u0938 \u0917\u0930\u093f\u090f\u0915\u094b \u0915\u093e\u0930\u094d\u092f',
  },
  fr: {
    title: 'Informations volcaniques',
    monitoredVolcanoes: 'Volcans surveill\u00e9s',
    alertLevel: 'Niveau d\'alerte volcanique',
    noAlerts: 'Aucune alerte volcanique en cours',
    loading: 'Chargement...',
    error: 'Impossible de charger les informations',
    retry: 'R\u00e9essayer',
    level1: 'Volcan actif, restez vigilant',
    level2: 'Ne pas approcher du crat\u00e8re',
    level3: 'Ne pas escalader la montagne',
    level4: 'Personnes \u00e2g\u00e9es : pr\u00e9parez l\'\u00e9vacuation',
    level5: '\u00c9vacuez',
    action: 'Action recommand\u00e9e',
  },
  de: {
    title: 'Vulkaninformationen',
    monitoredVolcanoes: '\u00dcberwachte Vulkane',
    alertLevel: 'Vulkan-Warnstufe',
    noAlerts: 'Derzeit keine Vulkanwarnungen',
    loading: 'Laden...',
    error: 'Informationen konnten nicht geladen werden',
    retry: 'Erneut versuchen',
    level1: 'Aktiver Vulkan, Vorsicht geboten',
    level2: 'Krater nicht betreten',
    level3: 'Berg nicht besteigen',
    level4: '\u00c4ltere Menschen: Evakuierung vorbereiten',
    level5: 'Evakuieren',
    action: 'Empfohlene Ma\u00dfnahme',
  },
  it: {
    title: 'Informazioni vulcaniche',
    monitoredVolcanoes: 'Vulcani monitorati',
    alertLevel: 'Livello di allerta vulcanica',
    noAlerts: 'Nessuna allerta vulcanica in corso',
    loading: 'Caricamento...',
    error: 'Impossibile caricare le informazioni',
    retry: 'Riprova',
    level1: 'Vulcano attivo, prestare attenzione',
    level2: 'Non avvicinarsi al cratere',
    level3: 'Non salire sulla montagna',
    level4: 'Anziani: prepararsi all\'evacuazione',
    level5: 'Evacuare',
    action: 'Azione consigliata',
  },
  es: {
    title: 'Informaci\u00f3n volc\u00e1nica',
    monitoredVolcanoes: 'Volcanes monitoreados',
    alertLevel: 'Nivel de alerta volc\u00e1nica',
    noAlerts: 'No hay alertas volc\u00e1nicas actualmente',
    loading: 'Cargando...',
    error: 'No se pudo cargar la informaci\u00f3n',
    retry: 'Reintentar',
    level1: 'Volc\u00e1n activo, tenga precauci\u00f3n',
    level2: 'No acercarse al cr\u00e1ter',
    level3: 'No escalar la monta\u00f1a',
    level4: 'Personas mayores: preparar evacuaci\u00f3n',
    level5: 'Evacuar',
    action: 'Acci\u00f3n recomendada',
  },
};

export default function VolcanoAlert({
  language = 'ja',
  showAll = false,
  onVolcanoSelect,
}: VolcanoAlertProps) {
  const [volcanoes, setVolcanoes] = useState<Volcano[]>([]);
  const [warnings, setWarnings] = useState<VolcanoWarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const t = useCallback(
    (key: keyof typeof translations.ja) =>
      translations[language]?.[key] || translations.ja[key],
    [language]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [volcanoesRes, warningsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/volcanoes?monitored_only=${!showAll}`),
        fetch(`${API_BASE_URL}/api/v1/volcanoes/warnings?lang=${language}`),
      ]);

      if (!volcanoesRes.ok || !warningsRes.ok) {
        throw new Error('Failed to fetch volcano data');
      }

      const [volcanoesData, warningsData] = await Promise.all([
        volcanoesRes.json(),
        warningsRes.json(),
      ]);

      setVolcanoes(volcanoesData);
      setWarnings(warningsData);
    } catch (err) {
      console.error('Volcano fetch error:', err);
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  }, [showAll, language, t]);

  useEffect(() => {
    fetchData();
    // 10分ごとに更新
    const interval = setInterval(fetchData, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const getAlertLevelStyles = (level: number) => {
    switch (level) {
      case 5:
        return 'bg-purple-600 text-white';
      case 4:
        return 'bg-red-600 text-white';
      case 3:
        return 'bg-orange-500 text-white';
      case 2:
        return 'bg-yellow-500 text-black';
      case 1:
      default:
        return 'bg-gray-200 text-gray-700';
    }
  };

  const getAlertLevelText = (level: number) => {
    switch (level) {
      case 5:
        return t('level5');
      case 4:
        return t('level4');
      case 3:
        return t('level3');
      case 2:
        return t('level2');
      case 1:
      default:
        return t('level1');
    }
  };

  if (loading) {
    return (
      <div className="p-4 bg-gray-100 rounded-lg animate-pulse">
        <div className="h-6 bg-gray-300 rounded w-1/3 mb-2"></div>
        <div className="h-4 bg-gray-300 rounded w-2/3"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-100 border border-red-300 rounded-lg">
        <p className="text-red-700">{error}</p>
        <button
          onClick={fetchData}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
        >
          {t('retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
        🌋 {t('title')}
      </h3>

      {/* 警報がある場合 */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((warning, index) => (
            <div
              key={`warning-${index}`}
              className={`p-4 rounded-lg ${getAlertLevelStyles(warning.alert_level)}`}
              role="alert"
              aria-live={warning.alert_level >= 4 ? 'assertive' : 'polite'}
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">🌋</span>
                <div>
                  <div className="font-bold">
                    {warning.volcano_name} - {t('alertLevel')} {warning.alert_level}
                  </div>
                  <p className="text-sm">{warning.alert_level_name}</p>
                  {warning.action && (
                    <p className="text-sm mt-1">
                      {t('action')}: {warning.action}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 警報がない場合 */}
      {warnings.length === 0 && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-700">✅ {t('noAlerts')}</p>
        </div>
      )}

      {/* 常時観測火山リスト */}
      <div className="mt-4">
        <h4 className="font-semibold text-gray-700 mb-2">{t('monitoredVolcanoes')}</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {volcanoes.slice(0, 12).map((volcano) => (
            <button
              key={volcano.code}
              onClick={() => onVolcanoSelect?.(volcano)}
              className="p-2 text-left text-sm bg-gray-50 hover:bg-gray-100 rounded border transition-colors"
            >
              <span className="font-medium">
                {language !== 'ja' && volcano.name_en ? volcano.name_en : volcano.name}
              </span>
              {volcano.alert_level && volcano.alert_level > 1 && (
                <span
                  className={`ml-2 px-1.5 py-0.5 text-xs rounded ${getAlertLevelStyles(
                    volcano.alert_level
                  )}`}
                >
                  Lv.{volcano.alert_level}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
