import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateSubscriptionPlanDto {
  @ApiProperty({ description: 'Identifiant unique du plan', example: 'business_plus' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Nom affiché du plan', example: 'Business+' })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiPropertyOptional({ description: 'Description du plan' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Prix mensuel en €. null = sur devis', example: 150 })
  @IsNumber()
  @IsOptional()
  priceMonthly?: number;

  @ApiPropertyOptional({ description: 'Nombre max d\'utilisateurs. null = illimité', example: 25 })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxUsers?: number;

  @ApiPropertyOptional({ description: 'Nombre max de KPIs. null = illimité', example: 20 })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxKpis?: number;

  @ApiPropertyOptional({ description: 'Nombre max de widgets. null = illimité', example: 50 })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxWidgets?: number;

  @ApiPropertyOptional({ description: 'Syncs Agent par jour. null = temps réel', example: 24 })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxAgentSyncPerDay?: number;

  @ApiPropertyOptional({ description: 'Packs KPIs inclus', example: ['daf_basic', 'daf_premium'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedKpiPacks?: string[];

  @ApiPropertyOptional({ description: 'NLQ (Natural Language Query) activé', example: true })
  @IsBoolean()
  @IsOptional()
  hasNlq?: boolean;

  @ApiPropertyOptional({ description: 'Rapports avancés activés', example: true })
  @IsBoolean()
  @IsOptional()
  hasAdvancedReports?: boolean;

  @ApiPropertyOptional({ description: 'Flutterwave Payment Plan ID', example: 'plan_xxx' })
  @IsString()
  @IsOptional()
  fwPlanId?: string;

  @ApiPropertyOptional({ description: 'Ordre d\'affichage', example: 5 })
  @IsInt()
  @IsOptional()
  sortOrder?: number;
}

export class UpdateSubscriptionPlanDto {
  @ApiPropertyOptional({ description: 'Nom affiché du plan' })
  @IsString()
  @IsOptional()
  label?: string;

  @ApiPropertyOptional({ description: 'Description du plan' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Prix mensuel en €. null = sur devis' })
  @IsNumber()
  @IsOptional()
  priceMonthly?: number;

  @ApiPropertyOptional({ description: 'Plan actif ou non' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Nombre max d\'utilisateurs. null = illimité' })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxUsers?: number;

  @ApiPropertyOptional({ description: 'Nombre max de KPIs. null = illimité' })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxKpis?: number;

  @ApiPropertyOptional({ description: 'Nombre max de widgets. null = illimité' })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxWidgets?: number;

  @ApiPropertyOptional({ description: 'Syncs Agent par jour. null = temps réel' })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxAgentSyncPerDay?: number;

  @ApiPropertyOptional({ description: 'Packs KPIs inclus' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedKpiPacks?: string[];

  @ApiPropertyOptional({ description: 'NLQ activé' })
  @IsBoolean()
  @IsOptional()
  hasNlq?: boolean;

  @ApiPropertyOptional({ description: 'Rapports avancés activés' })
  @IsBoolean()
  @IsOptional()
  hasAdvancedReports?: boolean;

  @ApiPropertyOptional({ description: 'Flutterwave Payment Plan ID' })
  @IsString()
  @IsOptional()
  fwPlanId?: string;

  @ApiPropertyOptional({ description: 'Ordre d\'affichage' })
  @IsInt()
  @IsOptional()
  sortOrder?: number;
}
