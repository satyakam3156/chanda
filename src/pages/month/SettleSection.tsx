import { useState } from 'react'
import { Lock, Plus, Unlock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EditDialog } from '@/components/EditDialog'
import { Field, NativeSelect, SectionCard } from '@/components/forms'
import { useAuth } from '@/context/AuthProvider'
import { useDebtText } from '@/hooks/useDebtText'
import { monthLabel, shiftMonth, todayISO } from '@/lib/month'
import { changedSinceClose } from '@/lib/settle'
import type { Debt, SettleResult } from '@/lib/settle'
import { supabase } from '@/lib/supabase'
import { formatINR } from '@/lib/utils'
import type { MonthClose, Settlement } from '@/types/database'

const METHOD_LABEL: Record<Settlement['method'], string> = { upi: 'UPI', bank: 'Bank transfer', cash: 'Cash', other: 'Other' }

export function SettleSection({
  month,
  settle,
  settlements,
  close,
  prevClosed,
  prevOpenWithActivity,
  nextClosed,
  warnings,
  mine,
  onChanged,
}: {
  month: string
  settle: SettleResult
  settlements: Settlement[]
  close: MonthClose | null
  prevClosed: boolean
  prevOpenWithActivity: boolean
  nextClosed: boolean
  warnings: string[]
  mine: boolean
  onChanged: () => void
}) {
  const { members } = useAuth()
  const debtText = useDebtText()
  const [dialog, setDialog] = useState<{ kind: 'settle'; s: Settlement | null; n: number } | { kind: 'close'; n: number } | { kind: 'reopen'; n: number } | null>(null)
  const name = (id: string) => members.find((m) => m.id === id)?.display_name ?? '?'
  const prevLabel = monthLabel(shiftMonth(month, -1))
  const nextLabel = monthLabel(shiftMonth(month, 1))
  const closed = !!close
  const stale = close ? changedSinceClose(close, settle.own) || Math.abs(Number(close.carry_out_amount) - (settle.remaining?.amount ?? 0)) >= 0.01 : false

  return (
    <SectionCard
      title="Settle up"
      description={closed ? `Closed. What's left carries into ${nextLabel}.` : `Record payments between you, then close ${monthLabel(month)}.`}
      action={
        !closed && (
          <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'settle', s: null, n: Date.now() })}>
            <Plus /> Record
          </Button>
        )
      }
    >
      <div className="space-y-1 text-sm">
        <SummaryRow label={`${monthLabel(month)} spending`} value={debtText(settle.own, mine)} />
        <SummaryRow
          label={`Carried in from ${prevLabel}`}
          value={prevClosed ? debtText(settle.carryIn, mine) : 'Nothing (not closed)'}
        />
        <SummaryRow label="Total due" value={debtText(settle.due, mine)} strong />
        <SummaryRow label="Settled so far" value={formatINR(settle.settled)} />
        <SummaryRow label={closed ? `Carried into ${nextLabel}` : 'Still owed'} value={debtText(settle.remaining, mine)} strong />
      </div>

      {prevOpenWithActivity && !closed && (
        <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          {prevLabel} has transactions but isn’t closed, so nothing carries in from it. Close {prevLabel} first if anything was left
          unpaid.
        </p>
      )}

      {settlements.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Settle-ups for {monthLabel(month)}</p>
          {settlements.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={closed}
              onClick={() => setDialog({ kind: 'settle', s, n: Date.now() })}
              className="flex w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors enabled:hover:bg-accent/50"
            >
              <span className="min-w-0">
                <span className="block truncate">
                  {name(s.from_member_id)} → {name(s.to_member_id)}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {METHOD_LABEL[s.method]} · {s.paid_on.slice(8)}/{s.paid_on.slice(5, 7)}
                  {s.note ? ` · ${s.note}` : ''}
                </span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{formatINR(s.amount)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-2 border-t border-border pt-4">
        {closed ? (
          <>
            <p className="flex items-center gap-2 text-sm">
              <Lock className="h-4 w-4" /> Closed by {close.closed_by ? name(close.closed_by) : '?'} on{' '}
              {new Date(close.closed_at).toLocaleDateString('en-IN')}
            </p>
            {stale && (
              <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs">
                Numbers changed after closing (a transaction or settle-up was edited). Reopen and close again so the carry-over is right.
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={nextClosed}
              onClick={() => setDialog({ kind: 'reopen', n: Date.now() })}
              title={nextClosed ? `Reopen ${nextLabel} first` : undefined}
            >
              <Unlock /> Reopen {monthLabel(month)}
            </Button>
            {nextClosed && <p className="text-xs text-muted-foreground">{nextLabel} is closed too. Reopen it first.</p>}
          </>
        ) : (
          <Button className="w-full" onClick={() => setDialog({ kind: 'close', n: Date.now() })}>
            <Lock /> Close {monthLabel(month)}
          </Button>
        )}
      </div>

      {dialog?.kind === 'settle' && (
        <SettlementDialog key={dialog.n} month={month} settlement={dialog.s} suggested={settle.remaining} onClose={() => setDialog(null)} onChanged={onChanged} />
      )}
      {dialog?.kind === 'close' && (
        <CloseDialog key={dialog.n} month={month} settle={settle} warnings={warnings} onClose={() => setDialog(null)} onChanged={onChanged} />
      )}
      {dialog?.kind === 'reopen' && (
        <EditDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={`Reopen ${monthLabel(month)}?`}
          saveLabel="Reopen"
          description={`${nextLabel} will stop receiving this month's carry-over until you close ${monthLabel(month)} again.`}
          onSave={async () => {
            const { error } = await supabase.from('month_closes').delete().eq('month', `${month}-01`)
            if (!error) onChanged()
            return error?.message ?? null
          }}
        >
          <p className="text-sm">You can then edit transactions and settle-ups, and close it again.</p>
        </EditDialog>
      )}
    </SectionCard>
  )
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? 'text-right font-semibold' : 'text-right'}>{value}</span>
    </div>
  )
}

function SettlementDialog({
  month,
  settlement,
  suggested,
  onClose,
  onChanged,
}: {
  month: string
  settlement: Settlement | null
  suggested: Debt
  onClose: () => void
  onChanged: () => void
}) {
  const { members } = useAuth()
  const [from, setFrom] = useState(settlement?.from_member_id ?? suggested?.from ?? members[0]?.id ?? '')
  const [amount, setAmount] = useState(settlement?.amount.toString() ?? (suggested ? suggested.amount.toFixed(2) : ''))
  const [paidOn, setPaidOn] = useState(settlement?.paid_on ?? todayISO())
  const [method, setMethod] = useState<Settlement['method']>(settlement?.method ?? 'upi')
  const [note, setNote] = useState(settlement?.note ?? '')
  const to = members.find((m) => m.id !== from)

  async function save(): Promise<string | null> {
    const value = Number(amount)
    if (!(value > 0)) return 'Amount must be more than 0.'
    if (!to) return 'Pick who sent it.'
    const row = {
      month: `${month}-01`,
      from_member_id: from,
      to_member_id: to.id,
      amount: value,
      paid_on: paidOn,
      method,
      note: note.trim() || null,
    }
    const { error } = settlement
      ? await supabase.from('settlements').update(row).eq('id', settlement.id)
      : await supabase.from('settlements').insert(row)
    if (!error) onChanged()
    return error?.message ?? null
  }

  async function remove(): Promise<string | null> {
    const { error } = await supabase.from('settlements').delete().eq('id', settlement!.id)
    if (!error) onChanged()
    return error?.message ?? null
  }

  return (
    <EditDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={settlement ? 'Edit settle-up' : 'Record a settle-up'}
      description={`Counts towards ${monthLabel(month)}. Check the amount before saving.`}
      onSave={save}
      onDelete={settlement ? remove : undefined}
    >
      <Field label="Who sent the money" htmlFor="st-from">
        <NativeSelect id="st-from" value={from} onChange={(e) => setFrom(e.target.value)}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display_name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)" htmlFor="st-amount">
          <Input id="st-amount" type="number" inputMode="decimal" step="0.01" min={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Paid on" htmlFor="st-date">
          <Input id="st-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
      </div>
      <Field label="How" htmlFor="st-method">
        <NativeSelect id="st-method" value={method} onChange={(e) => setMethod(e.target.value as Settlement['method'])}>
          {Object.entries(METHOD_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Note" htmlFor="st-note">
        <Input id="st-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {to && Number(amount) > 0 && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          {members.find((m) => m.id === from)?.display_name} sent {to.display_name} <b>{formatINR(Number(amount))}</b>.
        </p>
      )}
    </EditDialog>
  )
}

function CloseDialog({
  month,
  settle,
  warnings,
  onClose,
  onChanged,
}: {
  month: string
  settle: SettleResult
  warnings: string[]
  onClose: () => void
  onChanged: () => void
}) {
  const debtText = useDebtText()
  const nextLabel = monthLabel(shiftMonth(month, 1))

  async function save(): Promise<string | null> {
    const { error } = await supabase.from('month_closes').insert({
      month: `${month}-01`,
      own_from_member_id: settle.own?.from ?? null,
      own_amount: settle.own?.amount ?? 0,
      carry_in_from_member_id: settle.carryIn?.from ?? null,
      carry_in_amount: settle.carryIn?.amount ?? 0,
      settled_amount: settle.settled,
      carry_out_from_member_id: settle.remaining?.from ?? null,
      carry_out_amount: settle.remaining?.amount ?? 0,
    })
    if (!error) onChanged()
    if (error?.code === '23505') return 'This month is already closed. Reload the page.'
    return error?.message ?? null
  }

  return (
    <EditDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Close ${monthLabel(month)}?`}
      description="Check these numbers together. Closing confirms them."
      saveLabel="Close month"
      onSave={save}
    >
      <div className="space-y-1 rounded-md border border-border p-3 text-sm">
        <SummaryRow label="Month's spending" value={debtText(settle.own)} />
        <SummaryRow label="Carried in" value={debtText(settle.carryIn)} />
        <SummaryRow label="Settled" value={formatINR(settle.settled)} />
        <SummaryRow label={`Carries into ${nextLabel}`} value={debtText(settle.remaining)} strong />
      </div>
      {warnings.length > 0 && (
        <ul className="list-disc space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 py-2 pl-7 pr-3 text-xs">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </EditDialog>
  )
}
