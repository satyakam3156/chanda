import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { EditDialog } from '@/components/EditDialog'
import { Checkbox, Field, NativeSelect, SplitPicker } from '@/components/forms'
import { useAuth } from '@/context/AuthProvider'
import { supabase } from '@/lib/supabase'
import { describeSplit, EQUAL_SPLIT, normaliseSplit, validateSplit } from '@/lib/split'
import type { Split } from '@/lib/split'
import { suggestCategory } from '@/lib/suggest'
import { todayISO } from '@/lib/month'
import { groupFactor, TRIP_PARTS, tripKindLabel, tripSplit } from '@/lib/trips'
import { cn } from '@/lib/utils'
import type { Account, Category, Transaction, Trip, TripPart } from '@/types/database'

type Draft = {
  direction: Transaction['direction']
  amount: string
  occurred_on: string
  occurred_time: string // 'HH:MM', '' = not known
  description: string
  account_id: string // '' = cash / other
  paid_by_member_id: string
  category_id: string // '' = none yet
  categoryTouched: boolean
  followCategory: boolean
  split: Split
  status: Transaction['status']
  notes: string
  trip_id: string // '' = not part of a trip
  trip_part: TripPart | ''
  for_whole_group: boolean
}

function toDraft(t: Transaction | null, defaultPayer: string, defaultDate: string): Draft {
  return {
    direction: t?.direction ?? 'debit',
    amount: t?.amount.toString() ?? '',
    occurred_on: t?.occurred_on ?? defaultDate,
    occurred_time: t?.occurred_time?.slice(0, 5) ?? '',
    description: t?.description ?? '',
    account_id: t?.account_id ?? '',
    paid_by_member_id: t?.paid_by_member_id ?? defaultPayer,
    category_id: t?.category_id ?? '',
    categoryTouched: !!t?.category_id,
    followCategory: !t?.split_type,
    split: t?.split_type ? { split_type: t.split_type, bearer_member_id: t.bearer_member_id, bearer_pct: t.bearer_pct } : EQUAL_SPLIT,
    status: t?.status ?? 'confirmed',
    notes: t?.notes ?? '',
    trip_id: t?.trip_id ?? '',
    trip_part: t?.trip_part ?? '',
    for_whole_group: t?.for_whole_group ?? false,
  }
}

/**
 * Add or edit one transaction. Rendered with a `key` by the parent, so the draft
 * resets each time it opens for a different transaction.
 */
export function TransactionDialog({
  open,
  onOpenChange,
  transaction,
  accounts,
  categories,
  trips = [],
  defaultDate,
  defaultTripId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: Transaction | null
  accounts: Account[]
  categories: Category[]
  trips?: Trip[]
  defaultDate?: string
  /** New transactions start linked to this trip (used from a trip's page). */
  defaultTripId?: string
  onSaved: () => void
}) {
  const { members, member: me } = useAuth()
  const [draft, setDraft] = useState<Draft>(() => {
    const d = toDraft(transaction, me?.id ?? '', defaultDate ?? todayISO())
    if (!transaction && defaultTripId) {
      d.trip_id = defaultTripId
      d.category_id = categories.find((c) => c.kind === 'travel' && c.is_active)?.id ?? ''
      d.categoryTouched = !!d.category_id
    }
    return d
  })
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const isNew = transaction === null

  const usableAccounts = accounts.filter((a) => a.is_active || a.id === draft.account_id)
  const usableCategories = categories.filter((c) => c.is_active || c.id === draft.category_id)
  const category = categories.find((c) => c.id === draft.category_id) ?? null
  const trip = trips.find((t) => t.id === draft.trip_id) ?? null
  const suggested = !draft.categoryTouched ? suggestCategory(draft.description, categories) : null

  function changeDescription(v: string) {
    setDraft((d) => {
      const next = { ...d, description: v }
      if (!d.categoryTouched) next.category_id = suggestCategory(v, categories)?.id ?? ''
      return next
    })
  }

  function changeTrip(id: string) {
    setDraft((d) => {
      const next = { ...d, trip_id: id }
      if (!id) {
        next.trip_part = ''
        next.for_whole_group = false
      } else if (!d.category_id) {
        // A trip expense with no category yet: default to the travel category.
        const travel = categories.find((c) => c.kind === 'travel' && c.is_active)
        if (travel) next.category_id = travel.id
      }
      return next
    })
  }

  function changeAccount(id: string) {
    const owner = accounts.find((a) => a.id === id)?.owner_member_id
    setDraft((d) => ({ ...d, account_id: id, paid_by_member_id: owner ?? d.paid_by_member_id }))
  }

  async function save(): Promise<string | null> {
    const amount = Number(draft.amount)
    if (!(amount > 0)) return 'Amount must be more than 0.'
    if (!draft.occurred_on) return 'Pick a date.'
    if (!draft.description.trim()) return 'Add a description, e.g. the merchant.'
    if (draft.status === 'confirmed' && !draft.category_id) return 'Pick a category, or leave it in the inbox.'
    if (!draft.followCategory) {
      const err = validateSplit(draft.split)
      if (err) return err
    }
    const split: Pick<Transaction, 'split_type' | 'bearer_member_id' | 'bearer_pct'> = draft.followCategory
      ? { split_type: null, bearer_member_id: null, bearer_pct: null }
      : normaliseSplit(draft.split)
    const row = {
      direction: draft.direction,
      amount,
      occurred_on: draft.occurred_on,
      // Keep the seconds from the bank alert unless the time was changed.
      occurred_time: draft.occurred_time
        ? transaction?.occurred_time?.startsWith(draft.occurred_time)
          ? transaction.occurred_time
          : `${draft.occurred_time}:00`
        : null,
      description: draft.description.trim(),
      account_id: draft.account_id || null,
      paid_by_member_id: draft.paid_by_member_id,
      category_id: draft.category_id || null,
      ...split,
      status: draft.status,
      notes: draft.notes.trim() || null,
      trip_id: draft.trip_id || null,
      trip_part: draft.trip_id && draft.trip_part ? draft.trip_part : null,
      for_whole_group: !!trip && trip.trip_type === 'group' && draft.for_whole_group,
    }
    const { error } = isNew
      ? await supabase.from('transactions').insert(row)
      : await supabase.from('transactions').update(row).eq('id', transaction.id)
    if (!error) onSaved()
    return error?.message ?? null
  }

  async function remove(): Promise<string | null> {
    const { error } = await supabase.from('transactions').delete().eq('id', transaction!.id)
    if (!error) onSaved()
    return error?.message ?? null
  }

  return (
    <EditDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? 'Add transaction' : 'Edit transaction'}
      onSave={save}
      onDelete={isNew ? undefined : remove}
    >
      <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1 text-sm">
        {(['debit', 'credit'] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => set('direction', d)}
            className={cn(
              'rounded px-3 py-1.5 font-medium transition-colors',
              draft.direction === d ? 'bg-background shadow-sm' : 'text-muted-foreground',
            )}
          >
            {d === 'debit' ? 'Money spent' : 'Money back'}
          </button>
        ))}
      </div>
      {draft.direction === 'credit' && (
        <p className="text-xs text-muted-foreground">Refunds and cashback. They reduce the category's total for the month.</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)" htmlFor="tx-amount">
          <Input
            id="tx-amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0.01}
            value={draft.amount}
            onChange={(e) => set('amount', e.target.value)}
          />
        </Field>
        <Field label="Date" htmlFor="tx-date">
          <Input id="tx-date" type="date" value={draft.occurred_on} onChange={(e) => set('occurred_on', e.target.value)} />
        </Field>
      </div>
      <Field label="Time (optional)" htmlFor="tx-time">
        <Input id="tx-time" type="time" value={draft.occurred_time} onChange={(e) => set('occurred_time', e.target.value)} />
      </Field>

      <Field label="Description" htmlFor="tx-desc">
        <Input id="tx-desc" placeholder="e.g. Swiggy" value={draft.description} onChange={(e) => changeDescription(e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Card / account" htmlFor="tx-acc">
          <NativeSelect id="tx-acc" value={draft.account_id} onChange={(e) => changeAccount(e.target.value)}>
            <option value="">Cash / UPI / other</option>
            {usableAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={draft.direction === 'debit' ? 'Paid by' : 'Received by'} htmlFor="tx-payer">
          <NativeSelect id="tx-payer" value={draft.paid_by_member_id} onChange={(e) => set('paid_by_member_id', e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <Field
        label="Category"
        htmlFor="tx-cat"
        hint={suggested && draft.category_id === suggested.id ? 'Suggested from the description' : undefined}
      >
        <NativeSelect
          id="tx-cat"
          value={draft.category_id}
          onChange={(e) => setDraft((d) => ({ ...d, category_id: e.target.value, categoryTouched: true }))}
        >
          <option value="">Choose…</option>
          {usableCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </Field>

      {(trips.length > 0 || draft.trip_id) && (
        <div className="space-y-3 rounded-md border border-border p-3">
          <Field label="Trip" htmlFor="tx-trip">
            <NativeSelect id="tx-trip" value={draft.trip_id} onChange={(e) => changeTrip(e.target.value)}>
              <option value="">Not part of a trip</option>
              {trips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({tripKindLabel(t)})
                </option>
              ))}
            </NativeSelect>
          </Field>
          {trip && (
            <>
              <Field label="What for" htmlFor="tx-part">
                <NativeSelect id="tx-part" value={draft.trip_part} onChange={(e) => set('trip_part', e.target.value as TripPart | '')}>
                  <option value="">Choose…</option>
                  {TRIP_PARTS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              {trip.trip_type === 'group' && (
                <div className="space-y-1">
                  <Checkbox
                    checked={draft.for_whole_group}
                    onChange={(v) => set('for_whole_group', v)}
                    label={`Paid for the whole group of ${trip.headcount}`}
                  />
                  <p className="text-xs text-muted-foreground">
                    {draft.for_whole_group && Number(draft.amount) > 0
                      ? `Only your part counts: ${Math.round(Number(draft.amount) * groupFactor(trip, true)).toLocaleString('en-IN')} of ${Number(draft.amount).toLocaleString('en-IN')} (2 of ${trip.headcount}). Friends pay back outside Chanda.`
                      : 'Leave unticked if this was only for the two of you.'}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="space-y-3 rounded-md border border-border p-3">
        <Checkbox
          checked={draft.followCategory}
          onChange={(v) => set('followCategory', v)}
          label={
            trip
              ? `Use the trip's split (${describeSplit(tripSplit(trip), members)})`
              : category
                ? `Use the category's split (${describeSplit(category, members)})`
                : "Use the category's split"
          }
        />
        {!trip && draft.followCategory && category?.monthly_limit != null && (
          <p className="text-xs text-muted-foreground">Counts towards this category's monthly limit.</p>
        )}
        {!draft.followCategory && (
          <>
            <SplitPicker idPrefix="tx-split" value={draft.split} onChange={(s) => set('split', s)} members={members} />
            {category?.monthly_limit != null && (
              <p className="text-xs text-muted-foreground">Not counted towards the monthly limit, because it has its own split.</p>
            )}
          </>
        )}
      </div>

      <Field label="Notes" htmlFor="tx-notes">
        <Input id="tx-notes" value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>

      {isNew ? (
        <Checkbox
          checked={draft.status === 'needs_review'}
          onChange={(v) => set('status', v ? 'needs_review' : 'confirmed')}
          label="Leave in the inbox to review later"
        />
      ) : (
        <Field label="Status" htmlFor="tx-status" hint="Ignored transactions are never counted (e.g. card bill payments).">
          <NativeSelect id="tx-status" value={draft.status} onChange={(e) => set('status', e.target.value as Transaction['status'])}>
            <option value="confirmed">Confirmed</option>
            <option value="needs_review">Needs review (in inbox)</option>
            <option value="ignored">Ignored</option>
          </NativeSelect>
        </Field>
      )}
    </EditDialog>
  )
}
