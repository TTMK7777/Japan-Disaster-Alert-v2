# 災害対応 API（FastAPI）のコンテナイメージ
#
# 想定デプロイ先: Cloud Run（min-instances=0）。
# SSE 接続がある間だけインスタンスが起き、誰も見ていない間は落ちる＝課金ゼロ。
# その代わり **Push 通知の配信元となるバックグラウンド監視も止まる**。
# 購読データ（SQLite）もインスタンスと一緒に消えるため、
# Push 通知を常時運用する段階では永続ストレージへの移行が必要（docs/ops/deployment.md 参照）。

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# 依存だけ先に入れてレイヤキャッシュを効かせる。
# pytest 系も入っているが、requirements.txt を分割すると CI 側の参照も変わるため
# ここでは分けない（イメージサイズより構成の一本化を優先）。
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY data ./data

# 非 root 実行。data/ は SQLite と翻訳キャッシュの書き込み先なので所有者を移す
RUN useradd --create-home --uid 1001 appuser \
    && mkdir -p /app/data \
    && chown -R appuser:appuser /app
USER appuser

# Cloud Run は $PORT を注入する（ローカル実行用に既定値を置く）
ENV PORT=8080
EXPOSE 8080

# exec 形式にして SIGTERM を uvicorn に届ける。
# これが無いと lifespan の終了処理（DB クローズ・HTTP クライアント解放）が走らない
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
