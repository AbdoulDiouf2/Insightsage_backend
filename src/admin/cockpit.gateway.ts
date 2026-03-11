import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  },
  namespace: 'cockpit',
})
export class CockpitGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(CockpitGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token || client.handshake.query?.token;

    if (!token) {
      this.logger.warn(`Cockpit connection attempt without token: ${client.id}`);
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify(token);
      const organizationId = payload.organizationId;
      
      if (!organizationId) {
        this.logger.warn(`Cockpit token without organizationId: ${client.id}`);
        client.disconnect();
        return;
      }

      client.data.user = payload;
      client.data.organizationId = organizationId;

      this.logger.log(`User ${payload.email} connected to cockpit for org ${organizationId}`);
      
      client.join(`org_${organizationId}`);
      
      client.emit('authenticated', { status: 'ok' });
    } catch (error) {
      this.logger.error(`Cockpit handshake failed: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Cockpit client disconnected: ${client.id}`);
  }

  @OnEvent('agent.log.created')
  handleAgentLogCreated(payload: { organizationId: string; log: any }) {
    this.logger.debug(`Broadcasting agent log to org_${payload.organizationId}`);
    this.server.to(`org_${payload.organizationId}`).emit('agent_log_received', payload.log);
  }
}
