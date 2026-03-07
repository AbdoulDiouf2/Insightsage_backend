import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── KpiDefinition DTOs ───────────────────────────────────────────────────────

export class CreateKpiDefinitionDto {
  @ApiProperty({ example: 'revenue_mom', description: 'Clé unique du KPI' })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({ example: 'CA Mois/Mois' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Variation du chiffre d\'affaires mois sur mois' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: '%', description: 'Unité : €, %, jours' })
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiProperty({
    example: 'finance',
    description: 'Catégorie : finance | commercial | treasury',
  })
  @IsString()
  @IsIn(['finance', 'commercial', 'treasury'])
  category: string;

  @ApiProperty({
    example: 'gauge',
    description: 'Type de visualisation par défaut : gauge | bar | card | line | table',
  })
  @IsString()
  @IsIn(['gauge', 'bar', 'card', 'line', 'table'])
  defaultVizType: string;
}

export class UpdateKpiDefinitionDto {
  @ApiPropertyOptional({ example: 'CA Mois/Mois (mis à jour)' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: '€' })
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiPropertyOptional({ example: 'finance' })
  @IsString()
  @IsIn(['finance', 'commercial', 'treasury'])
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ example: 'card' })
  @IsString()
  @IsIn(['gauge', 'bar', 'card', 'line', 'table'])
  @IsOptional()
  defaultVizType?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// ─── WidgetTemplate DTOs ──────────────────────────────────────────────────────

export class CreateWidgetTemplateDto {
  @ApiProperty({ example: 'Carte KPI' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'card',
    description: 'Type de visualisation unique : card | bar | line | gauge | table',
  })
  @IsString()
  @IsIn(['card', 'bar', 'line', 'gauge', 'table'])
  vizType: string;

  @ApiPropertyOptional({ example: 'Affiche une métrique KPI sous forme de carte' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: { period: 'month' },
    description: 'Configuration JSON par défaut du widget',
  })
  @IsObject()
  defaultConfig: Record<string, unknown>;
}

export class UpdateWidgetTemplateDto {
  @ApiPropertyOptional({ example: 'Carte KPI (v2)' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: { period: 'quarter' } })
  @IsObject()
  @IsOptional()
  defaultConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// ─── KpiPack DTOs ─────────────────────────────────────────────────────────────

export class CreateKpiPackDto {
  @ApiProperty({ example: 'pack_daf', description: 'Identifiant unique du pack' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Pack DAF' })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiProperty({
    example: 'daf',
    description: 'Profil métier : daf | dg | controller | manager | analyst',
  })
  @IsString()
  @IsIn(['daf', 'dg', 'controller', 'manager', 'analyst'])
  profile: string;

  @ApiProperty({
    example: ['revenue_mom', 'dmp', 'ar_aging'],
    description: 'Clés KPI incluses dans ce pack',
  })
  @IsArray()
  @IsString({ each: true })
  kpiKeys: string[];

  @ApiPropertyOptional({ example: 'Pack complet pour le Directeur Administratif et Financier' })
  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateKpiPackDto {
  @ApiPropertyOptional({ example: 'Pack DAF Premium' })
  @IsString()
  @IsOptional()
  label?: string;

  @ApiPropertyOptional({ example: 'daf' })
  @IsString()
  @IsIn(['daf', 'dg', 'controller', 'manager', 'analyst'])
  @IsOptional()
  profile?: string;

  @ApiPropertyOptional({ example: ['revenue_mom', 'gross_margin'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  kpiKeys?: string[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
