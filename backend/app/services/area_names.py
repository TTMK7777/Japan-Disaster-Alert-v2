"""気象庁の地域コード → 地域名（日本語 / 英語）。

**このファイルは自動生成物。手で編集しない。**
生成元: https://www.jma.go.jp/bosai/common/const/area.json
生成スクリプト: scripts/generate_area_names.py

気象庁の警報 JSON には地域名が入っていない（`code` のみ）ため、
表示名はこの表から引く。オフラインでも動く必要があるので静的に焼き込んでいる。

収録階層: offices, class10s（class20s=市町村は対象外）
収録件数: AREA_NAMES=193 / FORECAST_OFFICE_CODES=58
"""

#: 表示用。府県予報区（offices）と一次細分区域（class10s）の両方を含む。
AREA_NAMES: dict[str, dict[str, str]] = {
    '011000': {"ja": '宗谷地方', "en": 'Soya Region'},
    '012000': {"ja": '上川・留萌地方', "en": 'Kamikawa Rumoi'},
    '012010': {"ja": '上川地方', "en": 'Kamikawa Region'},
    '012020': {"ja": '留萌地方', "en": 'Rumoi Region'},
    '013000': {"ja": '網走・北見・紋別地方', "en": 'Abashiri Kitami Mombetsu'},
    '013010': {"ja": '網走地方', "en": 'Abashiri Region'},
    '013020': {"ja": '北見地方', "en": 'Kitami Region'},
    '013030': {"ja": '紋別地方', "en": 'Mombetsu Region'},
    '014010': {"ja": '根室地方', "en": 'Nemuro Region'},
    '014020': {"ja": '釧路地方', "en": 'Kushiro Region'},
    '014030': {"ja": '十勝地方', "en": 'Tokachi Region'},
    '014100': {"ja": '釧路・根室地方', "en": 'Kushiro Nemuro'},
    '015000': {"ja": '胆振・日高地方', "en": 'Iburi Hidaka'},
    '015010': {"ja": '胆振地方', "en": 'Iburi Region'},
    '015020': {"ja": '日高地方', "en": 'Hidaka Region'},
    '016000': {"ja": '石狩・空知・後志地方', "en": 'Ishikari Sorachi Shiribeshi'},
    '016010': {"ja": '石狩地方', "en": 'Ishikari Region'},
    '016020': {"ja": '空知地方', "en": 'Sorachi Region'},
    '016030': {"ja": '後志地方', "en": 'Shiribeshi Region'},
    '017000': {"ja": '渡島・檜山地方', "en": 'Oshima Hiyama'},
    '017010': {"ja": '渡島地方', "en": 'Oshima Region'},
    '017020': {"ja": '檜山地方', "en": 'Hiyama Region'},
    '020000': {"ja": '青森県', "en": 'Aomori'},
    '020010': {"ja": '津軽', "en": 'Tsugaru'},
    '020020': {"ja": '下北', "en": 'Shimokita'},
    '020030': {"ja": '三八上北', "en": 'Sanpachi Kamikita'},
    '030000': {"ja": '岩手県', "en": 'Iwate'},
    '030010': {"ja": '内陸', "en": 'Inland'},
    '030020': {"ja": '沿岸北部', "en": 'Northern Coast'},
    '030030': {"ja": '沿岸南部', "en": 'Southern Coast'},
    '040000': {"ja": '宮城県', "en": 'Miyagi'},
    '040010': {"ja": '東部', "en": 'Eastern Region'},
    '040020': {"ja": '西部', "en": 'Western Region'},
    '050000': {"ja": '秋田県', "en": 'Akita'},
    '050010': {"ja": '沿岸', "en": 'Coast'},
    '050020': {"ja": '内陸', "en": 'Inland'},
    '060000': {"ja": '山形県', "en": 'Yamagata'},
    '060010': {"ja": '村山', "en": 'Murayama'},
    '060020': {"ja": '置賜', "en": 'Okitama'},
    '060030': {"ja": '庄内', "en": 'Shonai'},
    '060040': {"ja": '最上', "en": 'Mogami'},
    '070000': {"ja": '福島県', "en": 'Fukushima'},
    '070010': {"ja": '中通り', "en": 'Nakadori'},
    '070020': {"ja": '浜通り', "en": 'Hamadori'},
    '070030': {"ja": '会津', "en": 'Aizu'},
    '080000': {"ja": '茨城県', "en": 'Ibaraki'},
    '080010': {"ja": '北部', "en": 'Northern Region'},
    '080020': {"ja": '南部', "en": 'Southern Region'},
    '090000': {"ja": '栃木県', "en": 'Tochigi'},
    '090010': {"ja": '南部', "en": 'Southern Region'},
    '090020': {"ja": '北部', "en": 'Northern Region'},
    '100000': {"ja": '群馬県', "en": 'Gunma'},
    '100010': {"ja": '南部', "en": 'Southern Region'},
    '100020': {"ja": '北部', "en": 'Northern Region'},
    '110000': {"ja": '埼玉県', "en": 'Saitama'},
    '110010': {"ja": '南部', "en": 'Southern Region'},
    '110020': {"ja": '北部', "en": 'Northern Region'},
    '110030': {"ja": '秩父地方', "en": 'Chichibu Region'},
    '120000': {"ja": '千葉県', "en": 'Chiba'},
    '120010': {"ja": '北西部', "en": 'North-western Region'},
    '120020': {"ja": '北東部', "en": 'North-eastern Region'},
    '120030': {"ja": '南部', "en": 'Southern Region'},
    '130000': {"ja": '東京都', "en": 'Tokyo'},
    '130010': {"ja": '東京地方', "en": 'Tokyo Region'},
    '130020': {"ja": '伊豆諸島北部', "en": 'Northern Izu Islands'},
    '130030': {"ja": '伊豆諸島南部', "en": 'Southern Izu Islands'},
    '130040': {"ja": '小笠原諸島', "en": 'Ogasawara Islands'},
    '140000': {"ja": '神奈川県', "en": 'Kanagawa'},
    '140010': {"ja": '東部', "en": 'Eastern Region'},
    '140020': {"ja": '西部', "en": 'Western Region'},
    '150000': {"ja": '新潟県', "en": 'Niigata'},
    '150010': {"ja": '下越', "en": 'Kaetsu'},
    '150020': {"ja": '中越', "en": 'Chuetsu'},
    '150030': {"ja": '上越', "en": 'Joetsu'},
    '150040': {"ja": '佐渡', "en": 'Sado'},
    '160000': {"ja": '富山県', "en": 'Toyama'},
    '160010': {"ja": '東部', "en": 'Eastern Region'},
    '160020': {"ja": '西部', "en": 'Western Region'},
    '170000': {"ja": '石川県', "en": 'Ishikawa'},
    '170010': {"ja": '加賀', "en": 'Kaga'},
    '170020': {"ja": '能登', "en": 'Noto'},
    '180000': {"ja": '福井県', "en": 'Fukui'},
    '180010': {"ja": '嶺北', "en": 'Reihoku'},
    '180020': {"ja": '嶺南', "en": 'Reinan'},
    '190000': {"ja": '山梨県', "en": 'Yamanashi'},
    '190010': {"ja": '中・西部', "en": 'Central Western Region'},
    '190020': {"ja": '東部・富士五湖', "en": 'Eastern Region and Fuji Five Lakes'},
    '200000': {"ja": '長野県', "en": 'Nagano'},
    '200010': {"ja": '北部', "en": 'Northern Region'},
    '200020': {"ja": '中部', "en": 'Central Region'},
    '200030': {"ja": '南部', "en": 'Southern Region'},
    '210000': {"ja": '岐阜県', "en": 'Gifu'},
    '210010': {"ja": '美濃地方', "en": 'Mino Region'},
    '210020': {"ja": '飛騨地方', "en": 'Hida Region'},
    '220000': {"ja": '静岡県', "en": 'Shizuoka'},
    '220010': {"ja": '中部', "en": 'Central Region'},
    '220020': {"ja": '伊豆', "en": 'Izu'},
    '220030': {"ja": '東部', "en": 'Eastern Region'},
    '220040': {"ja": '西部', "en": 'Western Region'},
    '230000': {"ja": '愛知県', "en": 'Aichi'},
    '230010': {"ja": '西部', "en": 'Western Region'},
    '230020': {"ja": '東部', "en": 'Eastern Region'},
    '240000': {"ja": '三重県', "en": 'Mie'},
    '240010': {"ja": '北中部', "en": 'Northern Central Region'},
    '240020': {"ja": '南部', "en": 'Southern Region'},
    '250000': {"ja": '滋賀県', "en": 'Shiga'},
    '250010': {"ja": '南部', "en": 'Southern Region'},
    '250020': {"ja": '北部', "en": 'Northern Region'},
    '260000': {"ja": '京都府', "en": 'Kyoto'},
    '260010': {"ja": '南部', "en": 'Southern Region'},
    '260020': {"ja": '北部', "en": 'Northern Region'},
    '270000': {"ja": '大阪府', "en": 'Osaka Prefecture'},
    '280000': {"ja": '兵庫県', "en": 'Hyogo'},
    '280010': {"ja": '南部', "en": 'Southern Region'},
    '280020': {"ja": '北部', "en": 'Northern Region'},
    '290000': {"ja": '奈良県', "en": 'Nara'},
    '290010': {"ja": '北部', "en": 'Northern Region'},
    '290020': {"ja": '南部', "en": 'Southern Region'},
    '300000': {"ja": '和歌山県', "en": 'Wakayama'},
    '300010': {"ja": '北部', "en": 'Northern Region'},
    '300020': {"ja": '南部', "en": 'Southern Region'},
    '310000': {"ja": '鳥取県', "en": 'Tottori'},
    '310010': {"ja": '東部', "en": 'Eastern Region'},
    '310020': {"ja": '中・西部', "en": 'Central Western Region'},
    '320000': {"ja": '島根県', "en": 'Shimane'},
    '320010': {"ja": '東部', "en": 'Eastern Region'},
    '320020': {"ja": '西部', "en": 'Western Region'},
    '320030': {"ja": '隠岐', "en": 'Oki'},
    '330000': {"ja": '岡山県', "en": 'Okayama'},
    '330010': {"ja": '南部', "en": 'Southern Region'},
    '330020': {"ja": '北部', "en": 'Northern Region'},
    '340000': {"ja": '広島県', "en": 'Hiroshima'},
    '340010': {"ja": '南部', "en": 'Southern Region'},
    '340020': {"ja": '北部', "en": 'Northern Region'},
    '350000': {"ja": '山口県', "en": 'Yamaguchi'},
    '350010': {"ja": '西部', "en": 'Western Region'},
    '350020': {"ja": '中部', "en": 'Central Region'},
    '350030': {"ja": '東部', "en": 'Eastern Region'},
    '350040': {"ja": '北部', "en": 'Northern Region'},
    '360000': {"ja": '徳島県', "en": 'Tokushima'},
    '360010': {"ja": '北部', "en": 'Northern Region'},
    '360020': {"ja": '南部', "en": 'Southern Region'},
    '370000': {"ja": '香川県', "en": 'Kagawa Prefecture'},
    '380000': {"ja": '愛媛県', "en": 'Ehime'},
    '380010': {"ja": '中予', "en": 'Chuyo'},
    '380020': {"ja": '東予', "en": 'Toyo'},
    '380030': {"ja": '南予', "en": 'Nan-yo'},
    '390000': {"ja": '高知県', "en": 'Kochi'},
    '390010': {"ja": '中部', "en": 'Central Region'},
    '390020': {"ja": '東部', "en": 'Eastern Region'},
    '390030': {"ja": '西部', "en": 'Western Region'},
    '400000': {"ja": '福岡県', "en": 'Fukuoka'},
    '400010': {"ja": '福岡地方', "en": 'Fukuoka Region'},
    '400020': {"ja": '北九州地方', "en": 'Kitakyushu Region'},
    '400030': {"ja": '筑豊地方', "en": 'Chikuho Region'},
    '400040': {"ja": '筑後地方', "en": 'Chikugo Region'},
    '410000': {"ja": '佐賀県', "en": 'Saga'},
    '410010': {"ja": '南部', "en": 'Southern Region'},
    '410020': {"ja": '北部', "en": 'Northern Region'},
    '420000': {"ja": '長崎県', "en": 'Nagasaki'},
    '420010': {"ja": '南部', "en": 'Southern Region'},
    '420020': {"ja": '北部', "en": 'Northern Region'},
    '420030': {"ja": '壱岐・対馬', "en": 'Iki Tsushima'},
    '420040': {"ja": '五島', "en": 'Goto'},
    '430000': {"ja": '熊本県', "en": 'Kumamoto'},
    '430010': {"ja": '熊本地方', "en": 'Kumamoto Region'},
    '430020': {"ja": '阿蘇地方', "en": 'Aso Region'},
    '430030': {"ja": '天草・芦北地方', "en": 'Amakusa Ashikita Region'},
    '430040': {"ja": '球磨地方', "en": 'Kuma Region'},
    '440000': {"ja": '大分県', "en": 'Oita'},
    '440010': {"ja": '中部', "en": 'Central Region'},
    '440020': {"ja": '北部', "en": 'Northern Region'},
    '440030': {"ja": '西部', "en": 'Western Region'},
    '440040': {"ja": '南部', "en": 'Southern Region'},
    '450000': {"ja": '宮崎県', "en": 'Miyazaki'},
    '450010': {"ja": '南部平野部', "en": 'Plain Area of Southern Region'},
    '450020': {"ja": '北部平野部', "en": 'Plain Area of Northern Region'},
    '450030': {"ja": '南部山沿い', "en": 'Area along mountains of Southern Region'},
    '450040': {"ja": '北部山沿い', "en": 'Area along mountains of Northern Region'},
    '460010': {"ja": '薩摩地方', "en": 'Satsuma Region'},
    '460020': {"ja": '大隅地方', "en": 'Osumi Region'},
    '460030': {"ja": '種子島・屋久島地方', "en": 'Tanegashima Yakushima Region'},
    '460040': {"ja": '奄美地方', "en": 'Amami Region'},
    '460100': {"ja": '鹿児島県（奄美地方除く）', "en": 'Kagoshima (Excluding Amami)'},
    '471000': {"ja": '沖縄本島地方', "en": 'Okinawa Main Island'},
    '471010': {"ja": '本島中南部', "en": 'Central and Southern Main Island'},
    '471020': {"ja": '本島北部', "en": 'Northern Main Island'},
    '471030': {"ja": '久米島', "en": 'Kumejima'},
    '472000': {"ja": '大東島地方', "en": 'Daitojima Region'},
    '473000': {"ja": '宮古島地方', "en": 'Miyakojima Region'},
    '474000': {"ja": '八重山地方', "en": 'Yaeyama'},
    '474010': {"ja": '石垣島地方', "en": 'Ishigakijima Region'},
    '474020': {"ja": '与那国島地方', "en": 'Yonagunijima Region'},
}

#: 警報 JSON を取得できるコード（府県予報区）。ここに無いコードは 404 になる。
#: 「1 都道府県 = 1 コード」ではない点に注意（北海道 7・沖縄 4・鹿児島 2）。
FORECAST_OFFICE_CODES: frozenset[str] = frozenset({
    '011000',  # 宗谷地方
    '012000',  # 上川・留萌地方
    '013000',  # 網走・北見・紋別地方
    '014030',  # 十勝地方
    '014100',  # 釧路・根室地方
    '015000',  # 胆振・日高地方
    '016000',  # 石狩・空知・後志地方
    '017000',  # 渡島・檜山地方
    '020000',  # 青森県
    '030000',  # 岩手県
    '040000',  # 宮城県
    '050000',  # 秋田県
    '060000',  # 山形県
    '070000',  # 福島県
    '080000',  # 茨城県
    '090000',  # 栃木県
    '100000',  # 群馬県
    '110000',  # 埼玉県
    '120000',  # 千葉県
    '130000',  # 東京都
    '140000',  # 神奈川県
    '150000',  # 新潟県
    '160000',  # 富山県
    '170000',  # 石川県
    '180000',  # 福井県
    '190000',  # 山梨県
    '200000',  # 長野県
    '210000',  # 岐阜県
    '220000',  # 静岡県
    '230000',  # 愛知県
    '240000',  # 三重県
    '250000',  # 滋賀県
    '260000',  # 京都府
    '270000',  # 大阪府
    '280000',  # 兵庫県
    '290000',  # 奈良県
    '300000',  # 和歌山県
    '310000',  # 鳥取県
    '320000',  # 島根県
    '330000',  # 岡山県
    '340000',  # 広島県
    '350000',  # 山口県
    '360000',  # 徳島県
    '370000',  # 香川県
    '380000',  # 愛媛県
    '390000',  # 高知県
    '400000',  # 福岡県
    '410000',  # 佐賀県
    '420000',  # 長崎県
    '430000',  # 熊本県
    '440000',  # 大分県
    '450000',  # 宮崎県
    '460040',  # 奄美地方
    '460100',  # 鹿児島県（奄美地方除く）
    '471000',  # 沖縄本島地方
    '472000',  # 大東島地方
    '473000',  # 宮古島地方
    '474000',  # 八重山地方
})
