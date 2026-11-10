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
import { cn } from '@/lib/utils'
import type { Account, Category, Transaction } from '@/types/database'

type Draft = {
  direction: Transaction['direction']
  amount: string
  occurred_on: string
  description: string
  account_id: string // '' = cash / other
  paid_by_member_id: string
  category_id: string // '' = none yet
  categoryTouched: boolean
  followCategory: boolean
  split: Split
  status: Transaction['status']
  notes: string
}

function toDraft(t: Transaction | null, defaultPayer: string, defaultDate: string): Draft {
  return {
    direction: t?.direction ?? 'debit',
    amount: t?.amount.toString() ?? '',
    occurred_on: t?.occurred_on ?? defaultDate,
    description: t?.description ?? '',
    account_id: t?.account_id ?? '',
    paid_by_member_id: t?.paid_by_member_id ?? defaultPayer,
    category_id: t?.category_id ?? '',
    categoryTouched: !!t?.category_id,
    followCategory: !t?.split_type,
    split: t?.split_type ? { split_type: t.split_type, bearer_member_id: t.bearer_member_id, bearer_pct: t.bearer_pct } : EQUAL_SPLIT,
    status: t?.status ?? 'confirmed',
    notes: t?.notes ?? '',
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
  defaultDate,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: Transaction | null
  accounts: Account[]
  categories: Category[]
  defaultDate?: string
  onSaved: () => void
}) {
  const { members, member: me } = useAuth()
  const [draft, setDraft] = useState<Draft>(() => toDraft(transaction, me?.id ?? '', defaultDate ?? todayISO()))
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const isNew = transaction === null

  const usableAccounts = accounts.filter((a) => a.is_active || a.id === draft.account_id)
  const usableCategories = categories.filter((c) => c.is_active || c.id === draft.category_id)
  const category = categories.find((c) => c.id === draft.category_id) ?? null
  const suggested = !draft.categoryTouched ? suggestCategory(draft.description, categories) : null

  function changeDescription(v: string) {
    setDraft((d) => {
      const next = { ...d, description: v }
      if (!d.categoryTouched) next.category_id = suggestCategory(v, categories)?.id ?? ''
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
      description: draft.description.trim(),
      account_id: draft.account_id || null,
      paid_by_member_id: draft.paid_by_member_id,
      category_id: draft.category_id || null,
      ...split,
      status: draft.status,
      notes: draft.notes.trim() || null,
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

      <div className="space-y-3 rounded-md border border-border p-3">
        <Checkbox
          checked={draft.followCategory}
          onChange={(v) => set('followCategory', v)}
          label={category ? `Use the category's split (${describeSplit(category, members)})` : "Use the category's split"}
        />
        {draft.followCategory && category?.monthly_limit != null && (
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
