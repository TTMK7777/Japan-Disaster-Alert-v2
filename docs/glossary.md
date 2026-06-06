# 用語集 (Glossary)

Japan Disaster Alert で使われるプロジェクト固有の用語を定義します。

| 用語 | 定義 |
|------|------|
| **JMA** | Japan Meteorological Agency（気象庁）。気象警報・津波・火山情報の公式データソース。 |
| **P2P Earthquake Network** | ピアツーピア方式で地震情報を共有するネットワーク。地震データのライブフィード元（[p2pquake.net](https://www.p2pquake.net/)）。 |
| **SSE** | Server-Sent Events。サーバーからクライアントへの一方向リアルタイム通信。本アプリの災害更新配信（`/api/v1/events/stream`）に使用。 |
| **ポーリングフォールバック** | SSE 接続が確立できない / 切断された場合に、定期的な HTTP リクエストへ切り替えて更新を取得する仕組み。 |
| **ハートビート** | SSE 接続の維持確認のため、30 秒ごとに送出される無害なイベント。 |
| **MAX_SSE_CLIENTS** | 同時 SSE 接続数の上限（既定 500）。DoS 防御のための制限。 |
| **VAPID** | Voluntary Application Server Identification。Web Push 通知の認証方式。公開鍵／秘密鍵で送信元を識別する。 |
| **Web Push** | ブラウザのプッシュ通知機構。地震・津波アラートの配信に使用（`pywebpush`）。 |
| **地域セグメント通知** | 47 都道府県コードと震度しきい値に基づき、対象地域の購読者のみへ通知を送る仕組み。 |
| **ハイブリッド翻訳エンジン** | 静的辞書 → AI 翻訳（Gemini / Claude）→ DB キャッシュの 3 層で文字列を翻訳する方式。AI キー未設定でも静的辞書で動作する。 |
| **L1 / L2 キャッシュ** | 翻訳キャッシュの 2 層構造。L1 はインメモリ、L2 は DB バック（永続化）。 |
| **easy_ja** | やさしい日本語。日本語学習者向けの簡易日本語ロケール。 |
| **FOUT** | Flash of Unstyled Text。テーマ切替時に一瞬発生するちらつき。本アプリは blocking inline script で防止。 |
| **PWA** | Progressive Web App。インストール可能でオフライン対応の Web アプリ。Service Worker（`public/sw.js`、v2）で実現。 |
| **Service Worker (SW)** | ブラウザのバックグラウンドスクリプト。オフラインキャッシュとプッシュ受信を担う。 |
| **WCAG 2.1 AA** | Web アクセシビリティ達成基準。ズーム有効化・スキップリンク・44px タッチターゲットなどに準拠。 |
| **避難所 (Shelter)** | 国土地理院（GSI）の CSV データに基づく避難所情報。現在地から近い避難所を検索する。 |
| **GSI** | 国土地理院（Geospatial Information Authority of Japan）。避難所 CSV データの提供元。 |
| **レート制限 (Rate Limiting)** | エンドポイントごとに単位時間あたりのリクエスト数を制限する仕組み（`slowapi`）。一般 60／翻訳 20／安全ガイド 10（毎分）。 |
| **Management Token** | Push 購読の所有者検証に用いるトークン。IDOR（他人のリソース参照）を防止するために導入。 |
