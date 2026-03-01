import { IsString, IsNotEmpty, IsOptional, IsNumber, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HeartbeatDto {
  @ApiProperty({
    description: 'Agent token',
    example: 'isag_abc123def456...',
  })
  @IsString()
  @IsNotEmpty()
  agentToken: string;

  @ApiPropertyOptional({
    description: 'Organization ID',
  })
  @IsString()
  @IsOptional()
  organizationId?: string;

  @ApiPropertyOptional({
    description: 'Agent version',
    example: '1.0.0',
  })
  @IsString()
  @IsOptional()
  agentVersion?: string;

  @ApiPropertyOptional({
    description: 'Agent status',
    enum: ['online', 'offline', 'error'],
  })
  @IsString()
  @IsOptional()
  @IsIn(['online', 'offline', 'error'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Number of errors since last heartbeat',
  })
  @IsNumber()
  @IsOptional()
  errorCount?: number;

  @ApiPropertyOptional({
    description: 'Last error message',
  })
  @IsString()
  @IsOptional()
  lastError?: string;
}
