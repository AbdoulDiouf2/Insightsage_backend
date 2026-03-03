import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SqlSecurityService {
  private readonly logger = new Logger(SqlSecurityService.name);

  // Forbidden SQL keywords (write operations)
  private readonly FORBIDDEN_KEYWORDS = [
    'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE',
    'TRUNCATE', 'EXEC', 'EXECUTE', 'GRANT', 'REVOKE',
    'MERGE', 'CALL', 'BULK', 'OPENROWSET', 'OPENDATASOURCE',
    '--', ';', '/*'
  ];

  /**
   * Valide une requête SQL avant de l'envoyer à l'agent
   * @param sql La requête SQL à valider
   * @returns { is_valid: boolean; error?: string; detail?: string }
   */
  validate(sql: string): { isValid: boolean; error?: string } {
    if (!sql || !sql.trim()) {
      return { isValid: false, error: 'Requête SQL vide' };
    }

    const sqlUpper = sql.toUpperCase().trim();

    // 1. Doit commencer par SELECT
    if (!sqlUpper.startsWith('SELECT')) {
      return { isValid: false, error: 'Seules les requêtes SELECT sont autorisées' };
    }

    // 2. Vérification des mots-clés interdits
    for (const keyword of this.FORBIDDEN_KEYWORDS) {
      if (sqlUpper.includes(keyword)) {
        // Cas particulier pour les commentaires qui peuvent être n'importe où
        if (keyword === '--' || keyword === '/*' || keyword === ';') {
           if (sql.includes(keyword)) {
              return { isValid: false, error: `Caractère ou mot-clé interdit détecté: ${keyword}` };
           }
        } else {
           // Pour les mots-clés, on s'assure que ce sont des mots entiers via regex
           const regex = new RegExp(`\\b${keyword}\\b`, 'i');
           if (regex.test(sql)) {
             return { isValid: false, error: `Mot-clé interdit détecté: ${keyword}` };
           }
        }
      }
    }

    // 3. Vérification des requêtes multiples
    if (sql.includes(';') && sql.trim().indexOf(';') !== sql.trim().length - 1) {
      return { isValid: false, error: 'Les requêtes SQL multiples ne sont pas autorisées' };
    }

    return { isValid: true };
  }
}
