import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({
    example: 'Auditeur Externe',
    description: 'Nom du rôle sur-mesure',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'Accès en lecture seule pour la conformité',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: ['uuid-permission-read-users', 'uuid-permission-read-dashboards'],
    description: 'Tableau des IDs des Permissions associées à ce rôle',
  })
  @IsArray()
  @IsString({ each: true })
  permissionIds: string[];
}
