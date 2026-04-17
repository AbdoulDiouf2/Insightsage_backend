import { IsEmail, IsIn, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'test@example.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ enum: ['client', 'admin'], default: 'client' })
  @IsOptional()
  @IsIn(['client', 'admin'])
  source?: 'client' | 'admin';
}
