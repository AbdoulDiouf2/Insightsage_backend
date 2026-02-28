import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: 'newpassword123' })
  @IsString()
  @MinLength(8)
  newPassword!: string;

  @ApiProperty({ example: 'reset-token-123' })
  @IsString()
  token!: string;
}
