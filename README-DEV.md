# 로컬 개발 환경 (게임 루프 실행)

게임 루프는 Postgres·Redis에 의존한다. 둘 중 하나라도 없으면 진행도가 저장되지 않는다.

## 1. 의존 서비스

```bash
# 형제 폴더 dokkaebi-infra에서 (권장)
cd ../dokkaebi-infra && docker compose up -d postgres redis
```

Docker 없이 로컬 설치를 쓴다면 compose와 같은 자격증명을 만들어 둔다:

```bash
psql -d postgres -c "CREATE ROLE dokkaebi LOGIN PASSWORD 'dokkaebi' CREATEDB;"
psql -d postgres -c "CREATE DATABASE dokkaebi OWNER dokkaebi;"
psql -d postgres -c "CREATE DATABASE dokkaebi_test OWNER dokkaebi;"   # 테스트 베이스

# CREATEDB 권한이 필요한 이유: 테스트가 스위트별 DB(dokkaebi_test_quest 등)를
# 자동 생성한다. 이미 역할을 만들었다면: ALTER ROLE dokkaebi CREATEDB;
```

## 2. 기동

```bash
npm install
npm run build && npm start        # http://localhost:8000  (docs: /docs)
```

스키마는 `DB_SYNC=true`(기본)일 때 자동 생성된다. **배포에서는 `DB_SYNC=false`** 로 두고 migration을 쓸 것.

AI 백엔드(dokkaebi-ai)가 :8001에 떠 있어야 시나리오 생성이 된다.

## 3. 테스트

```bash
npm test
```

- `src/common/geo.spec.ts` — 거리·반경·이동속도 순수 함수 (DB 불필요)
- `test/quest-loop.spec.ts` · `core-modules.spec.ts` · `upstream-errors.spec.ts` — E2E.
  **스위트마다 자기 DB를 쓴다**(`dokkaebi_test_quest` / `_core` / `_upstream`).
  `globalSetup`이 없으면 만들어 준다 — 역할에 `CREATEDB` 권한이 필요하다.
  AI 백엔드는 스텁으로 대체하므로 네트워크·LLM 호출은 없다.

> 하나의 DB를 공유하면 `dropSchema`/`synchronize`가 서로를 밟아 **간헐적으로** 깨진다
> (실측: 같은 커밋이 통과 ↔ 10건 실패). `maxWorkers=1`로 직렬화해도 커넥션 정리
> 타이밍 때문에 완전히 없어지지 않아 DB 자체를 분리했다. 분리 후 10회 연속 통과.

> sqlite 인메모리로 대체하지 않은 이유: 드라이버 방언 차이를 sqlite가 가려서
> Postgres에서만 깨지는 경우가 실제로 있었다(`timestamp` 매핑).

## 4. 게임 루프 API 흐름

```
POST /v1/auth/guest                                   → token
POST /v1/scenarios/custom                             → scenario_id (자동 저장)
POST /v1/runs {scenario_id}                           → run_id, entry_node_id
POST /v1/runs/:runId/nodes/:nodeId/verify-location    → GPS 판정
POST /v1/runs/:runId/nodes/:nodeId/collect            → 조각 획득
POST /v1/runs/:runId/nodes/:nodeId/complete           → 보상 + next_node_id
GET  /v1/runs/:runId                                  → 진행도 복원
```

모든 `/runs/*`는 `Authorization: Bearer <token>` 필수.

### 판정 규칙 (전부 `src/config/configuration.ts`의 `quest`)

| 항목 | 기본값 | env |
|---|---|---|
| 기본 트리거 반경 | 100m | `QUEST_TRIGGER_RADIUS_M` |
| GPS 정확도 상한 | 100m | `QUEST_GPS_ACCURACY_MAX_M` |
| 허용 이동속도 | 30m/s (≈108km/h) | `QUEST_MAX_SPEED_MPS` |
| 조각당 경험치 | 100 | `QUEST_EXP_PER_FRAGMENT` |
| 완주 보너스 | 500 | `QUEST_EXP_FINALE_BONUS` |
