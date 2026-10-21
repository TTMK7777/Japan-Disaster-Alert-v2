export interface Earthquake {
  id: string;
  time: string;
  location: string;
  location_translated?: string;
  magnitude: number;
  max_intensity: string;
  max_intensity_translated?: string;
  depth: number;
  latitude: number;
  longitude: number;
  tsunami_warning: string;
  tsunami_warning_translated?: string;
  message: string;
  message_translated?: string;
}

/**
 * 津波の階級（backend の TsunamiInfo.warning_level）。
 *
 * `unknown` は種別名が想定と違う津波情報。気象庁の種別名を一次資料で確認できていないため、
 * backend は手がかりの無い名前を捨てずに unknown として「発表中」に含める。
 * 画面では注意報相当以上として扱い、捨てないこと（lib/emergencyAlert.ts）。
 */
export type TsunamiWarningLevel = 'none' | 'advisory' | 'warning' | 'major_warning' | 'unknown';

/** 津波予報区 1 つ分。list.json には区域名が無く、コードと種別名だけ */
export interface TsunamiArea {
  code: string;
  /** 気象庁の種別名そのまま（例「津波注意報」） */
  kind: string;
  /** /api/v1/tsunami/active のときだけ付く。発表中の区域の階級 */
  level?: Exclude<TsunamiWarningLevel, 'none'>;
}

/** backend の TsunamiInfo（/api/v1/tsunami・/api/v1/tsunami/active・SSE の tsunami イベント） */
export interface TsunamiInfo {
  id: string;
  event_id: string;
  title: string;
  title_en?: string | null;
  report_datetime: string;
  earthquake_time?: string | null;
  earthquake_location: string;
  earthquake_location_en?: string | null;
  magnitude?: string | null;
  coordinates?: string | null;
  warning_level: TsunamiWarningLevel;
  /** active では発表中の区域だけ。履歴一覧では上流の kind 配列そのまま */
  areas: TsunamiArea[];
  message: string;
  message_translated?: string | null;
}
