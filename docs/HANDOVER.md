# 災害対応AIエージェントシステム - 引継ぎ資料

**作成日**: 2025年12月14日
**更新日**: 2025年12月18日
**バージョン**: MVP 1.2（外国人観光客向け最適化版）
**作成者**: AI開発チーム（Claude Code + Perplexity + Gemini）
**リポジトリ**: https://github.com/TTMK7777/Japan-Disaster-Alert

---

## 1. プロジェクト概要

### 1.1 目的
日本の災害対応時に、発災状況・被害状況・多言語避難情報・日常防災情報を一元的に自治体・法人・個人に提供するAIエージェントシステム。

### 1.2 ターゲットユーザー（v1.2で重点化）
- **訪日観光客**: 年間3,000万人超（TOP10カ国をカバー）- **最優先**
- **在留外国人**: 約340万人（特にベトナム人52万人、中国人79万人、ネパール人17万人）
- **技能実習生**: 40万人超（やさしい日本語対応）
- **自治体**: 外国人集住都市（100〜200自治体）

### 1.3 市場機会
- **防災DX市場**: 2025年度 約2,416億円（成長中）
- **防災庁設置**: 2026年11月1日発足予定
- **市場空白**: 個人向け × 多言語対応 × 一元化サービスは競合不在

---

## 2. 現在の実装状況

### 2.1 完成した機能

| 機能 | 状態 | 実装詳細 |
|------|------|----------|
| 地震情報取得 | ✅ 完成 | P2P地震情報APIからリアルタイム取得、30秒自動更新 |
| **地震マップ表示** | ✅ 完成 | Leaflet/国土地理院タイル、震度別マーカー、影響範囲表示 |
| 警報・注意報 | ✅ 完成 | 気象庁APIから取得、多言語対応 |
| **緊急連絡先** | ✅ 新規 | 110/119/118/観光客ホットライン、タップで発信 |
| 避難所検索 | ✅ 完成 | 位置情報ベース検索、多言語対応 |
| **16言語対応** | ✅ 完成 | 訪日客TOP10カ国をカバー |
| **ハイブリッド翻訳** | ✅ 完成 | 静的マッピング → Claude API → キャッシュの3層方式 |
| **震源地名翻訳** | ✅ 完成 | 75地名 × 15言語の静的マッピング |
| 震度別カラー表示 | ✅ 完成 | 気象庁準拠＋色覚多様性対応パターン |
| レスポンシブUI | ✅ 完成 | モバイル・デスクトップ両対応 |
| **PWA対応** | ✅ 完成 | オフライン対応、ホーム画面追加可能 |

### 2.2 v1.2での変更点（外国人観光客向け最適化）

| 変更 | 理由 |
|------|------|
| 天気予報タブ削除 | 観光客には他アプリで十分 |
| 火山情報タブ削除 | 緊急性が低く情報過多を防ぐ |
| チェックリスト削除 | 在住者向け機能を簡素化 |
| **緊急連絡先タブ追加** | 観光客に最重要（110/119/118） |
| 地図デフォルト表示 | リスト表示より直感的 |

### 2.3 対応言語（16言語）

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

### 2.4 未完成・次フェーズの機能

| 機能 | 状態 | 課題 |
|------|------|------|
| プッシュ通知 | ❌ 未実装 | FCM/APNs連携が必要 |
| LINE連携 | ❌ 未実装 | LINE Messaging API連携が必要 |
| SNS情報収集 | ❌ 未実装 | X API有料化（$100〜/月） |
| デマ検出AI | ❌ 未実装 | 自然言語処理モデル必要 |

### 2.5 技術スタック

```
バックエンド:
├── Python 3.12
├── FastAPI
├── httpx（非同期HTTP）
├── Pydantic（データ検証）
├── config.py（環境変数管理）
└── Claude API（未登録地名の翻訳用・オプション）

フロントエンド:
├── Next.js 15.5.9（セキュリティ修正済み）
├── React 19.0.1（セキュリティ修正済み）
├── TypeScript
├── Tailwind CSS
├── Leaflet 1.9 / react-leaflet 5.0.0
└── 国土地理院タイル（無料）

データソース:
├── 気象庁 JSON API（無料）
├── P2P地震情報 API（無料）
└── 国土地理院 指定緊急避難場所データ
```

---

## 3. セキュリティ対応

### 3.1 脆弱性修正（2025年12月実施）

| 項目 | 修正前 | 修正後 |
|------|--------|--------|
| Next.js | 14.2.0 | 15.5.9 |
| React | 18.3.0 | 19.0.1 |
| react-leaflet | 4.2.1 | 5.0.0 |
| CORS | `["*"]` | 環境変数制御 |

### 3.2 CORS設定

```python
# backend/app/config.py
allowed_origins: str = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:3001,http://localhost:8000"
)

# backend/app/main.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)
```

---

## 4. ファイル構成

```
災害対応AI/
├── .gitignore
├── PROJECT_PLAN.md
├── README.md
├── CODE_REVIEW_REFACTORING_REPORT.md  # コードレビュー結果
├── docs/
│   └── HANDOVER.md                    # 本引継ぎ資料
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                    # FastAPI エンドポイント
│   │   ├── config.py                  # 環境変数管理（新規）
│   │   ├── exceptions.py              # カスタム例外（新規）
│   │   ├── models.py
│   │   ├── utils/                     # ユーティリティ（新規）
│   │   └── services/
│   │       ├── jma_service.py
│   │       ├── p2p_service.py
│   │       ├── shelter_service.py
│   │       ├── translator.py
│   │       ├── tsunami_service.py
│   │       ├── volcano_service.py
│   │       ├── warning_service.py
│   │       └── location_translations.py
│   ├── requirements.txt
│   ├── run.py
│   └── venv/
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── globals.css
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx               # メイン（4タブ構成に変更）
│   │   └── components/
│   │       ├── AlertBanner.tsx
│   │       ├── EarthquakeList.tsx
│   │       ├── EarthquakeMap.tsx      # 地図表示（座標フィルタリング強化）
│   │       ├── EmergencyContacts.tsx  # 緊急連絡先（新規）
│   │       ├── IntensityGauge.tsx
│   │       ├── LanguageSelector.tsx
│   │       ├── ShelterMap.tsx
│   │       └── TsunamiAlert.tsx
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   └── tsconfig.json
└── data/
    └── translation_cache.json
```

---

## 5. 起動方法

### 5.1 開発環境

```bash
# プロジェクトディレクトリ
cd /home/ttsuj/Desktop/03_Business-Apps/災害対応AI

# バックエンド起動（ターミナル1）
cd backend
source venv/bin/activate
python run.py
# → http://localhost:8000

# フロントエンド起動（ターミナル2）
cd frontend
npm run dev
# → http://localhost:3001
```

### 5.2 APIテスト例

```bash
# 地震情報（英語）
curl "http://localhost:8000/api/v1/earthquakes?limit=5&lang=en"

# 警報・注意報
curl "http://localhost:8000/api/v1/warnings?lang=en"

# 避難所検索
curl "http://localhost:8000/api/v1/shelters?lat=35.6762&lon=139.6503&radius=5000&lang=en"

# 対応言語一覧
curl "http://localhost:8000/api/v1/languages"
```

---

## 6. API仕様

### 6.1 エンドポイント一覧

| エンドポイント | メソッド | パラメータ | 説明 |
|--------------|--------|-----------|------|
| `/` | GET | - | ヘルスチェック |
| `/api/v1/earthquakes` | GET | `limit`, `lang` | 地震情報取得（翻訳付き） |
| `/api/v1/warnings` | GET | `lang` | 警報・注意報取得 |
| `/api/v1/shelters` | GET | `lat`, `lon`, `radius`, `lang` | 避難所検索 |
| `/api/v1/translate` | POST | `text`, `target_lang` | テキスト翻訳 |
| `/api/v1/languages` | GET | - | 対応言語一覧 |

### 6.2 言語コード

```
ja, en, zh, zh-TW, ko, vi, th, id, ms, tl, fr, de, it, es, ne, easy_ja
```

---

## 7. 今後の開発予定

### 7.1 優先度: 高

1. **プッシュ通知**
   - FCM (Firebase Cloud Messaging)
   - Service Worker

2. **多言語音声読み上げ**
   - Web Speech API
   - 緊急時の音声ガイダンス

### 7.2 優先度: 中

3. **LINE公式アカウント連携**
   - LINE Messaging API
   - 月200通無料枠

4. **オフライン地図キャッシュ**
   - 国土地理院タイルのローカル保存

### 7.3 優先度: 低

5. **デマ検出AI**
6. **自治体向け管理画面**

---

## 8. 既知の問題・注意点

### 8.1 技術的な注意

1. **Claude APIキー**: 未設定でも動作するが、未登録地名は日本語のまま返却
2. **座標フィルタリング**: 日本範囲外（緯度20-50、経度120-155外）は除外
3. **レート制限**: 気象庁APIは過度なアクセスを避ける

### 8.2 法的・運用上の注意

1. **免責事項**: 災害情報の誤配信リスクへの法的対応が必要
2. **個人情報**: 位置情報取得時の同意取得
3. **24時間運用**: 災害時の可用性確保

---

## 9. 参考リンク

- [気象庁 気象データ高度利用ポータル](https://www.data.jma.go.jp/developer/index.html)
- [P2P地震情報 API仕様](https://www.p2pquake.net/develop/)
- [Next.js ドキュメント](https://nextjs.org/docs)
- [FastAPI ドキュメント](https://fastapi.tiangolo.com/)
- [Claude API](https://docs.anthropic.com/)
- [国土地理院タイル](https://maps.gsi.go.jp/development/ichiran.html)

---

**以上、引継ぎ資料終わり**

次のステップとして、**プッシュ通知機能** の実装を推奨します。
