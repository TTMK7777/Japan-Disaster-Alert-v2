'use client';

import { getTranslation } from '@/i18n/translations';
import {
  EMERGENCY_LINKS,
  EMERGENCY_PHONE_NUMBERS,
  LINK_ORDER,
  LINK_TEXT_KEYS,
  PHONE_TEXT_KEYS,
  type PhoneContactId,
} from '@/lib/emergencyContacts';

interface EmergencyContactsProps {
  language: string;
}

interface PhoneContactText {
  /** 番号は持たない。EMERGENCY_PHONE_NUMBERS[id] から引く（offline.html と同じ正本） */
  id: PhoneContactId;
  /** 省略時は PHONE_TEXT_KEYS の翻訳キーから引く（119 の名前など） */
  name?: string;
  description?: string;
  available?: string;
  languages?: string;
}

// 緊急連絡先の多言語データ（番号は src/lib/emergencyContacts.ts が正本）
export const contactsData: Record<string, {
  title: string;
  subtitle: string;
  sections: {
    title: string;
    contacts: PhoneContactText[];
  }[];
  tips: string[];
}> = {
  ja: {
    title: '緊急連絡先',
    subtitle: '災害時にお使いください',
    sections: [
      {
        title: '緊急通報',
        contacts: [
          { id: 'police', name: '警察', description: '事件・事故', available: '24時間' },
          { id: 'fire', available: '24時間' },
          { id: 'coastGuard', name: '海上保安庁', description: '海での事故', available: '24時間' },
        ]
      },
      {
        title: '災害・観光相談',
        contacts: [
          { id: 'visitorHotline', name: 'Japan Visitor Hotline', available: '24時間', languages: 'EN/CN/KO/JP' },
          { id: 'message171', name: '災害用伝言ダイヤル', description: '安否確認', available: '災害時' },
        ]
      },
    ],
    tips: [
      '日本語が話せない場合は「English please」と伝えてください',
      '携帯電話からでも110, 119は無料でかけられます',
      '場所がわからない場合は近くの建物の住所を伝えてください',
    ],
  },
  en: {
    title: 'Emergency Contacts',
    subtitle: 'Use during disasters',
    sections: [
      {
        title: 'Emergency Services',
        contacts: [
          { id: 'police', name: 'Police', description: 'Crime, accidents', available: '24/7' },
          { id: 'fire', available: '24/7' },
          { id: 'coastGuard', name: 'Coast Guard', description: 'Sea accidents', available: '24/7' },
        ]
      },
      {
        title: 'Tourist Support',
        contacts: [
          { id: 'visitorHotline', name: 'Japan Visitor Hotline', available: '24/7', languages: 'EN/CN/KO/JP' },
          { id: 'message171', name: 'Disaster Message Dial', description: 'Safety confirmation', available: 'During disasters' },
        ]
      },
    ],
    tips: [
      'Say "English please" if you need English support',
      '110 and 119 are free from mobile phones',
      'If you don\'t know your location, describe nearby landmarks',
    ],
  },
  zh: {
    title: '紧急联系电话',
    subtitle: '灾害时使用',
    sections: [
      {
        title: '紧急服务',
        contacts: [
          { id: 'police', name: '警察', description: '犯罪、事故', available: '24小时' },
          { id: 'fire', available: '24小时' },
          { id: 'coastGuard', name: '海上保安', description: '海上事故', available: '24小时' },
        ]
      },
      {
        title: '游客支援',
        contacts: [
          { id: 'visitorHotline', name: 'Japan Visitor Hotline', available: '24小时', languages: '中文/EN/KO/JP' },
          { id: 'message171', name: '灾害留言电话', description: '确认安全', available: '灾害时' },
        ]
      },
    ],
    tips: [
      '如果需要中文服务，请说"Chinese please"',
      '110和119从手机拨打免费',
      '如果不知道位置，请描述附近的建筑物',
    ],
  },
  'zh-TW': {
    title: '緊急聯絡電話',
    subtitle: '災害時使用',
    sections: [
      {
        title: '緊急服務',
        contacts: [
          { id: 'police', name: '警察', description: '犯罪、事故', available: '24小時' },
          { id: 'fire', available: '24小時' },
          { id: 'coastGuard', name: '海上保安', description: '海上事故', available: '24小時' },
        ]
      },
      {
        title: '遊客支援',
        contacts: [
          { id: 'visitorHotline', name: 'Japan Visitor Hotline', available: '24小時', languages: '中文/EN/KO/JP' },
          { id: 'message171', name: '災害留言電話', description: '確認安全', available: '災害時' },
        ]
      },
    ],
    tips: [
      '如果需要中文服務，請說"Chinese please"',
      '110和119從手機撥打免費',
      '如果不知道位置，請描述附近的建築物',
    ],
  },
  ko: {
    title: '긴급 연락처',
    subtitle: '재해 시 사용',
    sections: [
      {
        title: '긴급 서비스',
        contacts: [
          { id: 'police', name: '경찰', description: '범죄, 사고', available: '24시간' },
          { id: 'fire', available: '24시간' },
          { id: 'coastGuard', name: '해상 보안', description: '해상 사고', available: '24시간' },
        ]
      },
      {
        title: '관광객 지원',
        contacts: [
          { id: 'visitorHotline', name: 'Japan Visitor Hotline', available: '24시간', languages: '한국어/EN/CN/JP' },
          { id: 'message171', name: '재해 메시지 다이얼', description: '안부 확인', available: '재해 시' },
        ]
      },
    ],
    tips: [
      '한국어 서비스가 필요하면 "Korean please"라고 말하세요',
      '110과 119는 휴대폰에서 무료입니다',
      '위치를 모르면 근처 건물을 설명하세요',
    ],
  },
  vi: {
    title: 'Liên hệ khẩn cấp',
    subtitle: 'Sử dụng khi có thảm họa',
    sections: [
      {
        title: 'Dịch vụ khẩn cấp',
        contacts: [
          { id: 'police', name: 'Cảnh sát', description: 'Tội phạm, tai nạn', available: '24/7' },
          { id: 'fire', available: '24/7' },
          { id: 'coastGuard', name: 'Bảo vệ bờ biển', description: 'Tai nạn trên biển', available: '24/7' },
        ]
      },
      {
        title: 'Hỗ trợ du khách',
        contacts: [
          { id: 'visitorHotline', name: 'Japan Visitor Hotline', available: '24/7', languages: 'EN/CN/KO/JP' },
          { id: 'message171', name: 'Đường dây nhắn tin thảm họa', description: 'Xác nhận an toàn', available: 'Khi có thảm họa' },
        ]
      },
    ],
    tips: [
      'Nói "English please" nếu cần hỗ trợ tiếng Anh',
      '110 và 119 miễn phí từ điện thoại di động',
      'Nếu không biết vị trí, mô tả các tòa nhà gần đó',
    ],
  },
  th: {
    title: 'ติดต่อฉุกเฉิน',
    subtitle: 'ใช้เมื่อเกิดภัยพิบัติ',
    sections: [
      {
        title: 'บริการฉุกเฉิน',
        contacts: [
          { id: 'police', name: 'ตำรวจ', description: 'อาชญากรรม อุบัติเหตุ', available: '24 ชม.' },
          { id: 'fire', available: '24 ชม.' },
          { id: 'coastGuard', name: 'หน่วยยามชายฝั่ง', description: 'อุบัติเหตุทางทะเล', available: '24 ชม.' },
        ]
      },
      {
        title: 'สนับสนุนนักท่องเที่ยว',
        contacts: [
          { id: 'visitorHotline', name: 'Japan Visitor Hotline', available: '24 ชม.', languages: 'EN/CN/KO/JP' },
          { id: 'message171', name: 'สายด่วนข้อความภัยพิบัติ', description: 'ยืนยันความปลอดภัย', available: 'เมื่อเกิดภัยพิบัติ' },
        ]
      },
    ],
    tips: [
      'พูดว่า "English please" หากต้องการบริการภาษาอังกฤษ',
      '110 และ 119 โทรฟรีจากโทรศัพท์มือถือ',
      'หากไม่ทราบตำแหน่ง ให้อธิบายสถานที่ใกล้เคียง',
    ],
  },
  id: {
    title: 'Kontak Darurat',
    subtitle: 'Gunakan saat bencana',
    sections: [
      {
        title: 'Layanan Darurat',
        contacts: [
          { id: 'police', name: 'Polisi', description: 'Kejahatan, kecelakaan', available: '24 jam' },
          { id: 'fire', available: '24 jam' },
          { id: 'coastGuard', name: 'Penjaga Pantai', description: 'Kecelakaan laut', available: '24 jam' },
        ]
      },
      {
        title: 'Dukungan Wisatawan',
        contacts: [
          { id: 'visitorHotline', name: 'Japan Visitor Hotline', available: '24 jam', languages: 'EN/CN/KO/JP' },
          { id: 'message171', name: 'Telepon Pesan Bencana', description: 'Konfirmasi keselamatan', available: 'Saat bencana' },
        ]
      },
    ],
    tips: [
      'Katakan "English please" jika membutuhkan dukungan bahasa Inggris',
      '110 dan 119 gratis dari ponsel',
      'Jika tidak tahu lokasi Anda, jelaskan bangunan terdekat',
    ],
  },
  ms: {
    title: 'Kenalan Kecemasan',
    subtitle: 'Gunakan semasa bencana',
    sections: [
      {
        title: 'Perkhidmatan Kecemasan',
        contacts: [
          { id: 'police', name: 'Polis', description: 'Jenayah, kemalangan', available: '24 jam' },
          { id: 'fire', available: '24 jam' },
          { id: 'coastGuard', name: 'Pengawal Pantai', description: 'Kemalangan laut', available: '24 jam' },
        ]
      },
      {
        title: 'Sokongan Pelancong',
        contacts: [
          { id: 'visitorHotline', name: 'Japan Visitor Hotline', available: '24 jam', languages: 'EN/CN/KO/JP' },
          { id: 'message171', name: 'Dail Mesej Bencana', description: 'Pengesahan keselamatan', available: 'Semasa bencana' },
        ]
      },
    ],
    tips: [
      'Katakan "English please" jika memerlukan sokongan bahasa Inggeris',
      '110 dan 119 percuma dari telefon bimbit',
      'Jika tidak tahu lokasi anda, terangkan bangunan berdekatan',
    ],
  },
  tl: {
    title: 'Emergency na Kontak',
    subtitle: 'Gamitin kapag may sakuna',
    sections: [
      {
        title: 'Emergency Services',
        contacts: [
          { id: 'police', name: 'Pulis', description: 'Krimen, aksidente', available: '24 oras' },
          { id: 'fire', available: '24 oras' },
          { id: 'coastGuard', name: 'Coast Guard', description: 'Aksidente sa dagat', available: '24 oras' },
        ]
      },
      {
        title: 'Suporta para sa Turista',
        contacts: [
          { id: 'visitorHotline', name: 'Japan Visitor Hotline', available: '24 oras', languages: 'EN/CN/KO/JP' },
          { id: 'message171', name: 'Disaster Message Dial', description: 'Kumpirmasyon ng kaligtasan', available: 'Kapag may sakuna' },
        ]
      },
    ],
    tips: [
      'Sabihin ang "English please" kung kailangan ng suporta sa Ingles',
      'Libre ang 110 at 119 mula sa cellphone',
      'Kung hindi mo alam ang lokasyon mo, ilarawan ang mga malapit na gusali',
    ],
  },
  ne: {
    title: 'आपतकालीन सम्पर्क',
    subtitle: 'विपद्को समयमा प्रयोग गर्नुहोस्',
    sections: [
      {
        title: 'आपतकालीन सेवा',
        contacts: [
          { id: 'police', name: 'प्रहरी', description: 'अपराध, दुर्घटना', available: '२४ घण्टा' },
          { id: 'fire', available: '२४ घण्टा' },
          { id: 'coastGuard', name: 'तटरक्षक', description: 'समुद्री दुर्घटना', available: '२४ घण्टा' },
        ]
      },
      {
        title: 'पर्यटक सहायता',
        contacts: [
          { id: 'visitorHotline', name: 'Japan Visitor Hotline', available: '२४ घण्टा', languages: 'EN/CN/KO/JP' },
          { id: 'message171', name: 'विपद् सन्देश डायल', description: 'सुरक्षा पुष्टि', available: 'विपद्को समयमा' },
        ]
      },
    ],
    tips: [
      'अंग्रेजी सहायता चाहिन्छ भने "English please" भन्नुहोस्',
      '110 र 119 मोबाइलबाट निःशुल्क छन्',
      'तपाईंको स्थान थाहा छैन भने नजिकको भवन वर्णन गर्नुहोस्',
    ],
  },
  fr: {
    title: 'Contacts d\'urgence',
    subtitle: 'Utilisez en cas de catastrophe',
    sections: [
      {
        title: 'Services d\'urgence',
        contacts: [
          { id: 'police', name: 'Police', description: 'Crimes, accidents', available: '24h/24' },
          { id: 'fire', available: '24h/24' },
          { id: 'coastGuard', name: 'Garde c\u00f4ti\u00e8re', description: 'Accidents en mer', available: '24h/24' },
        ]
      },
      {
        title: 'Assistance touristique',
        contacts: [
          { id: 'visitorHotline', name: 'Japan Visitor Hotline', available: '24h/24', languages: 'EN/CN/KO/JP' },
          { id: 'message171', name: 'Service de messages catastrophe', description: 'Confirmation de s\u00e9curit\u00e9', available: 'En cas de catastrophe' },
        ]
      },
    ],
    tips: [
      'Dites "English please" si vous avez besoin d\'aide en anglais',
      '110 et 119 sont gratuits depuis un t\u00e9l\u00e9phone portable',
      'Si vous ne connaissez pas votre emplacement, d\u00e9crivez les b\u00e2timents proches',
    ],
  },
  de: {
    title: 'Notfallkontakte',
    subtitle: 'Bei Katastrophen verwenden',
    sections: [
      {
        title: 'Notdienste',
        contacts: [
          { id: 'police', name: 'Polizei', description: 'Verbrechen, Unf\u00e4lle', available: '24 Std.' },
          { id: 'fire', available: '24 Std.' },
          { id: 'coastGuard', name: 'K\u00fcstenwache', description: 'Seeunf\u00e4lle', available: '24 Std.' },
        ]
      },
      {
        title: 'Touristenhilfe',
        contacts: [
          { id: 'visitorHotline', name: 'Japan Visitor Hotline', available: '24 Std.', languages: 'EN/CN/KO/JP' },
          { id: 'message171', name: 'Katastrophen-Nachrichtendienst', description: 'Sicherheitsbest\u00e4tigung', available: 'Bei Katastrophen' },
        ]
      },
    ],
    tips: [
      'Sagen Sie "English please" wenn Sie englische Unterst\u00fctzung ben\u00f6tigen',
      '110 und 119 sind kostenlos vom Mobiltelefon',
      'Wenn Sie Ihren Standort nicht kennen, beschreiben Sie nahe Geb\u00e4ude',
    ],
  },
  it: {
    title: 'Contatti di emergenza',
    subtitle: 'Utilizzare in caso di disastro',
    sections: [
      {
        title: 'Servizi di emergenza',
        contacts: [
          { id: 'police', name: 'Polizia', description: 'Crimini, incidenti', available: '24 ore' },
          { id: 'fire', available: '24 ore' },
          { id: 'coastGuard', name: 'Guardia costiera', description: 'Incidenti in mare', available: '24 ore' },
        ]
      },
      {
        title: 'Assistenza turistica',
        contacts: [
          { id: 'visitorHotline', name: 'Japan Visitor Hotline', available: '24 ore', languages: 'EN/CN/KO/JP' },
          { id: 'message171', name: 'Servizio messaggi disastro', description: 'Conferma sicurezza', available: 'Durante i disastri' },
        ]
      },
    ],
    tips: [
      'Dite "English please" se avete bisogno di supporto in inglese',
      '110 e 119 sono gratuiti dal cellulare',
      'Se non conoscete la vostra posizione, descrivete gli edifici vicini',
    ],
  },
  es: {
    title: 'Contactos de emergencia',
    subtitle: 'Usar durante desastres',
    sections: [
      {
        title: 'Servicios de emergencia',
        contacts: [
          { id: 'police', name: 'Polic\u00eda', description: 'Delitos, accidentes', available: '24 horas' },
          { id: 'fire', available: '24 horas' },
          { id: 'coastGuard', name: 'Guardacostas', description: 'Accidentes mar\u00edtimos', available: '24 horas' },
        ]
      },
      {
        title: 'Apoyo al turista',
        contacts: [
          { id: 'visitorHotline', name: 'Japan Visitor Hotline', available: '24 horas', languages: 'EN/CN/KO/JP' },
          { id: 'message171', name: 'L\u00ednea de mensajes de desastre', description: 'Confirmaci\u00f3n de seguridad', available: 'Durante desastres' },
        ]
      },
    ],
    tips: [
      'Diga "English please" si necesita ayuda en ingl\u00e9s',
      '110 y 119 son gratuitos desde el m\u00f3vil',
      'Si no conoce su ubicaci\u00f3n, describa los edificios cercanos',
    ],
  },
  easy_ja: {
    title: 'きんきゅう れんらくさき',
    subtitle: 'さいがいの ときに つかって ください',
    sections: [
      {
        title: 'きんきゅう でんわ',
        contacts: [
          { id: 'police', name: 'けいさつ', description: 'じけん・じこ', available: '24じかん' },
          { id: 'fire', available: '24じかん' },
          { id: 'coastGuard', name: 'かいじょうほあんちょう', description: 'うみの じこ', available: '24じかん' },
        ]
      },
      {
        title: 'さいがい・かんこう そうだん',
        contacts: [
          { id: 'visitorHotline', name: 'Japan Visitor Hotline', available: '24じかん', languages: 'EN/CN/KO/JP' },
          { id: 'message171', name: 'さいがいよう でんごん ダイヤル', description: 'あんぴ かくにん', available: 'さいがいのとき' },
        ]
      },
    ],
    tips: [
      'にほんごが はなせない ときは「English please」と いって ください',
      'けいたいでんわ からでも 110、119は むりょうです',
      'ばしょが わからない ときは ちかくの たてものを おしえて ください',
    ],
  },
};

// 電話アイコン
function PhoneIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
    </svg>
  );
}

// 情報アイコン
function InfoIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
    </svg>
  );
}

// 外部リンクのアイコン（新しいタブで公式ページを開く）
function GlobeIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm6.93 6h-2.95a15.65 15.65 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.93 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2s.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A7.99 7.99 0 0 1 5.08 16zm2.95-8H5.08a7.99 7.99 0 0 1 4.33-3.56A15.65 15.65 0 0 0 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2s.07-1.35.16-2h4.68c.09.65.16 1.32.16 2s-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2s-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z"/>
    </svg>
  );
}

export default function EmergencyContacts({ language }: EmergencyContactsProps) {
  // 言語データを取得（未対応言語はenにフォールバック）
  const data = contactsData[language] || contactsData.en;
  const t = (key: string) => getTranslation(contactsData[language] ? language : 'en', key);
  /** 名前・説明・注記: contactsData に無いものは translations.ts（PHONE_TEXT_KEYS）から */
  const phoneText = (contact: PhoneContactText) => {
    const keys = PHONE_TEXT_KEYS[contact.id] ?? {};
    return {
      name: keys.name ? t(keys.name) : contact.name ?? '',
      description: keys.description ? t(keys.description) : contact.description ?? '',
      note: keys.note ? t(keys.note) : undefined,
    };
  };

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="bg-red-600 dark:bg-red-700 text-white rounded-lg shadow dark:shadow-gray-900/30 p-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <PhoneIcon className="w-6 h-6" />
          {data.title}
        </h2>
        <p className="text-red-100 text-sm mt-1">{data.subtitle}</p>
      </div>

      {/* 各セクション */}
      {data.sections.map((section, sectionIdx) => (
        <div key={sectionIdx} className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/30 overflow-hidden">
          <h3 className="bg-gray-100 dark:bg-gray-700 px-4 py-2 font-bold text-gray-800 dark:text-gray-100 border-b dark:border-gray-600">
            {section.title}
          </h3>
          <div className="divide-y dark:divide-gray-700">
            {section.contacts.map((contact) => {
              const number = EMERGENCY_PHONE_NUMBERS[contact.id];
              const text = phoneText(contact);
              return (
              <div key={contact.id} className="p-4 flex items-center gap-4">
                {/* 発信ボタンは「意図してここを押した」と言える大きさに留める。
                    行全体をリンクにすると 110/119 の誤発信を招くため広げない。
                    番号は桁数で幅が変わるのでボタンの中に入れず本文側に出す
                    （以前は 80x80px の箱に text-lg で描いていたため、110 は収まっても
                    「050-3816-2787」はボタン枠からはみ出して切れていた） */}
                <a
                  href={`tel:${number}`}
                  className="flex-shrink-0 w-16 h-16 bg-red-500 hover:bg-red-600 text-white rounded-xl flex items-center justify-center transition-colors shadow-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                  aria-label={`Call ${text.name} at ${number}`}
                >
                  <PhoneIcon className="w-8 h-8" />
                </a>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-gray-900 dark:text-gray-100">{text.name}</h4>
                  {/* tabular-nums で桁を揃える。長い番号でも折り返さず1行に収まる */}
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums tracking-tight leading-tight">
                    {number}
                  </p>
                  <p className="text-gray-600 dark:text-gray-300 text-sm mt-0.5">{text.description}</p>
                  {text.note && (
                    <p className="text-amber-800 dark:text-amber-200 text-xs mt-1">{text.note}</p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {contact.available && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200">
                        {contact.available}
                      </span>
                    )}
                    {contact.languages && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200">
                        {contact.languages}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
            {/* 公式ページへの導線（電話番号を持たない）。新しいセクション見出しの訳が無いため、
                最後のセクション（災害・観光相談）の続きに並べる。#7119 は地域で有無・時間が違うので
                発信ボタンにせず消防庁の地域一覧へ案内し、注記を必ず添える */}
            {sectionIdx === data.sections.length - 1 && LINK_ORDER.map((id) => {
              const keys = LINK_TEXT_KEYS[id];
              return (
                <div key={id} className="p-4 flex items-center gap-4">
                  <span className="flex-shrink-0 w-16 h-16 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl flex items-center justify-center" aria-hidden="true">
                    <GlobeIcon className="w-8 h-8" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <a
                      href={EMERGENCY_LINKS[id]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center min-h-[44px] font-bold text-blue-700 dark:text-blue-300 underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                    >
                      {t(keys.name)}
                      <span aria-hidden="true" className="ml-1">↗</span>
                    </a>
                    <p className="text-gray-600 dark:text-gray-300 text-sm">{t(keys.description)}</p>
                    {keys.note && (
                      <p className="text-amber-800 dark:text-amber-200 text-xs mt-1">{t(keys.note)}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* ヒント */}
      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
        <h3 className="font-bold text-amber-800 dark:text-amber-200 flex items-center gap-2 mb-2">
          <InfoIcon className="w-5 h-5" />
          Tips
        </h3>
        <ul className="space-y-1 text-amber-700 dark:text-amber-300 text-sm">
          {data.tips.map((tip, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="text-amber-500">•</span>
              {tip}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
