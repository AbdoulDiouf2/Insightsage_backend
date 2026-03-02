import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ description: 'Nom de l\'organisation', example: 'ACME Corp' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Secteur d\'activité', example: 'Industrie' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  sector?: string;

  @ApiPropertyOptional({ description: 'Taille de l\'entreprise', example: 'pme', enum: ['startup', 'pme', 'business', 'enterprise'] })
  @IsString()
  @IsOptional()
  size?: string;

  @ApiPropertyOptional({ description: 'Pays', example: 'France' })
  @IsString()
  @IsOptional()
  country?: string;
}
