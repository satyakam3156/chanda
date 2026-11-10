import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { EditDialog } from '@/components/EditDialog'
import { Checkbox, Field, NativeSelect, SplitPicker } from '@/components/forms'
import { useAuth } from '@/context/AuthProvider'
import { currentMonth, monthLabel, shiftMonth, todayISO } from '@/lib/month'
import { describeSplit, EQUAL_SPLIT, normaliseSplit, validateSplit } from '@/lib/split'
import type { Split } from '@/lib/split'
import { supabase } from '@/lib/supabase'
import { emiLastMonth, TRIP_PARTS, tripKindLabel, tripSplit } from '@/lib/trips'
import { formatINR } from '@/lib/utils'
import type { Account, Category, EmiPlan, Transaction, Trip, TripPart } from '@/types/database'

/**
 * Add or edit an EMI plan. When created from a big charge, that charge is set to
 * "ignored" so it isn't counted twice — only the ticked instalments count.
 */
export function EmiDialog({
  plan,
  trips,
  accounts,
  categories,
  paidCount,
  onClose,
  onSaved,
}: {
  plan: EmiPlan | null
  trips: Trip[]
  accounts: Account[]
  categories: Category[]
  paidCount: number
  onClose: () => void
  onSaved: () => void
}) {
  const { members, member: me } = useAuth()
  const emiCategory = categories.find((c) => c.kind === 'emi' && c.is_active) ?? categories[0]
  const [sources, setSources] = useState<Transaction[]>([])
  const [sourceId, setSourceId] = useState(plan?.source_transaction_id ?? '')
  const [name, setName] = useState(plan?.name ?? '')
  const [categoryId, setCategoryId] = useState(plan?.category_id ?? emiCategory?.id ?? '')
  const [tripId, setTripId] = useState(plan?.trip_id ?? '')
  const [tripPart, setTripPart] = useState<TripPart | ''>(plan?.trip_part ?? '')
  const [wholeGroup, setWholeGroup] = useState(plan?.for_whole_group ?? false)
  const [accountId, setAccountId] = useState(plan?.account_id ?? '')
  const [instalment, setInstalment] = useState(plan?.instalment_amount.toString() ?? '')
  const [count, setCount] = useState(plan?.instalments.toString() ?? '6')
  const [firstMonth, setFirstMonth] = useState(plan?.first_month.slice(0, 7) ?? shiftMonth(currentMonth(), 1))
  const [payer, setPayer] = useState(plan?.paid_by_member_id ?? me?.id ?? '')
  const [followDefault, setFollowDefault] = useState(!plan?.split_type)
  const [split, setSplit] = useState<Split>(
    plan?.split_type ? { split_type: plan.split_type, bearer_member_id: plan.bearer_member_id, bearer_pct: plan.bearer_pct } : EQUAL_SPLIT,
  )
  const [notes, setNotes] = useState(plan?.notes ?? '')

  const trip = trips.find((t) => t.id === tripId) ?? null
  const category = categories.find((c) => c.id === categoryId) ?? null
  const source = sources.find((s) => s.id === sourceId) ?? null

  // Big recent debits that could have been converted to EMI.
  useEffect(() => {
    if (plan) return
    const since = new Date()
    since.setMonth(since.getMonth() - 6)
    supabase
      .from('transactions')
      .select('*')
      .eq('direction', 'debit')
      .neq('status', 'ignored')
      .gte('amount', 1000)
      .gte('occurred_on', since.toISOString().slice(0, 10))
      .order('amount', { ascending: false })
      .limit(50)
      .then(({ data }) => setSources(data ?? []))
  }, [plan])

  function pickSource(id: string) {
    setSourceId(id)
    const t = sources.find((s) => s.id === id)
    if (!t) return
    if (!name) setName(t.description)
    if (t.trip_id) {
      setTripId(t.trip_id)
      setTripPart(t.trip_part ?? '')
      setWholeGroup(t.for_whole_group)
    }
    if (t.account_id) setAccountId(t.account_id)
    setPayer(t.paid_by_member_id)
    const n = Number(count) || 6
    if (!instalment) setInstalment((Number(t.amount) / n).toFixed(2))
  }

  async function save(): Promise<string | null> {
    if (!name.trim()) return 'Give the EMI a name.'
    const amt = Number(instalment)
    if (!(amt > 0)) return 'Monthly instalment must be more than 0.'
    const n = Number(count)
    if (!(Number.isInteger(n) && n >= 1 && n <= 120)) return 'Number of instalments must be 1 to 120.'
    if (plan && n < paidCount) return `${paidCount} instalments are already ticked; the count can’t be lower.`
    if (!categoryId) return 'Pick a category.'
    if (!followDefault) {
      const err = validateSplit(split)
      if (err) return err
    }
    const s: Pick<EmiPlan, 'split_type' | 'bearer_member_id' | 'bearer_pct'> = followDefault
      ? { split_type: null, bearer_member_id: null, bearer_pct: null }
      : normaliseSplit(split)
    const row = {
      name: name.trim(),
      category_id: categoryId,
      trip_id: tripId || null,
      trip_part: tripId && tripPart ? tripPart : null,
      for_whole_group: !!trip && trip.trip_type === 'group' && wholeGroup,
      account_id: accountId || null,
      source_transaction_id: sourceId || null,
      instalment_amount: amt,
      instalments: n,
      first_month: `${firstMonth}-01`,
      paid_by_member_id: payer,
      ...s,
      notes: notes.trim() || null,
    }
    const { error } = plan
      ? await supabase.from('emi_plans').update(row).eq('id', plan.id)
      : await supabase.from('emi_plans').insert(row)
    if (error) return error.message
    if (!plan && source) {
      // Stop the original charge from counting; the instalments count instead.
      const note = [source.notes, `Converted to EMI: ${name.trim()} (${todayISO()})`].filter(Boolean).join(' · ')
      const { error: e2 } = await supabase.from('transactions').update({ status: 'ignored', notes: note }).eq('id', source.id)
      if (e2) return `EMI saved, but the original charge couldn’t be set to ignored: ${e2.message}`
    }
    onSaved()
    return null
  }

  async function remove(): Promise<string | null> {
    const { error } = await supabase.from('emi_plans').delete().eq('id', plan!.id)
    if (!error) onSaved()
    return error?.message ?? null
  }

  const total = Number(instalment) * Number(count)
  const defaultSplitText = trip
    ? `the trip's split (${describeSplit(tripSplit(trip), members)})`
    : category
      ? `the category's split (${describeSplit(category, members)})`
      : 'the default split'

  return (
    <EditDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={plan ? `Edit ${plan.name}` : 'New EMI'}
      description={plan ? undefined : 'Each month’s instalment counts once you tick it on the Month page.'}
      onSave={save}
      onDelete={plan ? remove : undefined}
    >
      {!plan && (
        <Field
          label="Converted from (optional)"
          htmlFor="emi-src"
          hint="The original big charge. It will be set to Ignored so it isn’t counted twice."
        >
          <NativeSelect id="emi-src" value={sourceId} onChange={(e) => pickSource(e.target.value)}>
            <option value="">None / not in Chanda</option>
            {sources.map((t) => (
              <option key={t.id} value={t.id}>
                {t.description} · {formatINR(t.amount)} · {t.occurred_on}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      <Field label="Name" htmlFor="emi-name">
        <Input id="emi-name" placeholder="Goa flights" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monthly instalment (₹)" htmlFor="emi-amt" hint="Including interest">
          <Input id="emi-amt" type="number" inputMode="decimal" step="0.01" min={1} value={instalment} onChange={(e) => setInstalment(e.target.value)} />
        </Field>
        <Field label="Instalments" htmlFor="emi-n">
          <Input id="emi-n" type="number" inputMode="numeric" min={1} max={120} value={count} onChange={(e) => setCount(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First instalment month" htmlFor="emi-first">
          <Input id="emi-first" type="month" value={firstMonth} onChange={(e) => setFirstMonth(e.target.value)} />
        </Field>
        <Field label="Card" htmlFor="emi-acc">
          <NativeSelect
            id="emi-acc"
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value)
              const owner = accounts.find((a) => a.id === e.target.value)?.owner_member_id
              if (owner) setPayer(owner)
            }}
          >
            <option value="">Other</option>
            {accounts
              .filter((a) => a.is_active || a.id === accountId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </NativeSelect>
        </Field>
      </div>
      {total > 0 && firstMonth && (
        <p className="rounded-md bg-muted px-3 py-2 text-xs">
          {formatINR(total)} in total, {monthLabel(firstMonth)} to{' '}
          {monthLabel(emiLastMonth({ first_month: `${firstMonth}-01`, instalments: Number(count) || 1 } as EmiPlan))}.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" htmlFor="emi-cat">
          <NativeSelect id="emi-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories
              .filter((c) => c.is_active || c.id === categoryId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </NativeSelect>
        </Field>
        <Field label="Paid by" htmlFor="emi-payer">
          <NativeSelect id="emi-payer" value={payer} onChange={(e) => setPayer(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <div className="space-y-3 rounded-md border border-border p-3">
        <Field label="Trip (optional)" htmlFor="emi-trip">
          <NativeSelect
            id="emi-trip"
            value={tripId}
            onChange={(e) => {
              setTripId(e.target.value)
              if (!e.target.value) {
                setTripPart('')
                setWholeGroup(false)
              }
            }}
          >
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
            <Field label="What for" htmlFor="emi-part">
              <NativeSelect id="emi-part" value={tripPart} onChange={(e) => setTripPart(e.target.value as TripPart | '')}>
                <option value="">Choose…</option>
                {TRIP_PARTS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {trip.trip_type === 'group' && (
              <Checkbox checked={wholeGroup} onChange={setWholeGroup} label={`Paid for the whole group of ${trip.headcount}`} />
            )}
          </>
        )}
      </div>

      <div className="space-y-3 rounded-md border border-border p-3">
        <Checkbox checked={followDefault} onChange={setFollowDefault} label={`Use ${defaultSplitText}`} />
        {!followDefault && <SplitPicker idPrefix="emi-split" value={split} onChange={setSplit} members={members} />}
      </div>
      <Field label="Notes" htmlFor="emi-notes">
        <Input id="emi-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </EditDialog>
  )
}
