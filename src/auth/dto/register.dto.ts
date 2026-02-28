import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
    @ApiProperty({ example: 'test@example.com' })
    @IsEmail()
    email!: string;

    @ApiProperty({ example: 'password123' })
    @IsString()
    @MinLength(8)
    password!: string;

    @ApiProperty({ example: 'My Company' })
    @IsString()
    @IsNotEmpty()
    organizationName!: string;

    @ApiPropertyOptional({ example: 'John' })
    @IsString()
    @IsOptional()
    firstName?: string;

    @ApiPropertyOptional({ example: 'Doe' })
    @IsString()
    @IsOptional()
    lastName?: string;

    @ApiPropertyOptional({ description: 'Optional invitation token' })
    @IsString()
    @IsOptional()
    invitationToken?: string;
}
