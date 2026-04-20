import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * @OrganizationId decorator - Extract organizationId from request
 * 
 * The TenantGuard injects organizationId into the request.
 * This decorator provides a clean way to access it in controllers.
 * 
 * Usage:
 * @Get('data')
 * getData(@OrganizationId() orgId: string) {
 *   return this.service.findByOrg(orgId);
 * }
 */
export const OrganizationId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    // Pour les routes tenant-scoped, on retourne toujours l'organizationId de l'utilisateur.
    // Les routes cross-tenant admin utilisent des params URL (:organizationId), pas ce décorateur.
    return request.organizationId || request.user?.organizationId;
  },
);
