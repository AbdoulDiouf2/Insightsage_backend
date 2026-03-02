import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AgentLinkDto {
  @ApiProperty({
    description: 'Token de l\'agent à associer à cette organisation (format: isag_...)',
    example: 'isag_a1b2c3d4e5f6...',
  })
  @IsString()
  @IsNotEmpty()
  agentToken: string;
}
