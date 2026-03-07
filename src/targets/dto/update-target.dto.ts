import {
  IsNumber,
  IsEnum,
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DeltaReference, TargetValueType } from '@prisma/client';

export class UpdateTargetDto {
  @ApiPropertyOptional({
    example: 175000,
    description: 'Nouvelle valeur cible',
  })
  @IsNumber()
  @IsOptional()
  value?: number;

  @ApiPropertyOptional({
    enum: TargetValueType,
    description: 'Nouveau type de valeur',
  })
  @IsEnum(TargetValueType)
  @IsOptional()
  valueType?: TargetValueType;

  @ApiPropertyOptional({
    enum: DeltaReference,
    description: 'Référence de comparaison (uniquement si valueType = DELTA_PERCENT)',
  })
  @IsEnum(DeltaReference)
  @IsOptional()
  deltaReference?: DeltaReference;

  @ApiPropertyOptional({
    example: 2026,
    description: 'Annee de l\'objectif',
  })
  @IsInt()
  @Min(2000)
  @Max(2100)
  @IsOptional()
  year?: number;

  @ApiPropertyOptional({
    example: 'Objectif révisé après S1',
    description: 'Note libre',
  })
  @IsString()
  @IsOptional()
  label?: string;
}
