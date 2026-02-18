# 災害対応AIエージェントシステム

多言語対応の災害情報提供システム。在留外国人・訪日観光客を含む全ての人々に、迅速かつ正確な災害情報を提供します。

## 主な機能

- **地震情報**: P2P地震情報からリアルタイム取得
- **気象情報**: 都道府県別の天気概況（気象庁API）
- **多言語対応**: 16言語対応（訪日客TOP10カ国をカバー）
- **ハイブリッド翻訳**: 静的マッピング → Claude API → キャッシュの3層方式
- **避難所検索**: 現在地周辺の避難所表示（開発中）

## 技術スタック

### バックエンド
- Python 3.12
- FastAPI
- httpx（非同期HTTPクライアント）
- Claude API（未登録地名の翻訳用・オプション）

### フロントエンド
- Next.js 14
- React 18
- TypeScript
- Tailwind CSS

### データソース
- [気象庁 気象データ高度利用ポータル](https://www.data.jma.go.jp/developer/index.html)
- [P2P地震情報 API](https://www.p2pquake.net/)

## セットアップ

### 必要条件
- Python 3.11以上
- Node.js 18以上
- npm

### バックエンド

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # Windows: .\venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

バックエンドは http://localhost:8000 で起動します。
APIドキュメントは http://localhost:8000/docs で確認できます。

### フロントエンド

```bash
cd frontend
npm install
npm run dev
```

フロントエンドは http://localhost:3000 で起動します。

### 一括起動

```bash
chmod +x scripts/start_dev.sh
./scripts/start_dev.sh
```

## API エンドポイント

| エンドポイント | メソッド | 説明 |
|--------------|--------|------|
| `/` | GET | ヘルスチェック |
| `/api/v1/earthquakes` | GET | 地震情報取得 |
| `/api/v1/weather/{area_code}` | GET | 天気情報取得 |
| `/api/v1/alerts` | GET | 警報・注意報取得 |
| `/api/v1/translate` | POST | テキスト翻訳 |
| `/api/v1/shelters` | GET | 避難所検索 |
| `/api/v1/languages` | GET | 対応言語一覧 |

### クエリパラメータ

- `lang`: 言語コード（ja, en, zh, zh-TW, ko, vi, th, id, ms, tl, fr, de, it, es, ne, easy_ja）
- `limit`: 取得件数

## プロジェクト構造

```
災害対応AI/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPIアプリケーション
│   │   ├── models.py         # データモデル
│   │   └── services/
│   │       ├── jma_service.py           # 気象庁API連携
│   │       ├── p2p_service.py           # P2P地震情報連携
│   │       ├── translator.py            # 多言語翻訳サービス
│   │       └── location_translations.py # 震源地名静的翻訳（75地名×15言語）
│   ├── requirements.txt
│   └── run.py
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   └── globals.css
│   │   └── components/
│   │       ├── LanguageSelector.tsx
│   │       ├── EarthquakeList.tsx
│   │       ├── WeatherInfo.tsx
│   │       └── AlertBanner.tsx
│   └── package.json
├── docs/
├── scripts/
│   └── start_dev.sh
├── PROJECT_PLAN.md
└── README.md
```

## 対応言語（16言語）

訪日客TOP10カ国（2024年）を網羅した多言語対応。

| コード | 言語 | 対象国・地域 | 訪日客数(2024) |
|-------|------|------------|--------------|
| ja | 日本語 | 日本 | - |
| ko | 한국어 | 韓国 | 881万人（1位） |
| zh | 简体中文 | 中国 | 698万人（2位） |
| zh-TW | 繁體中文 | 台湾・香港 | 872万人（3位+5位） |
| en | English | 米国・豪州・欧米 | 272万人（4位） |
| th | ภาษาไทย | タイ | 10位 |
| ms | Bahasa Melayu | マレーシア | 11位 |
| id | Bahasa Indonesia | インドネシア | 15位 |
| tl | Filipino | フィリピン | 技能実習生多数 |
| vi | Tiếng Việt | ベトナム | 在留52万人 |
| fr | Français | フランス | 16位 |
| de | Deutsch | ドイツ | 14位 |
| it | Italiano | イタリア | 17位 |
| es | Español | スペイン | 18位 |
| ne | नेपाली | ネパール | 在留17万人 |
| easy_ja | やさしい日本語 | 日本語学習者 | - |

## 今後の開発予定

- [ ] 避難所マップ機能（Leaflet/OpenStreetMap）
- [ ] プッシュ通知（FCM/APNs）
- [ ] LINE公式アカウント連携
- [ ] SNS情報収集・デマ検出
- [ ] 自治体向け管理画面
- [x] ハイブリッド翻訳システム（静的マッピング + Claude API + キャッシュ）
- [x] 16言語対応（訪日客TOP10カ国カバー）

## ライセンス

MIT License

## 免責事項

本システムは参考情報を提供するものであり、公式の災害情報に代わるものではありません。
災害時は必ず公式発表（気象庁、自治体等）をご確認ください。

---

**開発**: Taimu Tsuji
