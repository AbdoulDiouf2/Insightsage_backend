/** Offline catalogue classification only. Never executes or promotes legacy SQL to V2. */
export type LegacyAuditStatus =
  | 'COMPATIBLE'
  | 'ADAPTABLE'
  | 'INCOMPATIBLE'
  | 'BROKEN'
  | 'PLACEHOLDER';

export interface LegacyCatalogueEntry {
  key?: unknown;
  name?: unknown;
  sqlSage100?: unknown;
  sqlSage100View?: unknown;
  sqlSage100Tables?: unknown;
}

export interface LegacyAuditFinding {
  key: string;
  name: string;
  status: LegacyAuditStatus;
  reasons: string[];
  source: string;
}

/** Conservative static triage: no schema introspection, DB connection, or SQL execution. */
export function auditLegacyEntry(
  entry: LegacyCatalogueEntry,
  source: string,
): LegacyAuditFinding {
  const key = typeof entry.key === 'string' ? entry.key : '';
  const name = typeof entry.name === 'string' ? entry.name : '';
  const sql = typeof entry.sqlSage100 === 'string' ? entry.sqlSage100.trim() : '';
  const reasons: string[] = [];

  if (!key || !name) {
    return { key, name, source, status: 'BROKEN', reasons: ['Clé ou nom absent du catalogue.'] };
  }
  if (!sql || /^--/.test(sql) || /\b(?:TODO|TBD|MOCK|PLACEHOLDER)\b/i.test(sql)) {
    return { key, name, source, status: 'PLACEHOLDER', reasons: ['SQL absent, commentaire descriptif ou marqueur de substitution ; aucune requête exécutable garantie.'] };
  }
  if (!/^\s*SELECT\b/i.test(sql) || /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC(?:UTE)?)\b/i.test(sql)) {
    return { key, name, source, status: 'BROKEN', reasons: ['SQL non limité à une instruction SELECT selon le contrôle statique.'] };
  }
  if ((sql.match(/\{\{/g) ?? []).length !== (sql.match(/\}\}/g) ?? []).length) {
    return { key, name, source, status: 'BROKEN', reasons: ['Délimiteurs de template non appariés.'] };
  }

  // Legacy SQL is never accepted as a V2 MetricDefinition without a reviewed mapping.
  if (/\{\{|@[A-Za-z_]|\bJOIN\b|\bUNION\b|\bWITH\b|\bOVER\s*\(/i.test(sql)) {
    reasons.push('Template, paramètre ou composition SQL à traduire en mapping sémantique contrôlé.');
    return { key, name, source, status: 'INCOMPATIBLE', reasons };
  }
  if (/\b(?:SUM|COUNT|AVG|MIN|MAX)\s*\(/i.test(sql)) {
    reasons.push('Agrégat identifiable ; vérifier source, colonnes, filtres et périodes avant tout mapping V2.');
    return { key, name, source, status: 'ADAPTABLE', reasons };
  }
  reasons.push('SELECT simple apparent ; compatibilité limitée à la forme statique, jamais validée contre Sage.');
  return { key, name, source, status: 'COMPATIBLE', reasons };
}
