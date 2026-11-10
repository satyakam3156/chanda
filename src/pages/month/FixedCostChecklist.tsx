import { useState } from 'react'
import { Check, Circle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { EditDialog } from '@/components/EditDialog'
import { Field, NativeSelect, SectionCard } from '@/components/forms'
import { useAuth } from '@/context/AuthProvider'
import type { FixedDue } from '@/lib/balance'
import { todayISO } from '@/lib/month'
import { describeSplit } from '@/lib/split'
import { supabase } from '@/lib/supabase'
import { formatINR } from '@/lib/utils'

/** "Yes, we paid it" list for fixed costs due this month. Only ticked ones count. */
export function FixedCostChecklist({ month, items, onChanged }: { month: string; items: FixedDue[]; onChanged: () => void }) {
  const { members } = useAuth()
  const [open, setOpen] = useState<{ item: FixedDue; n: number } | null>(null)
  if (items.length === 0) return null
  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? '?'

  return (
    <SectionCard title="Fixed costs this month" description="Tick each one once it's paid. Unticked ones aren't in the balance yet.">
      <div className="space-y-2">
        {items.map((it) => {
          const p = it.payment
          return (
            <button
              key={it.fixedCost.id}
              type="button"
              onClick={() => setOpen({ item: it, n: Date.now() })}
              className="flex w-full items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left transition-colors hover:bg-accent/50"
            >
              {p ? (
                <Check className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{it.fixedCost.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {p
                    ? `Paid by ${nameOf(p.paid_by_member_id)}${p.paid_on ? ` on ${p.paid_on.slice(8)}/${p.paid_on.slice(5, 7)}` : ''}`
                    : `Not marked paid · usually ${nameOf(it.fixedCost.payer_member_id)} pays`}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{formatINR(p ? p.amount : it.fixedCost.amount)}</span>
            </button>
          )
        })}
      </div>

      {open && (
        <PaymentDialog key={open.n} month={month} item={open.item} onClose={() => setOpen(null)} onChanged={onChanged} />
      )}
    </SectionCard>
  )
}

function PaymentDialog({ month, item, onClose, onChanged }: { month: string; item: FixedDue; onClose: () => void; onChanged: () => void }) {
  const { members } = useAuth()
  const f = item.fixedCost
  const p = item.payment
  const [amount, setAmount] = useState((p?.amount ?? f.amount).toString())
  const [payer, setPayer] = useState(p?.paid_by_member_id ?? f.payer_member_id)
  const [paidOn, setPaidOn] = useState(p?.paid_on ?? todayISO())
  const split = p ?? f

  async function save(): Promise<string | null> {
    const value = Number(amount)
    if (!(value > 0)) return 'Amount must be more than 0.'
    const row = { amount: value, paid_by_member_id: payer, paid_on: paidOn || null }
    const { error } = p
      ? await supabase.from('fixed_cost_payments').update(row).eq('id', p.id)
      : await supabase.from('fixed_cost_payments').insert({
          ...row,
          fixed_cost_id: f.id,
          month: `${month}-01`,
          // Copy the split now, so editing the fixed cost later doesn't change this month.
          split_type: f.split_type,
          bearer_member_id: f.bearer_member_id,
          bearer_pct: f.bearer_pct,
        })
    if (!error) onChanged()
    return error?.message ?? null
  }

  async function untick(): Promise<string | null> {
    const { error } = await supabase.from('fixed_cost_payments').delete().eq('id', p!.id)
    if (!error) onChanged()
    return error?.message ?? null
  }

  return (
    <EditDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={p ? `${f.name} — paid` : `Yes, we paid ${f.name}`}
      description={`Split: ${describeSplit(split, members)}. Change the usual split in Settings.`}
      onSave={save}
      onDelete={p ? untick : undefined}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)" htmlFor="pay-amount">
          <Input id="pay-amount" type="number" inputMode="decimal" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Paid on" htmlFor="pay-date">
          <Input id="pay-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
      </div>
      <Field label="Paid by" htmlFor="pay-payer">
        <NativeSelect id="pay-payer" value={payer} onChange={(e) => setPayer(e.target.value)}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display_name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {p && <p className="text-xs text-muted-foreground">Delete un-ticks it, so it stops counting this month.</p>}
    </EditDialog>
  )
}
