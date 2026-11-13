import { Link } from '@tanstack/react-router';
import { ArrowRight, Droplets, Flame, RefreshCw, Zap } from 'lucide-react';
import { Button } from './ui/button';
import { kes } from '@/lib/landlord-reporting';
import type { getLandlordDashboard } from '@/lib/landlord-dashboard.functions';

type DashboardData = Awaited<ReturnType<typeof getLandlordDashboard>>;
const labels = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', annually: 'Annually' };
const periodLabels = { daily: 'Today', weekly: 'Current week · Mon–Sun', monthly: 'Current month', annually: 'Current calendar year' };
const typeIcons = { Electricity: Zap, Water: Droplets, Gas: Flame };
const typeColors = { Electricity: 'text-primary', Water: 'text-accent', Gas: 'text-foreground' };
const date = (value: string) => new Date(value).toLocaleDateString('en-KE', {
  timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric',
});
const time = (value: string) => new Date(value).toLocaleTimeString('en-KE', {
  timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit',
});

export function LandlordDashboardSummary({ data, refreshing, onRefresh, refreshError, viewAllTo = '/landlord/recent-tokens', scopeLabel = 'linked' }: {
  viewAllTo?: '/landlord/recent-tokens' | '/vendor/tokens'; scopeLabel?: string;
  data: DashboardData; refreshing: boolean; onRefresh: () => void; refreshError: boolean;
}) {
  return <div className="min-w-0 space-y-8 pb-6">
    {refreshError && <p role="alert" className="text-sm text-destructive">Could not refresh collections. Last saved figures are shown.</p>}
    <section aria-labelledby="collection-heading" className="min-w-0">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="collection-heading" className="text-lg font-bold text-foreground">Properties Payment Collection Summary</h2>
          <p className="mt-1 text-sm text-muted-foreground">{data.propertyCount} {scopeLabel} {data.propertyCount === 1 ? 'property' : 'properties'} · Confirmed payments · Africa/Nairobi (EAT)</p>
        </div>
        <Button variant="outline" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={refreshing ? 'motion-safe:animate-spin' : ''} />Refresh
        </Button>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.collections.map(period => <article key={period.key} aria-label={`${labels[period.key]} collections`} className="min-w-0 rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">{labels[period.key]}</h3>
          <p className="mt-1 min-h-5 text-xs text-muted-foreground">{periodLabels[period.key]}</p>
          <p className="my-4 break-words text-xl font-bold tabular-nums text-foreground">{kes(period.total)}</p>
          <p className="text-xs text-muted-foreground">{date(period.from)}{period.key !== 'daily' && ` – ${date(new Date(Date.parse(period.to) - 1).toISOString())}`}</p>
          <dl className="mt-4 space-y-2 border-t border-border pt-3">
            {period.byType.map(({ type, total }) => {
              const Icon = typeIcons[type];
              return <div key={type} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
                <dt className="flex items-center gap-1.5 text-muted-foreground"><Icon aria-hidden="true" className={`size-3.5 ${typeColors[type]}`} />{type}</dt>
                <dd className="font-medium tabular-nums text-foreground">{kes(total)}</dd>
              </div>;
            })}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">{period.count} {period.count === 1 ? 'payment' : 'payments'}</p>
        </article>)}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">As of {date(data.updatedAt)}, {time(data.updatedAt)} EAT</p>
    </section>

    <section aria-labelledby="recent-tokens-heading" className="min-w-0 border-t border-border pt-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="recent-tokens-heading" className="text-lg font-bold text-foreground">Recent Token Transactions</h2>
        <Button asChild variant="outline" className="h-auto min-h-9 max-w-full whitespace-normal text-left">
          <Link to={viewAllTo}>View All Token Transactions<ArrowRight /></Link>
        </Button>
      </header>
      {data.recent.length === 0 ? <div className="border-y border-border py-10 text-center text-sm text-muted-foreground">No successful token transactions for these properties.</div> : <>
        <div className="hidden overflow-x-auto border-y border-border md:block">
          <table aria-label="Recent Token Transactions" className="w-full text-left text-sm">
            <thead className="bg-secondary text-xs text-muted-foreground"><tr>
              {['Date / Time (EAT)', 'Property', 'Unit Name', 'Meter Number', 'Meter Type', 'Transaction ID', 'Amount Paid', 'Token Units'].map(label => <th key={label} className="whitespace-nowrap px-3 py-3 font-semibold">{label}</th>)}
            </tr></thead>
            <tbody>{data.recent.map(row => <tr key={row.record_id} className="border-t border-border">
              <td className="whitespace-nowrap px-3 py-3">{date(row.txn_at)}<span className="block text-xs text-muted-foreground">{time(row.txn_at)}</span></td>
              <td className="min-w-40 max-w-64 break-words px-3 py-3 font-medium">{row.property_name}</td>
              <td className="px-3 py-3">{row.unit_name}</td>
              <td className="whitespace-nowrap px-3 py-3 font-mono text-xs">{row.meter_number}</td>
              <td className="px-3 py-3">{row.meter_type}</td>
              <td className="max-w-52 break-all px-3 py-3 font-mono text-xs">{row.trans_id ?? row.token_id}</td>
              <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums">{kes(row.amount_paid)}</td>
              <td className="whitespace-nowrap px-3 py-3 tabular-nums">{row.units?.toLocaleString('en-KE', { maximumFractionDigits: 4 }) ?? '—'}{row.units != null && row.meter_type === 'Electricity' ? ' kWh' : ''}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <ol aria-label="Recent Token Transactions" className="divide-y divide-border border-y border-border md:hidden">
          {data.recent.map(row => <li key={row.record_id} className="min-w-0 py-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><p className="min-w-0 flex-1 break-words text-sm font-semibold">{row.property_name}</p><p className="text-sm font-bold tabular-nums">{kes(row.amount_paid)}</p></div>
            <p className="mt-1 text-xs text-muted-foreground">{date(row.txn_at)} · {time(row.txn_at)} EAT</p>
            <dl className="mt-3 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
              <dt className="text-muted-foreground">Unit Name</dt><dd className="break-words">{row.unit_name}</dd>
              <dt className="text-muted-foreground">Meter</dt><dd className="break-all font-mono">{row.meter_number} · {row.meter_type}</dd>
              <dt className="text-muted-foreground">Transaction ID</dt><dd className="break-all font-mono">{row.trans_id ?? row.token_id}</dd>
              <dt className="text-muted-foreground">Token Units</dt><dd className="tabular-nums">{row.units?.toLocaleString('en-KE', { maximumFractionDigits: 4 }) ?? '—'}{row.units != null && row.meter_type === 'Electricity' ? ' kWh' : ''}</dd>
            </dl>
          </li>)}
        </ol>
      </>}
    </section>
  </div>;
}