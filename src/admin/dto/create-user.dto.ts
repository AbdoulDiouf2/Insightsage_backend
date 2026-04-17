import { IsEmail, IsString, IsNotEmpty, IsUUID, IsArray, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'Jean' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Dupont' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'jean.dupont@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ description: 'Si absent, un mot de passe aléatoire est généré et un email de setup est envoyé' })
  @IsString()
  @IsOptional()
  password?: string;

  @ApiProperty({ example: 'uuid-org-123' })
  @IsUUID()
  @IsNotEmpty()
  organizationId: string;

  @ApiProperty({ example: ['uuid-role-123'], isArray: true })
  @IsArray()
  @IsString({ each: true })
  roleIds: string[];
}
