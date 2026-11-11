import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { SectionCard } from '@/components/forms'
import { useCardBills } from '@/data/useCardBills'
import { computeMonth } from '@/lib/balance'
import type { Amounts } from '@/lib/balance'
import { cardCycles } from '@/lib/cardBills'
import type { CardBill, CardCycle } from '@/lib/cardBills'
import { describeSplit } from '@/lib/split'
import { shiftMonth, todayISO } from '@/lib/month'
import { cn, formatINR } from '@/lib/utils'
import type { Account, Category, EmiPlan, Member, Trip } from '@/types/database'

function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleString('en-IN', { day: 'numeric', month: 'short' })
}

function monthShort(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'short' })
}

function daysUntil(iso: string, today: string): number {
  const [a, b] = [iso, today].map((s) => {
    const [y, m, d] = s.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  })
  return Math.round((a - b) / 86_400_000)
}

export function CardBillsSection({
  month,
  members,
  me,
  mine,
  accounts,
  categories,
  trips,
  emiPlans,
}: {
  month: string
  members: Member[]
  me: Member
  mine: boolean
  accounts: Account[]
  categories: Category[]
  trips: Trip[]
  emiPlans: EmiPlan[]
}) {
  const { data, error } = useCardBills(month)
  const today = todayISO()

  const result = useMemo(() => {
    if (!data) return null
    // Shares per calendar month, worked out exactly like the month's balance.
    const sharesByMonth: Record<string, Record<string, Amounts>> = {}
    for (const ym of [shiftMonth(month, -1), month, shiftMonth(month, 1)]) {
      sharesByMonth[ym] = computeMonth({
        month: ym,
        members,
        categories,
        transactions: data.transactions.filter((t) => t.occurred_on.startsWith(ym)),
        fixedCosts: [],
        payments: [],
        trips,
        emiPlans,
        emiPayments: data.emiPayments.filter((p) => p.month.startsWith(ym)),
        describe: (s) => describeSplit(s, members),
        formatINR,
      }).itemShares
    }
    return cardCycles({ month, accounts, transactions: data.transactions, sharesByMonth, emiPlans, emiPayments: data.emiPayments, members, today })
  }, [data, month, members, categories, trips, emiPlans, accounts, today])

  if (error) return <p className="text-sm text-destructive">Couldn’t load card bills: {error}</p>
  if (!result || !data) return null
  if (result.cycles.length === 0 && result.missingStatementDay.length === 0) return null

  const nameOf = (m: Member) => (mine && m.id === me.id ? 'You' : m.display_name)
  // In "Only me", show my share first.
  const people = mine ? [me, ...members.filter((m) => m.id !== me.id)] : members

  return (
    <SectionCard
      title="Card bills"
      description="Each card's bill runs statement day to statement day, so part of this month's spending is billed now and part next month. Settling still covers the whole calendar month."
    >
      <div className="space-y-5">
        {result.cycles.map((c) => (
          <CardCycleView key={c.account.id} cycle={c} month={month} people={people} nameOf={nameOf} today={today} />
        ))}

        {result.missingStatementDay.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Set the statement day in Settings → Cards and accounts to see bills for:{' '}
            {result.missingStatementDay.map((a) => a.name).join(', ')}.
          </p>
        )}

        {data.cardPayments.length > 0 && (
          <div className="space-y-1 border-t border-border pt-3">
            <p className="text-sm font-medium">Card bill payments this month</p>
            {data.cardPayments.map((p) => (
              <div key={p.id} className="flex justify-between text-sm tabular-nums">
                <span className="text-muted-foreground">
                  {shortDate(p.paid_on)} · via {p.via}
                </span>
                <span>{formatINR(Number(p.amount))}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  )
}

function CardCycleView({
  cycle,
  month,
  people,
  nameOf,
  today,
}: {
  cycle: CardCycle
  month: string
  people: Member[]
  nameOf: (m: Member) => string
  today: string
}) {
  const { account, current, next, thisMonth } = cycle
  return (
    <div className="space-y-3">
      <div>
        <p className="font-medium">{account.name}</p>
        <p className="text-xs text-muted-foreground">
          {monthShort(month)} on this card: <b className="tabular-nums">{formatINR(thisMonth.onCurrent)}</b> on the {shortDate(current.closesOn)} bill ·{' '}
          <b className="tabular-nums">{formatINR(thisMonth.onNext)}</b> goes to the {shortDate(next.closesOn)} bill
        </p>
      </div>
      <BillView bill={current} people={people} nameOf={nameOf} today={today} />
      <BillView bill={next} people={people} nameOf={nameOf} today={today} />
    </div>
  )
}

function BillView({ bill, people, nameOf, today }: { bill: CardBill; people: Member[]; nameOf: (m: Member) => string; today: string }) {
  const days = daysUntil(bill.closesOn, today)
  const months = Object.entries(bill.byMonth).sort(([a], [b]) => a.localeCompare(b))
  const notes = [
    months.length > 1 && months.map(([ym, amt]) => `${monthShort(ym)} ${formatINR(amt)}`).join(' + '),
    bill.emi > 0 && `includes EMI ${formatINR(bill.emi)}`,
    bill.pending !== 0 && `${formatINR(bill.pending)} still in the Inbox`,
    bill.ignored !== 0 && `${formatINR(bill.ignored)} not counted here (ignored, or ticked as a fixed cost)`,
    bill.foreignPending.count > 0 &&
      `plus ${bill.foreignPending.labels.join(', ')} awaiting the ₹ amount (Inbox)`,
  ].filter((n): n is string => !!n)

  return (
    <div className="space-y-1.5 rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{shortDate(bill.closesOn)} bill</p>
          <p className="text-xs text-muted-foreground">
            {shortDate(bill.from)} – {shortDate(bill.closesOn)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold tabular-nums">{formatINR(bill.total)}</p>
          {bill.generated ? (
            <Badge variant="secondary">Generated</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">so far · closes {days <= 1 ? (days === 1 ? 'tomorrow' : 'today') : `in ${days} days`}</span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs tabular-nums">
        {people.map((m) => (
          <span key={m.id}>
            <span className="text-muted-foreground">{nameOf(m)}’s share </span>
            <b className={cn(bill.share[m.id] < 0 && 'text-emerald-600 dark:text-emerald-400')}>{formatINR(bill.share[m.id] ?? 0)}</b>
          </span>
        ))}
      </div>
      {notes.length > 0 && <p className="text-xs text-muted-foreground">{notes.join(' · ')}</p>}
    </div>
  )
}
