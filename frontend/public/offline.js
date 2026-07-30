/**
 * オフラインページのロジック（public/offline.html から読み込む）
 *
 * **インラインに書いてはいけない。** middleware.ts の CSP が
 * `script-src 'self' 'nonce-...'` を設定しており、インラインスクリプトは
 * ブロックされる。Service Worker がキャッシュから返すときも
 * レスポンスヘッダごとキャッシュされるため、オフライン時も同様にブロックされる。
 * 同一オリジンの外部スクリプトは 'self' で許可されるのでこの形にしている。
 */
  // 言語コードは src/i18n/translations.ts の LANGUAGES と一致させる
  var LANGUAGES = [
    { code: 'ja', name: '日本語' },
    { code: 'en', name: 'English' },
    { code: 'zh', name: '中文' },
    { code: 'zh-TW', name: '繁體中文' },
    { code: 'ko', name: '한국어' },
    { code: 'vi', name: 'Tiếng Việt' },
    { code: 'th', name: 'ภาษาไทย' },
    { code: 'id', name: 'Bahasa Indonesia' },
    { code: 'ms', name: 'Bahasa Melayu' },
    { code: 'tl', name: 'Filipino' },
    { code: 'ne', name: 'नेपाली' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'it', name: 'Italiano' },
    { code: 'es', name: 'Español' },
    { code: 'easy_ja', name: 'やさしい日本語' }
  ];

  var T = {
    ja: {
      title: 'オフラインです',
      message: 'インターネットに接続されていません。以下は通信なしで読めます。',
      retry: '再接続',
      guide: 'いま すること',
      step1: '身の安全を確保する。頭を守り、倒れてくる物から離れる。',
      step2: '揺れが収まったら火を消し、海の近くなら高い場所へ移動する。',
      step3: '公式の指示に従って避難する。ひとりで判断しない。',
      emergency: '緊急連絡先',
      police: '警察', fire: '消防・救急', coast: '海上保安庁',
      hotline: '訪日外国人向け相談ホットライン（24時間）'
    },
    en: {
      title: 'You are offline',
      message: 'No internet connection. The steps below work without a network.',
      retry: 'Reconnect',
      guide: 'What to do now',
      step1: 'Protect yourself. Cover your head and move away from things that can fall.',
      step2: 'When the shaking stops, turn off fire. If you are near the sea, move to higher ground.',
      step3: 'Evacuate following official instructions. Do not decide alone.',
      emergency: 'Emergency numbers',
      police: 'Police', fire: 'Fire & Ambulance', coast: 'Coast Guard',
      hotline: 'Japan Visitor Hotline (24h)'
    },
    zh: {
      title: '您处于离线状态',
      message: '没有网络连接。以下内容无需联网即可阅读。',
      retry: '重新连接',
      guide: '现在该做什么',
      step1: '确保自身安全。保护头部，远离可能倒塌的物体。',
      step2: '摇晃停止后关闭火源。如在海边，请移动到高处。',
      step3: '按照官方指示避难。不要独自判断。',
      emergency: '紧急联系电话',
      police: '警察', fire: '消防·急救', coast: '海上保安厅',
      hotline: '访日外国人咨询热线（24小时）'
    },
    'zh-TW': {
      title: '您處於離線狀態',
      message: '沒有網路連線。以下內容無需連網即可閱讀。',
      retry: '重新連線',
      guide: '現在該做什麼',
      step1: '確保自身安全。保護頭部，遠離可能倒塌的物體。',
      step2: '搖晃停止後關閉火源。如在海邊，請移往高處。',
      step3: '依照官方指示避難。不要獨自判斷。',
      emergency: '緊急聯絡電話',
      police: '警察', fire: '消防·救護', coast: '海上保安廳',
      hotline: '訪日外國人諮詢熱線（24小時）'
    },
    ko: {
      title: '오프라인 상태입니다',
      message: '인터넷에 연결되어 있지 않습니다. 아래 내용은 통신 없이 읽을 수 있습니다.',
      retry: '다시 연결',
      guide: '지금 할 일',
      step1: '몸의 안전을 확보하세요. 머리를 보호하고 넘어질 수 있는 물건에서 떨어지세요.',
      step2: '흔들림이 멈추면 불을 끄고, 바다 근처라면 높은 곳으로 이동하세요.',
      step3: '공식 지시에 따라 대피하세요. 혼자 판단하지 마세요.',
      emergency: '긴급 연락처',
      police: '경찰', fire: '소방·구급', coast: '해상보안청',
      hotline: '방일 외국인 상담 핫라인(24시간)'
    },
    vi: {
      title: 'Bạn đang ngoại tuyến',
      message: 'Không có kết nối internet. Các bước dưới đây đọc được khi không có mạng.',
      retry: 'Kết nối lại',
      guide: 'Việc cần làm ngay',
      step1: 'Bảo vệ bản thân. Che đầu và tránh xa những vật có thể rơi đổ.',
      step2: 'Khi hết rung lắc, hãy tắt lửa. Nếu ở gần biển, hãy di chuyển lên cao.',
      step3: 'Sơ tán theo hướng dẫn chính thức. Không tự quyết định một mình.',
      emergency: 'Số điện thoại khẩn cấp',
      police: 'Cảnh sát', fire: 'Cứu hỏa·Cấp cứu', coast: 'Cảnh sát biển',
      hotline: 'Đường dây hỗ trợ khách nước ngoài (24h)'
    },
    th: {
      title: 'คุณออฟไลน์อยู่',
      message: 'ไม่มีการเชื่อมต่ออินเทอร์เน็ต ข้อความด้านล่างอ่านได้โดยไม่ต้องใช้เครือข่าย',
      retry: 'เชื่อมต่ออีกครั้ง',
      guide: 'สิ่งที่ต้องทำตอนนี้',
      step1: 'ป้องกันตัวเอง ปกป้องศีรษะและอยู่ห่างจากสิ่งของที่อาจล้ม',
      step2: 'เมื่อหยุดสั่นแล้ว ให้ดับไฟ หากอยู่ใกล้ทะเลให้ขึ้นที่สูง',
      step3: 'อพยพตามคำสั่งของทางการ อย่าตัดสินใจเพียงลำพัง',
      emergency: 'หมายเลขฉุกเฉิน',
      police: 'ตำรวจ', fire: 'ดับเพลิงและกู้ภัย', coast: 'ยามฝั่ง',
      hotline: 'สายด่วนสำหรับนักท่องเที่ยวต่างชาติ (24 ชม.)'
    },
    id: {
      title: 'Anda sedang offline',
      message: 'Tidak ada koneksi internet. Langkah di bawah bisa dibaca tanpa jaringan.',
      retry: 'Sambungkan ulang',
      guide: 'Yang harus dilakukan sekarang',
      step1: 'Lindungi diri Anda. Lindungi kepala dan jauhi benda yang bisa jatuh.',
      step2: 'Setelah guncangan berhenti, matikan api. Jika dekat laut, pindah ke tempat tinggi.',
      step3: 'Mengungsi mengikuti instruksi resmi. Jangan memutuskan sendiri.',
      emergency: 'Nomor darurat',
      police: 'Polisi', fire: 'Pemadam·Ambulans', coast: 'Penjaga Pantai',
      hotline: 'Hotline Wisatawan (24 jam)'
    },
    ms: {
      title: 'Anda sedang offline',
      message: 'Tiada sambungan internet. Langkah di bawah boleh dibaca tanpa rangkaian.',
      retry: 'Sambung semula',
      guide: 'Apa yang perlu dilakukan sekarang',
      step1: 'Lindungi diri anda. Lindungi kepala dan jauhi objek yang boleh tumbang.',
      step2: 'Apabila gegaran berhenti, padamkan api. Jika dekat laut, berpindah ke tempat tinggi.',
      step3: 'Berpindah mengikut arahan rasmi. Jangan buat keputusan sendiri.',
      emergency: 'Nombor kecemasan',
      police: 'Polis', fire: 'Bomba·Ambulans', coast: 'Pengawal Pantai',
      hotline: 'Hotline Pelawat (24 jam)'
    },
    tl: {
      title: 'Offline ka ngayon',
      message: 'Walang koneksyon sa internet. Mababasa ang mga hakbang sa ibaba kahit walang network.',
      retry: 'Kumonekta muli',
      guide: 'Ano ang gagawin ngayon',
      step1: 'Protektahan ang sarili. Takpan ang ulo at lumayo sa mga bagay na maaaring bumagsak.',
      step2: 'Kapag tumigil ang pagyanig, patayin ang apoy. Kung malapit sa dagat, umakyat sa mataas na lugar.',
      step3: 'Lumikas ayon sa opisyal na tagubilin. Huwag magdesisyon nang mag-isa.',
      emergency: 'Mga numero sa emergency',
      police: 'Pulis', fire: 'Bumbero·Ambulansya', coast: 'Coast Guard',
      hotline: 'Hotline para sa Bisita (24 oras)'
    },
    ne: {
      title: 'तपाईं अफलाइन छ',
      message: 'इन्टरनेट जडान छैन। तलका चरण नेटवर्क बिना पनि पढ्न सकिन्छ।',
      retry: 'पुनः जडान',
      guide: 'अहिले गर्नुपर्ने',
      step1: 'आफ्नो सुरक्षा गर्नुहोस्। टाउको बचाउनुहोस् र खस्न सक्ने वस्तुबाट पर बस्नुहोस्।',
      step2: 'कम्पन रोकिएपछि आगो निभाउनुहोस्। समुद्र नजिक भए उच्च स्थानमा जानुहोस्।',
      step3: 'आधिकारिक निर्देशन अनुसार सुरक्षित स्थानमा जानुहोस्। एक्लै निर्णय नगर्नुहोस्।',
      emergency: 'आपतकालीन नम्बर',
      police: 'प्रहरी', fire: 'दमकल·एम्बुलेन्स', coast: 'तटरक्षक',
      hotline: 'विदेशी पर्यटक हेल्पलाइन (२४ घण्टा)'
    },
    fr: {
      title: 'Vous êtes hors ligne',
      message: 'Aucune connexion Internet. Les étapes ci-dessous sont lisibles sans réseau.',
      retry: 'Se reconnecter',
      guide: 'Que faire maintenant',
      step1: 'Protégez-vous. Couvrez votre tête et éloignez-vous des objets qui peuvent tomber.',
      step2: 'Quand les secousses cessent, éteignez le feu. Près de la mer, gagnez les hauteurs.',
      step3: 'Évacuez en suivant les consignes officielles. Ne décidez pas seul.',
      emergency: 'Numéros d\'urgence',
      police: 'Police', fire: 'Pompiers·Ambulance', coast: 'Garde-côtes',
      hotline: 'Ligne d\'assistance aux visiteurs (24h)'
    },
    de: {
      title: 'Sie sind offline',
      message: 'Keine Internetverbindung. Die folgenden Schritte sind ohne Netz lesbar.',
      retry: 'Neu verbinden',
      guide: 'Was jetzt zu tun ist',
      step1: 'Schützen Sie sich. Schützen Sie Ihren Kopf und halten Sie Abstand zu Gegenständen, die umfallen können.',
      step2: 'Wenn das Beben aufhört, löschen Sie Feuer. In Küstennähe begeben Sie sich auf höheres Gelände.',
      step3: 'Evakuieren Sie nach den offiziellen Anweisungen. Entscheiden Sie nicht allein.',
      emergency: 'Notrufnummern',
      police: 'Polizei', fire: 'Feuerwehr·Rettungsdienst', coast: 'Küstenwache',
      hotline: 'Hotline für Besucher (24 Std.)'
    },
    it: {
      title: 'Sei offline',
      message: 'Nessuna connessione a Internet. I passaggi qui sotto si leggono senza rete.',
      retry: 'Riconnetti',
      guide: 'Cosa fare adesso',
      step1: 'Proteggiti. Copri la testa e allontanati dagli oggetti che possono cadere.',
      step2: 'Quando la scossa finisce, spegni il fuoco. Vicino al mare, raggiungi un luogo elevato.',
      step3: 'Evacua seguendo le indicazioni ufficiali. Non decidere da solo.',
      emergency: 'Numeri di emergenza',
      police: 'Polizia', fire: 'Vigili del fuoco·Ambulanza', coast: 'Guardia costiera',
      hotline: 'Assistenza ai visitatori (24h)'
    },
    es: {
      title: 'Estás sin conexión',
      message: 'No hay conexión a Internet. Los pasos siguientes se leen sin red.',
      retry: 'Reconectar',
      guide: 'Qué hacer ahora',
      step1: 'Protégete. Cúbrete la cabeza y aléjate de objetos que puedan caer.',
      step2: 'Cuando pare el temblor, apaga el fuego. Si estás cerca del mar, sube a un lugar elevado.',
      step3: 'Evacúa siguiendo las instrucciones oficiales. No decidas solo.',
      emergency: 'Números de emergencia',
      police: 'Policía', fire: 'Bomberos·Ambulancia', coast: 'Guardia costera',
      hotline: 'Línea de ayuda para visitantes (24h)'
    },
    easy_ja: {
      title: 'インターネットが つかえません',
      message: 'いんたーねっとに つながって いません。したの ことは よめます。',
      retry: 'もう いちど つなぐ',
      guide: 'いま する こと',
      step1: 'あなたの あんぜんを まもる。あたまを まもる。たおれる ものから はなれる。',
      step2: 'ゆれが とまったら ひを けす。うみの ちかくなら たかい ばしょへ いく。',
      step3: 'まちの ひとの いう ことを きいて にげる。ひとりで きめない。',
      emergency: 'きんきゅうの でんわ',
      police: 'けいさつ', fire: 'しょうぼう・きゅうきゅう', coast: 'かいじょうほあんちょう',
      hotline: 'がいこくじん そうだん でんわ（24じかん）'
    }
  };

  // src/i18n/detectLanguage.ts と同じ方針。繁体字・fil・in の吸収も揃える
  var ALIASES = { fil: 'tl', in: 'id' };
  var TRADITIONAL = ['hant', 'tw', 'hk', 'mo'];

  function detect() {
    var tags = (navigator.languages || []).concat(navigator.language ? [navigator.language] : []);
    for (var i = 0; i < tags.length; i++) {
      var parts = String(tags[i] || '').trim().toLowerCase().split('-').filter(Boolean);
      var primary = parts[0];
      if (!primary) continue;
      if (primary === 'zh') {
        for (var j = 1; j < parts.length; j++) {
          if (TRADITIONAL.indexOf(parts[j]) !== -1) return 'zh-TW';
        }
        return 'zh';
      }
      var exact = parts.join('-');
      for (var k = 0; k < LANGUAGES.length; k++) {
        if (LANGUAGES[k].code.toLowerCase() === exact) return LANGUAGES[k].code;
      }
      if (ALIASES[primary] && T[ALIASES[primary]]) return ALIASES[primary];
      if (T[primary] && primary !== 'easy_ja') return primary;
    }
    return 'en';
  }

  function setLang(lang) {
    var t = T[lang] || T.en;
    document.documentElement.lang = lang === 'easy_ja' ? 'ja' : lang;
    document.getElementById('title').textContent = t.title;
    document.getElementById('message').textContent = t.message;
    document.getElementById('guide-title').textContent = t.guide;
    document.getElementById('step1').textContent = t.step1;
    document.getElementById('step2').textContent = t.step2;
    document.getElementById('step3').textContent = t.step3;
    document.getElementById('emergency-title').textContent = t.emergency;
    document.getElementById('label-police').textContent = t.police;
    document.getElementById('label-fire').textContent = t.fire;
    document.getElementById('label-coast').textContent = t.coast;
    document.getElementById('label-hotline').textContent = t.hotline;
    document.getElementById('retry-text').textContent = t.retry;
    document.title = t.title + ' - Japan Disaster Alert';

    var buttons = document.querySelectorAll('.lang-btn');
    for (var i = 0; i < buttons.length; i++) {
      var active = buttons[i].getAttribute('data-lang') === lang;
      buttons[i].classList.toggle('active', active);
      buttons[i].setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    try { localStorage.setItem('disaster-app-lang', lang); } catch (e) { /* 非対応でも動く */ }
  }

  function retry() {
    window.location.reload();
  }

  (function init() {
    var wrap = document.getElementById('lang-switch');
    for (var i = 0; i < LANGUAGES.length; i++) {
      var btn = document.createElement('button');
      btn.className = 'lang-btn';
      btn.type = 'button';
      btn.textContent = LANGUAGES[i].name;
      btn.setAttribute('data-lang', LANGUAGES[i].code);
      btn.addEventListener('click', (function (code) {
        return function () { setLang(code); };
      })(LANGUAGES[i].code));
      wrap.appendChild(btn);
    }

    // 本体で明示選択した言語があればそれを尊重し、無ければブラウザ言語から推定
    var stored = null;
    try { stored = localStorage.getItem('disaster-app-lang'); } catch (e) { /* noop */ }
    setLang(stored && T[stored] ? stored : detect());

    var retryBtn = document.getElementById('retry-btn');
    if (retryBtn) retryBtn.addEventListener('click', retry);

    window.addEventListener('online', function () { window.location.reload(); });
  })();
