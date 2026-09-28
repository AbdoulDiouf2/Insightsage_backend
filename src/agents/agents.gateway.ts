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
import { UseFilters, UsePipes, ValidationPipe, Logger, Optional, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AgentsService } from './agents.service';
import { DataJobV2Service } from '../data-engine/jobs/data-job-v2.service';
import { DataJobV2Dispatcher } from '../data-engine/jobs/data-job-v2.dispatcher';
import { QueryFailure } from '../data-engine/contracts/query-error';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  },
  namespace: 'agents',
  pingInterval: 10000,
  pingTimeout: 5000,
})
export class AgentsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AgentsGateway.name);
  
  // Map pour suivre les sockets actifs par ID d'organisation
  private activeAgents = new Map<string, string>();

  constructor(private readonly agentsService: AgentsService, private readonly dataJobsV2: DataJobV2Service,
    @Optional() private readonly dispatcher?: DataJobV2Dispatcher) {}
  onModuleInit() {
    this.dispatcher?.registerTransport({
      agentFor: organizationId => {
        const id = this.activeAgents.get(organizationId);
        const socket = id && ((this.server as any).sockets?.get?.(id) ??
          (this.server as any).sockets?.sockets?.get?.(id));
        return socket?.data?.v2Capable ? socket.data.agentId : undefined;
      },
      send: (organizationId, agentId, payload) => {
        const id = this.activeAgents.get(organizationId);
        const socket = id && ((this.server as any).sockets?.get?.(id) ??
          (this.server as any).sockets?.sockets?.get?.(id));
        if (!socket?.data?.v2Capable || socket.data.agentId !== agentId) return false;
        this.server.to(id!).emit('execute_query_v2', payload);
        return true;
      },
    });
  }

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
      if (this.activeAgents.get(client.data.organizationId) === client.id)
        this.activeAgents.delete(client.data.organizationId);
      this.dispatcher?.disconnected(client.data.organizationId, client.data.agentId);
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

  // Événements V2 séparés ; aucun agent V1 ne les émet.
  @SubscribeMessage('agent_hello_v2')
  handleAgentHelloV2(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { protocolVersions: number[]; capabilities: string[] },
  ) {
    const { organizationId, agentId } = client.data;
    const protocolVersion = Array.isArray(data?.protocolVersions) && data.protocolVersions.includes(2)
      ? 2 : Array.isArray(data?.protocolVersions) && data.protocolVersions.includes(1) ? 1 : 'unsupported';
    const identity = `agentId=${agentId ?? 'unknown'} organizationId=${organizationId ?? 'unknown'} protocolVersion=${protocolVersion}`;
    this.logger.log(`agent_hello_v2 received ${identity}`);
    const reason = !organizationId || !agentId ? 'UNAUTHENTICATED_SOCKET'
      : !Array.isArray(data?.protocolVersions) || !data.protocolVersions.includes(2) ? 'UNSUPPORTED_PROTOCOL_VERSION'
      : !Array.isArray(data.capabilities) ? 'INVALID_CAPABILITIES'
      : !data.capabilities.includes('query_parameters') ? 'MISSING_QUERY_PARAMETERS'
      : !data.capabilities.includes('typed_schema') ? 'MISSING_TYPED_SCHEMA'
      : null;
    if (reason) {
      this.logger.warn(`agent_hello_v2 accepted=false reason=${reason} ${identity}`);
      return { status: 'rejected' };
    }
    client.data.v2Capable = true;
    this.logger.log(`agent_hello_v2 accepted=true ${identity} capabilities=query_parameters,typed_schema`);
    return { status: 'accepted', protocolVersion: 2 };
  }

  @SubscribeMessage('query_acknowledged_v2')
  async handleQueryAcknowledgedV2(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { protocolVersion: 2; jobId: string; queryId: string; sequence: number },
  ) {
    const { organizationId, agentId } = client.data;
    if (!organizationId || !agentId || !client.data.v2Capable || data?.protocolVersion !== 2 ||
        !this.dispatcher?.isPending(data.jobId, organizationId, agentId, data.queryId, data.sequence))
      return { status: 'rejected' };
    const transition = await this.dataJobsV2.transition(data.jobId, organizationId,
      ['DISPATCHED'], 'RUNNING', agentId);
    this.logger.log(`query_acknowledged_v2 queryId=${data.queryId} jobId=${data.jobId} agentId=${agentId} organizationId=${organizationId} state=${transition.job.state}`);
    return { status: transition.changed || transition.job.state === 'RUNNING' ? 'received' : 'ignored' };
  }

  @SubscribeMessage('query_result_v2')
  async handleQueryResultV2(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { protocolVersion: 2; jobId: string; queryId: string; sequence: number;
      status?: 'success' | 'error'; rows?: Record<string, unknown>[]; error?: { code?: string } },
  ) {
    const { organizationId, agentId } = client.data;
    if (!organizationId || !agentId || !client.data.v2Capable || data?.protocolVersion !== 2 ||
        !this.dispatcher?.isPending(data.jobId, organizationId, agentId, data.queryId, data.sequence))
      return { status: 'rejected' };
    this.logger.log(`query_result_v2 queryId=${data.queryId} jobId=${data.jobId} agentId=${agentId} organizationId=${organizationId} status=${data.status === 'success' ? 'success' : 'error'} rows=${Array.isArray(data.rows) ? data.rows.length : 0}`);
    if (data.status === 'error' || data.error) {
      this.dispatcher.fail(data.jobId, organizationId, agentId, data.queryId, data.sequence,
        new QueryFailure(
          ['QUERY_TIMEOUT', 'RESULT_TOO_LARGE', 'SOURCE_SCHEMA_MISMATCH'].includes(data.error?.code ?? '')
            ? data.error!.code as any : 'SOURCE_UNAVAILABLE',
          'Erreur source remontée par l’agent V2'));
      return { status: 'received' };
    }
    if (!Array.isArray(data.rows) || data.rows.length > 1000 ||
        Buffer.byteLength(JSON.stringify(data.rows)) > 1048576)
      return { status: this.dispatcher.fail(data.jobId, organizationId, agentId,
        data.queryId, data.sequence, new QueryFailure('RESULT_TOO_LARGE', 'Réponse agent invalide'))
        ? 'received' : 'ignored' };
    return { status: this.dispatcher.receive(data.jobId, organizationId, agentId,
      data.queryId, data.sequence, data.rows) ? 'received' : 'ignored' };
  }

  /**
   * Reçoit la configuration Sage de l'agent (envoyée juste après authentification)
   * et met à jour l'organisation + auto-complète le step 3 de l'onboarding si en attente.
   */
  @SubscribeMessage('agent_config')
  async handleAgentConfig(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      sageType?: string;
      sageMode?: string;
      sageHost?: string;
      sagePort?: number;
      sageVersion?: string;
      sqlServer?: string;
    },
  ) {
    const { agentId, organizationId } = client.data;
    if (!organizationId || !agentId) return { status: 'error', message: 'Unauthorized' };

    await this.agentsService.applyAgentConfig(agentId, organizationId, data);
    this.logger.log(`agent_config received from agent ${agentId}`);
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

  /**
   * Reçoit l'événement de renouvellement automatique émis par AgentsService
   * et pousse le nouveau token à l'agent via WebSocket.
   */
  @OnEvent('agent.token_auto_renewed')
  handleTokenAutoRenewed(payload: { organizationId: string; newToken: string; tokenExpiresAt: Date }) {
    const socketId = this.activeAgents.get(payload.organizationId);
    if (!socketId) return;

    this.server.to(socketId).emit('token_renewal', {
      newToken: payload.newToken,
      expiresAt: payload.tokenExpiresAt.toISOString(),
    });

    this.logger.log(`token_renewal pushed to org ${payload.organizationId}`);
  }
}
