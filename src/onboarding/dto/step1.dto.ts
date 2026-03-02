import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class Step1Dto {
  @ApiProperty({
    description: 'Plan d\'abonnement choisi',
    enum: ['startup', 'pme', 'business', 'enterprise'],
    example: 'pme',
  })
  @IsString()
  @IsIn(['startup', 'pme', 'business', 'enterprise'])
  plan: string;
}
