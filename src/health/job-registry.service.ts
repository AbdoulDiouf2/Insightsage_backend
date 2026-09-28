import { Inject, Injectable, Logger } from '@nestjs/common';
import { REDIS_CLIENT } from '../redis/redis.module';
import type { RedisClientType } from 'redis';

export interface JobStatus {
  name: string;
  lastRunAt: string | null;
  lastRunDurationMs: number | null;
  lastRunSuccess: boolean | null;
  lastError: string | null;
  runCount: number;
}

/** Hash Redis partagé par tous les workers du cluster. */
const REDIS_KEY = 'health:jobs';

/** Purge le hash si plus aucun worker n'écrit (7 jours). */
const REDIS_TTL_SECONDS = 7 * 24 * 3600;

@Injectable()
export class JobRegistryService {
  private readonly logger = new Logger(JobRegistryService.name);

  /**
   * Copie locale : sert de repli quand Redis est indisponible, et de source de
   * vérité pour le compteur de passages du worker courant.
   */
  private readonly jobs = new Map<string, JobStatus>();

  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClientType) {}

  async run<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    const prev = this.jobs.get(name);
    const job: JobStatus = {
      name,
      lastRunAt: new Date().toISOString(),
      lastRunDurationMs: null,
      lastRunSuccess: null,
      lastError: null,
      runCount: (prev?.runCount ?? 0) + 1,
    };

    try {
      const result = await fn();
      job.lastRunSuccess = true;
      job.lastRunDurationMs = Date.now() - start;
      return result;
    } catch (error) {
      job.lastRunSuccess = false;
      job.lastError = error instanceof Error ? error.message : String(error);
      job.lastRunDurationMs = Date.now() - start;
      throw error;
    } finally {
      this.jobs.set(name, job);
      await this.publish(job);
    }
  }

  /**
   * En cluster PM2, seul le worker meneur exécute les tâches, mais /health/jobs
   * est réparti entre tous les workers. Sans publication partagée, un worker sur
   * deux répondrait « aucun job enregistré ».
   */
  private async publish(job: JobStatus): Promise<void> {
    try {
      await this.redis.hSet(REDIS_KEY, job.name, JSON.stringify(job));
      await this.redis.expire(REDIS_KEY, REDIS_TTL_SECONDS);
    } catch {
      // Redis indisponible — la copie locale suffit, le statut réapparaîtra au
      // prochain passage une fois le cache revenu.
    }
  }

  async getAll(): Promise<JobStatus[]> {
    const local = Array.from(this.jobs.values());

    try {
      const raw = await this.redis.hGetAll(REDIS_KEY);
      const shared = Object.values(raw).map((v) => JSON.parse(v) as JobStatus);
      if (shared.length > 0) return this.sorted(shared);
    } catch {
      // Repli sur la copie locale ci-dessous.
    }

    return this.sorted(local);
  }

  private sorted(jobs: JobStatus[]): JobStatus[] {
    return [...jobs].sort((a, b) => a.name.localeCompare(b.name));
  }
}
