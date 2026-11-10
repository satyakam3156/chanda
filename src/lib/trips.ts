import type { Split } from '@/lib/split'
import type { EmiPlan, Trip, TripPart } from '@/types/database'

export const TRIP_PARTS: { value: TripPart; label: string }[] = [
  { value: 'travel', label: 'Getting there (flights, trains, buses)' },
  { value: 'stay', label: 'Stay' },
  { value: 'food', label: 'Food' },
  { value: 'local', label: 'Local travel (cabs, rentals, fuel)' },
  { value: 'activities', label: 'Activities and tickets' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'other', label: 'Other' },
]

export const TRIP_PART_SHORT: Record<TripPart, string> = {
  travel: 'Getting there',
  stay: 'Stay',
  food: 'Food',
  local: 'Local travel',
  activities: 'Activities',
  shopping: 'Shopping',
  other: 'Other',
}

/**
 * The part of an amount that counts between the two of you.
 * A group-trip bill paid for the whole group counts only 2/headcount; anything else counts in full.
 */
export function groupFactor(trip: Trip | null | undefined, forWholeGroup: boolean): number {
  if (!trip || trip.trip_type !== 'group' || !forWholeGroup) return 1
  return 2 / trip.headcount
}

export function tripSplit(trip: Trip): Split {
  return { split_type: trip.split_type, bearer_member_id: trip.bearer_member_id, bearer_pct: trip.bearer_pct }
}

export function tripKindLabel(trip: Trip): string {
  return trip.trip_type === 'couple' ? 'Just us' : `Group of ${trip.headcount}`
}

function monthIndex(ym: string): number {
  const [y, m] = ym.split('-').map(Number)
  return y * 12 + (m - 1)
}

/** Which instalment (1-based) of the plan falls in month "YYYY-MM", or null. */
export function emiSeqInMonth(plan: EmiPlan, ym: string): number | null {
  const seq = monthIndex(ym) - monthIndex(plan.first_month.slice(0, 7)) + 1
  return seq >= 1 && seq <= plan.instalments ? seq : null
}

export function emiLastMonth(plan: EmiPlan): string {
  const idx = monthIndex(plan.first_month.slice(0, 7)) + plan.instalments - 1
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
}

export function seqToMonth(plan: EmiPlan, seq: number): string {
  const idx = monthIndex(plan.first_month.slice(0, 7)) + seq - 1
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
}

export function tripDates(start: string, end: string | null): string {
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  return end && end !== start ? `${fmt(start)} – ${fmt(end)}` : fmt(start)
}
