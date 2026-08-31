# [v1] dokkaebi-server 컨테이너 이미지 (base-pipeline/kys/v1, 2026-06-10)
# pipeline: 배포 — 핫패스 persistent 컨테이너(아키텍처 9절)
FROM node:20-slim AS build
# better-sqlite3(typeorm peer)가 node-gyp 네이티브 빌드를 요구 — python3/make/g++ 필요
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 8000
CMD ["node", "dist/main"]
