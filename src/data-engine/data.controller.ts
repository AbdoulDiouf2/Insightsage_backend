import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators';
import type { AuthenticatedIdentity } from './planner/security-scope.service';
import { QueryRequest } from './contracts/query-request';
import { DataService } from './data.service';

@Controller('data')
export class DataController {
  constructor(private readonly data: DataService) {}
  @Post('query')
  query(@Body() request: QueryRequest, @CurrentUser() user: AuthenticatedIdentity) {
    return this.data.query(request, user);
  }
  @Get('jobs/:id')
  getJob(@Param('id') id: string, @CurrentUser() user: AuthenticatedIdentity) {
    return this.data.getJob(id, user);
  }
  @Post('jobs/:id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedIdentity) {
    return this.data.cancelJob(id, user);
  }
}
