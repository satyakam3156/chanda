import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { SectionCard } from '@/components/forms'
import { MonthSwitcher } from '@/components/MonthSwitcher'
import { useAuth } from '@/context/AuthProvider'
import { usePayments } from '@/data/usePayments'
import { useSettle } from '@/data/useSettle'
import { useSettings } from '@/data/useSettings'
import { useTransactions } from '@/data/useTransactions'
import { useDebtText } from '@/hooks/useDebtText'
import { useSelectedMonth } from '@/hooks/useSelectedMonth'
import { computeMonth } from '@/lib/balance'
import type { Line, MonthResult } from '@/lib/balance'
import { closeToCarry, computeSettle } from '@/lib/settle'
import type { SettleResult } from '@/lib/settle'
import { describeSplit } from '@/lib/split'
import { monthLabel } from '@/lib/month'
import { cn, formatINR } from '@/lib/utils'
import type { Member } from '@/types/database'
import { CardBillsSection } from './CardBillsSection'
import { EmiChecklist } from './EmiChecklist'
import { FixedCostChecklist } from './FixedCostChecklist'
import { SettleSection } from './SettleSection'

type View = 'both' | 'me'

function loadView(): View {
  try {
    return localStorage.getItem('chanda_view') === 'me' ? 'me' : 'both'
  } catch {
    return 'both'
  }
}

export function MonthPage() {
  const { members, member: me } = useAuth()
  const [month, setMonth] = useSelectedMonth()
  const [view, setViewState] = useState<View>(loadView)
  const settings = useSettings()
  const txs = useTransactions({ month })
  const payments = usePayments(month)
  const settleData = useSettle(month)

  function setView(v: View) {
    setViewState(v)
    try {
      localStorage.setItem('chanda_view', v)
    } catch {
      /* per-device preference only */
    }
  }

  const result = useMemo(() => {
    if (!settings.data || !txs.rows || !payments.rows || !payments.emiRows) return null
    return computeMonth({
      month,
      members,
      categories: settings.data.categories,
      transactions: txs.rows,
      fixedCosts: settings.data.fixedCosts,
      payments: payments.rows,
      trips: settings.data.trips,
      emiPlans: settings.data.emiPlans,
      emiPayments: payments.emiRows,
      describe: (s) => describeSplit(s, members),
      formatINR,
    })
  }, [month, members, settings.data, txs.rows, payments.rows, payments.emiRows])

  const settle = useMemo(() => {
    if (!result || !settleData.data) return null
    return computeSettle({
      ownBalance: result.balance,
      carryIn: closeToCarry(settleData.data.prevClose, members),
      settlements: settleData.data.settlements,
      members,
    })
  }, [result, settleData.data, members])

  const loadError = settings.error ?? txs.error ?? payments.error ?? settleData.error
  if (loadError) {
    return (
      <p className="text-sm text-destructive">
        Couldn’t load this month: {loadError}. If this mentions a missing table, run{' '}
        the latest file in <code>supabase/migrations/</code> in Supabase.
      </p>
    )
  }
  if (!result || !settle || !settleData.data || !me) return <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>

  const unticked = result.fixedDue.filter((f) => !f.payment).length + result.emiDue.filter((e) => !e.payment).length
  const closeWarnings = [
    result.pendingReview > 0 && `${result.pendingReview} inbox item(s) aren't counted. Review them first if they belong to ${monthLabel(month)}.`,
    unticked > 0 && `${unticked} fixed cost(s) or EMI(s) not ticked, so not counted.`,
  ].filter((w): w is string => !!w)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthSwitcher month={month} onChange={setMonth} />
        <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1 text-xs" role="tablist" aria-label="View">
          {(['both', 'me'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn('rounded px-3 py-1.5 font-medium', view === v ? 'bg-background shadow-sm' : 'text-muted-foreground')}
            >
              {v === 'both' ? 'Both of us' : 'Only me'}
            </button>
          ))}
        </div>
      </div>

      <NetCard result={result} settle={settle} members={members} me={me} view={view} />

      {(result.pendingReview > 0 || unticked > 0) && (
        <div className="space-y-2 text-sm">
          {result.pendingReview > 0 && (
            <Link to="/inbox" className="block rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
              {result.pendingReview} transaction{result.pendingReview > 1 ? 's' : ''} in the inbox aren’t counted yet →
            </Link>
          )}
          {unticked > 0 && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
              {unticked} fixed cost{unticked > 1 ? 's' : ''} or EMI{unticked > 1 ? 's' : ''} not marked paid yet, so not in the balance.
            </p>
          )}
        </div>
      )}

      {result.limits.length > 0 && (
        <SectionCard title="Monthly limits">
          <div className="space-y-4">
            {result.limits.map((l) => {
              const pct = Math.min(100, (Math.max(l.spent, 0) / l.limit) * 100)
              const over = l.spent - l.limit
              return (
                <div key={l.category.id} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{l.category.name}</span>
                    <span className="tabular-nums">
                      {formatINR(l.spent)} <span className="text-muted-foreground">/ {formatINR(l.limit)}</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className={cn('h-full rounded-full', over > 0 ? 'bg-rose-500' : 'bg-emerald-500')} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {over > 0 ? `${formatINR(over)} over the limit — that part is split differently.` : `${formatINR(-over)} left before the limit.`}
                  </p>
                </div>
              )
            })}
          </div>
        </SectionCard>
      )}

      <CardBillsSection
        month={month}
        members={members}
        me={me}
        mine={view === 'me'}
        accounts={settings.data!.accounts}
        categories={settings.data!.categories}
        trips={settings.data!.trips}
        emiPlans={settings.data!.emiPlans}
      />

      <FixedCostChecklist month={month} items={result.fixedDue} onChanged={payments.reload} />

      <EmiChecklist month={month} items={result.emiDue} trips={settings.data!.trips} onChanged={payments.reload} />

      <SettleSection
        month={month}
        settle={settle}
        settlements={settleData.data.settlements}
        close={settleData.data.close}
        prevClosed={!!settleData.data.prevClose}
        prevOpenWithActivity={settleData.data.prevOpenWithActivity}
        nextClosed={!!settleData.data.nextClose}
        warnings={closeWarnings}
        mine={view === 'me'}
        onChanged={settleData.reload}
      />

      <Breakdown lines={result.lines} members={members} me={me} view={view} />
    </div>
  )
}

function NetCard({ result, settle, members, me, view }: { result: MonthResult; settle: SettleResult; members: Member[]; me: Member; view: View }) {
  const debtText = useDebtText()
  const remaining = settle.remaining
  const mine = view === 'me'
  // Headline: what's still owed after carry-over and settle-ups.
  const headline = remaining ? debtText(remaining, mine, false) : 'All settled'
  const people = mine ? [me] : members

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div>
          <p className="text-sm text-muted-foreground">{headline}</p>
          <p className="text-3xl font-bold tabular-nums">{formatINR(remaining?.amount ?? 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Includes carry-over and settle-ups. This month’s spending alone: {settle.own ? debtText(settle.own, mine) : 'even'}.
          </p>
        </div>
        <div className="space-y-2 border-t border-border pt-3 text-sm">
          {people.map((m) => {
            const bal = result.balance[m.id]
            const name = mine ? 'You' : m.display_name
            return (
              <div key={m.id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
                <span>
                  {name} paid <b className="tabular-nums">{formatINR(result.paid[m.id])}</b>, share is{' '}
                  <b className="tabular-nums">{formatINR(result.share[m.id])}</b>
                </span>
                <span className={cn('text-right font-semibold tabular-nums', bal > 0 ? 'text-emerald-600 dark:text-emerald-400' : bal < 0 && 'text-rose-600 dark:text-rose-400')}>
                  {bal > 0 ? '+' : bal < 0 ? '−' : ''}
                  {formatINR(Math.abs(bal))}
                </span>
              </div>
            )
          })}
          <p className="text-xs text-muted-foreground">
            This month’s spending: paid more than your share → you’re owed the difference. Paid less → you owe it.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function Breakdown({ lines, members, me, view }: { lines: Line[]; members: Member[]; me: Member; view: View }) {
  const people = view === 'me' ? [me] : members
  return (
    <SectionCard title="How the balance is made" description="Every counted item: who paid it and whose share it is.">
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing counted yet this month.</p>
      ) : (
        <div className="divide-y divide-border">
          {lines.map((l) => (
            <div key={l.key} className="space-y-1 py-3 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{l.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {l.detail}
                    {l.kind !== 'fixed' && l.kind !== 'emi' && ` · ${l.count} transaction${l.count === 1 ? '' : 's'}`}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{formatINR(l.total)}</span>
              </div>
              <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 text-xs tabular-nums">
                <span />
                <span className="text-muted-foreground">Paid</span>
                <span className="text-muted-foreground">Share</span>
                {people.map((m) => (
                  <Row key={m.id} name={view === 'me' ? 'You' : m.display_name} paid={l.paid[m.id]} share={l.share[m.id]} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

function Row({ name, paid, share }: { name: string; paid: number; share: number }) {
  return (
    <>
      <span className="truncate text-muted-foreground">{name}</span>
      <span>{formatINR(paid)}</span>
      <span>{formatINR(share)}</span>
    </>
  )
}
