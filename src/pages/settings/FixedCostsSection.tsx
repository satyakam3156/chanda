import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EditDialog } from '@/components/EditDialog'
import { Checkbox, Field, ListRow, NativeSelect, SectionCard, SplitPicker } from '@/components/forms'
import { useAuth } from '@/context/AuthProvider'
import { supabase } from '@/lib/supabase'
import { describeSplit, EQUAL_SPLIT, normaliseSplit, validateSplit } from '@/lib/split'
import type { Split } from '@/lib/split'
import { formatINR } from '@/lib/utils'
import type { FixedCost } from '@/types/database'

type Draft = {
  name: string
  amount: string
  payer_member_id: string
  split: Split
  every_months: string
  start_month: string // "YYYY-MM", from <input type="month">
  notes: string
  is_active: boolean
}

function thisMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function toDraft(f: FixedCost | null, defaultPayer: string): Draft {
  return {
    name: f?.name ?? '',
    amount: f?.amount.toString() ?? '',
    payer_member_id: f?.payer_member_id ?? defaultPayer,
    split: f ? { split_type: f.split_type, bearer_member_id: f.bearer_member_id, bearer_pct: f.bearer_pct } : EQUAL_SPLIT,
    every_months: f?.every_months.toString() ?? '1',
    start_month: f?.start_month.slice(0, 7) ?? thisMonth(),
    notes: f?.notes ?? '',
    is_active: f?.is_active ?? true,
  }
}

function monthName(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'short', year: 'numeric' })
}

/** The first due month on or after the current month. */
function nextDue(f: FixedCost): string {
  const [sy, sm] = f.start_month.split('-').map(Number)
  const now = new Date()
  const start = sy * 12 + (sm - 1)
  const cur = now.getFullYear() * 12 + now.getMonth()
  const steps = cur <= start ? 0 : Math.ceil((cur - start) / f.every_months)
  const due = start + steps * f.every_months
  return monthName(`${Math.floor(due / 12)}-${String((due % 12) + 1).padStart(2, '0')}`)
}

function frequency(n: number): string {
  if (n === 1) return 'Every month'
  if (n === 12) return 'Every year'
  return `Every ${n} months`
}

export function FixedCostsSection({ fixedCosts, onChanged }: { fixedCosts: FixedCost[]; onChanged: () => void }) {
  const { members, member: me } = useAuth()
  const [editing, setEditing] = useState<FixedCost | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>(() => toDraft(null, me?.id ?? ''))

  function open(f: FixedCost | 'new') {
    setDraft(toDraft(f === 'new' ? null : f, me?.id ?? ''))
    setEditing(f)
  }
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? '?'

  async function save(): Promise<string | null> {
    if (!draft.name.trim()) return 'Name is required.'
    const amount = Number(draft.amount)
    if (!(amount > 0)) return 'Amount must be more than 0.'
    const every = Number(draft.every_months)
    if (!(Number.isInteger(every) && every >= 1 && every <= 12)) return 'Repeat must be every 1 to 12 months.'
    if (!/^\d{4}-\d{2}$/.test(draft.start_month)) return 'Pick the first month it’s due.'
    const splitErr = validateSplit(draft.split)
    if (splitErr) return splitErr

    const row = {
      name: draft.name.trim(),
      amount,
      payer_member_id: draft.payer_member_id,
      ...normaliseSplit(draft.split),
      every_months: every,
      start_month: `${draft.start_month}-01`,
      notes: draft.notes.trim() || null,
      is_active: draft.is_active,
    }
    const { error } =
      editing === 'new'
        ? await supabase.from('fixed_costs').insert(row)
        : await supabase.from('fixed_costs').update(row).eq('id', (editing as FixedCost).id)
    if (!error) onChanged()
    return error?.message ?? null
  }

  async function remove(): Promise<string | null> {
    const { error } = await supabase.from('fixed_costs').delete().eq('id', (editing as FixedCost).id)
    if (!error) onChanged()
    if (error?.code === '23503') return 'Transactions use this, so it can’t be deleted. Untick Active instead.'
    return error?.message ?? null
  }

  const presetEvery = ['1', '2', '3', '6', '12']

  return (
    <SectionCard
      title="Fixed shared costs"
      description="Rent, maintenance and anything else that repeats. Each month you'll tick these off as paid (step 4)."
      action={
        <Button size="sm" variant="outline" onClick={() => open('new')}>
          <Plus /> Add
        </Button>
      }
    >
      <div className="space-y-2">
        {fixedCosts.length === 0 && <p className="text-sm text-muted-foreground">No fixed costs yet. Add rent and maintenance here.</p>}
        {fixedCosts.map((f) => (
          <ListRow
            key={f.id}
            title={`${f.name} · ${formatINR(f.amount)}`}
            subtitle={`${frequency(f.every_months)} · ${nameOf(f.payer_member_id)} pays · ${describeSplit(f, members)}${
              f.is_active ? ` · next ${nextDue(f)}` : ''
            }`}
            badge={!f.is_active && <Badge variant="secondary">Inactive</Badge>}
            onClick={() => open(f)}
          />
        ))}
      </div>

      <EditDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === 'new' ? 'Add fixed cost' : `Edit ${draft.name || 'fixed cost'}`}
        onSave={save}
        onDelete={editing !== 'new' ? remove : undefined}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" htmlFor="fc-name">
            <Input id="fc-name" placeholder="Rent" value={draft.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Amount (₹)" htmlFor="fc-amount">
            <Input
              id="fc-amount"
              type="number"
              inputMode="decimal"
              min={1}
              value={draft.amount}
              onChange={(e) => set('amount', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Who pays it" htmlFor="fc-payer" hint="The person who actually sends the money, e.g. to the landlord.">
          <NativeSelect id="fc-payer" value={draft.payer_member_id} onChange={(e) => set('payer_member_id', e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Who bears it" htmlFor="fc-split">
          <SplitPicker idPrefix="fc-split" value={draft.split} onChange={(s) => set('split', s)} members={members} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Repeats" htmlFor="fc-every">
            <NativeSelect id="fc-every" value={draft.every_months} onChange={(e) => set('every_months', e.target.value)}>
              {presetEvery.map((n) => (
                <option key={n} value={n}>
                  {frequency(Number(n))}
                </option>
              ))}
              {!presetEvery.includes(draft.every_months) && (
                <option value={draft.every_months}>{frequency(Number(draft.every_months))}</option>
              )}
            </NativeSelect>
          </Field>
          <Field label="First due month" htmlFor="fc-start">
            <Input id="fc-start" type="month" value={draft.start_month} onChange={(e) => set('start_month', e.target.value)} />
          </Field>
        </div>
        <Field label="Notes" htmlFor="fc-notes">
          <Input id="fc-notes" value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <Checkbox checked={draft.is_active} onChange={(v) => set('is_active', v)} label="Active" />
      </EditDialog>
    </SectionCard>
  )
}
