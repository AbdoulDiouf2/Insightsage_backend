import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class Step3Dto {
  @ApiProperty({
    description: 'Type de solution Sage',
    enum: ['X3', '100'],
    example: 'X3',
  })
  @IsString()
  @IsIn(['X3', '100'])
  sageType: string;

  @ApiProperty({
    description: 'Mode d\'hébergement Sage',
    enum: ['local', 'cloud'],
    example: 'local',
  })
  @IsString()
  @IsIn(['local', 'cloud'])
  sageMode: string;

  @ApiPropertyOptional({ description: 'Hôte du serveur Sage (si local)', example: '192.168.1.100' })
  @IsString()
  @IsOptional()
  sageHost?: string;

  @ApiPropertyOptional({ description: 'Port du serveur Sage', example: 1433 })
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  sagePort?: number;
}
