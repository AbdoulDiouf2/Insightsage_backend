import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extrait l'agent courant depuis la requête (injecté par AgentTokenGuard).
 * Usage: @CurrentAgent() agent — retourne l'objet agent complet
 *        @CurrentAgent('id') id — retourne agent.id
 */
export const CurrentAgent = createParamDecorator(
  (field: string | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    const agent = req['agent'];
    return field ? agent?.[field] : agent;
  },
);
