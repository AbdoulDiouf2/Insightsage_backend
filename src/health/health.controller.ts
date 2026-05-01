import { Controller, Get, Inject } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { JobRegistryService } from './job-registry.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { REDIS_CLIENT } from '../redis/redis.module';
import { ConfigService } from '@nestjs/config';
import type { RedisClientType } from 'redis';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private jobRegistry: JobRegistryService,
    @Inject(REDIS_CLIENT) private redis: RedisClientType
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'API health check' })
  async check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'insightsage-api',
      version: '1.0.0',
    };
  }

  @Public()
  @Get('db')
  @ApiOperation({ summary: 'Dependencies connection health check' })
  async checkDb() {
    const health: any = {
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      redis: 'disconnected',
      mkdocs: 'disconnected',
      minio: 'disconnected',
    };

    let hasError = false;

    // Check PostgreSQL
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      health.database = 'connected';
    } catch (error) {
      hasError = true;
      health.databaseError = error instanceof Error ? error.message : 'Unknown error';
    }

    // Check Redis
    try {
      if (this.redis.isReady) {
        await this.redis.ping();
        health.redis = 'connected';
      } else {
        hasError = true;
        health.redisError = 'Redis client not ready';
      }
    } catch (error) {
      hasError = true;
      health.redisError = error instanceof Error ? error.message : 'Unknown error';
    }

    // Check MkDocs
    try {
      const mkdocsUrl = this.config.get<string>('MKDOCS_URL');
      if (mkdocsUrl) {
        // Un timeout court pour ne pas bloquer le healthcheck global
        const mController = new AbortController();
        const timeout = setTimeout(() => mController.abort(), 2000);
        
        const response = await fetch(mkdocsUrl, { signal: mController.signal });
        clearTimeout(timeout);
        
        if (response.ok) {
          health.mkdocs = 'connected';
        } else {
           hasError = true;
           health.mkdocsError = `Status ${response.status} from MkDocs`;
        }
      } else {
        health.mkdocs = 'not_configured';
      }
    } catch (error) {
      hasError = true;
      health.mkdocsError = error instanceof Error ? error.message : 'Unknown error';
    }

    // Check MinIO
    try {
      const minioEndpoint = this.config.get<string>('R2_ENDPOINT');
      if (minioEndpoint) {
        const mController = new AbortController();
        const timeout = setTimeout(() => mController.abort(), 2000);
        const response = await fetch(`${minioEndpoint}/minio/health/live`, { signal: mController.signal });
        clearTimeout(timeout);
        if (response.ok) {
          health.minio = 'connected';
          health.minioBucket = this.config.get<string>('R2_BUCKET_NAME') ?? '';
        } else {
          hasError = true;
          health.minioError = `Status ${response.status}`;
        }
      } else {
        health.minio = 'not_configured';
      }
    } catch (error) {
      hasError = true;
      health.minioError = error instanceof Error ? error.message : 'Unknown error';
    }

    health.status = hasError ? 'error' : 'ok';
    return health;
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Background jobs status' })
  getJobs() {
    return this.jobRegistry.getAll();
  }
}
