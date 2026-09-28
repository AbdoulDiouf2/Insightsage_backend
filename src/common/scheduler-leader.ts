/**
 * En cluster PM2, chaque worker charge l'application entière — donc chaque
 * `@Cron` et chaque `setInterval` s'exécute une fois par worker. Sans garde, les
 * rappels de fin d'essai partent en double à chaque passage du cron.
 *
 * PM2 expose `NODE_APP_INSTANCE` (index du worker) uniquement en mode cluster.
 * Hors cluster — dev local, mode fork, tests — la variable est absente et tout
 * s'exécute normalement.
 *
 * Volontairement indépendant de Redis : les tâches planifiées doivent continuer
 * de tourner pendant une coupure du cache.
 */
export function isSchedulerLeader(): boolean {
  const instance = process.env.NODE_APP_INSTANCE;
  return instance === undefined || instance === '0';
}
