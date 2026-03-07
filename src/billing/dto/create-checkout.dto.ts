import { IsString, IsNotEmpty, IsOptional, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCheckoutDto {
  @ApiProperty({
    example: 'uuid-plan-business',
    description: 'ID du plan d\'abonnement cible (SubscriptionPlan.id)',
  })
  @IsString()
  @IsNotEmpty()
  planId: string;

  @ApiPropertyOptional({
    example: 'https://app.cockpit.io/billing?success=true',
    description: 'URL de redirection apres paiement reussi (defaut : FRONTEND_URL/billing/success)',
  })
  @IsUrl()
  @IsOptional()
  successUrl?: string;

  @ApiPropertyOptional({
    example: 'https://app.cockpit.io/billing?cancelled=true',
    description: 'URL de redirection si le client abandonne le paiement (defaut : FRONTEND_URL/billing/cancel)',
  })
  @IsUrl()
  @IsOptional()
  cancelUrl?: string;
}
