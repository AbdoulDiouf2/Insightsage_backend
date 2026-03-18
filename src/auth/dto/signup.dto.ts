import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignupDto {
  @ApiProperty({ example: 'Jean' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Dupont' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ example: 'jean@entreprise.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Mon Entreprise SAS' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  organizationName!: string;

  @ApiProperty({ example: 'MonMotDePasse1' })
  @IsString()
  @MinLength(8)
  password!: string;
}
