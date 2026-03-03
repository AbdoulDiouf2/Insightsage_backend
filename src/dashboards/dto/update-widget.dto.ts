import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WidgetPositionDto } from './add-widget.dto';

export class UpdateWidgetDto {
  @ApiPropertyOptional({
    description: 'Nouveau nom du widget',
    example: 'CA Mois/Mois (mis à jour)',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Configuration JSON mise à jour',
    example: { period: 'quarter', showTrend: false },
  })
  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Type de visualisation',
    example: 'bar',
  })
  @IsString()
  @IsOptional()
  vizType?: string;

  @ApiPropertyOptional({
    description: 'Nouvelle position dans la grille',
    type: WidgetPositionDto,
  })
  @ValidateNested()
  @Type(() => WidgetPositionDto)
  @IsOptional()
  position?: WidgetPositionDto;

  @ApiPropertyOptional({
    description: 'Activer ou désactiver le widget dans le cockpit',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
