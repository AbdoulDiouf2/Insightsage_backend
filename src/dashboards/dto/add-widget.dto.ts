import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WidgetPositionDto {
  @ApiProperty({ description: 'Colonne de départ (grille)', example: 0 })
  x: number;

  @ApiProperty({ description: 'Ligne de départ (grille)', example: 0 })
  y: number;

  @ApiProperty({ description: 'Largeur en colonnes', example: 4 })
  w: number;

  @ApiProperty({ description: 'Hauteur en lignes', example: 3 })
  h: number;
}

export class AddWidgetDto {
  @ApiProperty({
    description: 'Nom du widget',
    example: 'CA Mois/Mois',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Type de widget',
    enum: ['kpi', 'chart', 'table'],
    example: 'kpi',
  })
  @IsString()
  @IsIn(['kpi', 'chart', 'table'])
  type: string;

  @ApiPropertyOptional({
    description: 'Clé du KPI (référence KpiDefinition)',
    example: 'revenue_mom',
  })
  @IsString()
  @IsOptional()
  kpiKey?: string;

  @ApiPropertyOptional({
    description: 'Type de visualisation (override du template)',
    example: 'gauge',
  })
  @IsString()
  @IsOptional()
  vizType?: string;

  @ApiPropertyOptional({
    description: 'Configuration JSON du widget',
    example: { period: 'month', showTrend: true },
  })
  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: "Identifiant de l'exposition métrique (pour NLQ)",
    example: 'revenue_mom',
  })
  @IsString()
  @IsOptional()
  exposure?: string;

  @ApiProperty({
    description: 'Position du widget dans la grille',
    type: WidgetPositionDto,
  })
  @ValidateNested()
  @Type(() => WidgetPositionDto)
  position: WidgetPositionDto;
}
