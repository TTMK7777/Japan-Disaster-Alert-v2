# フロントエンド（Next.js）のコンテナイメージ
#
# next.config.js の output: 'standalone' が出す最小構成を runner に載せる。
#
# 注意: NEXT_PUBLIC_* は **ビルド時にクライアントバンドルへ焼き込まれる**。
# Cloud Run のランタイム環境変数では変えられないため、バックエンドの URL は
# ここで ARG として渡す。＝ backend を先にデプロイして URL を確定させる順序になる。

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# バックエンド（Cloud Run）の公開 URL。未指定ならローカル開発の既定値になる
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN useradd --create-home --uid 1001 nextjs

# public/ は SW・manifest・offline.html を含む。standalone には入らないので別途コピーする
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static

USER nextjs

ENV PORT=8080
EXPOSE 8080

# standalone が吐く自前サーバ。next start ではない
CMD ["node", "server.js"]
