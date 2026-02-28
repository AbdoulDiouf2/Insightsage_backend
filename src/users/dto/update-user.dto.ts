import { IsOptional, IsString, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiProperty({
    example: 'Jean',
    description: "Le prénom de l'utilisateur",
    required: false,
  })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({
    example: 'Dupont',
    description: "Le nom de l'utilisateur",
    required: false,
  })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiProperty({
    example: ['uuid-of-daf-role', 'uuid-of-analyst'],
    description: 'Tableau des Identifiants (UUID) des rôles attribués',
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];
}
