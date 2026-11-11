import { useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ErrorText, NativeSelect } from '@/components/forms'
import { TransactionDialog } from '@/components/TransactionDialog'
import { useAuth } from '@/context/AuthProvider'
import { useSettings } from '@/data/useSettings'
import { useTransactions } from '@/data/useTransactions'
import { dayLabel } from '@/lib/month'
import { describeSplit } from '@/lib/split'
import { suggestCategory } from '@/lib/suggest'
import { supabase } from '@/lib/supabase'
import { cn, formatINR } from '@/lib/utils'
import type { Account, Category, FixedCost, Transaction } from '@/types/database'
import { FixedCostAction, SettleUpAction } from './inbox/InboxActions'
import { IngestMisses } from './inbox/IngestMisses'

export function InboxPage() {
  const settings = useSettings()
  const { rows, error, reload } = useTransactions({ inbox: true })
  const [dialog, setDialog] = useState<{ t: Transaction; n: number } | null>(null)

  const loadError = settings.error ?? error
  if (loadError) return <p className="text-sm text-destructive">Couldn’t load the inbox: {loadError}</p>
  if (!settings.data || !rows) return <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
  const { accounts, categories, trips, fixedCosts } = settings.data

  return (
    <div className="space-y-4">
      <IngestMisses />
      <p className="text-sm text-muted-foreground">
        {rows.length === 0
          ? 'Nothing to review. New bank emails land here every 15 minutes.'
          : `${rows.length} transaction${rows.length > 1 ? 's' : ''} to review. Confirm to count it, or ignore it.`}
      </p>
      {rows.map((t) => (
        <InboxItem
          key={t.id}
          t={t}
          accounts={accounts}
          categories={categories}
          fixedCosts={fixedCosts}
          onDone={reload}
          onEdit={() => setDialog({ t, n: Date.now() })}
        />
      ))}

      {dialog && (
        <TransactionDialog
          key={dialog.n}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          transaction={dialog.t}
          accounts={accounts}
          categories={categories}
          trips={trips}
          onSaved={reload}
        />
      )}
    </div>
  )
}

function InboxItem({
  t,
  accounts,
  categories,
  fixedCosts,
  onDone,
  onEdit,
}: {
  t: Transaction
  accounts: Account[]
  categories: Category[]
  fixedCosts: FixedCost[]
  onDone: () => void
  onEdit: () => void
}) {
  const { members } = useAuth()
  const [categoryId, setCategoryId] = useState(t.category_id ?? suggestCategory(t.description, categories)?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const account = accounts.find((a) => a.id === t.account_id)
  const payer = members.find((m) => m.id === t.paid_by_member_id)?.display_name
  const category = categories.find((c) => c.id === categoryId)
  const credit = t.direction === 'credit'

  async function setStatus(status: 'confirmed' | 'ignored') {
    if (status === 'confirmed' && !categoryId) return setError('Pick a category first.')
    setBusy(true)
    setError(null)
    const { error } = await supabase
      .from('transactions')
      .update({ status, category_id: categoryId || null })
      .eq('id', t.id)
    setBusy(false)
    if (error) setError(error.message)
    else onDone()
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{t.description}</p>
            <p className="text-xs text-muted-foreground">
              {[dayLabel(t.occurred_on), account?.name ?? 'Cash / other', payer && `${credit ? 'to' : 'by'} ${payer}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <p className={cn('shrink-0 font-semibold tabular-nums', credit && 'text-emerald-600 dark:text-emerald-400')}>
            {credit ? '+' : ''}
            {formatINR(t.amount)}
          </p>
        </div>

        <SettleUpAction t={t} onDone={onDone} onError={setError} />

        {credit && !(t.raw as { settle_member_id?: string } | null)?.settle_member_id && (
          <p className="rounded-md bg-muted px-3 py-2 text-xs">
            Money back. <b>Confirm</b> to reduce the {category?.name ?? 'category'} total, or <b>Ignore</b> to leave totals unchanged.
          </p>
        )}

        <div className="space-y-1">
          <NativeSelect aria-label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Choose a category…</option>
            {categories
              .filter((c) => c.is_active || c.id === categoryId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </NativeSelect>
          {category && (
            <p className="text-xs text-muted-foreground">
              Split:{' '}
              {t.split_type
                ? describeSplit({ split_type: t.split_type, bearer_member_id: t.bearer_member_id, bearer_pct: t.bearer_pct }, members)
                : describeSplit(category, members)}
              {!t.split_type && category.monthly_limit != null && ' (limit applies)'}
            </p>
          )}
        </div>

        <FixedCostAction t={t} fixedCosts={fixedCosts} onDone={onDone} onError={setError} />

        <ErrorText>{error}</ErrorText>

        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy} onClick={() => setStatus('confirmed')}>
            <Check /> Confirm
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setStatus('ignored')}>
            <X /> Ignore
          </Button>
          <Button variant="ghost" size="icon" aria-label="Edit details" disabled={busy} onClick={onEdit}>
            <Pencil />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
