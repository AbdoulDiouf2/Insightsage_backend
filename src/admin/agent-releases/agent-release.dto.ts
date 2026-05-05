import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

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

export class PresignedUploadQueryDto {
  @IsString() filename: string;
  @IsString() contentType: string;
  @IsString() version: string;
  @IsEnum(['windows', 'linux', 'macos']) platform: string;
  @IsOptional() @IsEnum(['x64', 'arm64']) arch?: string;
}

export class ConfirmAgentReleaseDto {
  @ApiProperty() @IsString() key: string;
  @ApiProperty() @IsString() version: string;
  @ApiProperty() @IsEnum(['windows', 'linux', 'macos']) platform: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(['x64', 'arm64']) arch?: string;
  @ApiProperty() @IsString() fileName: string;
  @ApiProperty() @IsNumber() @Type(() => Number) fileSize: number;
  @ApiPropertyOptional() @IsOptional() @IsString() changelog?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() checksum?: string;
}
