export type JobStateV2 = 'PENDING' | 'DISPATCHED' | 'RUNNING' |
  'COMPLETED' | 'FAILED' | 'TIMED_OUT' | 'CANCELLED';
export const TERMINAL_STATES_V2: readonly JobStateV2[] = ['COMPLETED', 'FAILED', 'TIMED_OUT', 'CANCELLED'];
export const ACTIVE_STATES_V2: readonly JobStateV2[] = ['PENDING', 'DISPATCHED', 'RUNNING'];
