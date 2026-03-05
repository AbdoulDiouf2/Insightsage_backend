import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class NlqQueryDto {
    @ApiProperty({
        example: "quel est mon chiffre d'affaires ce mois-ci ?",
        description: 'La question en langage naturel posée par l utilisateur',
    })
    @IsString()
    @IsNotEmpty()
    query: string;
}
