import { SourceResource } from '../../contracts/semantic-definition';

export const financeGeneralResource: SourceResource = {
  connector: 'sage100', key: 'finance_general',
  schemaVersion: 'views_stable-ca_ht-source-2',
  table: 'dbo.VW_FINANCE_GENERAL',
  expressions: { revenue: 'ca_ht', accounting_date: 'dt_jour',
    month: 'annee_mois', account: 'cg_num' },
  dateStorage: 'local_date',
  fixedFilters: [],
};
