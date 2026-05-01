import { Injectable } from '@nestjs/common';

export interface JobStatus {
  name: string;
  lastRunAt: string | null;
  lastRunDurationMs: number | null;
  lastRunSuccess: boolean | null;
  lastError: string | null;
  runCount: number;
}

@Injectable()
export class JobRegistryService {
  private readonly jobs = new Map<string, JobStatus>();

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
      this.jobs.set(name, job);
      return result;
    } catch (error) {
      job.lastRunSuccess = false;
      job.lastError = error instanceof Error ? error.message : String(error);
      job.lastRunDurationMs = Date.now() - start;
      this.jobs.set(name, job);
      throw error;
    }
  }

  getAll(): JobStatus[] {
    return Array.from(this.jobs.values()).sort((a, b) => a.name.localeCompare(b.name));
  }
}
