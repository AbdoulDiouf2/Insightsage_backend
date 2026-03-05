import { IsNotEmpty, IsString, IsOptional, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class NlqAddToDashboardDto {
    @ApiProperty({
        example: 'uuid-session-nlq',
        description: 'ID de la session NLQ a transformer en widget',
    })
    @IsString()
    @IsNotEmpty()
    sessionId: string;

    @ApiProperty({
        example: 'uuid-dashboard',
        description: 'ID du dashboard cible',
    })
    @IsString()
    @IsNotEmpty()
    dashboardId: string;

    @ApiProperty({
        example: 'Mon Graphique NLQ',
        description: 'Nom personnalise pour le widget',
    })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiProperty({
        example: { x: 0, y: 0, w: 4, h: 3 },
        description: 'Position et taille du widget sur la grille',
    })
    @IsObject()
    @IsOptional()
    position?: any;
}
