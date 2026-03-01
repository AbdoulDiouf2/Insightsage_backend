import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterAgentDto {
  @ApiProperty({
    description: 'Agent token generated during onboarding',
    example: 'isag_abc123def456...',
  })
  @IsString()
  @IsNotEmpty()
  agent_token: string;

  @ApiPropertyOptional({
    description: 'Type of Sage installation',
    example: '100',
  })
  @IsString()
  @IsOptional()
  sage_type?: string;

  @ApiPropertyOptional({
    description: 'Version of Sage',
    example: 'v12',
  })
  @IsString()
  @IsOptional()
  sage_version?: string;

  @ApiPropertyOptional({
    description: 'Agent name',
    example: 'InsightSage-Agent-01',
  })
  @IsString()
  @IsOptional()
  agent_name?: string;

  @ApiPropertyOptional({
    description: 'Agent version',
    example: '1.0.0',
  })
  @IsString()
  @IsOptional()
  agent_version?: string;
}
