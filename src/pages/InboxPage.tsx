import { useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ErrorText, NativeSelect } from '@/components/forms'
import { TransactionDialog } from '@/components/TransactionDialog'
import { useAuth } from '@/context/AuthProvider'
import { useSettings } from '@/data/useSettings'
import { useTransactions } from '@/data/useTransactions'
import { dayLabel, timeLabel } from '@/lib/month'
import { describeSplit } from '@/lib/split'
import { suggestCategory } from '@/lib/suggest'
import { supabase } from '@/lib/supabase'
import { cn, formatINR } from '@/lib/utils'
import type { Account, Category, FixedCost, Transaction } from '@/types/database'
import { FixedCostAction, SettleUpAction } from './inbox/InboxActions'
import { IngestMisses } from './inbox/IngestMisses'

type Who = 'mine' | 'theirs' | 'all'
const WHO_KEY = 'chanda.inbox.who'

function savedWho(): Who {
  try {
    const v = localStorage.getItem(WHO_KEY)
    if (v === 'mine' || v === 'theirs' || v === 'all') return v
  } catch {
    // Storage blocked: fall back to the default.
  }
  return 'mine'
}

export function InboxPage() {
  const settings = useSettings()
  const { member: me, members } = useAuth()
  const { rows, error, reload } = useTransactions({ inbox: true })
  const [dialog, setDialog] = useState<{ t: Transaction; n: number } | null>(null)
  const [who, setWhoState] = useState<Who>(savedWho)

  function setWho(w: Who) {
    setWhoState(w)
    try {
      localStorage.setItem(WHO_KEY, w)
    } catch {
      // Not remembered this time; harmless.
    }
  }

  const loadError = settings.error ?? error
  if (loadError) return <p className="text-sm text-destructive">Couldn’t load the inbox: {loadError}</p>
  if (!settings.data || !rows) return <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
  const { accounts, categories, trips, fixedCosts } = settings.data

  // Whose item it is: the owner of the card/account it came from, else whoever paid.
  const ownerOf = (t: Transaction) => accounts.find((a) => a.id === t.account_id)?.owner_member_id ?? t.paid_by_member_id
  const other = members.find((m) => m.id !== me?.id)
  const otherName = other?.display_name.split(' ')[0] ?? 'Partner'
  const mine = rows.filter((t) => ownerOf(t) === me?.id)
  const theirs = rows.filter((t) => ownerOf(t) !== me?.id)
  const shown = who === 'mine' ? mine : who === 'theirs' ? theirs : rows

  const tabs: { id: Who; label: string; count: number }[] = [
    { id: 'mine', label: 'Mine', count: mine.length },
    { id: 'theirs', label: otherName, count: theirs.length },
    { id: 'all', label: 'All', count: rows.length },
  ]

  let summary: string
  if (rows.length === 0) summary = 'Nothing to review. New bank emails land here every 15 minutes.'
  else if (shown.length === 0)
    summary = who === 'mine' ? `Nothing of yours to review. ${otherName} has ${theirs.length}.` : `Nothing of ${otherName}’s to review.`
  else
    summary =
      `${shown.length} transaction${shown.length > 1 ? 's' : ''} to review. Confirm to count it, or ignore it.` +
      (who === 'theirs' ? ` Either of you can confirm these.` : '')

  return (
    <div className="space-y-4">
      <IngestMisses />
      {rows.length > 0 && (
        <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1 text-sm sm:inline-grid" role="tablist" aria-label="Whose transactions">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={who === tab.id}
              onClick={() => setWho(tab.id)}
              className={cn(
                'flex min-w-0 items-center justify-center gap-1 rounded px-1.5 py-1.5 font-medium transition-colors sm:gap-1.5 sm:px-3',
                who === tab.id ? 'bg-background shadow-sm' : 'text-muted-foreground',
              )}
            >
              <span className="truncate">{tab.label}</span>
              <span
                className={cn(
                  'rounded-full px-1.5 text-xs tabular-nums',
                  tab.count > 0 ? 'bg-primary/15 text-foreground' : 'text-muted-foreground',
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        {summary}
        {rows.length > 0 && shown.length === 0 && who === 'mine' && theirs.length > 0 && (
          <>
            {' '}
            <button type="button" className="font-medium text-foreground underline underline-offset-2" onClick={() => setWho('theirs')}>
              Show them
            </button>
          </>
        )}
      </p>
      {shown.map((t) => (
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
  const foreign = foreignCharge(t)

  async function setStatus(status: 'confirmed' | 'ignored') {
    if (status === 'confirmed' && !categoryId) return setError('Pick a category first.')
    if (status === 'confirmed' && foreign?.needsRupees) return setError('Enter the ₹ amount first (pencil button).')
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
              {[dayLabel(t.occurred_on) + (t.occurred_time ? `, ${timeLabel(t.occurred_time)}` : ''), account?.name ?? 'Cash / other', payer && `${credit ? 'to' : 'by'} ${payer}`]
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

        {foreign && (
          <p className="rounded-md bg-amber-500/15 px-3 py-2 text-xs">
            Charged in {foreign.currency} ({foreign.currency} {foreign.amount}).{' '}
            {foreign.needsRupees ? (
              <>
                Tap <b>✎</b> and enter the ₹ amount from your card statement, then confirm.
              </>
            ) : (
              <>₹ amount entered.</>
            )}
          </p>
        )}

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

/** A card spend imported in another currency: its amount stays a placeholder until edited. */
function foreignCharge(t: Transaction): { currency: string; amount: number; needsRupees: boolean } | null {
  const raw = t.raw as { currency?: string; foreign_amount?: number } | null
  if (!raw?.currency || raw.foreign_amount == null) return null
  return { currency: raw.currency, amount: Number(raw.foreign_amount), needsRupees: Number(t.amount) === Number(raw.foreign_amount) }
}
