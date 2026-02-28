import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * @CurrentUser decorator - Extract current authenticated user from request
 * 
 * Usage:
 * @Get('profile')
 * getProfile(@CurrentUser() user: User) {
 *   return user;
 * }
 * 
 * // Get specific property
 * @Get('org')
 * getOrg(@CurrentUser('organizationId') orgId: string) {
 *   return { organizationId: orgId };
 * }
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return null;
    }

    // If a specific property is requested, return just that
    if (data) {
      return user[data];
    }

    return user;
  },
);
