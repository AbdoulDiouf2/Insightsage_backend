import { IsOptional, IsString, IsBoolean, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateOrganizationDto {
    @ApiProperty({ example: 'Acme Corp', required: false })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiProperty({ example: 'enterprise', required: false })
    @IsString()
    @IsOptional()
    size?: string;

    @ApiProperty({ example: 'premium', required: false })
    @IsString()
    @IsOptional()
    plan?: string;

    @ApiProperty({ example: 'X3', required: false })
    @IsString()
    @IsOptional()
    sageType?: string;
}
