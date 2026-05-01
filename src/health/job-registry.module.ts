import { Global, Module } from '@nestjs/common';
import { JobRegistryService } from './job-registry.service';

@Global()
@Module({
  providers: [JobRegistryService],
  exports: [JobRegistryService],
})
export class JobRegistryModule {}
