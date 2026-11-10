import { shareOf } from '@/lib/balance'
import type { Amounts } from '@/lib/balance'
import type { Split } from '@/lib/split'
import { groupFactor, tripSplit } from '@/lib/trips'
import type { EmiPayment, EmiPlan, Member, Transaction, Trip, TripPart } from '@/types/database'

export type TripSummary = {
  /** What the trip cost the two of you so far (your part only, after refunds). */
  counted: number
  /** EMI instalments not yet ticked, your part only. */
  emiRemaining: number
  /** Everything that left your cards/accounts for this trip, before dividing by headcount. */
  grossPaid: number
  byPart: { part: TripPart | 'unspecified'; amount: number }[]
  paid: Amounts
  share: Amounts
  txCount: number
}

export function summariseTrip(input: {
  trip: Trip
  transactions: Transaction[]
  plans: EmiPlan[]
  emiPayments: EmiPayment[]
  members: Member[]
}): TripSummary {
  const { trip, members } = input
  const paid: Amounts = Object.fromEntries(members.map((m) => [m.id, 0]))
  const share: Amounts = Object.fromEntries(members.map((m) => [m.id, 0]))
  const parts = new Map<TripPart | 'unspecified', number>()
  let counted = 0
  let gross = 0
  let emiRemaining = 0

  function add(amount: number, payer: string, split: Split, part: TripPart | null) {
    counted += amount
    paid[payer] = (paid[payer] ?? 0) + amount
    for (const [k, v] of Object.entries(shareOf(split, amount, payer, members))) share[k] = (share[k] ?? 0) + v
    const key = part ?? 'unspecified'
    parts.set(key, (parts.get(key) ?? 0) + amount)
  }

  const txs = input.transactions.filter((t) => t.trip_id === trip.id && t.status === 'confirmed')
  for (const t of txs) {
    const sign = t.direction === 'credit' ? -1 : 1
    gross += sign * Number(t.amount)
    const amt = sign * Number(t.amount) * groupFactor(trip, t.for_whole_group)
    const split: Split = t.split_type ? { split_type: t.split_type, bearer_member_id: t.bearer_member_id, bearer_pct: t.bearer_pct } : tripSplit(trip)
    add(amt, t.paid_by_member_id, split, t.trip_part)
  }

  for (const plan of input.plans.filter((p) => p.trip_id === trip.id)) {
    const factor = groupFactor(trip, plan.for_whole_group)
    const split: Split = plan.split_type
      ? { split_type: plan.split_type, bearer_member_id: plan.bearer_member_id, bearer_pct: plan.bearer_pct }
      : tripSplit(trip)
    const ticked = input.emiPayments.filter((p) => p.plan_id === plan.id)
    for (const p of ticked) {
      gross += Number(p.amount)
      add(Number(p.amount) * factor, plan.paid_by_member_id, split, plan.trip_part)
    }
    emiRemaining += Math.max(plan.instalments - ticked.length, 0) * Number(plan.instalment_amount) * factor
  }

  return {
    counted,
    emiRemaining,
    grossPaid: gross,
    byPart: [...parts.entries()].map(([part, amount]) => ({ part, amount })).sort((a, b) => b.amount - a.amount),
    paid,
    share,
    txCount: txs.length,
  }
}
