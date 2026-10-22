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
      jmaRelay: "このアプリは、気象庁が発表した警報・情報をお伝えします。避難については、市町村の指示に従ってください。",
      notCovered: "このアプリでは、避難指示と避難所の開設状況を扱いません。",
      retry: '再接続',
      guide: 'いま すること',
      step1: '身の安全を確保する。頭を守り、倒れてくる物から離れる。',
      step2: '揺れが収まったら火を消し、海の近くなら高い場所へ移動する。',
      step3: '公式の指示に従って避難する。ひとりで判断しない。',
      emergency: '緊急連絡先',
      police: '警察', fire: "消防・救急車", coast: '海上保安庁',
      hotline: '訪日外国人向け相談ホットライン（24時間）',
      fireDesc: "火災や急な病気・けがの緊急通報。",
      hotlineDesc: "病気・災害などの非常時支援。英語・中国語・韓国語・日本語で365日24時間対応。",
      message171: "災害用伝言ダイヤル",
      message171Note: "電話の171はNTTが提供を開始したときに利用できます。提供状況・利用条件は公式案内で確認してください。",
      web171: "災害用伝言板（web171）",
      web171Desc: "インターネットで安否の伝言を登録・確認できます。",
      medicalSearch: "JNTO 医療機関検索",
      medicalSearchDesc: "対応言語や診療科で探し、受診前に医療機関へ対応状況を確認してください。",
      medicalSearchUrl: "https://www.jnto.go.jp/emergency/jpn/mi_guide.html",
      consultation7119: "#7119 救急相談の地域一覧",
      consultation7119Desc: "救急車を呼ぶか、受診するか迷うときの相談先を確認できます。",
      consultation7119Note: "地域により受付時間・対象者が異なります。利用できる地域を一覧で確認してください。",
      embassy: "自国の駐日大使館・領事館",
      embassyDesc: "外務省の駐日公館一覧から、自国の窓口を確認してください。",
      onlineOnly: "インターネットにつながっているときだけ開けます（オフラインでは開けません）。"
    },
    en: {
      title: 'You are offline',
      message: 'No internet connection. The steps below work without a network.',
      jmaRelay: "This app relays warnings and information issued by the Japan Meteorological Agency. For evacuation, follow instructions from your local municipality.",
      notCovered: "This app does not provide evacuation orders or information on whether evacuation shelters are open.",
      retry: 'Reconnect',
      guide: 'What to do now',
      step1: 'Protect yourself. Cover your head and move away from things that can fall.',
      step2: 'When the shaking stops, turn off fire. If you are near the sea, move to higher ground.',
      step3: 'Evacuate following official instructions. Do not decide alone.',
      emergency: 'Emergency numbers',
      police: 'Police', fire: "Fire service / Ambulance", coast: 'Coast Guard',
      hotline: 'Japan Visitor Hotline (24h)',
      fireDesc: "Emergency calls for fires, sudden illness or injuries.",
      hotlineDesc: "Help in emergencies such as illness or disasters. Available 24/7 in English, Chinese, Korean and Japanese.",
      message171: "Disaster Message Dial",
      message171Note: "The 171 telephone service is available when NTT activates it. Check the official guidance for availability and conditions.",
      web171: "Disaster message board (web171)",
      web171Desc: "You can post and check messages about people's safety online.",
      medicalSearch: "JNTO medical institution search",
      medicalSearchDesc: "Search by language or specialty, and check availability with the medical institution before visiting.",
      medicalSearchUrl: "https://www.jnto.go.jp/emergency/eng/mi_guide.html",
      consultation7119: "#7119: regional emergency medical advice services",
      consultation7119Desc: "Find where to ask for advice if you are unsure whether to call an ambulance or seek medical care.",
      consultation7119Note: "Hours and eligible users vary by area. Check the list to see where the service is available.",
      embassy: "Your embassy or consulate in Japan",
      embassyDesc: "Find your country's contact in the Ministry of Foreign Affairs' list of foreign missions in Japan.",
      onlineOnly: "These pages open only when you are online (not available offline)."
    },
    zh: {
      title: '您处于离线状态',
      message: '没有网络连接。以下内容无需联网即可阅读。',
      jmaRelay: "本应用转达日本气象厅发布的预警和信息。有关避难，请遵从当地市町村政府的指示。",
      notCovered: "本应用不提供避难指示或避难所是否开放的信息。",
      retry: '重新连接',
      guide: '现在该做什么',
      step1: '确保自身安全。保护头部，远离可能倒塌的物体。',
      step2: '摇晃停止后关闭火源。如在海边，请移动到高处。',
      step3: '按照官方指示避难。不要独自判断。',
      emergency: '紧急联系电话',
      police: '警察', fire: "消防／救护车", coast: '海上保安厅',
      hotline: '访日外国人咨询热线（24小时）',
      fireDesc: "火灾、突发疾病或受伤时的紧急报警。",
      hotlineDesc: "疾病、灾害等紧急情况的支援。全年每天24小时提供英语、中文、韩语和日语服务。",
      message171: "灾害留言电话",
      message171Note: "电话171服务在NTT启动服务后可用。请通过官方说明确认服务状态和使用条件。",
      web171: "灾害留言板（web171）",
      web171Desc: "可通过互联网登记和查看报平安的留言。",
      medicalSearch: "JNTO 医疗机构搜索",
      medicalSearchDesc: "可按语言或科室搜索，就诊前请向医疗机构确认接诊情况。",
      medicalSearchUrl: "https://www.jnto.go.jp/emergency/chs/mi_guide.html",
      consultation7119: "#7119 急救咨询服务地区列表",
      consultation7119Desc: "可查找在不确定是否要叫救护车或就医时的咨询窗口。",
      consultation7119Note: "服务时间和服务对象因地区而异。请在列表中确认可使用的地区。",
      embassy: "贵国驻日本的大使馆或领事馆",
      embassyDesc: "请从日本外务省的驻日外国公馆名录中查找贵国的联络窗口。",
      onlineOnly: "这些网页需联网才能打开（离线时无法打开）。"
    },
    'zh-TW': {
      title: '您處於離線狀態',
      message: '沒有網路連線。以下內容無需連網即可閱讀。',
      jmaRelay: "本應用程式轉達日本氣象廳發布的警報與資訊。有關避難，請遵從當地市町村政府的指示。",
      notCovered: "本應用程式不提供避難指示或避難所是否開放的資訊。",
      retry: '重新連線',
      guide: '現在該做什麼',
      step1: '確保自身安全。保護頭部，遠離可能倒塌的物體。',
      step2: '搖晃停止後關閉火源。如在海邊，請移往高處。',
      step3: '依照官方指示避難。不要獨自判斷。',
      emergency: '緊急聯絡電話',
      police: '警察', fire: "消防／救護車", coast: '海上保安廳',
      hotline: '訪日外國人諮詢熱線（24小時）',
      fireDesc: "火災、突發疾病或受傷時的緊急報案。",
      hotlineDesc: "疾病、災害等緊急情況的支援。全年每天24小時提供英語、中文、韓語和日語服務。",
      message171: "災害留言電話",
      message171Note: "電話171服務在NTT啟動服務後可用。請透過官方說明確認服務狀態和使用條件。",
      web171: "災害留言板（web171）",
      web171Desc: "可透過網路登記和查看報平安的留言。",
      medicalSearch: "JNTO 醫療機構搜尋",
      medicalSearchDesc: "可依語言或科別搜尋，就診前請向醫療機構確認接診情況。",
      medicalSearchUrl: "https://www.jnto.go.jp/emergency/chc/mi_guide.html",
      consultation7119: "#7119 急救諮詢服務地區列表",
      consultation7119Desc: "可查找不確定是否要叫救護車或就醫時的諮詢窗口。",
      consultation7119Note: "服務時間和服務對象因地區而異。請在列表中確認可使用的地區。",
      embassy: "貴國駐日本的大使館或領事館",
      embassyDesc: "請從日本外務省的駐日外國公館名錄中查找貴國的聯絡窗口。",
      onlineOnly: "這些網頁需連網才能開啟（離線時無法開啟）。"
    },
    ko: {
      title: '오프라인 상태입니다',
      message: '인터넷에 연결되어 있지 않습니다. 아래 내용은 통신 없이 읽을 수 있습니다.',
      jmaRelay: "이 앱은 일본 기상청이 발표한 경보와 정보를 전달합니다. 대피에 관해서는 현지 시정촌의 지시에 따라 주세요.",
      notCovered: "이 앱은 대피 지시나 대피소 개설 여부에 관한 정보를 제공하지 않습니다.",
      retry: '다시 연결',
      guide: '지금 할 일',
      step1: '몸의 안전을 확보하세요. 머리를 보호하고 넘어질 수 있는 물건에서 떨어지세요.',
      step2: '흔들림이 멈추면 불을 끄고, 바다 근처라면 높은 곳으로 이동하세요.',
      step3: '공식 지시에 따라 대피하세요. 혼자 판단하지 마세요.',
      emergency: '긴급 연락처',
      police: '경찰', fire: "소방·구급차", coast: '해상보안청',
      hotline: '방일 외국인 상담 핫라인(24시간)',
      fireDesc: "화재나 갑작스러운 질병·부상에 대한 긴급 신고.",
      hotlineDesc: "질병·재해 등 비상시 지원. 영어·중국어·한국어·일본어로 연중무휴 24시간 대응.",
      message171: "재해 메시지 다이얼",
      message171Note: "전화 171은 NTT가 서비스를 개시했을 때 이용할 수 있습니다. 공식 안내에서 제공 현황과 이용 조건을 확인해 주세요.",
      web171: "재해용 메시지 게시판(web171)",
      web171Desc: "인터넷으로 안부 메시지를 등록하고 확인할 수 있습니다.",
      medicalSearch: "JNTO 의료기관 검색",
      medicalSearchDesc: "대응 언어나 진료과로 검색하고, 방문 전에 의료기관에 진료 가능 여부를 확인해 주세요.",
      medicalSearchUrl: "https://www.jnto.go.jp/emergency/kor/mi_guide.html",
      consultation7119: "#7119 응급의료 상담 지역 목록",
      consultation7119Desc: "구급차를 부를지, 진료를 받을지 고민될 때 상담할 곳을 확인할 수 있습니다.",
      consultation7119Note: "지역에 따라 운영 시간과 이용 대상이 다릅니다. 목록에서 이용 가능한 지역을 확인해 주세요.",
      embassy: "일본에 있는 자국 대사관·영사관",
      embassyDesc: "일본 외무성의 주일 외국공관 목록에서 자국 연락처를 확인해 주세요.",
      onlineOnly: "이 페이지들은 인터넷에 연결되어 있을 때만 열 수 있습니다(오프라인에서는 열 수 없습니다)."
    },
    vi: {
      title: 'Bạn đang ngoại tuyến',
      message: 'Không có kết nối internet. Các bước dưới đây đọc được khi không có mạng.',
      jmaRelay: "Ứng dụng này truyền đạt cảnh báo và thông tin do Cơ quan Khí tượng Nhật Bản công bố. Khi sơ tán, hãy làm theo chỉ dẫn của chính quyền thành phố, thị trấn hoặc làng tại địa phương.",
      notCovered: "Ứng dụng này không cung cấp lệnh sơ tán hoặc thông tin về việc nơi sơ tán có mở cửa hay không.",
      retry: 'Kết nối lại',
      guide: 'Việc cần làm ngay',
      step1: 'Bảo vệ bản thân. Che đầu và tránh xa những vật có thể rơi đổ.',
      step2: 'Khi hết rung lắc, hãy tắt lửa. Nếu ở gần biển, hãy di chuyển lên cao.',
      step3: 'Sơ tán theo hướng dẫn chính thức. Không tự quyết định một mình.',
      emergency: 'Số điện thoại khẩn cấp',
      police: 'Cảnh sát', fire: "Cứu hỏa / Xe cấp cứu", coast: 'Cảnh sát biển',
      hotline: 'Đường dây hỗ trợ khách nước ngoài (24h)',
      fireDesc: "Gọi khẩn cấp khi có cháy, bệnh đột ngột hoặc chấn thương.",
      hotlineDesc: "Hỗ trợ trong tình huống khẩn cấp như bệnh tật, thiên tai. Phục vụ 24 giờ mỗi ngày, 365 ngày bằng tiếng Anh, Trung, Hàn và Nhật.",
      message171: "Đường dây nhắn tin thảm họa",
      message171Note: "Dịch vụ điện thoại 171 dùng được khi NTT bắt đầu cung cấp. Hãy xem hướng dẫn chính thức về tình trạng cung cấp và điều kiện sử dụng.",
      web171: "Bảng nhắn tin khi có thiên tai (web171)",
      web171Desc: "Có thể đăng và xem lời nhắn báo tình trạng an toàn qua internet.",
      medicalSearch: "JNTO: tìm cơ sở y tế",
      medicalSearchDesc: "Tìm theo ngôn ngữ hoặc chuyên khoa và xác nhận khả năng tiếp nhận với cơ sở y tế trước khi đến.",
      medicalSearchUrl: "https://www.jnto.go.jp/emergency/eng/mi_guide.html",
      consultation7119: "#7119: danh sách khu vực có tư vấn cấp cứu",
      consultation7119Desc: "Tra cứu nơi tư vấn khi bạn phân vân có nên gọi xe cấp cứu hoặc đi khám hay không.",
      consultation7119Note: "Giờ tiếp nhận và đối tượng sử dụng khác nhau tùy khu vực. Hãy xem danh sách để biết khu vực có dịch vụ.",
      embassy: "Đại sứ quán hoặc lãnh sự quán nước bạn tại Nhật Bản",
      embassyDesc: "Tra cứu đầu mối liên hệ của nước bạn trong danh sách cơ quan đại diện nước ngoài tại Nhật Bản của Bộ Ngoại giao Nhật Bản.",
      onlineOnly: "Các trang này chỉ mở được khi có kết nối internet (không mở được khi ngoại tuyến)."
    },
    th: {
      title: 'คุณออฟไลน์อยู่',
      message: 'ไม่มีการเชื่อมต่ออินเทอร์เน็ต ข้อความด้านล่างอ่านได้โดยไม่ต้องใช้เครือข่าย',
      jmaRelay: "แอปนี้ถ่ายทอดคำเตือนและข้อมูลที่ประกาศโดยกรมอุตุนิยมวิทยาญี่ปุ่น สำหรับการอพยพ โปรดปฏิบัติตามคำสั่งของเทศบาลในพื้นที่",
      notCovered: "แอปนี้ไม่ให้ข้อมูลคำสั่งอพยพหรือข้อมูลว่าศูนย์อพยพเปิดอยู่หรือไม่",
      retry: 'เชื่อมต่ออีกครั้ง',
      guide: 'สิ่งที่ต้องทำตอนนี้',
      step1: 'ป้องกันตัวเอง ปกป้องศีรษะและอยู่ห่างจากสิ่งของที่อาจล้ม',
      step2: 'เมื่อหยุดสั่นแล้ว ให้ดับไฟ หากอยู่ใกล้ทะเลให้ขึ้นที่สูง',
      step3: 'อพยพตามคำสั่งของทางการ อย่าตัดสินใจเพียงลำพัง',
      emergency: 'หมายเลขฉุกเฉิน',
      police: 'ตำรวจ', fire: "ดับเพลิง / รถพยาบาล", coast: 'ยามฝั่ง',
      hotline: 'สายด่วนสำหรับนักท่องเที่ยวต่างชาติ (24 ชม.)',
      fireDesc: "แจ้งเหตุไฟไหม้ หรือเหตุฉุกเฉินทางการแพทย์จากการเจ็บป่วยกะทันหันหรือการบาดเจ็บ",
      hotlineDesc: "ช่วยเหลือในเหตุฉุกเฉิน เช่น การเจ็บป่วยหรือภัยพิบัติ ให้บริการภาษาอังกฤษ จีน เกาหลี และญี่ปุ่น ตลอด 24 ชั่วโมง 365 วัน",
      message171: "สายด่วนข้อความภัยพิบัติ",
      message171Note: "โทรศัพท์ 171 ใช้ได้เมื่อ NTT เริ่มเปิดบริการ โปรดตรวจสอบสถานะและเงื่อนไขการใช้บริการจากคำแนะนำทางการ",
      web171: "กระดานข้อความในช่วงภัยพิบัติ (web171)",
      web171Desc: "สามารถฝากและตรวจสอบข้อความแจ้งความปลอดภัยผ่านอินเทอร์เน็ตได้",
      medicalSearch: "JNTO ค้นหาสถานพยาบาล",
      medicalSearchDesc: "ค้นหาตามภาษาหรือแผนก และติดต่อสถานพยาบาลเพื่อยืนยันการรับผู้ป่วยก่อนเข้ารับบริการ",
      medicalSearchUrl: "https://www.jnto.go.jp/emergency/eng/mi_guide.html",
      consultation7119: "#7119 รายชื่อพื้นที่ให้คำปรึกษาทางการแพทย์ฉุกเฉิน",
      consultation7119Desc: "ตรวจสอบหน่วยงานให้คำปรึกษาเมื่อไม่แน่ใจว่าควรเรียกรถพยาบาลหรือไปพบแพทย์",
      consultation7119Note: "เวลารับบริการและผู้ที่ใช้บริการได้แตกต่างกันตามพื้นที่ โปรดตรวจสอบพื้นที่ให้บริการจากรายชื่อ",
      embassy: "สถานทูตหรือสถานกงสุลของประเทศคุณในญี่ปุ่น",
      embassyDesc: "ตรวจสอบช่องทางติดต่อของประเทศคุณจากรายชื่อสถานทูตและสถานกงสุลต่างประเทศในญี่ปุ่นของกระทรวงการต่างประเทศญี่ปุ่น",
      onlineOnly: "หน้าเหล่านี้เปิดได้เฉพาะเมื่อเชื่อมต่ออินเทอร์เน็ต (เปิดไม่ได้ขณะออฟไลน์)"
    },
    id: {
      title: 'Anda sedang offline',
      message: 'Tidak ada koneksi internet. Langkah di bawah bisa dibaca tanpa jaringan.',
      jmaRelay: "Aplikasi ini meneruskan peringatan dan informasi yang diterbitkan oleh Badan Meteorologi Jepang. Untuk evakuasi, ikuti instruksi pemerintah kota atau desa setempat.",
      notCovered: "Aplikasi ini tidak menyediakan perintah evakuasi atau informasi apakah tempat pengungsian sudah dibuka.",
      retry: 'Sambungkan ulang',
      guide: 'Yang harus dilakukan sekarang',
      step1: 'Lindungi diri Anda. Lindungi kepala dan jauhi benda yang bisa jatuh.',
      step2: 'Setelah guncangan berhenti, matikan api. Jika dekat laut, pindah ke tempat tinggi.',
      step3: 'Mengungsi mengikuti instruksi resmi. Jangan memutuskan sendiri.',
      emergency: 'Nomor darurat',
      police: 'Polisi', fire: "Pemadam kebakaran / Ambulans", coast: 'Penjaga Pantai',
      hotline: 'Hotline Wisatawan (24 jam)',
      fireDesc: "Panggilan darurat untuk kebakaran, sakit mendadak, atau cedera.",
      hotlineDesc: "Bantuan saat keadaan darurat seperti sakit atau bencana. Tersedia 24 jam sehari, 365 hari setahun dalam bahasa Inggris, Cina, Korea, dan Jepang.",
      message171: "Telepon Pesan Bencana",
      message171Note: "Layanan telepon 171 dapat digunakan saat NTT mengaktifkannya. Periksa informasi resmi tentang ketersediaan dan ketentuan penggunaan.",
      web171: "Papan pesan bencana (web171)",
      web171Desc: "Anda dapat menulis dan memeriksa pesan tentang keselamatan melalui internet.",
      medicalSearch: "JNTO: pencarian fasilitas medis",
      medicalSearchDesc: "Cari berdasarkan bahasa atau spesialisasi, lalu konfirmasikan ketersediaan layanan dengan fasilitas medis sebelum berkunjung.",
      medicalSearchUrl: "https://www.jnto.go.jp/emergency/eng/mi_guide.html",
      consultation7119: "#7119: daftar wilayah layanan konsultasi medis darurat",
      consultation7119Desc: "Temukan tempat berkonsultasi saat ragu apakah perlu memanggil ambulans atau berobat.",
      consultation7119Note: "Jam layanan dan pengguna yang memenuhi syarat berbeda menurut wilayah. Periksa daftar wilayah yang menyediakan layanan.",
      embassy: "Kedutaan atau konsulat negara Anda di Jepang",
      embassyDesc: "Temukan kontak negara Anda di daftar perwakilan asing di Jepang dari Kementerian Luar Negeri Jepang.",
      onlineOnly: "Halaman ini hanya dapat dibuka saat terhubung ke internet (tidak dapat dibuka saat offline)."
    },
    ms: {
      title: 'Anda sedang offline',
      message: 'Tiada sambungan internet. Langkah di bawah boleh dibaca tanpa rangkaian.',
      jmaRelay: "Aplikasi ini menyampaikan amaran dan maklumat yang dikeluarkan oleh Agensi Meteorologi Jepun. Untuk pemindahan, ikut arahan pihak berkuasa perbandaran tempatan.",
      notCovered: "Aplikasi ini tidak menyediakan arahan pemindahan ke tempat selamat atau maklumat sama ada pusat pemindahan dibuka.",
      retry: 'Sambung semula',
      guide: 'Apa yang perlu dilakukan sekarang',
      step1: 'Lindungi diri anda. Lindungi kepala dan jauhi objek yang boleh tumbang.',
      step2: 'Apabila gegaran berhenti, padamkan api. Jika dekat laut, berpindah ke tempat tinggi.',
      step3: 'Berpindah mengikut arahan rasmi. Jangan buat keputusan sendiri.',
      emergency: 'Nombor kecemasan',
      police: 'Polis', fire: "Bomba / Ambulans", coast: 'Pengawal Pantai',
      hotline: 'Hotline Pelawat (24 jam)',
      fireDesc: "Panggilan kecemasan untuk kebakaran, penyakit secara tiba-tiba atau kecederaan.",
      hotlineDesc: "Bantuan semasa kecemasan seperti sakit atau bencana. Tersedia 24 jam sehari, 365 hari setahun dalam bahasa Inggeris, Cina, Korea dan Jepun.",
      message171: "Dail Mesej Bencana",
      message171Note: "Perkhidmatan telefon 171 boleh digunakan apabila NTT mengaktifkannya. Semak panduan rasmi tentang ketersediaan dan syarat penggunaan.",
      web171: "Papan mesej bencana (web171)",
      web171Desc: "Anda boleh mencatat dan menyemak mesej tentang keselamatan melalui internet.",
      medicalSearch: "JNTO: carian institusi perubatan",
      medicalSearchDesc: "Cari mengikut bahasa atau kepakaran, dan sahkan ketersediaan perkhidmatan dengan institusi perubatan sebelum berkunjung.",
      medicalSearchUrl: "https://www.jnto.go.jp/emergency/eng/mi_guide.html",
      consultation7119: "#7119: senarai kawasan khidmat nasihat perubatan kecemasan",
      consultation7119Desc: "Semak tempat untuk mendapatkan nasihat jika anda tidak pasti sama ada perlu memanggil ambulans atau mendapatkan rawatan.",
      consultation7119Note: "Waktu perkhidmatan dan pengguna yang layak berbeza mengikut kawasan. Semak senarai kawasan yang menyediakan perkhidmatan.",
      embassy: "Kedutaan atau konsulat negara anda di Jepun",
      embassyDesc: "Semak maklumat hubungan negara anda dalam senarai perwakilan asing di Jepun oleh Kementerian Luar Negeri Jepun.",
      onlineOnly: "Halaman ini hanya boleh dibuka apabila disambungkan ke internet (tidak boleh dibuka di luar talian)."
    },
    tl: {
      title: 'Offline ka ngayon',
      message: 'Walang koneksyon sa internet. Mababasa ang mga hakbang sa ibaba kahit walang network.',
      jmaRelay: "Ipinapabatid ng app na ito ang mga babala at impormasyong inilabas ng Japan Meteorological Agency. Para sa paglikas, sundin ang mga tagubilin ng lokal na pamahalaang lungsod, bayan o nayon.",
      notCovered: "Hindi nagbibigay ang app na ito ng mga utos sa paglikas o impormasyon kung bukas ang mga sentro ng paglikas.",
      retry: 'Kumonekta muli',
      guide: 'Ano ang gagawin ngayon',
      step1: 'Protektahan ang sarili. Takpan ang ulo at lumayo sa mga bagay na maaaring bumagsak.',
      step2: 'Kapag tumigil ang pagyanig, patayin ang apoy. Kung malapit sa dagat, umakyat sa mataas na lugar.',
      step3: 'Lumikas ayon sa opisyal na tagubilin. Huwag magdesisyon nang mag-isa.',
      emergency: 'Mga numero sa emergency',
      police: 'Pulis', fire: "Bumbero / Ambulansya", coast: 'Coast Guard',
      hotline: 'Hotline para sa Bisita (24 oras)',
      fireDesc: "Tawag na pang-emergency para sa sunog, biglaang pagkakasakit o pinsala sa katawan.",
      hotlineDesc: "Tulong sa emergency gaya ng pagkakasakit o sakuna. Bukas 24 oras, 365 araw sa Ingles, Tsino, Koreano at Hapon.",
      message171: "Disaster Message Dial",
      message171Note: "Magagamit ang teleponong 171 kapag sinimulan ng NTT ang serbisyo. Tingnan ang opisyal na gabay para sa katayuan at mga kondisyon ng paggamit.",
      web171: "Disaster message board (web171)",
      web171Desc: "Maaaring mag-iwan at tumingin ng mga mensahe tungkol sa kalagayan at kaligtasan sa internet.",
      medicalSearch: "JNTO: paghahanap ng institusyong medikal",
      medicalSearchDesc: "Maghanap ayon sa wika o espesyalidad at tiyakin sa institusyong medikal kung maaari kayong tanggapin bago pumunta.",
      medicalSearchUrl: "https://www.jnto.go.jp/emergency/eng/mi_guide.html",
      consultation7119: "#7119: listahan ng mga lugar na may payong medikal para sa emergency",
      consultation7119Desc: "Hanapin kung saan maaaring magtanong kapag hindi tiyak kung tatawag ng ambulansya o magpapatingin.",
      consultation7119Note: "Magkakaiba ang oras ng serbisyo at maaaring gumamit nito ayon sa lugar. Tingnan sa listahan kung saan may serbisyo.",
      embassy: "Embahada o konsulado ng inyong bansa sa Japan",
      embassyDesc: "Hanapin ang tanggapan ng inyong bansa sa listahan ng mga dayuhang misyon sa Japan ng Ministry of Foreign Affairs ng Japan.",
      onlineOnly: "Mabubuksan lamang ang mga pahinang ito kapag may internet (hindi mabubuksan kapag offline)."
    },
    ne: {
      title: 'तपाईं अफलाइन छ',
      message: 'इन्टरनेट जडान छैन। तलका चरण नेटवर्क बिना पनि पढ्न सकिन्छ।',
      jmaRelay: "यो एपले जापान मौसम विज्ञान निकायले जारी गरेका चेतावनी र जानकारी प्रस्तुत गर्छ। सुरक्षित स्थानमा सर्न स्थानीय नगर वा गाउँ सरकारका निर्देशन पालना गर्नुहोस्।",
      notCovered: "यो एपले सुरक्षित स्थानमा जान दिइएका निर्देशन वा आश्रयस्थल खुला छ कि छैन भन्ने जानकारी दिँदैन।",
      retry: 'पुनः जडान',
      guide: 'अहिले गर्नुपर्ने',
      step1: 'आफ्नो सुरक्षा गर्नुहोस्। टाउको बचाउनुहोस् र खस्न सक्ने वस्तुबाट पर बस्नुहोस्।',
      step2: 'कम्पन रोकिएपछि आगो निभाउनुहोस्। समुद्र नजिक भए उच्च स्थानमा जानुहोस्।',
      step3: 'आधिकारिक निर्देशन अनुसार सुरक्षित स्थानमा जानुहोस्। एक्लै निर्णय नगर्नुहोस्।',
      emergency: 'आपतकालीन नम्बर',
      police: 'प्रहरी', fire: "दमकल / एम्बुलेन्स", coast: 'तटरक्षक',
      hotline: 'विदेशी पर्यटक हेल्पलाइन (२४ घण्टा)',
      fireDesc: "आगलागी, अचानक बिरामी वा चोटपटकका लागि आपतकालीन फोन।",
      hotlineDesc: "बिरामी वा विपद् जस्ता आपतकालमा सहयोग। अङ्ग्रेजी, चिनियाँ, कोरियाली र जापानी भाषामा वर्षका ३६५ दिन चौबीसै घण्टा सेवा।",
      message171: "विपद् सन्देश डायल",
      message171Note: "NTT ले सेवा सुरु गरेपछि मात्र फोन 171 प्रयोग गर्न सकिन्छ। सेवा उपलब्धता र प्रयोगका सर्तहरू आधिकारिक सूचनामा हेर्नुहोस्।",
      web171: "विपद् सन्देश बोर्ड (web171)",
      web171Desc: "इन्टरनेटबाट कुशलक्षेमसम्बन्धी सन्देश राख्न र हेर्न सकिन्छ।",
      medicalSearch: "JNTO: स्वास्थ्य संस्थाको खोजी",
      medicalSearchDesc: "भाषा वा विशेषज्ञताका आधारमा खोज्नुहोस् र जानुअघि स्वास्थ्य संस्थामा सेवा उपलब्ध छ कि छैन पुष्टि गर्नुहोस्।",
      medicalSearchUrl: "https://www.jnto.go.jp/emergency/eng/mi_guide.html",
      consultation7119: "#7119: आकस्मिक चिकित्सा परामर्श उपलब्ध क्षेत्रहरूको सूची",
      consultation7119Desc: "एम्बुलेन्स बोलाउने वा उपचार गराउन जाने भन्नेमा अन्योल हुँदा सल्लाह लिने ठाउँ हेर्न सक्नुहुन्छ।",
      consultation7119Note: "सेवाको समय र सेवा लिन योग्य व्यक्तिहरू क्षेत्रअनुसार फरक हुन्छन्। सेवा उपलब्ध क्षेत्रहरू सूचीमा हेर्नुहोस्।",
      embassy: "जापानमा रहेको आफ्नो देशको दूतावास वा वाणिज्य दूतावास",
      embassyDesc: "जापानको परराष्ट्र मन्त्रालयको जापानस्थित विदेशी नियोगहरूको सूचीबाट आफ्नो देशको सम्पर्क स्थान हेर्नुहोस्।",
      onlineOnly: "यी पृष्ठहरू इन्टरनेट जडान हुँदा मात्र खुल्छन् (अफलाइनमा खुल्दैनन्)।"
    },
    fr: {
      title: 'Vous êtes hors ligne',
      message: 'Aucune connexion Internet. Les étapes ci-dessous sont lisibles sans réseau.',
      jmaRelay: "Cette application relaie les alertes et les informations émises par l’Agence météorologique du Japon. Pour l’évacuation, suivez les consignes de votre municipalité.",
      notCovered: "Cette application ne fournit ni consignes d'évacuation ni informations sur l'ouverture des centres d'évacuation.",
      retry: 'Se reconnecter',
      guide: 'Que faire maintenant',
      step1: 'Protégez-vous. Couvrez votre tête et éloignez-vous des objets qui peuvent tomber.',
      step2: 'Quand les secousses cessent, éteignez le feu. Près de la mer, gagnez les hauteurs.',
      step3: 'Évacuez en suivant les consignes officielles. Ne décidez pas seul.',
      emergency: 'Numéros d\'urgence',
      police: 'Police', fire: "Pompiers / Ambulance", coast: 'Garde-côtes',
      hotline: 'Ligne d\'assistance aux visiteurs (24h)',
      fireDesc: "Appels d'urgence en cas d'incendie, de maladie soudaine ou de blessure.",
      hotlineDesc: "Aide en cas d'urgence, notamment maladie ou catastrophe. Service 24 h/24, 365 jours par an, en anglais, chinois, coréen et japonais.",
      message171: "Service de messages catastrophe",
      message171Note: "Le service téléphonique 171 est disponible lorsque NTT l'active. Consultez les informations officielles pour connaître sa disponibilité et ses conditions d'utilisation.",
      web171: "Tableau de messages en cas de catastrophe (web171)",
      web171Desc: "Vous pouvez déposer et consulter en ligne des messages sur la sécurité des personnes.",
      medicalSearch: "JNTO : recherche d'établissements médicaux",
      medicalSearchDesc: "Recherchez par langue ou spécialité et vérifiez les possibilités de prise en charge auprès de l'établissement avant de vous y rendre.",
      medicalSearchUrl: "https://www.jnto.go.jp/emergency/eng/mi_guide.html",
      consultation7119: "#7119 : liste des services régionaux de conseil médical d'urgence",
      consultation7119Desc: "Trouvez où demander conseil si vous hésitez à appeler une ambulance ou à consulter un médecin.",
      consultation7119Note: "Les horaires et les personnes éligibles varient selon la région. Vérifiez dans la liste où le service est disponible.",
      embassy: "Ambassade ou consulat de votre pays au Japon",
      embassyDesc: "Trouvez le contact de votre pays dans la liste des missions étrangères au Japon du ministère japonais des Affaires étrangères.",
      onlineOnly: "Ces pages ne s’ouvrent qu’avec une connexion Internet (indisponibles hors ligne)."
    },
    de: {
      title: 'Sie sind offline',
      message: 'Keine Internetverbindung. Die folgenden Schritte sind ohne Netz lesbar.',
      jmaRelay: "Diese App gibt Warnungen und Informationen der Japanischen Meteorologischen Behörde weiter. Befolgen Sie bei einer Evakuierung die Anweisungen Ihrer örtlichen Gemeinde.",
      notCovered: "Diese App bietet weder Evakuierungsanordnungen noch Informationen darüber, ob Evakuierungsunterkünfte geöffnet sind.",
      retry: 'Neu verbinden',
      guide: 'Was jetzt zu tun ist',
      step1: 'Schützen Sie sich. Schützen Sie Ihren Kopf und halten Sie Abstand zu Gegenständen, die umfallen können.',
      step2: 'Wenn das Beben aufhört, löschen Sie Feuer. In Küstennähe begeben Sie sich auf höheres Gelände.',
      step3: 'Evakuieren Sie nach den offiziellen Anweisungen. Entscheiden Sie nicht allein.',
      emergency: 'Notrufnummern',
      police: 'Polizei', fire: "Feuerwehr / Rettungswagen", coast: 'Küstenwache',
      hotline: 'Hotline für Besucher (24 Std.)',
      fireDesc: "Notrufe bei Bränden, plötzlichen Erkrankungen oder Verletzungen.",
      hotlineDesc: "Hilfe in Notfällen wie Krankheit oder Katastrophen. Rund um die Uhr an 365 Tagen auf Englisch, Chinesisch, Koreanisch und Japanisch.",
      message171: "Katastrophen-Nachrichtendienst",
      message171Note: "Der Telefondienst 171 ist verfügbar, wenn NTT ihn aktiviert. Prüfen Sie die offiziellen Hinweise zu Verfügbarkeit und Nutzungsbedingungen.",
      web171: "Nachrichtentafel für Katastrophenfälle (web171)",
      web171Desc: "Sie können online Nachrichten über das Wohlergehen von Personen hinterlassen und abrufen.",
      medicalSearch: "JNTO: Suche nach medizinischen Einrichtungen",
      medicalSearchDesc: "Suchen Sie nach Sprache oder Fachgebiet und klären Sie vor dem Besuch mit der Einrichtung, ob eine Behandlung möglich ist.",
      medicalSearchUrl: "https://www.jnto.go.jp/emergency/eng/mi_guide.html",
      consultation7119: "#7119: Liste regionaler medizinischer Beratungsdienste für Notfälle",
      consultation7119Desc: "Finden Sie eine Beratungsstelle, wenn Sie unsicher sind, ob Sie einen Krankenwagen rufen oder ärztliche Hilfe aufsuchen sollen.",
      consultation7119Note: "Öffnungszeiten und berechtigte Personengruppen unterscheiden sich je nach Region. Prüfen Sie in der Liste, wo der Dienst verfügbar ist.",
      embassy: "Botschaft oder Konsulat Ihres Landes in Japan",
      embassyDesc: "Finden Sie den Kontakt Ihres Landes in der Liste der ausländischen Vertretungen in Japan des japanischen Außenministeriums.",
      onlineOnly: "Diese Seiten öffnen sich nur mit Internetverbindung (offline nicht verfügbar)."
    },
    it: {
      title: 'Sei offline',
      message: 'Nessuna connessione a Internet. I passaggi qui sotto si leggono senza rete.',
      jmaRelay: "Questa app riporta le allerte e le informazioni emesse dall’Agenzia meteorologica giapponese. Per l’evacuazione, segui le istruzioni del comune in cui ti trovi.",
      notCovered: "Questa app non fornisce ordini di evacuazione né informazioni sull'apertura dei centri di evacuazione.",
      retry: 'Riconnetti',
      guide: 'Cosa fare adesso',
      step1: 'Proteggiti. Copri la testa e allontanati dagli oggetti che possono cadere.',
      step2: 'Quando la scossa finisce, spegni il fuoco. Vicino al mare, raggiungi un luogo elevato.',
      step3: 'Evacua seguendo le indicazioni ufficiali. Non decidere da solo.',
      emergency: 'Numeri di emergenza',
      police: 'Polizia', fire: "Vigili del fuoco / Ambulanza", coast: 'Guardia costiera',
      hotline: 'Assistenza ai visitatori (24h)',
      fireDesc: "Chiamate d'emergenza per incendi, malattie improvvise o lesioni.",
      hotlineDesc: "Assistenza nelle emergenze, come malattie o calamità. Servizio 24 ore su 24, 365 giorni l'anno, in inglese, cinese, coreano e giapponese.",
      message171: "Servizio messaggi disastro",
      message171Note: "Il servizio telefonico 171 è disponibile quando NTT lo attiva. Consulti le indicazioni ufficiali su disponibilità e condizioni d'uso.",
      web171: "Bacheca messaggi in caso di calamità (web171)",
      web171Desc: "È possibile lasciare e consultare online messaggi sulle condizioni e sull'incolumità delle persone.",
      medicalSearch: "JNTO: ricerca di strutture sanitarie",
      medicalSearchDesc: "Cerchi per lingua o specialità e verifichi con la struttura la disponibilità delle cure prima di recarsi sul posto.",
      medicalSearchUrl: "https://www.jnto.go.jp/emergency/eng/mi_guide.html",
      consultation7119: "#7119: elenco dei servizi regionali di consulenza medica d'urgenza",
      consultation7119Desc: "Trovi dove chiedere consiglio se non sa se chiamare un'ambulanza o rivolgersi a un medico.",
      consultation7119Note: "Gli orari e le persone ammesse al servizio variano in base alla zona. Consulti l'elenco per sapere dove è disponibile.",
      embassy: "Ambasciata o consolato del proprio Paese in Giappone",
      embassyDesc: "Consulti il contatto del proprio Paese nell'elenco delle rappresentanze straniere in Giappone del Ministero degli Affari esteri giapponese.",
      onlineOnly: "Queste pagine si aprono solo con una connessione Internet (non disponibili offline)."
    },
    es: {
      title: 'Estás sin conexión',
      message: 'No hay conexión a Internet. Los pasos siguientes se leen sin red.',
      jmaRelay: "Esta aplicación transmite las alertas y la información emitidas por la Agencia Meteorológica de Japón. Para la evacuación, sigue las instrucciones del municipio donde te encuentres.",
      notCovered: "Esta aplicación no proporciona órdenes de evacuación ni información sobre la apertura de los centros de evacuación.",
      retry: 'Reconectar',
      guide: 'Qué hacer ahora',
      step1: 'Protégete. Cúbrete la cabeza y aléjate de objetos que puedan caer.',
      step2: 'Cuando pare el temblor, apaga el fuego. Si estás cerca del mar, sube a un lugar elevado.',
      step3: 'Evacúa siguiendo las instrucciones oficiales. No decidas solo.',
      emergency: 'Números de emergencia',
      police: 'Policía', fire: "Bomberos / Ambulancia", coast: 'Guardia costera',
      hotline: 'Línea de ayuda para visitantes (24h)',
      fireDesc: "Llamadas de emergencia por incendios, enfermedades repentinas o lesiones.",
      hotlineDesc: "Ayuda en emergencias, como enfermedades o desastres. Atención las 24 horas, los 365 días, en inglés, chino, coreano y japonés.",
      message171: "Línea de mensajes de desastre",
      message171Note: "El servicio telefónico 171 está disponible cuando NTT lo activa. Consulte la información oficial sobre disponibilidad y condiciones de uso.",
      web171: "Tablón de mensajes en caso de desastre (web171)",
      web171Desc: "Puede dejar y consultar por internet mensajes sobre el estado y la seguridad de las personas.",
      medicalSearch: "JNTO: búsqueda de centros médicos",
      medicalSearchDesc: "Busque por idioma o especialidad y confirme con el centro la disponibilidad de atención antes de acudir.",
      medicalSearchUrl: "https://www.jnto.go.jp/emergency/eng/mi_guide.html",
      consultation7119: "#7119: lista de servicios regionales de orientación médica de urgencia",
      consultation7119Desc: "Consulte dónde pedir orientación si no sabe si debe llamar a una ambulancia o acudir al médico.",
      consultation7119Note: "Los horarios y las personas que pueden utilizar el servicio varían según la zona. Consulte la lista de zonas donde está disponible.",
      embassy: "Embajada o consulado de su país en Japón",
      embassyDesc: "Consulte el contacto de su país en la lista de misiones extranjeras en Japón del Ministerio de Asuntos Exteriores de Japón.",
      onlineOnly: "Estas páginas solo se abren con conexión a Internet (no disponibles sin conexión)."
    },
    easy_ja: {
      title: 'インターネットが つかえません',
      message: 'いんたーねっとに つながって いません。したの ことは よめます。',
      jmaRelay: "このアプリは、気象庁が出した警報や情報を伝えます。避難するときは、今いる市・町・村の指示に従ってください。",
      notCovered: "この アプリでは、「にげて ください」という まちの しじや、ひなんじょに いま はいれるかは わかりません。",
      retry: 'もう いちど つなぐ',
      guide: 'いま する こと',
      step1: 'あなたの あんぜんを まもる。あたまを まもる。たおれる ものから はなれる。',
      step2: 'ゆれが とまったら ひを けす。うみの ちかくなら たかい ばしょへ いく。',
      step3: 'まちの ひとの いう ことを きいて にげる。ひとりで きめない。',
      emergency: 'きんきゅうの でんわ',
      police: 'けいさつ', fire: "しょうぼう・きゅうきゅうしゃ", coast: 'かいじょうほあんちょう',
      hotline: 'がいこくじん そうだん でんわ（24じかん）',
      fireDesc: "かじ、きゅうな びょうきや けがで、いそいで たすけが いる ときの でんわ。",
      hotlineDesc: "びょうき・さいがいなどで こまった ときの たすけ。えいご・ちゅうごくご・かんこくご・にほんごで、まいにち 24じかん。",
      message171: "さいがいよう でんごん ダイヤル",
      message171Note: "でんわの 171は、NTTが サービスを はじめた ときに つかえます。つかえるか、つかいかたは、NTTの あんないを みて ください。",
      web171: "さいがいの でんごんばん（web171）",
      web171Desc: "インターネットで、ぶじか どうかの でんごんを かいたり よんだり できます。",
      medicalSearch: "JNTO びょういん・しんりょうじょを さがす",
      medicalSearchDesc: "ことばや びょうきの しゅるいで さがせます。いく まえに、びょういん・しんりょうじょへ みてもらえるか きいて ください。",
      medicalSearchUrl: "https://www.jnto.go.jp/emergency/jpn/mi_guide.html",
      consultation7119: "#7119 そうだんできる ちいきの リスト",
      consultation7119Desc: "きゅうきゅうしゃを よぶか、びょういんへ いくか まよう ときの そうだんさきを さがせます。",
      consultation7119Note: "ちいきで、つかえる じかんや ひとが ちがいます。つかえる ちいきを リストで みて ください。",
      embassy: "にほんに ある じぶんの くにの たいしかん・りょうじかん",
      embassyDesc: "がいむしょうの リストで、じぶんの くにに れんらくする ところを さがして ください。",
      onlineOnly: "インターネットに つながって いる ときだけ ひらけます（つながって いない ときは ひらけません）。"
    }
  };

  // offline.html の要素 id → T のフィールド（本体の translations.ts emergency.* と同じ文）
  var TEXT_FIELDS = {
    'desc-fire': 'fireDesc',
    'desc-hotline': 'hotlineDesc',
    'label-message171': 'message171',
    'note-message171': 'message171Note',
    'label-web171': 'web171',
    'desc-web171': 'web171Desc',
    'label-medicalSearch': 'medicalSearch',
    'desc-medicalSearch': 'medicalSearchDesc',
    'url-medicalSearch': 'medicalSearchUrl',
    'label-consultation7119': 'consultation7119',
    'desc-consultation7119': 'consultation7119Desc',
    'note-consultation7119': 'consultation7119Note',
    'label-embassy': 'embassy',
    'desc-embassy': 'embassyDesc',
    'links-online-only': 'onlineOnly'
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
    document.getElementById('scope-relay').textContent = t.jmaRelay;
    document.getElementById('scope-not-covered').textContent = t.notCovered;
    document.getElementById('emergency-title').textContent = t.emergency;
    document.getElementById('label-police').textContent = t.police;
    document.getElementById('label-fire').textContent = t.fire;
    document.getElementById('label-coast').textContent = t.coast;
    document.getElementById('label-hotline').textContent = t.hotline;
    // B11: 説明・注記・公式ページへの導線（要素 id → T のフィールド）
    for (var id in TEXT_FIELDS) {
      var el = document.getElementById(id);
      if (el && t[TEXT_FIELDS[id]]) el.textContent = t[TEXT_FIELDS[id]];
    }
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
