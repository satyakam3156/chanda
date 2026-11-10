/**
 * Settle-ups and carry-over, on top of the month's own balance (balance.ts).
 *
 *   final = month's own balance + carried in from last closed month + settle-ups
 *
 * A settle-up from A to B counts as A paying: it raises A's balance and lowers B's.
 */
import type { Amounts } from '@/lib/balance'
import type { Member, MonthClose, Settlement } from '@/types/database'

/** "from owes to amount". Null when even. */
export type Debt = { from: string; to: string; amount: number } | null

const round2 = (n: number) => Math.round(n * 100) / 100

export function balanceToDebt(balance: Amounts, members: Member[]): Debt {
  if (members.length !== 2) return null
  const [a, b] = members
  const owedToA = round2(balance[a.id] ?? 0)
  if (Math.abs(owedToA) < 0.01) return null
  return owedToA > 0 ? { from: b.id, to: a.id, amount: owedToA } : { from: a.id, to: b.id, amount: -owedToA }
}

export function debtToBalance(debt: Debt, members: Member[]): Amounts {
  const out: Amounts = Object.fromEntries(members.map((m) => [m.id, 0]))
  if (debt) {
    out[debt.to] += debt.amount
    out[debt.from] -= debt.amount
  }
  return out
}

function add(a: Amounts, b: Amounts): Amounts {
  const out: Amounts = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v
  return out
}

export type SettleResult = {
  own: Debt
  carryIn: Debt
  /** own + carry-in, before any settle-up. */
  due: Debt
  /** Total of settle-ups that reduce `due` (opposite-direction ones count negative). */
  settled: number
  /** What's still owed after settle-ups. This carries into next month when closing. */
  remaining: Debt
}

export function computeSettle(input: {
  ownBalance: Amounts
  carryIn: Debt
  settlements: Settlement[]
  members: Member[]
}): SettleResult {
  const { ownBalance, carryIn, settlements, members } = input
  const dueBalance = add(ownBalance, debtToBalance(carryIn, members))
  const due = balanceToDebt(dueBalance, members)

  let finalBalance = { ...dueBalance }
  let settled = 0
  for (const s of settlements) {
    finalBalance = add(finalBalance, { [s.from_member_id]: Number(s.amount), [s.to_member_id]: -Number(s.amount) })
    // Positive when it's the debtor paying, negative if it went the other way.
    settled += !due || s.from_member_id === due.from ? Number(s.amount) : -Number(s.amount)
  }

  return {
    own: balanceToDebt(ownBalance, members),
    carryIn,
    due,
    settled: round2(settled),
    remaining: balanceToDebt(finalBalance, members),
  }
}

export function closeToCarry(close: MonthClose | null | undefined, members: Member[]): Debt {
  if (!close || !close.carry_out_from_member_id || Number(close.carry_out_amount) === 0) return null
  const to = members.find((m) => m.id !== close.carry_out_from_member_id)
  return to ? { from: close.carry_out_from_member_id, to: to.id, amount: Number(close.carry_out_amount) } : null
}

/** True when the month's own numbers no longer match what was confirmed at closing. */
export function changedSinceClose(close: MonthClose, own: Debt): boolean {
  const closedAmount = Number(close.own_amount)
  const liveAmount = own?.amount ?? 0
  return Math.abs(closedAmount - liveAmount) >= 0.01 || (own?.from ?? null) !== close.own_from_member_id
}
