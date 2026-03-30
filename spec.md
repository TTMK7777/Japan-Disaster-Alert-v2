# Japan-Disaster-Alert-v2 -- 仕様書

## 概要
日本の災害情報（地震、津波、火山、天気警報）を16言語で提供するリアルタイム防災Webアプリケーション。在日外国人・訪日観光客向けに、気象庁・P2P地震情報ネットワークのデータをリアルタイム配信し、避難所検索やプッシュ通知を提供する。

## 機能一覧
- [x] リアルタイム地震データ: P2P earthquake networkからのライブフィード + 震度マップ
- [x] SSEリアルタイムストリーミング: Server-Sent Eventsで即時災害更新（ポーリングフォールバック付き）
- [x] JMA気象警報: 都道府県レベルの気象警報（28種類の注意事項）
- [x] 16言語対応: 上位10観光客出身国+在住者カバー（ハイブリッド翻訳エンジン）
- [x] 地域セグメント通知: 都道府県ベースのプッシュ通知（震度しきい値フィルタ）
- [x] 避難所検索: 現在地ベースの避難所検索（国土地理院CSV対応）
- [x] ダークモード: Light/Dark/System テーマ（FOUT防止）
- [x] PWA: オフライン対応、インストール可能、Service Worker v2
- [x] Web Push通知: VAPID認証によるリアルタイム地震/津波アラート
- [x] WCAG 2.1 AA: ズーム対応、スキップリンク、44pxタッチターゲット
- [x] レート制限API: エンドポイント別レート制限
- [x] 包括的テスト: 100+テスト（Vitest 66, Playwright E2E 28, pytest 38）
- [x] 警報重複排除: 同一警報コードを地域別にグループ化
- [x] i18n全16言語完全対応: 23コンポーネントキー x 16言語
- [ ] コードドクター: フロントエンド・バックエンド一括レビュー

## 技術スタック
- バックエンド: Python 3.11+ / FastAPI / SQLAlchemy (async) / aiosqlite / slowapi / pywebpush
- フロントエンド: Next.js 15 / React 19 / TypeScript / Tailwind CSS / Leaflet
- AI翻訳: Gemini API (gemini-2.0-flash) / Claude API（オプション）
- データソース: JMA (気象庁), P2P Earthquake Network
- テスト: pytest (38件), Vitest (66件), Playwright (28件)
- デプロイ: (情報なし -- 要調査)

## 非機能要件
- SSEリアルタイム配信（10秒ポーリング + ハートビート30秒）
- MAX_SSE_CLIENTS=500 でDoS防御
- レート制限: 一般60/翻訳20/安全ガイド10 per min
- リクエストサイズ制限: 1MB、翻訳テキスト5000文字
- WCAG 2.1 AA準拠

## 対応言語
ja, en, ko, zh, zh-TW, th, ms, id, tl, vi, fr, de, it, es, ne, easy_ja

## 用語定義
| 用語 | 定義 |
|------|------|
| P2P Earthquake Network | ピアツーピア方式で地震情報を共有するネットワーク |
| SSE | Server-Sent Events -- サーバーからクライアントへの一方向リアルタイム通信 |
| VAPID | Voluntary Application Server Identification -- Web Push認証方式 |
| FOUT | Flash of Unstyled Text -- テーマ切替時の一瞬のちらつき |
| easy_ja | やさしい日本語 -- 日本語学習者向けの簡易日本語 |
| JMA | Japan Meteorological Agency -- 気象庁 |
