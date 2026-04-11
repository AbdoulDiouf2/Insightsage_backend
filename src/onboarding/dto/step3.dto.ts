import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class Step3Dto {
  @ApiPropertyOptional({
    description:
      'Type de solution Sage — requis uniquement en mode cloud (en mode local, l\'agent pousse cette info automatiquement)',
    enum: ['X3', '100'],
    example: 'X3',
  })
  @IsOptional()
  @IsString()
  @IsIn(['X3', '100'])
  sageType?: string;

  @ApiPropertyOptional({
    description: 'Mode d\'hébergement Sage',
    enum: ['local', 'cloud'],
    example: 'local',
  })
  @IsOptional()
  @IsString()
  @IsIn(['local', 'cloud'])
  sageMode?: string;
}
