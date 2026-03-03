import { Injectable, Logger } from '@nestjs/common';
import { identify } from 'sql-query-identifier';

@Injectable()
export class SqlSecurityService {
  private readonly logger = new Logger(SqlSecurityService.name);

  // Forbidden SQL keywords (write operations)
  private readonly FORBIDDEN_KEYWORDS = [
    'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE',
    'TRUNCATE', 'EXEC', 'EXECUTE', 'GRANT', 'REVOKE',
    'MERGE', 'CALL', 'BULK', 'OPENROWSET', 'OPENDATASOURCE',
    '--', '/*',
  ];

  /**
   * Valide une requête SQL avant de l'envoyer à l'agent
   * @param sql La requête SQL à valider
   * @returns { is_valid: boolean; error?: string }
   */
  validate(sql: string): { isValid: boolean; error?: string } {
    if (!sql || !sql.trim()) {
      return { isValid: false, error: 'Requête SQL vide' };
    }

    try {
      // 1. Identification via parser
      const queries = identify(sql, { strict: false });

      if (queries.length === 0) {
        return { isValid: false, error: 'Requête SQL invalide ou illisible' };
      }

      if (queries.length > 1) {
        return {
          isValid: false,
          error: 'Les requêtes SQL multiples ne sont pas autorisées',
        };
      }

      const query = queries[0];

      // 2. Doit être une requête SELECT
      if (query.type !== 'SELECT') {
        this.logger.warn(`Tentative d'exécution d'une requête non-SELECT: ${query.type}`);
        return {
          isValid: false,
          error: 'Seules les requêtes SELECT sont autorisées',
        };
      }

      // 3. Vérification des mots-clés interdits (Defense in Depth)
      const sqlUpper = sql.toUpperCase();
      for (const keyword of this.FORBIDDEN_KEYWORDS) {
        // Pour les mots-clés, on s'assure que ce sont des mots entiers via regex
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(sql)) {
          this.logger.warn(`Mot-clé interdit détecté: ${keyword}`);
          return { isValid: false, error: `Mot-clé interdit détecté: ${keyword}` };
        }
      }

      // Cas particulier pour les commentaires (souvent hors tokens Keyword)
      if (sql.includes('--') || sql.includes('/*')) {
        this.logger.warn('Commentaires SQL détectés');
        return { isValid: false, error: 'Les commentaires SQL ne sont pas autorisés' };
      }

      return { isValid: true };
    } catch (error) {
      this.logger.error(`Erreur lors de la validation SQL: ${error.message}`);
      return { isValid: false, error: 'Erreur technique de validation SQL' };
    }
  }
}
