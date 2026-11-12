import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/context/AuthProvider'
import { timeLabel } from '@/lib/month'
import { describeSplit } from '@/lib/split'
import { tripSplit } from '@/lib/trips'
import { cn, formatINR } from '@/lib/utils'
import type { Account, Category, Transaction, Trip } from '@/types/database'

export function TransactionRow({
  t,
  accounts,
  categories,
  trips = [],
  onClick,
}: {
  t: Transaction
  accounts: Account[]
  categories: Category[]
  trips?: Trip[]
  onClick: () => void
}) {
  const { members } = useAuth()
  const account = accounts.find((a) => a.id === t.account_id)
  const category = categories.find((c) => c.id === t.category_id)
  const trip = trips.find((x) => x.id === t.trip_id)
  const payer = members.find((m) => m.id === t.paid_by_member_id)?.display_name
  const split = t.split_type
    ? describeSplit({ split_type: t.split_type, bearer_member_id: t.bearer_member_id, bearer_pct: t.bearer_pct }, members)
    : trip
      ? describeSplit(tripSplit(trip), members) + (t.for_whole_group ? ` · whole group (2 of ${trip.headcount})` : '')
      : category
      ? describeSplit(category, members) + (category.monthly_limit != null ? ' (limit applies)' : '')
      : null

  const credit = t.direction === 'credit'
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-start justify-between gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent/50',
        t.status === 'ignored' && 'opacity-50',
      )}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{t.description}</span>
          {t.status === 'needs_review' && <Badge variant="outline">Review</Badge>}
          {t.status === 'ignored' && <Badge variant="secondary">Ignored</Badge>}
        </span>
        <span className="line-clamp-2 text-xs text-muted-foreground">
          {[timeLabel(t.occurred_time), trip ? `Trip: ${trip.name}` : (category?.name ?? 'No category'), account?.name ?? 'Cash / other', payer && `${credit ? 'to' : 'by'} ${payer}`, split]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
      <span className={cn('shrink-0 text-sm font-semibold tabular-nums', credit && 'text-emerald-600 dark:text-emerald-400')}>
        {credit ? '+' : ''}
        {formatINR(t.amount)}
      </span>
    </button>
  )
}
