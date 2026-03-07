import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateDashboardDto {
  @ApiPropertyOptional({
    description: 'Nouveau nom du dashboard',
    example: 'Cockpit DAF - Trimestriel',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Layout en grille des widgets (tableau de positions)',
    example: [{ id: 'wid_123', x: 0, y: 0, w: 4, h: 3 }],
  })
  @IsOptional()
  layout?: Record<string, unknown>[];

  @ApiPropertyOptional({
    description: 'Définir comme dashboard par défaut de l\'utilisateur',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
