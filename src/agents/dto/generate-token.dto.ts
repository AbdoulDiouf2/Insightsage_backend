import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateTokenDto {
  @ApiPropertyOptional({
    description: 'Custom name for the agent',
    example: 'Production-Agent',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Force creation even if agent exists',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  force?: boolean;
}
