// ============================================================
// [v1] 파티 실시간 게이트웨이 (Socket.io)
// pipeline: 게임 백엔드 / 실시간 멀티 (아키텍처 4절)
// 구현(요약): party:join / fragment:collect→broadcast / chat:message 골격.
//            룸=party:{id}. 조각 중복방지·랭킹의 Redis 원자처리는 TODO(김예슬)
// 구현일: 2026-06-10 | 작성: kys (base-pipeline/kys/v1)
// ============================================================
import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class PartyGateway {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(PartyGateway.name);

  /** 파티 룸 입장 → party:state 동기화 */
  @SubscribeMessage('party:join')
  onJoin(@MessageBody() body: { code: string }, @ConnectedSocket() client: Socket) {
    const room = `party:${body.code}`;
    client.join(room);
    // TODO(정찬희): Redis에서 파티 상태 로드 후 emit
    this.server.to(room).emit('party:state', { code: body.code, members: [] });
  }

  /** 조각 획득 → 파티 전체 broadcast.
   *  ⚠️ 실제 획득 인정(중복 방지)·랭킹은 서버가 Redis 원자처리 후 broadcast. */
  @SubscribeMessage('fragment:collect')
  onCollect(@MessageBody() body: { code: string; user_id: string; fragment_id: string }) {
    // TODO(김예슬): Redis Lua 원자 선점 → 성공 시에만 broadcast + ZADD 랭킹
    this.server
      .to(`party:${body.code}`)
      .emit('fragment:collected', { user_id: body.user_id, fragment_id: body.fragment_id });
  }

  /** 인게임 채팅 */
  @SubscribeMessage('chat:message')
  onChat(@MessageBody() body: { code: string; user_id: string; text: string }) {
    this.server
      .to(`party:${body.code}`)
      .emit('chat:message', { user_id: body.user_id, text: body.text });
  }
}
