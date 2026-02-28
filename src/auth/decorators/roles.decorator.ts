import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * @Roles decorator - Restrict access to specific roles
 * 
 * Usage:
 * @Roles('daf', 'owner') - Only DAF or Owner can access
 * @Roles('superadmin') - Only superadmins can access
 * 
 * Note: Role names are case-insensitive
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
