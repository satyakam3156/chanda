import { useState } from 'react'
import { ArrowLeftRight, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/forms'
import { useAuth } from '@/context/AuthProvider'
import { supabase } from '@/lib/supabase'
import { formatINR } from '@/lib/utils'
import type { FixedCost, Transaction } from '@/types/database'

function rawSettleMember(t: Transaction): string | null {
  const raw = t.raw as { settle_member_id?: string } | null
  return raw?.settle_member_id ?? null
}

/** Ignore the transaction with a note, so it never counts as spending. */
async function ignoreWithNote(t: Transaction, note: string) {
  return supabase
    .from('transactions')
    .update({ status: 'ignored', notes: [t.notes, note].filter(Boolean).join(' · ') })
    .eq('id', t.id)
}

/**
 * A UPI transfer between the two of you (matched by "how you appear in bank alerts").
 * Recording it creates a settle-up for that month and ignores the transaction.
 */
export function SettleUpAction({ t, onDone, onError }: { t: Transaction; onDone: () => void; onError: (e: string) => void }) {
  const { members } = useAuth()
  const [busy, setBusy] = useState(false)
  const other = rawSettleMember(t)
  if (!other) return null
  const from = t.direction === 'debit' ? t.paid_by_member_id : other
  const to = t.direction === 'debit' ? other : t.paid_by_member_id
  const name = (id: string) => members.find((m) => m.id === id)?.display_name ?? '?'

  async function record() {
    setBusy(true)
    const { error } = await supabase.from('settlements').insert({
      month: `${t.occurred_on.slice(0, 7)}-01`,
      from_member_id: from,
      to_member_id: to,
      amount: Number(t.amount),
      paid_on: t.occurred_on,
      method: 'upi',
      transaction_id: t.id,
      note: 'From bank email',
    })
    if (error) {
      setBusy(false)
      return onError(error.message)
    }
    const { error: e2 } = await ignoreWithNote(t, 'Recorded as settle-up')
    setBusy(false)
    if (e2) return onError(e2.message)
    onDone()
  }

  return (
    <div className="space-y-2 rounded-md border border-sky-500/40 bg-sky-500/10 p-3 text-sm">
      <p>
        Looks like a settle-up: <b>{name(from)}</b> sent <b>{name(to)}</b> {formatINR(t.amount)}.
      </p>
      <Button size="sm" disabled={busy} onClick={record}>
        <ArrowLeftRight /> Record as settle-up
      </Button>
    </div>
  )
}

/**
 * A bank debit that is really a fixed cost (e.g. the rent transfer). Ticks that fixed
 * cost for the month with this amount, and ignores the transaction so it isn't counted twice.
 */
export function FixedCostAction({
  t,
  fixedCosts,
  onDone,
  onError,
}: {
  t: Transaction
  fixedCosts: FixedCost[]
  onDone: () => void
  onError: (e: string) => void
}) {
  const [fixedId, setFixedId] = useState('')
  const [busy, setBusy] = useState(false)
  const active = fixedCosts.filter((f) => f.is_active)
  if (t.direction !== 'debit' || active.length === 0 || rawSettleMember(t)) return null

  async function apply() {
    const f = active.find((x) => x.id === fixedId)
    if (!f) return onError('Pick which fixed cost this is.')
    setBusy(true)
    const month = `${t.occurred_on.slice(0, 7)}-01`
    const { data: existing, error: e0 } = await supabase
      .from('fixed_cost_payments')
      .select('id')
      .eq('fixed_cost_id', f.id)
      .eq('month', month)
      .maybeSingle()
    if (e0) {
      setBusy(false)
      return onError(e0.message)
    }
    if (!existing) {
      const { error } = await supabase.from('fixed_cost_payments').insert({
        fixed_cost_id: f.id,
        month,
        amount: Number(t.amount),
        paid_by_member_id: t.paid_by_member_id,
        paid_on: t.occurred_on,
        split_type: f.split_type,
        bearer_member_id: f.bearer_member_id,
        bearer_pct: f.bearer_pct,
      })
      if (error) {
        setBusy(false)
        return onError(error.message)
      }
    }
    const { error: e2 } = await ignoreWithNote(t, `Paid ${f.name} (ticked as fixed cost)`)
    setBusy(false)
    if (e2) return onError(e2.message)
    onDone()
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Is this a fixed cost?</span>
      <NativeSelect aria-label="Fixed cost" className="w-auto flex-1" value={fixedId} onChange={(e) => setFixedId(e.target.value)}>
        <option value="">Choose…</option>
        {active.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name} ({formatINR(f.amount)})
          </option>
        ))}
      </NativeSelect>
      <Button size="sm" variant="outline" disabled={busy || !fixedId} onClick={apply}>
        <Home /> Tick it
      </Button>
    </div>
  )
}
