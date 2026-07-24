import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ContactDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  company: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  message?: string;
}
