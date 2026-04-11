import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class AgentLinkDto {
  @ApiPropertyOptional({
    description: 'Token de l\'agent à associer à cette organisation (format: isag_...)',
    example: 'isag_a1b2c3d4e5f6...',
  })
  @IsOptional()
  @IsString()
  agentToken?: string;

  @ApiPropertyOptional({
    description: 'Passer à true pour reporter la configuration de l\'agent à plus tard',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  skipLater?: boolean;
}
