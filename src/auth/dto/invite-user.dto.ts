import { IsEmail, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InviteUserDto {
  @ApiProperty({ example: 'colleague@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'controller' })
  @IsString()
  role!: string;

  @ApiProperty({ example: 'org-id-123' })
  @IsString()
  organizationId!: string;
}
