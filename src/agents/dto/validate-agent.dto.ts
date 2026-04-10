import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ValidateAgentDto {
  @ApiPropertyOptional({
    description: "Email de l'utilisateur Cockpit (vérification optionnelle)",
    example: 'admin@bijou-sa.com',
  })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({
    description: "Token agent généré depuis le portail Cockpit (format isag_xxx)",
    example: 'isag_a1b2c3d4e5f6...',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiPropertyOptional({
    description: "Identifiant unique de la machine cliente (node-machine-id)",
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsString()
  @IsOptional()
  machineId?: string;

  @ApiPropertyOptional({
    description: "Instance SQL Server Sage 100 (ex: MONSERVEUR\\SAGE)",
    example: 'SRV-COMPTA\\SAGE100',
  })
  @IsString()
  @IsOptional()
  sqlServer?: string;

  @ApiPropertyOptional({
    description: "Tables Sage 100 détectées lors de l'installation",
    example: ['F_ECRITUREC', 'F_COMPTET', 'F_DOCENTETE'],
  })
  @IsArray()
  @IsOptional()
  sageTables?: string[];
}
