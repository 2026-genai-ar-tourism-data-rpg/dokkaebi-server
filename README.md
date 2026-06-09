# dokkaebi-server

> TourAPI 수집·저장, 퀘스트·유저·인증, Socket.io 실시간 동기화를 담당하는 핵심 백엔드.

API 서버와 실시간 서버를 같은 Node 런타임으로 묶어 한 컨테이너로 배포합니다.

## Clone

```bash
git clone https://github.com/2026-genai-ar-tourism-data-rpg/dokkaebi-server.git
cd dokkaebi-server
```

## 스택

- **런타임**: Node.js + NestJS (or Express)
- **실시간**: Socket.io
- **DB**: PostgreSQL (관광지·퀘스트·유저)
- **캐시**: Redis (위치 데이터 캐싱 + 세션 + 멀티유저 룸 상태)

## 책임 범위

### 데이터 수집 및 저장
- TourAPI **배치 수집 워커 + 실시간 조회** 병행
- 수집 데이터 → DB 저장, 위치 데이터 → Redis 캐싱
- API 장애 시 캐시 데이터로 서비스 유지(폴백)

### 게임 구조로 변환
- 관광지 좌표(mapX, mapY) → 퀘스트 마커 / AR 인터랙션 트리거 기준점
- 카테고리 코드 → 관광지 유형별 퀘스트 자동 분류
- 행사·축제 기간 데이터 → 시즌 한정 퀘스트 자동 생성 및 만료

### 게임 로직
- GPS 반경 진입 검증
- 방문 혼잡도 기반 보상 가중치 (저방문 관광지일수록 높은 보상)

### 실시간 멀티유저
- Socket.io 동기화: 최대 4인 협력 파티, 단서 실시간 공유, 인게임 채팅
- 경쟁 모드 랭킹·리더보드

## 결합 방식

NPC 대사·개인화 힌트·사이드퀘스트가 필요하면 [`dokkaebi-ai`](./dokkaebi-ai.md)를 **내부 HTTP**로 호출합니다.

## 의존 레포

- [`dokkaebi-ai`](./dokkaebi-ai.md) — 생성형 AI / NPC 서비스
- [`dokkaebi-infra`](./dokkaebi-infra.md) — 배포·환경 설정
