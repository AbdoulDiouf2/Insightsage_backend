import { Injectable } from '@nestjs/common';
import { PeriodDefinition } from '../contracts/query-request';
import { ResolvedPeriod } from '../contracts/query-plan';
import { QueryFailure } from '../contracts/query-error';

@Injectable()
export class PeriodResolverService {
  private parts(date: Date, zone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const get = (name: string) => Number(parts.find(p => p.type === name)?.value);
    return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute'), sec: get('second') };
  }
  private zonedMidnight(y: number, m: number, d: number, zone: string): string {
    const wanted = Date.UTC(y, m - 1, d);
    let candidate = wanted;
    for (let i = 0; i < 3; i++) {
      const p = this.parts(new Date(candidate), zone);
      const observed = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.sec);
      candidate += wanted - observed;
    }
    return new Date(candidate).toISOString();
  }
  compare(period: ResolvedPeriod, type: 'previous_period' | 'previous_year',
    definition?: PeriodDefinition): ResolvedPeriod {
    const local = (instant: string) => this.parts(new Date(instant), period.timezone);
    const a = local(period.fromInclusive);
    const b = local(period.toExclusive);
    const fromDay = Date.UTC(a.y, a.m - 1, a.d);
    const toDay = Date.UTC(b.y, b.m - 1, b.d);
    if (type === 'previous_period') {
      const named = definition?.type === 'relative' ? definition.value : undefined;
      const months = ['current_month', 'previous_month'].includes(named ?? '') ? 1
        : ['current_quarter', 'previous_quarter'].includes(named ?? '') ? 3
        : named === 'current_year' || named === 'previous_year' ? 12 : 0;
      if (months) {
        const previousStart = new Date(Date.UTC(a.y, a.m - 1 - months, 1));
        return { ...period,
          fromInclusive: this.zonedMidnight(previousStart.getUTCFullYear(),
            previousStart.getUTCMonth() + 1, 1, period.timezone),
          toExclusive: period.fromInclusive };
      }
      const days = Math.round((toDay - fromDay) / 86400000);
      const start = new Date(fromDay - days * 86400000);
      return { ...period,
        fromInclusive: this.zonedMidnight(start.getUTCFullYear(), start.getUTCMonth() + 1,
          start.getUTCDate(), period.timezone),
        toExclusive: period.fromInclusive };
    }
    const shifted = (value: ReturnType<typeof local>) => {
      const year = value.y - 1;
      const day = Math.min(value.d, new Date(Date.UTC(year, value.m, 0)).getUTCDate());
      return this.zonedMidnight(year, value.m, day, period.timezone);
    };
    return { ...period, fromInclusive: shifted(a), toExclusive: shifted(b) };
  }
  resolve(period: PeriodDefinition | undefined, zone: string, dateDimension: string, now = new Date()): ResolvedPeriod | undefined {
    if (!period) return undefined;
    try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); }
    catch { throw new QueryFailure('NOT_CONFIGURED', 'Fuseau horaire non configuré'); }
    if (period.type === 'absolute') {
      if (!period.from || !period.to || !/[Zz]|[+-]\d\d:\d\d$/.test(period.from) ||
          !/[Zz]|[+-]\d\d:\d\d$/.test(period.to) ||
          !Number.isFinite(Date.parse(period.from)) || !Number.isFinite(Date.parse(period.to)) ||
          Date.parse(period.from) >= Date.parse(period.to))
        throw new QueryFailure('QUERY_INVALID', 'Bornes absolues invalides');
      return { dateDimension, fromInclusive: new Date(period.from).toISOString(),
        toExclusive: new Date(period.to).toISOString(), timezone: zone };
    }
    const p = this.parts(now, zone);
    let start = Date.UTC(p.y, p.m - 1, p.d);
    let end = start + 86400000;
    switch (period.value) {
      case 'today': break;
      case 'current_week': start -= ((new Date(start).getUTCDay() + 6) % 7) * 86400000; end = start + 7 * 86400000; break;
      case 'current_month': start = Date.UTC(p.y, p.m - 1, 1); end = Date.UTC(p.y, p.m, 1); break;
      case 'current_quarter': start = Date.UTC(p.y, Math.floor((p.m - 1) / 3) * 3, 1); end = Date.UTC(p.y, Math.floor((p.m - 1) / 3) * 3 + 3, 1); break;
      case 'current_year': start = Date.UTC(p.y, 0, 1); end = Date.UTC(p.y + 1, 0, 1); break;
      case 'previous_month': start = Date.UTC(p.y, p.m - 2, 1); end = Date.UTC(p.y, p.m - 1, 1); break;
      case 'previous_quarter': start = Date.UTC(p.y, Math.floor((p.m - 1) / 3) * 3 - 3, 1); end = Date.UTC(p.y, Math.floor((p.m - 1) / 3) * 3, 1); break;
      case 'previous_year': start = Date.UTC(p.y - 1, 0, 1); end = Date.UTC(p.y, 0, 1); break;
      default: throw new QueryFailure('QUERY_INVALID', 'Période inconnue');
    }
    const a = new Date(start), b = new Date(end);
    return { dateDimension,
      fromInclusive: this.zonedMidnight(a.getUTCFullYear(), a.getUTCMonth() + 1, a.getUTCDate(), zone),
      toExclusive: this.zonedMidnight(b.getUTCFullYear(), b.getUTCMonth() + 1, b.getUTCDate(), zone),
      timezone: zone };
  }
}
