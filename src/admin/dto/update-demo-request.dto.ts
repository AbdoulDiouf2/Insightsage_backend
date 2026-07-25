import { IsEnum, IsOptional, IsString, IsObject, MaxLength } from 'class-validator';
import { DemoRequestStatus } from '@prisma/client';

export class UpdateDemoRequestDto {
  @IsEnum(DemoRequestStatus)
  @IsOptional()
  status?: DemoRequestStatus;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;

  @IsObject()
  @IsOptional()
  statusMeta?: Record<string, any>;
}
