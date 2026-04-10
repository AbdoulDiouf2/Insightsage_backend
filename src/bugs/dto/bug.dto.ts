import { IsString, IsArray, IsOptional, IsInt, IsBoolean, MinLength, MaxLength, IsUrl } from 'class-validator';

export class CreateBugDto {
  @IsString()
  @MinLength(10)
  @MaxLength(120)
  title: string;

  @IsArray()
  @IsString({ each: true })
  bug_type: string[];

  @IsString()
  module: string;

  @IsString()
  @IsOptional()
  priority?: string = 'moyenne';

  @IsInt()
  @IsOptional()
  severity?: number = 3;

  @IsString()
  @IsOptional()
  organizationId?: string;

  @IsString()
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  browser?: string;

  @IsString()
  @IsOptional()
  os?: string;

  @IsString()
  @IsOptional()
  screen?: string;

  @IsString()
  @IsOptional()
  path?: string;

  @IsString()
  @IsOptional()
  userAgent?: string;

  @IsString()
  @IsOptional()
  entity_code?: string;

  @IsInt()
  @IsOptional()
  fiscal_year?: number;

  @IsString()
  @IsOptional()
  period_start?: string;

  @IsString()
  @IsOptional()
  period_end?: string;

  @IsString()
  @MinLength(30)
  description: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  steps_to_reproduce?: string[] = [];

  @IsString()
  @IsOptional()
  expected_behavior?: string;

  @IsString()
  @IsOptional()
  actual_behavior?: string;

  @IsString()
  frequency: string;

  @IsString()
  impact: string;

  @IsString()
  @IsOptional()
  users_impacted?: string;

  @IsBoolean()
  @IsOptional()
  workaround?: boolean = false;

  @IsString()
  @IsOptional()
  workaround_desc?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[] = [];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  attachments?: string[] = [];

  @IsString()
  @IsOptional()
  console_errors?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  notify_emails?: string[] = [];
}

export class UpdateBugStatusDto {
  @IsString()
  status: string;
}

export class AddCommentDto {
  @IsString()
  content: string;

  @IsBoolean()
  @IsOptional()
  isInternal?: boolean = false;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  mentionedUserIds?: string[];
}

export class AssignBugDto {
  @IsString()
  @IsOptional()
  userId?: string | null;
}
