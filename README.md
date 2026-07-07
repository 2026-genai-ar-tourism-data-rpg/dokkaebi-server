# dokkaebi-server

> 퀘스트·유저·인증, 실시간 멀티(Socket.io), TourAPI 노드 데이터를 담당하는 게임 백엔드. **NestJS(Node.js)** + Socket.io.

REST API와 실시간 서버를 같은 Node 런타임으로 묶어 한 컨테이너로 배포(핫패스). NPC 대사는 내부적으로 `dokkaebi-ai`로 프록시.

---

## 빠른 시작 (개발)

> 요구: **Node.js 20+**

```bash
git clone https://github.com/2026-genai-ar-tourism-data-rpg/dokkaebi-server.git
cd dokkaebi-server

npm install
cp .env.example .env          # PORT·DB·Redis·AI_BASE_URL

npm run start:dev             # 워치 모드 (nest start --watch)
#  → http://localhost:8000/v1/health
#  → Swagger UI: http://localhost:8000/docs
```

> ⚠️ 호스트 포트 8000이 이미 점유돼 있으면 `.env`의 `PORT` 변경(예: 8088).

### 빌드 / 실행

```bash
npm run build && npm start    # dist/main 실행
```

---

## 디렉터리 구조

```
src/
├── main.ts                 부팅 — 전역 prefix(v1)·ValidationPipe·Swagger(/docs)
├── app.module.ts           루트 모듈 (도메인 모듈 조립)
├── config/configuration.ts env(PORT·DATABASE_URL·REDIS_URL·AI_BASE_URL)
├── health/                 GET /v1/health
├── ai/                     ── AI 백엔드 프록시 ──
│   └── ai.client.ts          POST {AI_BASE_URL}/v1/dialogue 호출
├── quest/                  ── 게임 루프 (상태머신 ARRIVED→REWARDED) ──
│   ├── quest.controller.ts   verify-location · dialogue · collect · complete
│   ├── quest.service.ts      게임 로직(스텁)
│   └── dto/quest.dto.ts      요청 검증(class-validator)
├── party/                  ── 실시간 멀티 ──
│   ├── party.controller.ts   POST /parties · /parties/:code/join
│   ├── party.gateway.ts      Socket.io: party:join · fragment:collect · chat:message
│   └── party.service.ts
├── user/                   GET /v1/me (탐사등급·방문률·도감)
├── map/                    GET /v1/regions/:id/nodes · /nodes/:id
└── scenario/               POST /v1/scenarios/custom (맞춤 시나리오)
```

**API 계약**: 엔드포인트는 조직 `.github` 레포 `contracts/server-openapi.yaml` 과 1:1. 부팅 시 `/docs`(Swagger)로도 노출.

**서버 ↔ AI**: `POST /v1/quests/:id/dialogue` → `AiClient` → `dokkaebi-ai POST /v1/dialogue`.

---

## 스택

- **런타임/프레임워크**: Node.js 20 + **NestJS** (모듈·DI·데코레이터)
- **실시간**: Socket.io (`@nestjs/platform-socket.io`)
- **DB/캐시**: PostgreSQL · Redis (룸 상태·랭킹·세션)
- **문서**: `@nestjs/swagger` (/docs)

## 책임 범위 (요약)

- 퀘스트·GPS 인증·보상, 유저 진행·도감, 맞춤/공용 시나리오
- 실시간 멀티(4인 파티·조각 동기화·랭킹·채팅) — **조각 중복방지·랭킹은 Redis 원자처리**
- TourAPI 노드 데이터 조회(+수집 워커는 배치)
- NPC 대사는 `dokkaebi-ai` 프록시

## 코딩 컨벤션 (이 레포 필수)

- 파일 헤더 주석 `[v1]`·역할·파이프라인 위치·구현 요약·구현일
- 모듈 최대 분리, 매직넘버/URL은 `config`로, 브랜치 `<기능>/<이름>/<버전>`(예: `base-pipeline/kys/v1`)→`dev` PR
- 상세: 조직 `.github` 레포 `CONTRIBUTING.md` · `report/개발계획.md`

## 의존

- [`dokkaebi-ai`](https://github.com/2026-genai-ar-tourism-data-rpg/dokkaebi-ai) — NPC 대사 생성(내부 HTTP)
- [`dokkaebi-infra`](https://github.com/2026-genai-ar-tourism-data-rpg/dokkaebi-infra) — compose·배포
