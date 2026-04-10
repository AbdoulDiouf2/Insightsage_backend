import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Request } from 'express';

/**
 * Guard pour les endpoints Agent v1.
 * Authentifie via `Authorization: Bearer <agent_token>` (format isag_xxx).
 * À utiliser en combinaison avec @Public() pour désactiver le JwtAuthGuard global.
 */
@Injectable()
export class AgentTokenGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { agent?: any }>();
    const authHeader = req.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token agent manquant (Authorization: Bearer <token>)');
    }

    const token = authHeader.slice(7).trim();

    const agent = await this.prisma.agent.findUnique({
      where: { token },
      include: {
        organization: { select: { id: true, name: true } },
      },
    });

    if (!agent) {
      throw new UnauthorizedException('Token agent invalide');
    }
    if (agent.isRevoked) {
      throw new UnauthorizedException('Token agent révoqué — générez un nouveau token depuis le portail');
    }
    if (agent.tokenExpiresAt && agent.tokenExpiresAt < new Date()) {
      throw new UnauthorizedException('Token agent expiré (validité 30 jours) — régénérez depuis le portail');
    }

    req['agent'] = agent;
    return true;
  }
}
