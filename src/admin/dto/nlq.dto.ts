import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── KPI Full (KpiDefinition + NlqIntent + NlqTemplate(s) en une transaction) ─

export class CreateKpiFullDto {
  // ── KpiDefinition ──
  @ApiProperty() @IsString() @IsNotEmpty() key: string;
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsString() @IsOptional() code?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() domain?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
  @ApiProperty() @IsString() @IsNotEmpty() category: string;
  @ApiPropertyOptional() @IsString() @IsOptional() subcategory?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() unit?: string;
  @ApiProperty({ default: 'card' }) @IsString() @IsNotEmpty() defaultVizType: string;
  @ApiPropertyOptional() @IsString() @IsOptional() usage?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() frequency?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() risk?: string;
  @ApiPropertyOptional({ type: [String] }) @IsArray() @IsString({ each: true }) @IsOptional() profiles?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsArray() @IsString({ each: true }) @IsOptional() sectors?: string[];
  @ApiPropertyOptional() @IsString() @IsOptional() sqlSage100View?: string;
  @ApiPropertyOptional({ type: [String] }) @IsArray() @IsString({ each: true }) @IsOptional() sqlSage100Tables?: string[];
  @ApiPropertyOptional({ enum: ['HIGHER_IS_BETTER', 'LOWER_IS_BETTER'] }) @IsString() @IsIn(['HIGHER_IS_BETTER', 'LOWER_IS_BETTER']) @IsOptional() direction?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() mlUsage?: string;

  // ── NlqIntent (optionnel) ──
  @ApiPropertyOptional() @IsString() @IsOptional() intentLabel?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() intentDescription?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() intentCategory?: string;
  @ApiPropertyOptional({ type: [String] }) @IsArray() @IsString({ each: true }) @IsOptional() intentKeywords?: string[];

  // ── NlqTemplates (optionnel) ──
  @ApiPropertyOptional() @IsString() @IsOptional() sqlSage100?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() sqlSageX3?: string;
  @ApiPropertyOptional({ default: 'card' }) @IsString() @IsOptional() templateVizType?: string;
}

const NLQ_CATEGORIES = ['finance', 'commercial', 'treasury'] as const;
const SAGE_TYPES = ['100', 'X3'] as const;
const VIZ_TYPES = ['card', 'gauge', 'bar', 'line', 'table', 'pie', 'map', 'text'] as const;

// ─── NlqIntent DTOs ──────────────────────────────────────────────────────────

export class CreateNlqIntentDto {
  @ApiProperty({ example: 'f01_ca_ht', description: 'Clé unique de l\'intention' })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({ example: 'Chiffre d\'Affaires HT', description: 'Libellé humain' })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiPropertyOptional({ description: 'Description longue de l\'intention' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ enum: NLQ_CATEGORIES, example: 'finance' })
  @IsString()
  @IsNotEmpty()
  @IsIn(NLQ_CATEGORIES)
  category: string;

  @ApiPropertyOptional({ type: [String], example: ['ca', 'chiffre affaires', 'revenus'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  keywords?: string[];
}

export class UpdateNlqIntentDto {
  @ApiPropertyOptional({ example: 'Chiffre d\'Affaires HT' })
  @IsString()
  @IsOptional()
  label?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: NLQ_CATEGORIES })
  @IsString()
  @IsIn(NLQ_CATEGORIES)
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  keywords?: string[];
}

// ─── NlqTemplate DTOs ────────────────────────────────────────────────────────

export class CreateNlqTemplateDto {
  @ApiProperty({ example: 'f01_ca_ht', description: 'Clé de l\'intention associée' })
  @IsString()
  @IsNotEmpty()
  intentKey: string;

  @ApiProperty({ enum: SAGE_TYPES, example: '100' })
  @IsString()
  @IsNotEmpty()
  @IsIn(SAGE_TYPES)
  sageType: string;

  @ApiProperty({ description: 'Requête SQL executée sur l\'agent Sage' })
  @IsString()
  @IsNotEmpty()
  sqlQuery: string;

  @ApiPropertyOptional({ enum: VIZ_TYPES, default: 'card' })
  @IsString()
  @IsIn(VIZ_TYPES)
  @IsOptional()
  defaultVizType?: string;
}

export class UpdateNlqTemplateDto {
  @ApiPropertyOptional({ description: 'Nouvelle requête SQL' })
  @IsString()
  @IsOptional()
  sqlQuery?: string;

  @ApiPropertyOptional({ enum: VIZ_TYPES })
  @IsString()
  @IsIn(VIZ_TYPES)
  @IsOptional()
  defaultVizType?: string;
}
