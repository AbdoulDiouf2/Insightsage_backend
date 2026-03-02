import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class InvitationItemDto {
  @ApiPropertyOptional({ description: 'Email de l\'utilisateur à inviter', example: 'controller@acme.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ description: 'Rôle attribué', example: 'controller', enum: ['daf', 'controller', 'analyst', 'manager'] })
  @IsString()
  @IsNotEmpty()
  role: string;
}

export class Step5Dto {
  @ApiPropertyOptional({
    description: 'Liste des invitations à envoyer',
    type: [InvitationItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvitationItemDto)
  @IsOptional()
  invitations?: InvitationItemDto[];

  @ApiPropertyOptional({
    description: 'Passer l\'étape d\'invitation (inviter plus tard)',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  inviteLater?: boolean;
}
