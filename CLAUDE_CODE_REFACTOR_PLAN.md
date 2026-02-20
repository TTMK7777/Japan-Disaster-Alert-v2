# 災害対応AI - Claude Code向けリファクタリング計画書

既存の「コードレビュー・デバッグ・リファクタリング報告書」に基づき、優先度の高い「Phase 1」の修正をClaude Codeに実行させるための具体的な手順書です。

## 🎯 目的
バックエンド（FastAPI）のコード品質向上、保守性の改善、および本番運用に向けた堅牢化。

## 📂 対象ディレクトリ
`backend/app/`

---

## 🛠️ Claude Code 実行手順

### 手順1: ログ出力の統一（最優先）
**目的**: `print()` 文を排除し、適切なログレベルで出力する基盤を作る。

**Claude Codeへの指示プロンプト:**
```text
`backend/app` のリファクタリングを行います。
まず、ロギング基盤を整備してください。

1. `backend/app/utils/logger.py` を作成（または修正）し、標準の `logging` モジュールを使用した `get_logger` 関数を実装してください。
   - 本番環境（ENVIRONMENT=production）ではINFO以上、それ以外はDEBUGレベルを出力するように設定。
   - フォーマットには時刻、モジュール名、ログレベルを含めてください。

2. `backend/app` 以下のすべてのPythonファイル（特に `services/` 内）をスキャンし、`print()` 文をすべて `logger.info()` や `logger.error()` などの適切なメソッドに置き換えてください。
```

---

### 手順2: 設定管理の集約（Config化）
**目的**: ハードコードされた値（APIキー、URL、タイムアウト値）を `config.py` に集約する。

**Claude Codeへの指示プロンプト:**
```text
設定管理を改善します。
`backend/app/config.py` を作成し、Pydanticの `BaseSettings` を使用して環境変数を管理する `Settings` クラスを実装してください。

以下の項目を管理対象にしてください：
- API設定（タイムアウト値、外部APIのベースURL）
- キャッシュ設定（キャッシュファイルのパス、ディレクトリ）
- 環境設定（ENVIRONMENT, LOG_LEVEL）
- APIキー（Claude, Geminiなど）

その後、`main.py` や `services/` 内で `os.getenv` やハードコードされた値を使っている箇所を、`settings` オブジェクトを参照するように修正してください。
```

---

### 手順3: エラーハンドリングの統一
**目的**: 各エンドポイントで重複しているエラー処理（try-exceptブロック）を削除し、デコレータで統一する。

**Claude Codeへの指示プロンプト:**
```text
エラーハンドリングの重複コードを解消します。
`backend/app/utils/error_handler.py` を作成し、`handle_errors` デコレータを実装してください。

仕様:
- 関数実行時の例外をキャッチする。
- `HTTPException` はそのまま再送出する。
- その他の例外はログに出力（`logger.error(..., exc_info=True)`）した上で、500エラーとして送出する。
- 本番環境では詳細なエラーメッセージを隠蔽するロジックを含める。

その後、`backend/app/main.py` の各エンドポイントにある `try-except` ブロックを削除し、代わりに `@handle_errors` デコレータを適用してください。
```

---

### 手順4: 依存関係の更新
**目的**: セキュリティリスクを低減する。

**Claude Codeへの指示プロンプト:**
```text
`backend/requirements.txt` を確認し、主要なライブラリ（fastapi, uvicorn, httpx, pydanticなど）のバージョンを最新の安定版に更新してください。
互換性に注意しながら更新を行ってください。
```

---

### 🔍 検証方法

リファクタリング完了後、以下のコマンドでサーバーが正常に起動し、APIが応答することを確認してください。

```bash
cd backend
python run.py
# ブラウザで http://localhost:8000/docs を開き、ヘルスチェックやAPIが動作するか確認
```
