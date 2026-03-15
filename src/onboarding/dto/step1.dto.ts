import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class Step1Dto {
  @ApiProperty({
    description: 'Plan d\'abonnement choisi',
    enum: ['essentiel', 'pme', 'premium', 'enterprise'],
    example: 'pme',
  })
  @IsString()
  @IsIn(['essentiel', 'pme', 'premium', 'enterprise', 'startup', 'business'])
  plan: string;
}
