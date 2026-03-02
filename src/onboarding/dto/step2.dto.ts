import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class Step2Dto {
  @ApiPropertyOptional({ description: 'Nom de l\'organisation', example: 'ACME Corp' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Secteur d\'activité', example: 'Industrie manufacturière' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  sector?: string;

  @ApiPropertyOptional({
    description: 'Taille de l\'entreprise',
    enum: ['startup', 'pme', 'business', 'enterprise'],
    example: 'pme',
  })
  @IsString()
  @IsIn(['startup', 'pme', 'business', 'enterprise'])
  @IsOptional()
  size?: string;

  @ApiPropertyOptional({ description: 'Pays', example: 'France' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  country?: string;
}
