import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * @Public decorator - Mark routes as publicly accessible
 * 
 * Routes marked with @Public() will bypass:
 * - JwtAuthGuard
 * - TenantGuard
 * - PermissionsGuard
 * - RolesGuard
 * 
 * Usage:
 * @Public()
 * @Get('health')
 * healthCheck() { return { status: 'ok' }; }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
