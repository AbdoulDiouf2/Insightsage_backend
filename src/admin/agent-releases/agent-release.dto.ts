import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateAgentReleaseDto {
  @ApiProperty({ description: 'Version de la release', example: '1.2.3' })
  @IsString()
  version: string;

  @ApiProperty({
    description: 'Plateforme cible',
    enum: ['windows', 'linux', 'macos'],
    example: 'windows',
  })
  @IsEnum(['windows', 'linux', 'macos'])
  platform: string;

  @ApiPropertyOptional({
    description: 'Architecture processeur',
    enum: ['x64', 'arm64'],
    default: 'x64',
  })
  @IsOptional()
  @IsEnum(['x64', 'arm64'])
  arch?: string;

  @ApiPropertyOptional({ description: 'Notes de version (changelog)', example: 'Correction bug heartbeat' })
  @IsOptional()
  @IsString()
  changelog?: string;
}
