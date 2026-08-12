import { Module, Global, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/** Intervalle minimal entre deux logs d'erreur Redis (évite de noyer les logs PM2). */
const ERROR_LOG_THROTTLE_MS = 30_000;

/** Délai max avant de laisser l'app démarrer sans Redis. */
const INITIAL_CONNECT_TIMEOUT_MS = 5_000;

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const logger = new Logger('Redis');
        const url = config.get<string>('REDIS_URL') || 'redis://localhost:6379';

        const client = createClient({
          url,
          // Sans ça, les commandes émises pendant une coupure sont mises en file
          // d'attente et leur promesse ne résout jamais : chaque requête HTTP qui
          // touche Redis se fige et l'API entière devient inopérante.
          // Avec ça, elles rejettent immédiatement et les fallbacks s'appliquent.
          disableOfflineQueue: true,
          socket: {
            connectTimeout: 5_000,
            // Backoff exponentiel plafonné à 5s, reconnexion infinie.
            reconnectStrategy: (retries) => Math.min(100 * 2 ** retries, 5_000),
          },
        });

        let lastErrorLoggedAt = 0;
        let wasReady = false;

        client.on('error', (err: any) => {
          const now = Date.now();
          if (now - lastErrorLoggedAt < ERROR_LOG_THROTTLE_MS) return;
          lastErrorLoggedAt = now;
          const detail = err?.code || err?.message || String(err);
          logger.error(`Connexion perdue (${detail}) — mode dégradé, reconnexion en cours`);
        });

        client.on('ready', () => {
          if (!wasReady) logger.log('Connecté');
          else logger.log('Reconnecté après coupure');
          wasReady = true;
          lastErrorLoggedAt = 0;
        });

        // Connexion non bloquante : si Redis est mort au démarrage, l'app démarre
        // quand même en mode dégradé et le client reconnecte en arrière-plan.
        const connecting = client.connect().catch(() => {
          logger.warn('Indisponible au démarrage — API en mode dégradé');
        });

        await Promise.race([
          connecting,
          new Promise((resolve) => setTimeout(resolve, INITIAL_CONNECT_TIMEOUT_MS)),
        ]);

        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
