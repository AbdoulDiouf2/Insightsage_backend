import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class Step4Dto {
  @ApiProperty({
    description: 'Profils métiers sélectionnés pour cette organisation',
    example: ['daf', 'controller', 'analyst'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  profiles: string[];
}
