# [v1] dokkaebi-server 컨테이너 이미지 (base-pipeline/kys/v1, 2026-06-10)
# pipeline: 배포 — 핫패스 persistent 컨테이너(아키텍처 9절)
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 8000
CMD ["node", "dist/main"]
