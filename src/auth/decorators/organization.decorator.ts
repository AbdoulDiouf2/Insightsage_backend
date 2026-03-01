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
    return request.organizationId || request.user?.organizationId;
  },
);
