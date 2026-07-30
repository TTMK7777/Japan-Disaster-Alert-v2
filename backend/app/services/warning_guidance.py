"""
気象警報の行動ガイダンス（16言語）

## なぜこのモジュールがあるか

`warning_service.WARNING_GUIDANCE` は警報コード別に細かい文面を持つが **ja / en の
2言語のみ**で、他の14言語は実行時に英語へフォールバックしていた。
さらに警報名（`WARNING_CODES`）と説明テンプレ（`DESCRIPTION_TEMPLATES`）も
6言語（ja/en/zh/ko/vi/easy_ja）しかないため、zh-TW・th・id・ms・tl・ne・fr・de・it・es
のユーザーは警報名・説明・行動指示のすべてを英語で読んでいた。

## 設計上のトレードオフ（意図的）

29コード × 16言語 = 464 文面を人手で用意すると、安全に関わる文言を大量に
無レビューで生成することになる。そこで **災害種別で13グループにまとめ**、
グループ単位で16言語の行動指示を持つ。文字列数を 13×16 に抑えることで
一つ一つを丁寧に書けるようにしている。

- ja / en は既存のコード別文面をそのまま使う（劣化させない）
- 他の14言語はグループ文面を使う（英語よりは母国語が読める方が良い）
- 特別警報コードには「命に関わる危険」の接頭語を付ける
- 災害種別ごとの細かいニュアンス（例: 「除雪時の事故」）は落ちる

コード別文面を各言語に増やしたくなったら、`WARNING_GUIDANCE` に言語キーを
足すだけでこのモジュールより優先される（解決順は `resolve_guidance` 参照）。

本モジュールは **外部依存を持たない**。
"""
from typing import Mapping, Optional

FALLBACK_LANG = "en"

# 特別警報（数十年に一度の規模）のコード
EMERGENCY_CODES = frozenset({"32", "33", "35", "36", "37", "38"})

# 警報コード → 災害グループ
HAZARD_BY_CODE: dict[str, str] = {
    # 暴風雪・吹雪（視界不良）
    "02": "blizzard",
    "13": "blizzard",
    "32": "blizzard",
    # 大雪（交通障害・建物への荷重）
    "06": "heavy_snow",
    "12": "heavy_snow",
    "36": "heavy_snow",
    # 大雨（土砂災害・浸水）
    "03": "landslide_flood",
    "10": "landslide_flood",
    "33": "landslide_flood",
    # 河川の増水・氾濫
    "04": "river_flood",
    "18": "river_flood",
    # 暴風・強風
    "05": "storm_wind",
    "15": "storm_wind",
    "35": "storm_wind",
    # 高波
    "07": "high_waves",
    "16": "high_waves",
    "37": "high_waves",
    # 高潮
    "08": "storm_surge",
    "19": "storm_surge",
    "38": "storm_surge",
    # 雷・突風・ひょう
    "14": "thunderstorm",
    # 融雪
    "17": "snowmelt",
    # 濃霧
    "20": "fog",
    # 乾燥（火災）
    "21": "dry_fire",
    # なだれ
    "22": "avalanche",
    # 低温・霜・着氷・着雪
    "23": "cold",
    "24": "cold",
    "25": "cold",
    "26": "cold",
}

# 特別警報に付ける接頭語
EMERGENCY_PREFIX: dict[str, str] = {
    "ja": "命に関わる危険。ただちに行動してください。",
    "en": "Life-threatening emergency. Act now.",
    "zh": "生命危险。请立即采取行动。",
    "zh-TW": "生命危險。請立即採取行動。",
    "ko": "생명이 위험합니다. 즉시 행동하세요.",
    "vi": "Nguy hiểm đến tính mạng. Hãy hành động ngay.",
    "th": "อันตรายถึงชีวิต กรุณาดำเนินการทันที",
    "id": "Bahaya mengancam nyawa. Segera bertindak.",
    "ms": "Bahaya mengancam nyawa. Bertindak sekarang.",
    "tl": "Nakamamatay na panganib. Kumilos agad.",
    "ne": "ज्यान जोखिममा छ। तुरुन्तै कदम चाल्नुहोस्।",
    "fr": "Danger vital. Agissez immédiatement.",
    "de": "Lebensgefahr. Handeln Sie sofort.",
    "it": "Pericolo di vita. Agisci immediatamente.",
    "es": "Peligro de muerte. Actúa de inmediato.",
    "easy_ja": "いのちが あぶない。すぐ こうどうして ください。",
}

# 災害グループ別の行動指示（16言語）
HAZARD_ACTION: dict[str, dict[str, str]] = {
    "blizzard": {
        "ja": "猛吹雪。視界不良と交通障害。外出を控え、車の運転は避けてください。",
        "en": "Blizzard: poor visibility and traffic disruption. Stay indoors and avoid driving.",
        "zh": "强烈暴风雪。能见度差、交通受阻。请勿外出，避免驾车。",
        "zh-TW": "強烈暴風雪。能見度差、交通受阻。請勿外出，避免駕車。",
        "ko": "강한 눈보라. 시야 불량과 교통 장애. 외출을 삼가고 운전을 피하세요.",
        "vi": "Bão tuyết mạnh: tầm nhìn kém và giao thông bị gián đoạn. Hãy ở trong nhà và tránh lái xe.",
        "th": "พายุหิมะรุนแรง ทัศนวิสัยไม่ดีและการจราจรติดขัด กรุณาอยู่ในอาคารและหลีกเลี่ยงการขับรถ",
        "id": "Badai salju: jarak pandang buruk dan lalu lintas terganggu. Tetap di dalam ruangan dan hindari menyetir.",
        "ms": "Badai salji: penglihatan terhad dan lalu lintas terganggu. Kekal di dalam bangunan dan elak memandu.",
        "tl": "Blizzard: malabong paningin at abalang trapiko. Manatili sa loob at iwasan ang pagmamaneho.",
        "ne": "भयंकर हिउँ आँधी। दृश्यता कम र यातायात अवरुद्ध। बाहिर नजानुहोस् र गाडी नचलाउनुहोस्।",
        "fr": "Fort blizzard : visibilité réduite et circulation perturbée. Restez à l'intérieur et évitez de conduire.",
        "de": "Starker Schneesturm: schlechte Sicht und Verkehrsstörungen. Bleiben Sie im Haus und vermeiden Sie Autofahrten.",
        "it": "Forte bufera di neve: scarsa visibilità e traffico interrotto. Resta al chiuso ed evita di guidare.",
        "es": "Ventisca fuerte: poca visibilidad y tráfico interrumpido. Permanece en interiores y evita conducir.",
        "easy_ja": "とても つよい ふぶき。まえが みえません。そとに でないで ください。",
    },
    "heavy_snow": {
        "ja": "大雪。交通障害や建物の倒壊のおそれ。外出を控え、除雪時の事故に注意してください。",
        "en": "Heavy snow: traffic disruption and risk of building collapse. Stay indoors and take care when clearing snow.",
        "zh": "大雪。可能造成交通受阻和建筑物倒塌。请勿外出，除雪时注意安全。",
        "zh-TW": "大雪。可能造成交通受阻與建築物倒塌。請勿外出，除雪時注意安全。",
        "ko": "폭설. 교통 장애와 건물 붕괴 우려. 외출을 삼가고 제설 작업 시 주의하세요.",
        "vi": "Tuyết dày: nguy cơ gián đoạn giao thông và sập mái nhà. Hãy ở trong nhà và cẩn thận khi dọn tuyết.",
        "th": "หิมะตกหนัก อาจทำให้การจราจรติดขัดและอาคารถล่ม กรุณาอยู่ในอาคารและระวังอันตรายขณะกวาดหิมะ",
        "id": "Salju tebal: risiko gangguan lalu lintas dan bangunan runtuh. Tetap di dalam ruangan dan hati-hati saat membersihkan salju.",
        "ms": "Salji tebal: risiko gangguan lalu lintas dan bangunan runtuh. Kekal di dalam bangunan dan berhati-hati semasa membersihkan salji.",
        "tl": "Makapal na niyebe: panganib ng abalang trapiko at pagguho ng gusali. Manatili sa loob at mag-ingat kapag nag-aalis ng niyebe.",
        "ne": "भारी हिमपात। यातायात अवरुद्ध र भवन भत्किने खतरा। बाहिर नजानुहोस्, हिउँ पन्छाउँदा होसियार हुनुहोस्।",
        "fr": "Fortes chutes de neige : risque de perturbation du trafic et d'effondrement de bâtiments. Restez à l'intérieur et soyez prudent en déneigeant.",
        "de": "Starker Schneefall: Gefahr von Verkehrsstörungen und Gebäudeeinstürzen. Bleiben Sie im Haus und seien Sie beim Schneeräumen vorsichtig.",
        "it": "Nevicate abbondanti: rischio di interruzioni del traffico e crolli di edifici. Resta al chiuso e fai attenzione mentre spali la neve.",
        "es": "Nevada intensa: riesgo de interrupción del tráfico y derrumbe de edificios. Permanece en interiores y ten cuidado al retirar la nieve.",
        "easy_ja": "おおゆき。でんしゃや くるまが とまります。そとに でないで ください。",
    },
    "landslide_flood": {
        "ja": "大雨。土砂災害と浸水のおそれ。崖や水路から離れ、早めに避難してください。",
        "en": "Heavy rain: risk of landslides and flooding. Stay away from slopes and waterways, and evacuate early.",
        "zh": "大雨。有山体滑坡和内涝危险。请远离陡坡和水道，尽早避难。",
        "zh-TW": "大雨。有山崩與淹水危險。請遠離陡坡與水道，儘早避難。",
        "ko": "호우. 산사태와 침수 위험. 절벽과 물길에서 떨어지고 일찍 대피하세요.",
        "vi": "Mưa lớn: nguy cơ sạt lở đất và ngập lụt. Hãy tránh xa vách núi và kênh nước, sơ tán sớm.",
        "th": "ฝนตกหนัก เสี่ยงดินถล่มและน้ำท่วม กรุณาอยู่ห่างจากหน้าผาและทางน้ำ และอพยพให้เร็ว",
        "id": "Hujan lebat: risiko tanah longsor dan banjir. Jauhi lereng dan saluran air, dan mengungsi lebih awal.",
        "ms": "Hujan lebat: risiko tanah runtuh dan banjir. Jauhi cerun dan saluran air, dan berpindah lebih awal.",
        "tl": "Malakas na ulan: panganib ng landslide at pagbaha. Lumayo sa mga bangin at daluyan ng tubig, at lumikas nang maaga.",
        "ne": "भारी वर्षा। पहिरो र डुबानको खतरा। भिर र नहरबाट पर बस्नुहोस्, चाँडै सुरक्षित स्थानमा जानुहोस्।",
        "fr": "Fortes pluies : risque de glissements de terrain et d'inondations. Éloignez-vous des pentes et des cours d'eau, et évacuez tôt.",
        "de": "Starkregen: Gefahr von Erdrutschen und Überflutungen. Halten Sie Abstand zu Hängen und Wasserläufen und evakuieren Sie früh.",
        "it": "Pioggia intensa: rischio di frane e allagamenti. Allontanati da pendii e corsi d'acqua ed evacua presto.",
        "es": "Lluvia intensa: riesgo de deslizamientos de tierra e inundaciones. Aléjate de laderas y cauces, y evacúa pronto.",
        "easy_ja": "おおあめ。やまが くずれる。みずが あふれる。がけや かわから はなれて、はやく にげて ください。",
    },
    "river_flood": {
        "ja": "河川が増水・氾濫するおそれ。河川敷や低地から離れてください。",
        "en": "Rivers may rise and overflow. Stay away from riverbanks and low-lying areas.",
        "zh": "河水可能上涨、泛滥。请远离河滩和低洼地区。",
        "zh-TW": "河水可能上漲、氾濫。請遠離河灘與低窪地區。",
        "ko": "하천이 불어나 범람할 수 있습니다. 하천 부지와 저지대에서 떨어지세요.",
        "vi": "Sông có thể dâng cao và tràn bờ. Hãy tránh xa bãi sông và vùng đất thấp.",
        "th": "แม่น้ำอาจเอ่อล้นและท่วม กรุณาอยู่ห่างจากริมแม่น้ำและพื้นที่ต่ำ",
        "id": "Sungai dapat meluap dan banjir. Jauhi bantaran sungai dan daerah rendah.",
        "ms": "Sungai mungkin melimpah dan banjir. Jauhi tebing sungai dan kawasan rendah.",
        "tl": "Maaaring umapaw ang ilog. Lumayo sa pampang ng ilog at mabababang lugar.",
        "ne": "नदीको पानी बढ्न र बाढी आउन सक्छ। नदी किनार र होचो क्षेत्रबाट पर बस्नुहोस्।",
        "fr": "Les rivières peuvent monter et déborder. Éloignez-vous des berges et des zones basses.",
        "de": "Flüsse können ansteigen und über die Ufer treten. Halten Sie Abstand zu Flussufern und tief liegenden Gebieten.",
        "it": "I fiumi possono ingrossarsi ed esondare. Allontanati dagli argini e dalle zone basse.",
        "es": "Los ríos pueden crecer y desbordarse. Aléjate de las riberas y de las zonas bajas.",
        "easy_ja": "かわの みずが ふえます。かわの ちかくから はなれて ください。",
    },
    "storm_wind": {
        "ja": "強風・暴風。飛来物と建物損壊のおそれ。頑丈な建物の中に入り、飛びやすい物を固定してください。",
        "en": "Strong wind: risk of flying debris and building damage. Move into a sturdy building and secure loose items.",
        "zh": "强风。有飞来物和建筑物损坏危险。请进入坚固建筑物内，固定易被吹走的物品。",
        "zh-TW": "強風。有飛落物與建築物損壞危險。請進入堅固建築物內，固定易被吹走的物品。",
        "ko": "강풍. 날아오는 물체와 건물 손상 위험. 튼튼한 건물 안으로 들어가고 날아갈 물건을 고정하세요.",
        "vi": "Gió mạnh: nguy cơ vật bay và hư hại nhà cửa. Hãy vào trong toà nhà kiên cố và cố định các vật dễ bay.",
        "th": "ลมแรง เสี่ยงวัตถุปลิวและอาคารเสียหาย กรุณาเข้าไปในอาคารที่แข็งแรงและยึดสิ่งของที่ปลิวได้",
        "id": "Angin kencang: risiko benda terbang dan kerusakan bangunan. Masuk ke bangunan kokoh dan ikat benda yang mudah terbang.",
        "ms": "Angin kuat: risiko objek terbang dan kerosakan bangunan. Masuk ke bangunan yang kukuh dan ikat objek yang mudah terbang.",
        "tl": "Malakas na hangin: panganib ng lumilipad na bagay at pinsala sa gusali. Pumasok sa matibay na gusali at itali ang mga bagay na madaling lumipad.",
        "ne": "तेज हावा। वस्तु उडने र भवन बिग्रिने खतरा। बलियो भवन भित्र बस्नुहोस् र उडने वस्तु बाँध्नुहोस्।",
        "fr": "Vents violents : risque de projections et de dégâts aux bâtiments. Mettez-vous à l'abri dans un bâtiment solide et fixez les objets susceptibles d'être emportés.",
        "de": "Starker Wind: Gefahr durch umherfliegende Gegenstände und Gebäudeschäden. Gehen Sie in ein stabiles Gebäude und sichern Sie lose Gegenstände.",
        "it": "Vento forte: rischio di oggetti scagliati e danni agli edifici. Entra in un edificio solido e fissa gli oggetti che possono volare.",
        "es": "Viento fuerte: riesgo de objetos volando y daños en edificios. Entra en un edificio sólido y asegura los objetos que puedan volar.",
        "easy_ja": "とても つよい かぜ。ものが とんできます。じょうぶな たてものの なかに いて ください。",
    },
    "high_waves": {
        "ja": "高波。海岸に近づかず、釣りや海辺の活動は控えてください。",
        "en": "High waves. Stay away from the coast and avoid fishing and coastal activities.",
        "zh": "浪高。请勿靠近海岸，避免钓鱼和海边活动。",
        "zh-TW": "浪高。請勿靠近海岸，避免釣魚與海邊活動。",
        "ko": "높은 파도. 해안에 접근하지 말고 낚시와 해변 활동을 삼가세요.",
        "vi": "Sóng lớn. Hãy tránh xa bờ biển, không câu cá hay hoạt động ven biển.",
        "th": "คลื่นสูง กรุณาอยู่ห่างจากชายฝั่ง งดตกปลาและกิจกรรมริมทะเล",
        "id": "Gelombang tinggi. Jauhi pantai dan hindari memancing serta aktivitas di tepi laut.",
        "ms": "Gelombang tinggi. Jauhi pantai dan elak memancing serta aktiviti di tepi laut.",
        "tl": "Malalaking alon. Lumayo sa baybayin at iwasan ang pangingisda at mga aktibidad sa dagat.",
        "ne": "उच्च छाल। समुद्र किनारमा नजानुहोस्, माछा मार्ने र किनारका गतिविधि रोक्नुहोस्।",
        "fr": "Fortes vagues. Éloignez-vous du littoral et évitez la pêche et les activités côtières.",
        "de": "Hohe Wellen. Halten Sie Abstand zur Küste und verzichten Sie auf Angeln und Aktivitäten am Meer.",
        "it": "Onde alte. Allontanati dalla costa ed evita la pesca e le attività in riva al mare.",
        "es": "Olas altas. Aléjate de la costa y evita la pesca y las actividades en la orilla.",
        "easy_ja": "なみが たかい。うみに ちかづかないで ください。",
    },
    "storm_surge": {
        "ja": "高潮による浸水のおそれ。沿岸の低地から離れ、高い場所へ移動してください。",
        "en": "Storm surge: risk of coastal flooding. Leave low-lying coastal areas and move to higher ground.",
        "zh": "风暴潮可能造成淹水。请离开沿岸低洼地区，转移到高处。",
        "zh-TW": "暴潮可能造成淹水。請離開沿岸低窪地區，移往高處。",
        "ko": "폭풍 해일로 침수 우려. 해안 저지대를 떠나 높은 곳으로 이동하세요.",
        "vi": "Nước dâng do bão có thể gây ngập. Hãy rời vùng thấp ven biển và di chuyển lên cao.",
        "th": "น้ำทะเลหนุนอาจทำให้เกิดน้ำท่วม กรุณาออกจากพื้นที่ต่ำริมชายฝั่งและขึ้นที่สูง",
        "id": "Gelombang badai dapat menyebabkan banjir. Tinggalkan daerah pantai yang rendah dan pindah ke tempat tinggi.",
        "ms": "Air pasang badai boleh menyebabkan banjir. Tinggalkan kawasan pantai yang rendah dan berpindah ke tempat tinggi.",
        "tl": "Ang storm surge ay maaaring magdulot ng baha. Lisanin ang mabababang baybayin at umakyat sa mataas na lugar.",
        "ne": "समुद्री जलस्तर बढेर डुबान हुन सक्छ। किनारका होचो क्षेत्र छोडी उच्च स्थानमा जानुहोस्।",
        "fr": "Onde de tempête : risque de submersion. Quittez les zones côtières basses et gagnez les hauteurs.",
        "de": "Sturmflut: Überflutungsgefahr. Verlassen Sie tief liegende Küstengebiete und begeben Sie sich auf höheres Gelände.",
        "it": "Mareggiata: rischio di allagamento. Lascia le zone costiere basse e raggiungi un luogo elevato.",
        "es": "Marea de tormenta: riesgo de inundación. Abandona las zonas costeras bajas y sube a un lugar elevado.",
        "easy_ja": "うみの みずが あふれます。うみの ちかくの ひくい ばしょから たかい ばしょへ にげて ください。",
    },
    "thunderstorm": {
        "ja": "落雷・突風・急な強い雨・ひょう。屋外にいる場合はただちに建物内に入ってください。",
        "en": "Lightning, gusts, sudden heavy rain and hail. If you are outside, move indoors immediately.",
        "zh": "雷击、阵风、突降大雨和冰雹。在户外请立即进入建筑物内。",
        "zh-TW": "雷擊、陣風、突降大雨與冰雹。在戶外請立即進入建築物內。",
        "ko": "낙뢰·돌풍·갑작스러운 폭우·우박. 야외에 있으면 즉시 건물 안으로 들어가세요.",
        "vi": "Sét, gió giật, mưa lớn bất chợt và mưa đá. Nếu đang ở ngoài trời, hãy vào trong nhà ngay.",
        "th": "ฟ้าผ่า ลมกระโชก ฝนตกหนักฉับพลัน และลูกเห็บ หากอยู่นอกอาคารให้เข้าอาคารทันที",
        "id": "Sambaran petir, angin kencang mendadak, hujan lebat, dan hujan es. Jika di luar, segera masuk ke dalam bangunan.",
        "ms": "Kilat, tiupan angin kencang, hujan lebat mendadak dan hujan batu. Jika di luar, segera masuk ke dalam bangunan.",
        "tl": "Kidlat, biglaang malakas na hangin, malakas na ulan, at ulan ng yelo. Kung sa labas, pumasok agad sa loob ng gusali.",
        "ne": "चट्याङ, तेज बतास, अचानक भारी वर्षा र असिना। बाहिर भए तुरुन्तै भवन भित्र जानुहोस्।",
        "fr": "Foudre, rafales, pluies soudaines et grêle. Si vous êtes dehors, rentrez immédiatement.",
        "de": "Blitzschlag, Sturmböen, plötzlicher Starkregen und Hagel. Gehen Sie im Freien sofort in ein Gebäude.",
        "it": "Fulmini, raffiche, pioggia intensa improvvisa e grandine. Se sei all'aperto, entra subito in un edificio.",
        "es": "Rayos, rachas de viento, lluvia intensa repentina y granizo. Si estás al aire libre, entra de inmediato en un edificio.",
        "easy_ja": "かみなり・つよい かぜ・つよい あめ・ひょう。そとに いる ひとは すぐ たてものの なかへ。",
    },
    "snowmelt": {
        "ja": "融雪による土砂災害・浸水・なだれのおそれ。斜面から離れてください。",
        "en": "Snowmelt may cause landslides, flooding and avalanches. Stay away from slopes.",
        "zh": "融雪可能引发山体滑坡、内涝和雪崩。请远离斜坡。",
        "zh-TW": "融雪可能引發山崩、淹水與雪崩。請遠離斜坡。",
        "ko": "융설로 산사태·침수·눈사태 위험. 경사면에서 떨어지세요.",
        "vi": "Tuyết tan có thể gây sạt lở, ngập lụt và lở tuyết. Hãy tránh xa các sườn dốc.",
        "th": "หิมะละลายอาจทำให้ดินถล่ม น้ำท่วม และหิมะถล่ม กรุณาอยู่ห่างจากพื้นที่ลาดชัน",
        "id": "Salju yang mencair dapat memicu tanah longsor, banjir, dan longsoran salju. Jauhi lereng.",
        "ms": "Salji mencair boleh menyebabkan tanah runtuh, banjir dan runtuhan salji. Jauhi cerun.",
        "tl": "Ang natutunaw na niyebe ay maaaring magdulot ng landslide, baha, at avalanche. Lumayo sa mga dalisdis.",
        "ne": "हिउँ पग्लिएर पहिरो, डुबान र हिउँ पहिरोको खतरा। भिरालो ठाउँबाट पर बस्नुहोस्।",
        "fr": "La fonte des neiges peut provoquer glissements de terrain, inondations et avalanches. Éloignez-vous des pentes.",
        "de": "Schneeschmelze kann Erdrutsche, Überflutungen und Lawinen auslösen. Halten Sie Abstand zu Hängen.",
        "it": "Lo scioglimento della neve può causare frane, allagamenti e valanghe. Allontanati dai pendii.",
        "es": "El deshielo puede provocar deslizamientos, inundaciones y avalanchas. Aléjate de las laderas.",
        "easy_ja": "ゆきが とけて やまが くずれます。なだれも あぶない。しゃめんから はなれて ください。",
    },
    "fog": {
        "ja": "濃霧で視界不良。速度を落とし、フォグランプを使用してください。",
        "en": "Dense fog: poor visibility. Reduce speed and use fog lights.",
        "zh": "浓雾能见度差。请减速行驶并使用雾灯。",
        "zh-TW": "濃霧能見度差。請減速行駛並使用霧燈。",
        "ko": "짙은 안개로 시야 불량. 속도를 줄이고 안개등을 사용하세요.",
        "vi": "Sương mù dày, tầm nhìn kém. Hãy giảm tốc độ và bật đèn sương mù.",
        "th": "หมอกหนา ทัศนวิสัยไม่ดี กรุณาลดความเร็วและเปิดไฟตัดหมอก",
        "id": "Kabut tebal, jarak pandang buruk. Kurangi kecepatan dan gunakan lampu kabut.",
        "ms": "Kabus tebal, penglihatan terhad. Kurangkan kelajuan dan gunakan lampu kabus.",
        "tl": "Makapal na hamog, malabong paningin. Bagalan ang takbo at gamitin ang fog lights.",
        "ne": "बाक्लो कुहिरो, दृश्यता कम। गति घटाउनुहोस् र फग लाइट प्रयोग गर्नुहोस्।",
        "fr": "Brouillard dense : visibilité réduite. Réduisez votre vitesse et utilisez les feux de brouillard.",
        "de": "Dichter Nebel: schlechte Sicht. Reduzieren Sie die Geschwindigkeit und nutzen Sie Nebelscheinwerfer.",
        "it": "Nebbia densa: scarsa visibilità. Riduci la velocità e usa i fendinebbia.",
        "es": "Niebla densa: poca visibilidad. Reduce la velocidad y usa las luces antiniebla.",
        "easy_ja": "きりで まえが みえません。くるまは ゆっくり すすんで ください。",
    },
    "dry_fire": {
        "ja": "空気が乾燥し火災の危険。火の取り扱いに十分注意してください。",
        "en": "Dry air: high fire risk. Handle fire with extra caution.",
        "zh": "空气干燥，火灾风险高。请特别小心用火。",
        "zh-TW": "空氣乾燥，火災風險高。請特別小心用火。",
        "ko": "건조한 공기로 화재 위험이 높습니다. 불 사용에 각별히 주의하세요.",
        "vi": "Không khí khô, nguy cơ cháy cao. Hãy hết sức cẩn thận với lửa.",
        "th": "อากาศแห้ง เสี่ยงเกิดไฟไหม้ กรุณาระมัดระวังการใช้ไฟเป็นพิเศษ",
        "id": "Udara kering, risiko kebakaran tinggi. Tangani api dengan sangat hati-hati.",
        "ms": "Udara kering, risiko kebakaran tinggi. Berhati-hati sangat semasa mengendalikan api.",
        "tl": "Tuyong hangin, mataas na panganib ng sunog. Mag-ingat na mabuti sa paggamit ng apoy.",
        "ne": "सुक्खा हावा, आगलागीको उच्च जोखिम। आगो प्रयोगमा विशेष सतर्कता अपनाउनुहोस्।",
        "fr": "Air sec : risque élevé d'incendie. Manipulez le feu avec une extrême prudence.",
        "de": "Trockene Luft: hohe Brandgefahr. Gehen Sie mit Feuer besonders vorsichtig um.",
        "it": "Aria secca: alto rischio di incendi. Maneggia il fuoco con estrema cautela.",
        "es": "Aire seco: alto riesgo de incendio. Maneja el fuego con extrema precaución.",
        "easy_ja": "くうきが かわいて かじが おきやすい。ひの つかいかたに きを つけて ください。",
    },
    "avalanche": {
        "ja": "なだれの危険。急斜面やなだれ危険箇所に近づかないでください。",
        "en": "Avalanche risk. Stay away from steep slopes and avalanche-prone areas.",
        "zh": "有雪崩危险。请勿靠近陡坡和雪崩危险区域。",
        "zh-TW": "有雪崩危險。請勿靠近陡坡與雪崩危險區域。",
        "ko": "눈사태 위험. 급경사면과 눈사태 위험 지역에 접근하지 마세요.",
        "vi": "Nguy cơ lở tuyết. Hãy tránh xa sườn dốc và khu vực có nguy cơ lở tuyết.",
        "th": "เสี่ยงหิมะถล่ม กรุณาอยู่ห่างจากพื้นที่ลาดชันและบริเวณที่เสี่ยงหิมะถล่ม",
        "id": "Risiko longsoran salju. Jauhi lereng terjal dan area rawan longsoran salju.",
        "ms": "Risiko runtuhan salji. Jauhi cerun curam dan kawasan berisiko runtuhan salji.",
        "tl": "Panganib ng avalanche. Lumayo sa matatarik na dalisdis at mga lugar na madaling ma-avalanche.",
        "ne": "हिउँ पहिरोको खतरा। ठाडो भिरालो र हिउँ पहिरो जोखिम क्षेत्रमा नजानुहोस्।",
        "fr": "Risque d'avalanche. Éloignez-vous des pentes raides et des zones exposées aux avalanches.",
        "de": "Lawinengefahr. Halten Sie Abstand zu Steilhängen und lawinengefährdeten Bereichen.",
        "it": "Rischio di valanghe. Allontanati dai pendii ripidi e dalle zone a rischio valanga.",
        "es": "Riesgo de avalancha. Aléjate de laderas empinadas y de zonas propensas a avalanchas.",
        "easy_ja": "なだれが あぶない。きゅうな さかに ちかづかないで ください。",
    },
    "cold": {
        "ja": "低温・霜・着氷。防寒対策をし、水道管の凍結や送電線の被害に注意してください。",
        "en": "Low temperatures, frost and icing. Protect against the cold and watch for frozen pipes and damaged power lines.",
        "zh": "低温、霜冻和结冰。请注意保暖，防止水管冻结和输电线受损。",
        "zh-TW": "低溫、霜與結冰。請注意保暖，防止水管凍結與輸電線受損。",
        "ko": "저온·서리·착빙. 방한 대책을 하고 수도관 동결과 송전선 피해에 주의하세요.",
        "vi": "Nhiệt độ thấp, sương giá và băng đóng. Hãy giữ ấm, đề phòng đường ống nước đóng băng và hư hại đường dây điện.",
        "th": "อุณหภูมิต่ำ น้ำค้างแข็ง และการเกาะตัวของน้ำแข็ง กรุณาป้องกันความหนาว ระวังท่อน้ำแตกและสายไฟเสียหาย",
        "id": "Suhu rendah, embun beku, dan lapisan es. Lindungi diri dari dingin, waspadai pipa air membeku dan kerusakan kabel listrik.",
        "ms": "Suhu rendah, embun beku dan lapisan ais. Lindungi diri daripada kesejukan, waspada paip air membeku dan kerosakan kabel elektrik.",
        "tl": "Mababang temperatura, hamog na nagyeyelo, at pag-yelo. Manatiling mainit, mag-ingat sa nagyeyelong tubo at napinsalang linya ng kuryente.",
        "ne": "न्यून तापक्रम, तुसारो र हिउँ जम्ने। जाडोबाट बच्नुहोस्, पानीको पाइप जम्ने र बिजुली लाइन बिग्रिने खतरामा ध्यान दिनुहोस्।",
        "fr": "Températures basses, gel et givre. Protégez-vous du froid et attention aux canalisations gelées et aux lignes électriques endommagées.",
        "de": "Niedrige Temperaturen, Frost und Eisablagerungen. Schützen Sie sich vor Kälte und achten Sie auf gefrorene Wasserleitungen und beschädigte Stromleitungen.",
        "it": "Temperature basse, gelo e ghiaccio. Proteggiti dal freddo e attenzione alle tubature gelate e alle linee elettriche danneggiate.",
        "es": "Temperaturas bajas, escarcha y hielo. Protégete del frío y ten cuidado con las tuberías congeladas y las líneas eléctricas dañadas.",
        "easy_ja": "とても さむい。しもや こおり。あたたかい ふくを きて ください。",
    },
}


def resolve_guidance(
    code: str,
    lang: Optional[str],
    per_code_guidance: Mapping[str, Mapping[str, str]],
) -> str:
    """
    警報コードと言語から行動ガイダンスを決める。

    解決順:
      1. コード別文面にその言語があればそれを使う（ja / en。将来言語を足せば優先される）
      2. 災害グループの行動指示（特別警報なら「命に関わる危険」接頭語を付ける）
      3. コード別文面の英語

    どれも無ければ空文字を返す（呼び出し側でガイダンス行を出さない）。

    Args:
        code: 気象庁の警報コード
        lang: 表示言語
        per_code_guidance: `WarningService.WARNING_GUIDANCE` 相当の辞書
    """
    entry = per_code_guidance.get(code) or {}

    if lang:
        specific = entry.get(lang)
        if specific:
            return specific

        hazard = HAZARD_BY_CODE.get(code)
        if hazard:
            action = HAZARD_ACTION[hazard].get(lang)
            if action:
                if code in EMERGENCY_CODES:
                    prefix = EMERGENCY_PREFIX.get(lang) or EMERGENCY_PREFIX[FALLBACK_LANG]
                    return f"{prefix} {action}"
                return action

    return entry.get(FALLBACK_LANG, "")
