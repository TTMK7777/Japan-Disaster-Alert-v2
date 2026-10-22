/**
 * 緊急連絡先の番号・公式 URL の正本（B11）。
 *
 * 本体（components/EmergencyContacts.tsx）はここから番号・URL を引く。
 * オフライン画面（public/offline.html）は静的ファイルで import できないため同じ値を直書きし、
 * src/__tests__/emergency-contacts-sync.test.ts が「本体の描画結果 = 正本 = offline.html」を固定する。
 * 片方だけ直すとそのテストが落ちる。
 *
 * 番号の照合: .team/inbox/CDX/audit-emergency-contacts.md（確認日 2026-10-21）
 * URL の出典: .team/inbox/CDX/i18n-b11/source-ja.json（新しい URL をここで作らない）
 */

/** 電話で発信できる窓口（tel: リンクにする） */
export const EMERGENCY_PHONE_NUMBERS = {
  police: '110',
  fire: '119',
  coastGuard: '118',
  visitorHotline: '050-3816-2787',
  message171: '171',
} as const;

export type PhoneContactId = keyof typeof EMERGENCY_PHONE_NUMBERS;

/**
 * 公式ページへの導線（電話番号は持たない）。
 * #7119 は地域ごとに有無・受付時間・対象者が違うため、全国共通の発信ボタンにせず
 * 消防庁の地域一覧へ案内する。
 */
export const EMERGENCY_LINKS = {
  web171: 'https://www.ntt-east.co.jp/saigai/web171/',
  medicalSearch: 'https://www.jnto.go.jp/emergency/jpn/mi_guide.html',
  consultation7119: 'https://www.fdma.go.jp/mission/enrichment/appropriate/appropriate007.html',
  embassy: 'https://www.mofa.go.jp/about/emb_cons/protocol/index.html',
} as const;

export type LinkContactId = keyof typeof EMERGENCY_LINKS;

/** 表示順（安否 → 医療 → 救急相談 → 自国の公館） */
export const LINK_ORDER: readonly LinkContactId[] = ['web171', 'medicalSearch', 'consultation7119', 'embassy'];

/** 導線ごとの翻訳キー（translations.ts） */
export const LINK_TEXT_KEYS: Record<LinkContactId, { name: string; description: string; note?: string }> = {
  web171: { name: 'emergency.web171.name', description: 'emergency.web171.description' },
  medicalSearch: { name: 'emergency.medicalSearch.name', description: 'emergency.medicalSearch.description' },
  consultation7119: {
    name: 'emergency.consultation7119.name',
    description: 'emergency.consultation7119.description',
    note: 'emergency.consultation7119.note',
  },
  embassy: { name: 'emergency.embassy.name', description: 'emergency.embassy.description' },
};

/** 電話窓口のうち、名前・説明・注記を translations.ts から引くもの（他は contactsData の文言） */
export const PHONE_TEXT_KEYS: Partial<Record<PhoneContactId, { name?: string; description?: string; note?: string }>> = {
  fire: { name: 'emergency.fire.name', description: 'emergency.fire.description' },
  visitorHotline: { description: 'emergency.visitorHotline.description' },
  message171: { note: 'emergency.message171.note' },
};
