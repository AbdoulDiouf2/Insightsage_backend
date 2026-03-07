import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CancelSubscriptionDto {
  @ApiPropertyOptional({
    example: false,
    default: false,
    description:
      'Si true : annulation immediate. ' +
      'Si false (defaut) : l\'acces reste actif jusqu\'a la fin de la periode en cours, puis annulation.',
  })
  @IsBoolean()
  @IsOptional()
  immediately?: boolean;
}
