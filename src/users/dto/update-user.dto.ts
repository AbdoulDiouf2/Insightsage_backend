import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
    @ApiProperty({ example: 'Jean', description: 'Le prénom de l\'utilisateur', required: false })
    @IsOptional()
    @IsString()
    firstName?: string;

    @ApiProperty({ example: 'Dupont', description: 'Le nom de l\'utilisateur', required: false })
    @IsOptional()
    @IsString()
    lastName?: string;

    @ApiProperty({ example: 'manager', description: 'Le rôle de l\'utilisateur dans l\'organisation', required: false })
    @IsOptional()
    @IsString()
    role?: string;
}
