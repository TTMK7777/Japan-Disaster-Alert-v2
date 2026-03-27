'use client';

interface EmergencyContactsProps {
  language: string;
}

// 緊急連絡先の多言語データ
const contactsData: Record<string, {
  title: string;
  subtitle: string;
  sections: {
    title: string;
    contacts: {
      name: string;
      number: string;
      description: string;
      available?: string;
      languages?: string;
    }[];
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
          { name: '警察', number: '110', description: '事件・事故', available: '24時間' },
          { name: '消防・救急', number: '119', description: '火災・救急', available: '24時間' },
          { name: '海上保安庁', number: '118', description: '海での事故', available: '24時間' },
        ]
      },
      {
        title: '災害・観光相談',
        contacts: [
          { name: 'Japan Visitor Hotline', number: '050-3816-2787', description: '外国人向け24時間対応', available: '24時間', languages: 'EN/CN/KO/JP' },
          { name: '災害用伝言ダイヤル', number: '171', description: '安否確認', available: '災害時' },
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
          { name: 'Police', number: '110', description: 'Crime, accidents', available: '24/7' },
          { name: 'Fire/Ambulance', number: '119', description: 'Fire, medical emergency', available: '24/7' },
          { name: 'Coast Guard', number: '118', description: 'Sea accidents', available: '24/7' },
        ]
      },
      {
        title: 'Tourist Support',
        contacts: [
          { name: 'Japan Visitor Hotline', number: '050-3816-2787', description: '24h multilingual support', available: '24/7', languages: 'EN/CN/KO/JP' },
          { name: 'Disaster Message Dial', number: '171', description: 'Safety confirmation', available: 'During disasters' },
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
          { name: '警察', number: '110', description: '犯罪、事故', available: '24小时' },
          { name: '消防/急救', number: '119', description: '火灾、急救', available: '24小时' },
          { name: '海上保安', number: '118', description: '海上事故', available: '24小时' },
        ]
      },
      {
        title: '游客支援',
        contacts: [
          { name: 'Japan Visitor Hotline', number: '050-3816-2787', description: '24小时多语言服务', available: '24小时', languages: '中文/EN/KO/JP' },
          { name: '灾害留言电话', number: '171', description: '确认安全', available: '灾害时' },
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
          { name: '警察', number: '110', description: '犯罪、事故', available: '24小時' },
          { name: '消防/急救', number: '119', description: '火災、急救', available: '24小時' },
          { name: '海上保安', number: '118', description: '海上事故', available: '24小時' },
        ]
      },
      {
        title: '遊客支援',
        contacts: [
          { name: 'Japan Visitor Hotline', number: '050-3816-2787', description: '24小時多語言服務', available: '24小時', languages: '中文/EN/KO/JP' },
          { name: '災害留言電話', number: '171', description: '確認安全', available: '災害時' },
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
          { name: '경찰', number: '110', description: '범죄, 사고', available: '24시간' },
          { name: '소방/구급', number: '119', description: '화재, 응급', available: '24시간' },
          { name: '해상 보안', number: '118', description: '해상 사고', available: '24시간' },
        ]
      },
      {
        title: '관광객 지원',
        contacts: [
          { name: 'Japan Visitor Hotline', number: '050-3816-2787', description: '24시간 다국어 서비스', available: '24시간', languages: '한국어/EN/CN/JP' },
          { name: '재해 메시지 다이얼', number: '171', description: '안부 확인', available: '재해 시' },
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
          { name: 'Cảnh sát', number: '110', description: 'Tội phạm, tai nạn', available: '24/7' },
          { name: 'Cứu hỏa/Cấp cứu', number: '119', description: 'Hỏa hoạn, y tế', available: '24/7' },
          { name: 'Bảo vệ bờ biển', number: '118', description: 'Tai nạn trên biển', available: '24/7' },
        ]
      },
      {
        title: 'Hỗ trợ du khách',
        contacts: [
          { name: 'Japan Visitor Hotline', number: '050-3816-2787', description: 'Hỗ trợ đa ngôn ngữ 24h', available: '24/7', languages: 'EN/CN/KO/JP' },
          { name: 'Đường dây nhắn tin thảm họa', number: '171', description: 'Xác nhận an toàn', available: 'Khi có thảm họa' },
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
          { name: 'ตำรวจ', number: '110', description: 'อาชญากรรม อุบัติเหตุ', available: '24 ชม.' },
          { name: 'ดับเพลิง/รถพยาบาล', number: '119', description: 'ไฟไหม้ ฉุกเฉินทางการแพทย์', available: '24 ชม.' },
          { name: 'หน่วยยามชายฝั่ง', number: '118', description: 'อุบัติเหตุทางทะเล', available: '24 ชม.' },
        ]
      },
      {
        title: 'สนับสนุนนักท่องเที่ยว',
        contacts: [
          { name: 'Japan Visitor Hotline', number: '050-3816-2787', description: 'บริการหลายภาษา 24 ชม.', available: '24 ชม.', languages: 'EN/CN/KO/JP' },
          { name: 'สายด่วนข้อความภัยพิบัติ', number: '171', description: 'ยืนยันความปลอดภัย', available: 'เมื่อเกิดภัยพิบัติ' },
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
          { name: 'Polisi', number: '110', description: 'Kejahatan, kecelakaan', available: '24 jam' },
          { name: 'Pemadam/Ambulans', number: '119', description: 'Kebakaran, darurat medis', available: '24 jam' },
          { name: 'Penjaga Pantai', number: '118', description: 'Kecelakaan laut', available: '24 jam' },
        ]
      },
      {
        title: 'Dukungan Wisatawan',
        contacts: [
          { name: 'Japan Visitor Hotline', number: '050-3816-2787', description: 'Dukungan multibahasa 24 jam', available: '24 jam', languages: 'EN/CN/KO/JP' },
          { name: 'Telepon Pesan Bencana', number: '171', description: 'Konfirmasi keselamatan', available: 'Saat bencana' },
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
          { name: 'Polis', number: '110', description: 'Jenayah, kemalangan', available: '24 jam' },
          { name: 'Bomba/Ambulans', number: '119', description: 'Kebakaran, kecemasan perubatan', available: '24 jam' },
          { name: 'Pengawal Pantai', number: '118', description: 'Kemalangan laut', available: '24 jam' },
        ]
      },
      {
        title: 'Sokongan Pelancong',
        contacts: [
          { name: 'Japan Visitor Hotline', number: '050-3816-2787', description: 'Sokongan pelbagai bahasa 24 jam', available: '24 jam', languages: 'EN/CN/KO/JP' },
          { name: 'Dail Mesej Bencana', number: '171', description: 'Pengesahan keselamatan', available: 'Semasa bencana' },
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
          { name: 'Pulis', number: '110', description: 'Krimen, aksidente', available: '24 oras' },
          { name: 'Bumbero/Ambulansya', number: '119', description: 'Sunog, medikal na emergency', available: '24 oras' },
          { name: 'Coast Guard', number: '118', description: 'Aksidente sa dagat', available: '24 oras' },
        ]
      },
      {
        title: 'Suporta para sa Turista',
        contacts: [
          { name: 'Japan Visitor Hotline', number: '050-3816-2787', description: '24 oras na multilingual na suporta', available: '24 oras', languages: 'EN/CN/KO/JP' },
          { name: 'Disaster Message Dial', number: '171', description: 'Kumpirmasyon ng kaligtasan', available: 'Kapag may sakuna' },
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
          { name: 'प्रहरी', number: '110', description: 'अपराध, दुर्घटना', available: '२४ घण्टा' },
          { name: 'दमकल/एम्बुलेन्स', number: '119', description: 'आगलागी, चिकित्सा आपतकालीन', available: '२४ घण्टा' },
          { name: 'तटरक्षक', number: '118', description: 'समुद्री दुर्घटना', available: '२४ घण्टा' },
        ]
      },
      {
        title: 'पर्यटक सहायता',
        contacts: [
          { name: 'Japan Visitor Hotline', number: '050-3816-2787', description: '२४ घण्टा बहुभाषिक सहायता', available: '२४ घण्टा', languages: 'EN/CN/KO/JP' },
          { name: 'विपद् सन्देश डायल', number: '171', description: 'सुरक्षा पुष्टि', available: 'विपद्को समयमा' },
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
          { name: 'Police', number: '110', description: 'Crimes, accidents', available: '24h/24' },
          { name: 'Pompiers/Ambulance', number: '119', description: 'Incendie, urgence m\u00e9dicale', available: '24h/24' },
          { name: 'Garde c\u00f4ti\u00e8re', number: '118', description: 'Accidents en mer', available: '24h/24' },
        ]
      },
      {
        title: 'Assistance touristique',
        contacts: [
          { name: 'Japan Visitor Hotline', number: '050-3816-2787', description: 'Support multilingue 24h', available: '24h/24', languages: 'EN/CN/KO/JP' },
          { name: 'Service de messages catastrophe', number: '171', description: 'Confirmation de s\u00e9curit\u00e9', available: 'En cas de catastrophe' },
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
          { name: 'Polizei', number: '110', description: 'Verbrechen, Unf\u00e4lle', available: '24 Std.' },
          { name: 'Feuerwehr/Rettung', number: '119', description: 'Brand, medizinischer Notfall', available: '24 Std.' },
          { name: 'K\u00fcstenwache', number: '118', description: 'Seeunf\u00e4lle', available: '24 Std.' },
        ]
      },
      {
        title: 'Touristenhilfe',
        contacts: [
          { name: 'Japan Visitor Hotline', number: '050-3816-2787', description: 'Mehrsprachiger Support 24 Std.', available: '24 Std.', languages: 'EN/CN/KO/JP' },
          { name: 'Katastrophen-Nachrichtendienst', number: '171', description: 'Sicherheitsbest\u00e4tigung', available: 'Bei Katastrophen' },
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
          { name: 'Polizia', number: '110', description: 'Crimini, incidenti', available: '24 ore' },
          { name: 'Vigili del fuoco/Ambulanza', number: '119', description: 'Incendi, emergenze mediche', available: '24 ore' },
          { name: 'Guardia costiera', number: '118', description: 'Incidenti in mare', available: '24 ore' },
        ]
      },
      {
        title: 'Assistenza turistica',
        contacts: [
          { name: 'Japan Visitor Hotline', number: '050-3816-2787', description: 'Supporto multilingue 24 ore', available: '24 ore', languages: 'EN/CN/KO/JP' },
          { name: 'Servizio messaggi disastro', number: '171', description: 'Conferma sicurezza', available: 'Durante i disastri' },
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
          { name: 'Polic\u00eda', number: '110', description: 'Delitos, accidentes', available: '24 horas' },
          { name: 'Bomberos/Ambulancia', number: '119', description: 'Incendios, emergencia m\u00e9dica', available: '24 horas' },
          { name: 'Guardacostas', number: '118', description: 'Accidentes mar\u00edtimos', available: '24 horas' },
        ]
      },
      {
        title: 'Apoyo al turista',
        contacts: [
          { name: 'Japan Visitor Hotline', number: '050-3816-2787', description: 'Soporte multiling\u00fce 24h', available: '24 horas', languages: 'EN/CN/KO/JP' },
          { name: 'L\u00ednea de mensajes de desastre', number: '171', description: 'Confirmaci\u00f3n de seguridad', available: 'Durante desastres' },
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
          { name: 'けいさつ', number: '110', description: 'じけん・じこ', available: '24じかん' },
          { name: 'しょうぼう・きゅうきゅう', number: '119', description: 'かじ・きゅうきゅう', available: '24じかん' },
          { name: 'かいじょうほあんちょう', number: '118', description: 'うみの じこ', available: '24じかん' },
        ]
      },
      {
        title: 'さいがい・かんこう そうだん',
        contacts: [
          { name: 'Japan Visitor Hotline', number: '050-3816-2787', description: 'がいこくじん むけ 24じかん たいおう', available: '24じかん', languages: 'EN/CN/KO/JP' },
          { name: 'さいがいよう でんごん ダイヤル', number: '171', description: 'あんぴ かくにん', available: 'さいがいのとき' },
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

export default function EmergencyContacts({ language }: EmergencyContactsProps) {
  // 言語データを取得（未対応言語はenにフォールバック）
  const data = contactsData[language] || contactsData.en;

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
            {section.contacts.map((contact, contactIdx) => (
              <div key={contactIdx} className="p-4 flex items-center gap-4">
                <a
                  href={`tel:${contact.number}`}
                  className="flex-shrink-0 w-20 h-20 bg-red-500 hover:bg-red-600 text-white rounded-xl flex flex-col items-center justify-center transition-colors shadow-md"
                  aria-label={`Call ${contact.name} at ${contact.number}`}
                >
                  <PhoneIcon className="w-8 h-8" />
                  <span className="text-lg font-bold mt-1">{contact.number}</span>
                </a>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-gray-900 dark:text-gray-100 text-lg">{contact.name}</h4>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">{contact.description}</p>
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
            ))}
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
