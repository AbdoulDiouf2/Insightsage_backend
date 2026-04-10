import { IsString, IsOptional, IsNumber, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class HeartbeatV1Dto {
  @ApiPropertyOptional({
    description: "Statut actuel de l'agent",
    enum: ['online', 'offline', 'error'],
    example: 'online',
  })
  @IsString()
  @IsOptional()
  @IsIn(['online', 'offline', 'error'])
  status?: string;

  @ApiPropertyOptional({
    description: "Timestamp ISO de la dernière synchronisation réussie",
    example: '2026-04-10T14:30:00.000Z',
  })
  @IsString()
  @IsOptional()
  lastSync?: string;

  @ApiPropertyOptional({
    description: "Nombre total de lignes synchronisées depuis l'installation",
    example: 48901,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  nbRecordsTotal?: number;
}
