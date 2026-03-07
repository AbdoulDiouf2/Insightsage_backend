import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsEnum,
  IsOptional,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PeriodType,
  TargetValueType,
  DeltaReference,
  TargetScenario,
} from '@prisma/client';

export class CreateTargetDto {
  @ApiProperty({
    example: 'ca_ht',
    description: 'Cle du KPI cible (doit exister dans kpi_definitions)',
  })
  @IsString()
  @IsNotEmpty()
  kpiKey: string;

  @ApiProperty({
    example: 150000,
    description: 'Valeur de l\'objectif. Interpretee selon valueType : montant brut, %, ou variation %',
  })
  @IsNumber()
  value: number;

  @ApiProperty({
    enum: TargetValueType,
    default: TargetValueType.ABSOLUTE,
    description: 'ABSOLUTE = valeur brute dans l\'unite du KPI | PERCENTAGE = % absolu | DELTA_PERCENT = variation % vs reference',
  })
  @IsEnum(TargetValueType)
  valueType: TargetValueType;

  @ApiPropertyOptional({
    enum: DeltaReference,
    description: 'Obligatoire si valueType = DELTA_PERCENT. Precise la periode de comparaison.',
  })
  @IsEnum(DeltaReference)
  @IsOptional()
  deltaReference?: DeltaReference;

  @ApiProperty({
    enum: PeriodType,
    example: PeriodType.TRIMESTRE,
    description: 'Granularite de la periode : MENSUEL | BIMESTRE | TRIMESTRE | SEMESTRE | ANNEE',
  })
  @IsEnum(PeriodType)
  periodType: PeriodType;

  @ApiProperty({
    example: 1,
    description: 'Index de la periode dans l\'annee. Plages valides : MENSUEL 1-12 | BIMESTRE 1-6 | TRIMESTRE 1-4 | SEMESTRE 1-2 | ANNEE 1',
  })
  @IsInt()
  @Min(1)
  @Max(12)
  periodIndex: number;

  @ApiProperty({
    example: 2025,
    description: 'Annee de l\'objectif',
  })
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @ApiProperty({
    enum: TargetScenario,
    default: TargetScenario.BUDGET,
    description: 'BUDGET = budget initial | REVISED = budget revise | FORECAST = prevision glissante | STRETCH = objectif ambitieux',
  })
  @IsEnum(TargetScenario)
  scenario: TargetScenario;

  @ApiPropertyOptional({
    example: 'Objectif CA Q1 2025 - hypothese centrale',
    description: 'Note libre (titre court de l\'objectif)',
  })
  @IsString()
  @IsOptional()
  label?: string;
}
