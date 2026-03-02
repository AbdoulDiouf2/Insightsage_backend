import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class TestConnectionDto {
  @ApiPropertyOptional({
    description: 'Token de l\'agent à tester. Si omis, utilise l\'agent actif de l\'organisation.',
    example: 'isag_a1b2c3d4e5f6...',
  })
  @IsString()
  @IsOptional()
  agentToken?: string;
}
