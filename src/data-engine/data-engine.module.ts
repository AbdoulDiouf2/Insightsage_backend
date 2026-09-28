import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DataController } from './data.controller';
import { DataService } from './data.service';
import { SemanticRegistryService } from './semantic/semantic-registry.service';
import { SecurityScopeService } from './planner/security-scope.service';
import { QueryValidatorService } from './planner/query-validator.service';
import { PeriodResolverService } from './planner/period-resolver.service';
import { SqlCompilerService } from './planner/sql-compiler.service';
import { QueryPlannerService } from './planner/query-planner.service';
import { QueryCacheService } from './cache/query-cache.service';
import { DataJobV2Service } from './jobs/data-job-v2.service';
import { DataJobV2Dispatcher } from './jobs/data-job-v2.dispatcher';

@Module({
  imports: [PrismaModule],
  controllers: [DataController],
  providers: [DataService, SemanticRegistryService, SecurityScopeService, QueryValidatorService,
    PeriodResolverService, SqlCompilerService, QueryPlannerService, QueryCacheService,
    DataJobV2Service, DataJobV2Dispatcher],
  exports: [DataJobV2Service, DataJobV2Dispatcher],
})
export class DataEngineModule {}
