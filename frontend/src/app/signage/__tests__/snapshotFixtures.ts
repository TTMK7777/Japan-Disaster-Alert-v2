/**
 * テスト用の snapshot（GET /api/v1/snapshot）の生 JSON。
 * 形は backend/app/snapshot_models.py と docs/dev/snapshot-schema.json に合わせる
 * （fetched_at / generated_at は UTC の ISO 文字列、error は fetched_at=null・items=null）。
 */

type Status = 'ok' | 'stale' | 'error';

export function dataset(status: Status, fetchedAt: string | null, items: unknown[] | null) {
  return { status, fetched_at: fetchedAt, items };
}

export function quake(overrides: Record<string, unknown> = {}) {
  return {
    id: 'q1',
    occurred_at: '2026-10-22T14:20:00+09:00',
    location_ja: '千葉県東方沖',
    magnitude: 4.8,
    depth_km: 30,
    max_intensity: '5弱',
    max_scale: 45,
    latitude: 35.7,
    longitude: 140.9,
    domestic_tsunami: 'None',
    ...overrides,
  };
}

export function tsunami(level: string, overrides: Record<string, unknown> = {}) {
  return {
    event_id: `e-${level}`,
    report_id: `r-${level}`,
    report_datetime: '2026-10-22T14:25:00+09:00',
    info_type: '発表',
    warning_level: level,
    earthquake_time: '2026-10-22T14:20:00+09:00',
    epicenter_ja: '三陸沖',
    epicenter_en: 'Off Sanriku',
    magnitude: '7.8',
    areas: [
      { code: '100', kind_ja: '津波警報', level },
      { code: '101', kind_ja: '津波警報', level },
    ],
    ...overrides,
  };
}

export function volcano(severity: string, overrides: Record<string, unknown> = {}) {
  return {
    volcano_code: `v-${severity}`,
    volcano_name_ja: severity === 'extreme' ? '桜島' : '浅間山',
    volcano_name_en: severity === 'extreme' ? 'Sakurajima' : 'Asamayama',
    alert_level: severity === 'extreme' ? 5 : 2,
    warning_name_ja: severity === 'extreme' ? '噴火警報（居住地域）' : '火口周辺警報',
    condition: '継続',
    severity,
    issued_at: '2026-10-22T11:00:00+09:00',
    municipalities_ja: ['鹿児島市'],
    latitude: 31.58,
    longitude: 130.65,
    ...overrides,
  };
}

/** generated_at と各 dataset の fetched_at を同じ時刻にした snapshot */
export function snapshotAt(
  iso: string,
  parts: Partial<Record<'earthquakes' | 'tsunami' | 'volcano_warnings', ReturnType<typeof dataset>>> = {}
) {
  return {
    schema_version: '1.0',
    generated_at: iso,
    source: {
      providers: [],
      official: false,
      notice_ja: '気象庁の発表を中継したもので、公式発表ではありません。',
      notice_en: 'Relayed from JMA; not an official release.',
    },
    datasets: {
      earthquakes: parts.earthquakes ?? dataset('ok', iso, [quake()]),
      tsunami: parts.tsunami ?? dataset('ok', iso, []),
      volcano_warnings: parts.volcano_warnings ?? dataset('ok', iso, []),
    },
  };
}
