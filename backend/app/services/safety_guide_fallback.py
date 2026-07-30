"""
安全ガイドのフォールバック（AI 非依存・16言語）

AI プロバイダが使えないとき（APIキー未設定 / ネットワーク不調 / レート制限 /
停電による通信断）に返す静的な安全ガイド。

公的調査では災害時に訪日客が困ったことの1位が「停電で情報が得られなかった」
67.0% であり、AI が使えない状況こそがこのアプリの本番である。
以前はこのフォールバックが日本語のみを返しており、外国人向けアプリが
最も必要な瞬間に日本語しか出さない状態だった。

本モジュールは **外部依存を持たない**（テストと軽量な検証を容易にするため）。
"""
from typing import Optional

from .translation_templates import DISASTER_TYPES

# フォールバックの言語が見つからない場合に使う言語
DEFAULT_LANG = "en"

# 日本の緊急連絡先（数字は共通、ラベルのみ各言語）
# 訪日外国人向けホットラインは観光庁 / JNTO の Japan Visitor Hotline
_HOTLINE = "050-3816-2787"

# 各言語の定型文。`{disaster}` に災害種別名（各言語）が入る
SAFETY_GUIDE_FALLBACK: dict[str, dict] = {
    "ja": {
        "title": "{disaster}の安全ガイド",
        "summary": "{disaster}が発生したときの基本的な行動です。落ち着いて行動してください。",
        "immediate_actions": [
            "まず身の安全を確保してください（頭を守り、倒れてくる物から離れる）",
            "公式の最新情報を確認してください",
            "指示があれば避難してください",
        ],
        "preparation_tips": [
            "非常用持ち出し袋を準備しておきましょう",
            "最寄りの避難場所を確認しておきましょう",
        ],
        "evacuation_info": "市区町村の指示に従って避難してください",
        "emergency_contacts": f"警察 110 / 消防・救急 119 / 海上保安庁 118 / 訪日外国人向け相談ホットライン {_HOTLINE}",
        "additional_notes": "正確な情報は公式発表を確認してください",
    },
    "en": {
        "title": "{disaster} Safety Guide",
        "summary": "What to do when {disaster} happens. Stay calm and act step by step.",
        "immediate_actions": [
            "Protect yourself first — cover your head and move away from things that can fall",
            "Check the latest official information",
            "Evacuate if you are told to",
        ],
        "preparation_tips": [
            "Keep an emergency bag ready",
            "Know your nearest evacuation site",
        ],
        "evacuation_info": "Follow the instructions of your local authorities",
        "emergency_contacts": f"Police 110 / Fire & Ambulance 119 / Coast Guard 118 / Japan Visitor Hotline {_HOTLINE}",
        "additional_notes": "Check official announcements for accurate information",
    },
    "zh": {
        "title": "{disaster}安全指南",
        "summary": "发生{disaster}时的基本行动。请保持冷静。",
        "immediate_actions": [
            "首先确保自身安全——保护头部，远离可能倒塌的物体",
            "确认官方最新信息",
            "如接到指示，请立即避难",
        ],
        "preparation_tips": [
            "准备好应急包",
            "确认最近的避难场所",
        ],
        "evacuation_info": "请按照当地政府的指示避难",
        "emergency_contacts": f"警察 110 / 消防·急救 119 / 海上保安厅 118 / 访日外国人咨询热线 {_HOTLINE}",
        "additional_notes": "准确的信息请确认官方发布",
    },
    "zh-TW": {
        "title": "{disaster}安全指南",
        "summary": "發生{disaster}時的基本行動。請保持冷靜。",
        "immediate_actions": [
            "首先確保自身安全——保護頭部，遠離可能倒塌的物體",
            "確認官方最新資訊",
            "如接到指示，請立即避難",
        ],
        "preparation_tips": [
            "準備好緊急避難包",
            "確認最近的避難場所",
        ],
        "evacuation_info": "請依照當地政府的指示避難",
        "emergency_contacts": f"警察 110 / 消防·救護 119 / 海上保安廳 118 / 訪日外國人諮詢熱線 {_HOTLINE}",
        "additional_notes": "準確的資訊請確認官方發布",
    },
    "ko": {
        "title": "{disaster} 안전 가이드",
        "summary": "{disaster}이(가) 발생했을 때의 기본 행동입니다. 침착하게 행동하세요.",
        "immediate_actions": [
            "먼저 몸의 안전을 확보하세요 — 머리를 보호하고 넘어질 수 있는 물건에서 떨어지세요",
            "공식 최신 정보를 확인하세요",
            "지시가 있으면 대피하세요",
        ],
        "preparation_tips": [
            "비상 가방을 준비해 두세요",
            "가장 가까운 대피 장소를 확인해 두세요",
        ],
        "evacuation_info": "지방자치단체의 지시에 따라 대피하세요",
        "emergency_contacts": f"경찰 110 / 소방·구급 119 / 해상보안청 118 / 방일 외국인 상담 핫라인 {_HOTLINE}",
        "additional_notes": "정확한 정보는 공식 발표를 확인하세요",
    },
    "vi": {
        "title": "Hướng dẫn an toàn khi {disaster}",
        "summary": "Các bước cơ bản khi {disaster} xảy ra. Hãy bình tĩnh.",
        "immediate_actions": [
            "Trước tiên hãy bảo vệ bản thân — che đầu và tránh xa những vật có thể rơi đổ",
            "Kiểm tra thông tin chính thức mới nhất",
            "Hãy sơ tán nếu được yêu cầu",
        ],
        "preparation_tips": [
            "Chuẩn bị sẵn túi đồ khẩn cấp",
            "Biết nơi sơ tán gần nhất",
        ],
        "evacuation_info": "Hãy sơ tán theo hướng dẫn của chính quyền địa phương",
        "emergency_contacts": f"Cảnh sát 110 / Cứu hỏa·Cấp cứu 119 / Cảnh sát biển 118 / Đường dây hỗ trợ khách nước ngoài {_HOTLINE}",
        "additional_notes": "Hãy kiểm tra công bố chính thức để có thông tin chính xác",
    },
    "th": {
        "title": "คู่มือความปลอดภัยเมื่อเกิด{disaster}",
        "summary": "สิ่งที่ควรทำเมื่อเกิด{disaster} กรุณาตั้งสติ",
        "immediate_actions": [
            "ป้องกันตัวเองก่อน — ปกป้องศีรษะและอยู่ห่างจากสิ่งของที่อาจล้ม",
            "ตรวจสอบข้อมูลล่าสุดจากทางการ",
            "อพยพเมื่อได้รับคำสั่ง",
        ],
        "preparation_tips": [
            "เตรียมกระเป๋าฉุกเฉินให้พร้อม",
            "ตรวจสอบจุดอพยพที่ใกล้ที่สุด",
        ],
        "evacuation_info": "กรุณาอพยพตามคำสั่งของหน่วยงานท้องถิ่น",
        "emergency_contacts": f"ตำรวจ 110 / ดับเพลิงและกู้ภัย 119 / ยามฝั่ง 118 / สายด่วนสำหรับนักท่องเที่ยวต่างชาติ {_HOTLINE}",
        "additional_notes": "กรุณาตรวจสอบประกาศทางการเพื่อข้อมูลที่ถูกต้อง",
    },
    "id": {
        "title": "Panduan Keselamatan {disaster}",
        "summary": "Langkah dasar saat terjadi {disaster}. Tetap tenang.",
        "immediate_actions": [
            "Lindungi diri Anda terlebih dahulu — lindungi kepala dan jauhi benda yang bisa jatuh",
            "Periksa informasi resmi terbaru",
            "Segera mengungsi jika diperintahkan",
        ],
        "preparation_tips": [
            "Siapkan tas darurat",
            "Ketahui lokasi pengungsian terdekat",
        ],
        "evacuation_info": "Ikuti instruksi dari pemerintah daerah setempat",
        "emergency_contacts": f"Polisi 110 / Pemadam·Ambulans 119 / Penjaga Pantai 118 / Hotline Wisatawan {_HOTLINE}",
        "additional_notes": "Periksa pengumuman resmi untuk informasi yang akurat",
    },
    "ms": {
        "title": "Panduan Keselamatan {disaster}",
        "summary": "Langkah asas apabila {disaster} berlaku. Bertenang.",
        "immediate_actions": [
            "Lindungi diri anda dahulu — lindungi kepala dan jauhi objek yang boleh tumbang",
            "Semak maklumat rasmi terkini",
            "Berpindah jika diarahkan",
        ],
        "preparation_tips": [
            "Sediakan beg kecemasan",
            "Ketahui tempat pemindahan terdekat",
        ],
        "evacuation_info": "Ikut arahan pihak berkuasa tempatan",
        "emergency_contacts": f"Polis 110 / Bomba·Ambulans 119 / Pengawal Pantai 118 / Hotline Pelawat {_HOTLINE}",
        "additional_notes": "Semak pengumuman rasmi untuk maklumat yang tepat",
    },
    "tl": {
        "title": "Gabay sa Kaligtasan sa {disaster}",
        "summary": "Mga pangunahing hakbang kapag may {disaster}. Manatiling kalmado.",
        "immediate_actions": [
            "Protektahan muna ang sarili — takpan ang ulo at lumayo sa mga bagay na maaaring bumagsak",
            "Suriin ang pinakabagong opisyal na impormasyon",
            "Lumikas kung inutusan",
        ],
        "preparation_tips": [
            "Maghanda ng emergency bag",
            "Alamin ang pinakamalapit na evacuation site",
        ],
        "evacuation_info": "Sundin ang tagubilin ng lokal na pamahalaan",
        "emergency_contacts": f"Pulis 110 / Bumbero·Ambulansya 119 / Coast Guard 118 / Hotline para sa Bisita {_HOTLINE}",
        "additional_notes": "Tingnan ang opisyal na anunsyo para sa tamang impormasyon",
    },
    "ne": {
        "title": "{disaster} सुरक्षा निर्देशिका",
        "summary": "{disaster} हुँदा गर्नुपर्ने आधारभूत कार्य। शान्त रहनुहोस्।",
        "immediate_actions": [
            "पहिले आफ्नो सुरक्षा गर्नुहोस् — टाउको बचाउनुहोस् र खस्न सक्ने वस्तुबाट पर बस्नुहोस्",
            "आधिकारिक नवीनतम जानकारी जाँच्नुहोस्",
            "निर्देशन आएमा तुरुन्त सुरक्षित स्थानमा जानुहोस्",
        ],
        "preparation_tips": [
            "आपतकालीन झोला तयार राख्नुहोस्",
            "नजिकको आश्रयस्थल थाहा पाउनुहोस्",
        ],
        "evacuation_info": "स्थानीय निकायको निर्देशन अनुसार सुरक्षित स्थानमा जानुहोस्",
        "emergency_contacts": f"प्रहरी 110 / दमकल·एम्बुलेन्स 119 / तटरक्षक 118 / विदेशी पर्यटक हेल्पलाइन {_HOTLINE}",
        "additional_notes": "सही जानकारीको लागि आधिकारिक घोषणा जाँच्नुहोस्",
    },
    "fr": {
        "title": "Guide de sécurité — {disaster}",
        "summary": "Les gestes essentiels en cas de {disaster}. Gardez votre calme.",
        "immediate_actions": [
            "Protégez-vous d'abord — couvrez votre tête et éloignez-vous des objets qui peuvent tomber",
            "Vérifiez les informations officielles les plus récentes",
            "Évacuez si on vous le demande",
        ],
        "preparation_tips": [
            "Préparez un sac d'urgence",
            "Repérez le lieu d'évacuation le plus proche",
        ],
        "evacuation_info": "Suivez les instructions des autorités locales",
        "emergency_contacts": f"Police 110 / Pompiers·Ambulance 119 / Garde-côtes 118 / Ligne d'assistance aux visiteurs {_HOTLINE}",
        "additional_notes": "Consultez les annonces officielles pour des informations exactes",
    },
    "de": {
        "title": "Sicherheitsleitfaden — {disaster}",
        "summary": "Die wichtigsten Schritte bei {disaster}. Bleiben Sie ruhig.",
        "immediate_actions": [
            "Schützen Sie sich zuerst — schützen Sie Ihren Kopf und halten Sie Abstand zu Gegenständen, die umfallen können",
            "Prüfen Sie die neuesten offiziellen Informationen",
            "Evakuieren Sie, wenn Sie dazu aufgefordert werden",
        ],
        "preparation_tips": [
            "Halten Sie eine Notfalltasche bereit",
            "Kennen Sie die nächste Evakuierungsstelle",
        ],
        "evacuation_info": "Folgen Sie den Anweisungen der örtlichen Behörden",
        "emergency_contacts": f"Polizei 110 / Feuerwehr·Rettungsdienst 119 / Küstenwache 118 / Hotline für Besucher {_HOTLINE}",
        "additional_notes": "Prüfen Sie offizielle Bekanntmachungen für genaue Informationen",
    },
    "it": {
        "title": "Guida alla sicurezza — {disaster}",
        "summary": "Le azioni essenziali in caso di {disaster}. Mantieni la calma.",
        "immediate_actions": [
            "Proteggi prima te stesso — copri la testa e allontanati dagli oggetti che possono cadere",
            "Controlla le informazioni ufficiali più recenti",
            "Evacua se ti viene richiesto",
        ],
        "preparation_tips": [
            "Tieni pronta una borsa d'emergenza",
            "Individua il punto di evacuazione più vicino",
        ],
        "evacuation_info": "Segui le indicazioni delle autorità locali",
        "emergency_contacts": f"Polizia 110 / Vigili del fuoco·Ambulanza 119 / Guardia costiera 118 / Assistenza ai visitatori {_HOTLINE}",
        "additional_notes": "Consulta gli annunci ufficiali per informazioni accurate",
    },
    "es": {
        "title": "Guía de seguridad — {disaster}",
        "summary": "Pasos básicos en caso de {disaster}. Mantén la calma.",
        "immediate_actions": [
            "Protégete primero — cúbrete la cabeza y aléjate de objetos que puedan caer",
            "Consulta la información oficial más reciente",
            "Evacúa si te lo indican",
        ],
        "preparation_tips": [
            "Ten preparada una mochila de emergencia",
            "Conoce el punto de evacuación más cercano",
        ],
        "evacuation_info": "Sigue las instrucciones de las autoridades locales",
        "emergency_contacts": f"Policía 110 / Bomberos·Ambulancia 119 / Guardia costera 118 / Línea de ayuda para visitantes {_HOTLINE}",
        "additional_notes": "Consulta los anuncios oficiales para obtener información precisa",
    },
    "easy_ja": {
        "title": "{disaster}の あんぜんガイド",
        "summary": "{disaster}が おきた ときに する ことです。おちついて ください。",
        "immediate_actions": [
            "まず あなたの あんぜんを まもって ください（あたまを まもる。たおれる ものから はなれる）",
            "あたらしい じょうほうを みて ください",
            "「にげて」と いわれたら にげて ください",
        ],
        "preparation_tips": [
            "ひじょうよう の かばんを じゅんびして ください",
            "ちかくの にげる ばしょを しらべて ください",
        ],
        "evacuation_info": "まちや むらの ひとの いう ことを きいて にげて ください",
        "emergency_contacts": f"けいさつ 110 / しょうぼう・きゅうきゅう 119 / かいじょうほあんちょう 118 / がいこくじん そうだん でんわ {_HOTLINE}",
        "additional_notes": "ただしい じょうほうは こうしきの おしらせを みて ください",
    },
}

# 出力に必ず含まれるフィールド
GUIDE_FIELDS = (
    "title",
    "summary",
    "immediate_actions",
    "preparation_tips",
    "evacuation_info",
    "emergency_contacts",
    "additional_notes",
)


def localized_disaster_name(disaster_type: str, target_lang: str) -> str:
    """災害種別名をその言語で返す。未知の種別は種別コードをそのまま返す。"""
    names = DISASTER_TYPES.get(disaster_type)
    if not names:
        return disaster_type
    return names.get(target_lang) or names.get(DEFAULT_LANG) or disaster_type


def build_fallback_guide(disaster_type: str, target_lang: Optional[str]) -> dict:
    """
    AI を使わずに安全ガイドを組み立てる。

    未対応の言語は英語にフォールバックする（日本語ではない点が重要 —
    外国人向けアプリで日本語に落とすと、読めない人に読めないものを返すことになる）。
    """
    lang = target_lang if target_lang in SAFETY_GUIDE_FALLBACK else DEFAULT_LANG
    template = SAFETY_GUIDE_FALLBACK[lang]
    disaster_name = localized_disaster_name(disaster_type, lang)

    guide = {
        "title": template["title"].format(disaster=disaster_name),
        "summary": template["summary"].format(disaster=disaster_name),
        "immediate_actions": list(template["immediate_actions"]),
        "preparation_tips": list(template["preparation_tips"]),
        "evacuation_info": template["evacuation_info"],
        "emergency_contacts": template["emergency_contacts"],
        "additional_notes": template["additional_notes"],
    }
    guide["cached"] = False
    # AI 生成ではなく静的フォールバックであることを呼び出し側が判別できるようにする
    guide["fallback"] = True
    guide["lang"] = lang
    return guide
