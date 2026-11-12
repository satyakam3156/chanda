import { useState } from 'react'
import { Check, Circle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { EditDialog } from '@/components/EditDialog'
import { Field, SectionCard } from '@/components/forms'
import { useAuth } from '@/context/AuthProvider'
import type { EmiDue } from '@/lib/balance'
import { todayISO } from '@/lib/month'
import { supabase } from '@/lib/supabase'
import { groupFactor } from '@/lib/trips'
import { formatINR } from '@/lib/utils'
import type { Trip } from '@/types/database'

/** This month's EMI instalments. Each counts once ticked, like fixed costs. */
export function EmiChecklist({ month, items, trips, onChanged }: { month: string; items: EmiDue[]; trips: Trip[]; onChanged: () => void }) {
  const { members } = useAuth()
  const [open, setOpen] = useState<{ item: EmiDue; n: number } | null>(null)
  if (items.length === 0) return null
  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? '?'

  return (
    <SectionCard title="EMIs this month" description="Tick each instalment once it's charged. Unticked ones aren't in the balance yet.">
      <div className="space-y-2">
        {items.map((it) => {
          const p = it.payment
          const trip = trips.find((t) => t.id === it.plan.trip_id)
          const factor = groupFactor(trip, it.plan.for_whole_group)
          return (
            <button
              key={it.plan.id}
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
                <span className="block truncate text-sm font-medium">{it.plan.name}</span>
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {[
                    `Instalment ${it.seq} of ${it.plan.instalments}`,
                    p ? `ticked` : `not ticked · ${nameOf(it.plan.paid_by_member_id)} pays`,
                    factor < 1 && trip && `your part: 2 of ${trip.headcount}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{formatINR(p ? p.amount : it.plan.instalment_amount)}</span>
            </button>
          )
        })}
      </div>
      {open && <InstalmentDialog key={open.n} month={month} item={open.item} onClose={() => setOpen(null)} onChanged={onChanged} />}
    </SectionCard>
  )
}

function InstalmentDialog({ month, item, onClose, onChanged }: { month: string; item: EmiDue; onClose: () => void; onChanged: () => void }) {
  const p = item.payment
  const [amount, setAmount] = useState((p?.amount ?? item.plan.instalment_amount).toString())
  const [paidOn, setPaidOn] = useState(p?.paid_on ?? todayISO())

  async function save(): Promise<string | null> {
    const value = Number(amount)
    if (!(value > 0)) return 'Amount must be more than 0.'
    const { error } = p
      ? await supabase.from('emi_payments').update({ amount: value, paid_on: paidOn || null }).eq('id', p.id)
      : await supabase
          .from('emi_payments')
          .insert({ plan_id: item.plan.id, seq: item.seq, month: `${month}-01`, amount: value, paid_on: paidOn || null })
    if (!error) onChanged()
    return error?.message ?? null
  }

  async function untick(): Promise<string | null> {
    const { error } = await supabase.from('emi_payments').delete().eq('id', p!.id)
    if (!error) onChanged()
    return error?.message ?? null
  }

  return (
    <EditDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${item.plan.name}: instalment ${item.seq} of ${item.plan.instalments}`}
      description="Change the amount if this month's charge was different (e.g. GST on interest)."
      saveLabel={p ? 'Save' : 'Yes, it’s paid'}
      onSave={save}
      onDelete={p ? untick : undefined}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)" htmlFor="ei-amount">
          <Input id="ei-amount" type="number" inputMode="decimal" step="0.01" min={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Charged on" htmlFor="ei-date">
          <Input id="ei-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
      </div>
      {p && <p className="text-xs text-muted-foreground">Delete un-ticks it, so it stops counting this month.</p>}
    </EditDialog>
  )
}
