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
  @ApiProperty({ example: 'f01_ca_ht', description: 'Clé unique du KPI' })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiPropertyOptional({ example: 'KPI-F01', description: 'Code court du KPI' })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiProperty({ example: 'Chiffre d\'Affaires (CA) HT' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Finance & Trésorerie', description: 'Domaine métier' })
  @IsString()
  @IsOptional()
  domain?: string;

  @ApiPropertyOptional({ example: 'Total des ventes nettes hors taxes.' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'finance', description: 'Catégorie du KPI' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ example: 'Revenus', description: 'Sous-catégorie' })
  @IsString()
  @IsOptional()
  subcategory?: string;

  @ApiPropertyOptional({ example: 'Mesurer la performance commerciale globale.' })
  @IsString()
  @IsOptional()
  usage?: string;

  @ApiPropertyOptional({ example: '€', description: 'Unité : €, %, jours' })
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiPropertyOptional({ example: 'Mensuel / Annuel' })
  @IsString()
  @IsOptional()
  frequency?: string;

  @ApiPropertyOptional({ example: 'Faible', description: 'Niveau de risque : Faible | Moyen | Élevé' })
  @IsString()
  @IsOptional()
  risk?: string;

  @ApiPropertyOptional({ example: ['DAF', 'CFO', 'DG'], description: 'Profils métier cibles' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  profiles?: string[];

  @ApiPropertyOptional({ example: ['Tous secteurs'], description: 'Secteurs applicables' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  sectors?: string[];

  @ApiProperty({
    example: 'bar',
    description: 'Type de visualisation par défaut',
  })
  @IsString()
  @IsIn(['gauge', 'bar', 'card', 'kpi', 'line', 'table', 'pie', 'map', 'text'])
  defaultVizType: string;

  @ApiPropertyOptional({ example: 'VW_Finances_Clients_Flat', description: 'Vue Sage 100 principale' })
  @IsString()
  @IsOptional()
  sqlSage100View?: string;

  @ApiPropertyOptional({ example: ['F_COMPTET', 'G_ECRITUREC'], description: 'Tables Sage 100 sous-jacentes' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  sqlSage100Tables?: string[];

  @ApiPropertyOptional({ example: 'HIGHER_IS_BETTER', description: 'Direction : HIGHER_IS_BETTER | LOWER_IS_BETTER' })
  @IsString()
  @IsIn(['HIGHER_IS_BETTER', 'LOWER_IS_BETTER'])
  @IsOptional()
  direction?: string;

  @ApiPropertyOptional({ example: 'Feature principale pour prévision de revenus.' })
  @IsString()
  @IsOptional()
  mlUsage?: string;
}

export class UpdateKpiDefinitionDto {
  @ApiPropertyOptional({ example: 'KPI-F01 (mis à jour)' })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ example: 'Chiffre d\'Affaires (CA) HT (mis à jour)' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'Finance & Trésorerie' })
  @IsString()
  @IsOptional()
  domain?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'finance' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ example: 'Revenus' })
  @IsString()
  @IsOptional()
  subcategory?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  usage?: string;

  @ApiPropertyOptional({ example: '€' })
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiPropertyOptional({ example: 'Mensuel' })
  @IsString()
  @IsOptional()
  frequency?: string;

  @ApiPropertyOptional({ example: 'Faible' })
  @IsString()
  @IsOptional()
  risk?: string;

  @ApiPropertyOptional({ example: ['DAF', 'CFO'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  profiles?: string[];

  @ApiPropertyOptional({ example: ['Commerce'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  sectors?: string[];

  @ApiPropertyOptional({ example: 'bar' })
  @IsString()
  @IsIn(['gauge', 'bar', 'card', 'kpi', 'line', 'table', 'pie', 'map', 'text'])
  @IsOptional()
  defaultVizType?: string;

  @ApiPropertyOptional({ example: 'VW_Finances_Clients_Flat' })
  @IsString()
  @IsOptional()
  sqlSage100View?: string;

  @ApiPropertyOptional({ example: ['F_COMPTET'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  sqlSage100Tables?: string[];

  @ApiPropertyOptional({ example: 'HIGHER_IS_BETTER', description: 'Direction : HIGHER_IS_BETTER | LOWER_IS_BETTER' })
  @IsString()
  @IsIn(['HIGHER_IS_BETTER', 'LOWER_IS_BETTER'])
  @IsOptional()
  direction?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  mlUsage?: string;

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
    description: 'Type de visualisation unique : card | bar | line | gauge | table | pie | map | text',
  })
  @IsString()
  @IsIn(['card', 'bar', 'line', 'gauge', 'table', 'pie', 'map', 'text'])
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
    example: ['f01_ca_ht', 'f05_dso', 'f06_encours_clients'],
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

  @ApiPropertyOptional({ example: ['f01_ca_ht', 'f03_marge_brute'] })
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
