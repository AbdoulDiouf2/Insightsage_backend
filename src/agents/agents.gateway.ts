import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseFilters, UsePipes, ValidationPipe, Logger } from '@nestjs/common';
import { AgentsService } from './agents.service';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  },
  namespace: 'agents',
})
export class AgentsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AgentsGateway.name);
  
  // Map pour suivre les sockets actifs par ID d'organisation
  private activeAgents = new Map<string, string>();

  constructor(private readonly agentsService: AgentsService) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token || client.handshake.query?.token;
    
    if (!token) {
      this.logger.warn(`Connection attempt without token from ${client.id}`);
      client.disconnect();
      return;
    }

    try {
      const agent = await this.agentsService.validateAgentToken(token);
      
      // Stocker l'association organizationId -> socketId
      this.activeAgents.set(agent.organizationId, client.id);
      this.agentsService.setAgentConnected(agent.organizationId);
      
      // Attacher les données à la socket pour usage ultérieur
      client.data.agentId = agent.id;
      client.data.organizationId = agent.organizationId;
      
      this.logger.log(`Agent ${agent.name} (${agent.id}) connected for org ${agent.organizationId}`);
      
      // Rejoindre une room spécifique à l'organisation
      client.join(`org_${agent.organizationId}`);
      
      client.emit('authenticated', { 
        status: 'ok', 
        organizationId: agent.organizationId,
        agentId: agent.id 
      });
    } catch (error) {
      this.logger.error(`Handshake failed: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    if (client.data.organizationId) {
      this.activeAgents.delete(client.data.organizationId);
      this.agentsService.setAgentDisconnected(client.data.organizationId);
      this.agentsService.failActiveJobsForOrg(client.data.organizationId).catch(() => {});
      this.logger.log(`Agent disconnected: ${client.data.agentId}`);
    }
  }

  /**
   * Envoie une requête SQL à un agent spécifique
   */
  async emitExecuteSql(organizationId: string, jobId: string, sql: string) {
    const socketId = this.activeAgents.get(organizationId);
    if (!socketId) {
      this.logger.warn(`No active agent found for organization ${organizationId}`);
      return false;
    }

    this.server.to(socketId).emit('execute_sql', { jobId, sql });
    return true;
  }

  /**
   * Reçoit le résultat d'une exécution SQL
   */
  @SubscribeMessage('sql_result')
  async handleSqlResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { jobId: string; result?: any; error?: string },
  ) {
    const organizationId = client.data.organizationId;
    if (!organizationId) return { status: 'error', message: 'Unauthorized' };

    this.logger.log(
      `Received result for job ${data.jobId} from org ${organizationId}`,
    );

    await this.agentsService.updateJobResult(
      data.jobId,
      organizationId,
      data.result,
      data.error,
    );

    return { status: 'received' };
  }

  /**
   * Reçoit les logs de l'agent pour centralisation
   */
  @SubscribeMessage('agent_log')
  async handleAgentLog(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { level: string; message: string; timestamp?: string },
  ) {
    const organizationId = client.data.organizationId;
    const agentId = client.data.agentId;
    if (!organizationId || !agentId) return { status: 'error', message: 'Unauthorized' };

    // Formatage simple pour les logs backend (console)
    this.logger.log(
      `[AGENT-LOG][${organizationId}] ${data.level.toUpperCase()}: ${data.message}`,
    );

    // Persistance en base de données
    await this.agentsService.createLog(organizationId, agentId, {
      level: data.level,
      message: data.message,
      timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
    });

    return { status: 'received' };
  }

  /**
   * Vérifie si un agent est connecté via WebSocket
   */
  isAgentConnected(organizationId: string): boolean {
    return this.activeAgents.has(organizationId);
  }
}
