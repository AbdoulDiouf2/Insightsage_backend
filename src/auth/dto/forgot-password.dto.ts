import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
    @ApiProperty({ example: 'test@example.com' })
    @IsEmail()
    email!: string;
}
