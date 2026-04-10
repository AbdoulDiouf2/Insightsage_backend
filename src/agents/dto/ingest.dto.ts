import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  IsIn,
  IsObject,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IngestDto {
  @ApiProperty({
    description: "Nom de la vue Sage 100 synchronisée",
    example: 'VW_GRAND_LIVRE_GENERAL',
  })
  @IsString()
  @IsNotEmpty()
  view_name: string;

  @ApiProperty({
    description: "Mode de synchronisation",
    enum: ['INCREMENTAL', 'FULL'],
    example: 'INCREMENTAL',
  })
  @IsString()
  @IsIn(['INCREMENTAL', 'FULL'])
  sync_mode: 'INCREMENTAL' | 'FULL';

  @ApiPropertyOptional({
    description: "cbMarq de départ du batch (mode INCREMENTAL)",
    example: 45230,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  watermark_min?: number;

  @ApiPropertyOptional({
    description: "cbMarq max du batch — devient le nouveau watermark",
    example: 48901,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  watermark_max?: number;

  @ApiProperty({
    description: "Nombre de lignes dans ce batch",
    example: 3671,
  })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  row_count: number;

  @ApiPropertyOptional({
    description: "Version de schéma Sage détectée",
    enum: ['v21plus', 'v15v17', 'fallback'],
    example: 'v21plus',
  })
  @IsString()
  @IsOptional()
  schema_version?: string;

  @ApiPropertyOptional({
    description: "Code entité Sage (dossier/société)",
    example: 'BIJOU',
  })
  @IsString()
  @IsOptional()
  entity_code?: string;

  @ApiProperty({
    description: "Lignes de données extraites de la vue",
    type: 'array',
    example: [{ ID_Ecriture: 12543, Date_Ecriture: '2025-03-01', Montant: 1500 }],
  })
  @IsArray()
  rows: Record<string, any>[];
}
