import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import type { RedisClientType } from 'redis';

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const INITIAL_DELAY_MS  = 30_000;        // laisser le temps aux services de démarrer

@Injectable()
export class HealthMonitorService implements OnModuleInit {
  private readonly logger = new Logger(HealthMonitorService.name);
  private readonly states = new Map<string, boolean>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientType,
  ) {}

  onModuleInit() {
    setTimeout(() => {
      this.checkAll().catch(() => {});
      setInterval(() => this.checkAll().catch(() => {}), CHECK_INTERVAL_MS);
    }, INITIAL_DELAY_MS);
  }

  private async checkAll(): Promise<void> {
    await Promise.allSettled([
      this.check('Base de données', () => this.checkDb()),
      this.check('Cache Redis',     () => this.checkRedis()),
      this.check('MinIO',           () => this.checkMinio()),
    ]);
  }

  private async check(name: string, fn: () => Promise<boolean>): Promise<void> {
    try {
      const healthy = await fn();
      const prev = this.states.get(name);
      this.states.set(name, healthy);

      if (!healthy && prev !== false) {
        this.logger.warn(`[HealthMonitor] ${name} DOWN`);
        this.notifications.notifySystemComponentDown(name).catch(() => {});
      } else if (healthy && prev === false) {
        this.logger.log(`[HealthMonitor] ${name} RECOVERED`);
        this.notifications.notifySystemComponentRecovered(name).catch(() => {});
      }
    } catch {
      // Ignorer les erreurs du check lui-même
    }
  }

  private async checkDb(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      if (!this.redis.isReady) return false;
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }

  private async checkMinio(): Promise<boolean> {
    const endpoint = this.config.get<string>('R2_ENDPOINT');
    if (!endpoint) return true;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(`${endpoint}/minio/health/live`, { signal: ctrl.signal });
      clearTimeout(t);
      return res.ok;
    } catch {
      return false;
    }
  }
}
