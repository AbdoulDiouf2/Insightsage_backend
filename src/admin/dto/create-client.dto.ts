import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateClientDto {
  @ApiProperty({
    example: 'Acme Corp',
    description: "The name of the new client's organization",
  })
  @IsString()
  @IsNotEmpty()
  organizationName: string;

  @ApiProperty({
    example: 'admin@acmecorp.com',
    description: "The email of the client's root DAF/Owner",
  })
  @IsEmail()
  @IsNotEmpty()
  adminEmail: string;

  @ApiProperty({ example: 'Jean', description: 'First name of the admin user' })
  @IsString()
  @IsNotEmpty()
  adminFirstName: string;

  @ApiProperty({
    example: 'Dupont',
    description: 'Last name of the admin user',
  })
  @IsString()
  @IsNotEmpty()
  adminLastName: string;

  @ApiProperty({
    example: 'plan_uuid_here',
    description: 'Optional: ID of the subscription plan to assign',
    required: false,
  })
  @IsString()
  @IsNotEmpty()
  planId?: string;
}
