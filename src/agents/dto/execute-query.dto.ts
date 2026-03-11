import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ExecuteQueryDto {
  @ApiProperty({
    description: 'Requête SQL SELECT à exécuter via l\'agent on-premise',
    example: 'SELECT TOP 100 * FROM F_DOCENTETE WHERE DO_Type = 1',
    maxLength: 4000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  sql: string;
}
