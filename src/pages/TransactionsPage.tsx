import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox, NativeSelect } from '@/components/forms'
import { MonthSwitcher } from '@/components/MonthSwitcher'
import { useSelectedMonth } from '@/hooks/useSelectedMonth'
import { TransactionDialog } from '@/components/TransactionDialog'
import { TransactionRow } from '@/components/TransactionRow'
import { useAuth } from '@/context/AuthProvider'
import { useSettings } from '@/data/useSettings'
import { useTransactions } from '@/data/useTransactions'
import { currentMonth, dayLabel, todayISO } from '@/lib/month'
import { formatINR } from '@/lib/utils'
import type { Transaction } from '@/types/database'

export function TransactionsPage() {
  const { members } = useAuth()
  const [month, setMonth] = useSelectedMonth()
  const settings = useSettings()
  const { rows, error, reload } = useTransactions({ month })

  const [categoryFilter, setCategoryFilter] = useState('')
  const [payerFilter, setPayerFilter] = useState('')
  const [showIgnored, setShowIgnored] = useState(false)
  // `n` changes on every open so the dialog remounts with a fresh draft.
  const [dialog, setDialog] = useState<{ t: Transaction | null; n: number } | null>(null)

  const visible = useMemo(
    () =>
      (rows ?? []).filter(
        (t) =>
          (showIgnored || t.status !== 'ignored') &&
          (!categoryFilter || (categoryFilter === 'none' ? !t.category_id : t.category_id === categoryFilter)) &&
          (!payerFilter || t.paid_by_member_id === payerFilter),
      ),
    [rows, showIgnored, categoryFilter, payerFilter],
  )

  // Only confirmed transactions count. Inbox items are shown but not totalled until confirmed.
  const counted = visible.filter((t) => t.status === 'confirmed')
  const spent = counted.filter((t) => t.direction === 'debit').reduce((s, t) => s + Number(t.amount), 0)
  const back = counted.filter((t) => t.direction === 'credit').reduce((s, t) => s + Number(t.amount), 0)
  const inboxCount = (rows ?? []).filter((t) => t.status === 'needs_review').length

  const byDay = useMemo(() => {
    const groups = new Map<string, Transaction[]>()
    for (const t of visible) groups.set(t.occurred_on, [...(groups.get(t.occurred_on) ?? []), t])
    return [...groups.entries()]
  }, [visible])

  const loadError = settings.error ?? error
  if (loadError) {
    return (
      <p className="text-sm text-destructive">
        Couldn’t load transactions: {loadError}. If this mentions a missing table, run{' '}
        <code>supabase/migrations/0003_transactions.sql</code> in Supabase.
      </p>
    )
  }
  if (!settings.data || !rows) return <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
  const { accounts, categories, trips } = settings.data

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthSwitcher month={month} onChange={setMonth} />
        <Button onClick={() => setDialog({ t: null, n: Date.now() })}>
          <Plus /> Add
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Spent" value={formatINR(spent)} />
        <Stat label="Money back" value={formatINR(back)} />
        <Stat label="Transactions" value={String(counted.length)} />
      </div>

      {inboxCount > 0 && (
        <Link to="/inbox" className="block rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {inboxCount === 1 ? '1 transaction this month needs' : `${inboxCount} transactions this month need`} review. It isn’t
          counted until confirmed →
        </Link>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect aria-label="Filter by category" className="w-auto" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="none">No category</option>
        </NativeSelect>
        <NativeSelect aria-label="Filter by who paid" className="w-auto" value={payerFilter} onChange={(e) => setPayerFilter(e.target.value)}>
          <option value="">Anyone paid</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display_name} paid
            </option>
          ))}
        </NativeSelect>
        <Checkbox checked={showIgnored} onChange={setShowIgnored} label="Show ignored" />
      </div>

      {byDay.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No transactions in this month yet.</p>
      ) : (
        <div className="space-y-4">
          {byDay.map(([day, list]) => (
            <div key={day}>
              <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">{dayLabel(day)}</p>
              <Card>
                <CardContent className="divide-y divide-border p-1">
                  {list.map((t) => (
                    <TransactionRow key={t.id} t={t} accounts={accounts} categories={categories} trips={trips} onClick={() => setDialog({ t, n: Date.now() })} />
                  ))}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}

      {dialog && (
        <TransactionDialog
          key={dialog.n}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          transaction={dialog.t}
          accounts={accounts}
          categories={categories}
          trips={trips}
          // New entries default to today in the current month, otherwise the 1st of the month being viewed.
          defaultDate={month === currentMonth() ? todayISO() : `${month}-01`}
          onSaved={reload}
        />
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-base font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}
