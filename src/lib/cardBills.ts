/**
 * Card billing cycles (step 8). Pure functions only.
 *
 * A card with statement day S closes a bill on the S-th of every month. The bill that
 * closes in month M covers (S+1)-th of the previous month → S-th of M. So a calendar
 * month's spending on the card sits partly on the bill that closes this month and
 * partly on next month's bill.
 *
 * Shares come from the balance (computeMonth's itemShares), so limits, trips and
 * custom splits are applied exactly as in the month's balance.
 */
import type { Amounts } from '@/lib/balance'
import { shiftMonth } from '@/lib/month'
import type { Account, EmiPayment, EmiPlan, Member, Transaction } from '@/types/database'

export type CardBill = {
  /** "YYYY-MM-DD" the bill is generated (end of the cycle). */
  closesOn: string
  /** First day of the cycle. */
  from: string
  /** True once the bill has been generated (today is on or after closesOn). */
  generated: boolean
  /** Everything on the card in this cycle, as the bank will bill it (EMI instalments included). */
  total: number
  /** Counted items only: each person's share. Group-trip bills only count your couple's part. */
  share: Amounts
  /** On the card but still in the Inbox (not counted yet). */
  pending: number
  /** On the card but not counted here: ignored, or ticked as a fixed cost / settle-up. */
  ignored: number
  /** Charges in another currency still waiting for their ₹ amount: left out of the total. */
  foreignPending: { count: number; labels: string[] }
  /** EMI instalments ticked for this bill's month that are charged to this card. */
  emi: number
  /** Card spending in this cycle per calendar month ("YYYY-MM" → amount). */
  byMonth: Record<string, number>
}

export type CardCycle = {
  account: Account
  statementDay: number
  /** The bill that closes in the selected month. */
  current: CardBill
  /** The bill that closes next month. */
  next: CardBill
  /** The selected month's spending on this card: how much is on each bill. */
  thisMonth: { onCurrent: number; onNext: number }
}

const round2 = (n: number) => Math.round(n * 100) / 100

function daysIn(ym: string): number {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/** The day a bill closes in month "YYYY-MM" (statement day 31 → last day of short months). */
export function closeDate(ym: string, statementDay: number): string {
  return `${ym}-${String(Math.min(statementDay, daysIn(ym))).padStart(2, '0')}`
}

function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(y, m - 1, d + 1)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

function signed(t: Transaction): number {
  return t.direction === 'credit' ? -Number(t.amount) : Number(t.amount)
}

function zero(members: Member[]): Amounts {
  return Object.fromEntries(members.map((m) => [m.id, 0]))
}

function addInto(target: Amounts, src: Amounts | undefined) {
  if (!src) return
  for (const [k, v] of Object.entries(src)) target[k] = (target[k] ?? 0) + v
}

/** One card's bill closing in month `closeYm`. */
export function billFor(input: {
  account: Account
  statementDay: number
  closeYm: string
  /** Transactions covering the cycle (any status). */
  transactions: Transaction[]
  /** computeMonth(...).itemShares per calendar month. */
  sharesByMonth: Record<string, Record<string, Amounts>>
  emiPlans: EmiPlan[]
  /** EMI instalments ticked, any month. */
  emiPayments: EmiPayment[]
  members: Member[]
  today: string
}): CardBill {
  const { account, statementDay, closeYm, members, sharesByMonth } = input
  const closesOn = closeDate(closeYm, statementDay)
  const from = nextDay(closeDate(shiftMonth(closeYm, -1), statementDay))
  // A purchase converted to EMI is billed as instalments, not as the purchase.
  const emiSources = new Set(input.emiPlans.map((p) => p.source_transaction_id).filter(Boolean))

  const bill: CardBill = {
    closesOn,
    from,
    generated: input.today >= closesOn,
    total: 0,
    share: zero(members),
    pending: 0,
    ignored: 0,
    foreignPending: { count: 0, labels: [] },
    emi: 0,
    byMonth: {},
  }

  for (const t of input.transactions) {
    if (t.account_id !== account.id || t.occurred_on < from || t.occurred_on > closesOn) continue
    if (emiSources.has(t.id)) continue
    // A foreign-currency charge whose amount is still the placeholder (e.g. VND 667201):
    // adding it would swamp the bill, so it's only listed.
    const raw = t.raw as { currency?: string; foreign_amount?: number } | null
    if (raw?.currency && raw.foreign_amount != null && Number(t.amount) === Number(raw.foreign_amount)) {
      bill.foreignPending.count += 1
      bill.foreignPending.labels.push(`${raw.currency} ${raw.foreign_amount}`)
      continue
    }
    const amt = signed(t)
    const ym = t.occurred_on.slice(0, 7)
    bill.total += amt
    bill.byMonth[ym] = (bill.byMonth[ym] ?? 0) + amt
    if (t.status === 'needs_review') bill.pending += amt
    else if (t.status === 'ignored') bill.ignored += amt
    else addInto(bill.share, sharesByMonth[ym]?.[`tx:${t.id}`])
  }

  // EMI instalments: counted on the bill that closes in the month they're ticked for.
  for (const p of input.emiPayments) {
    if (p.month.slice(0, 7) !== closeYm) continue
    const plan = input.emiPlans.find((x) => x.id === p.plan_id)
    if (!plan || plan.account_id !== account.id) continue
    bill.total += Number(p.amount)
    bill.emi += Number(p.amount)
    addInto(bill.share, sharesByMonth[closeYm]?.[`emi:${plan.id}`])
  }

  bill.total = round2(bill.total)
  bill.pending = round2(bill.pending)
  bill.ignored = round2(bill.ignored)
  bill.emi = round2(bill.emi)
  for (const k of Object.keys(bill.share)) bill.share[k] = round2(bill.share[k])
  for (const k of Object.keys(bill.byMonth)) bill.byMonth[k] = round2(bill.byMonth[k])
  return bill
}

/** Every active credit card with a statement day: this month's bill and next month's. */
export function cardCycles(input: {
  month: string
  accounts: Account[]
  transactions: Transaction[]
  sharesByMonth: Record<string, Record<string, Amounts>>
  emiPlans: EmiPlan[]
  emiPayments: EmiPayment[]
  members: Member[]
  today: string
}): { cycles: CardCycle[]; missingStatementDay: Account[] } {
  const cards = input.accounts.filter((a) => a.kind === 'credit_card' && a.is_active)
  const cycles: CardCycle[] = []
  for (const account of cards) {
    if (!account.statement_day) continue
    const common = { ...input, account, statementDay: account.statement_day }
    const current = billFor({ ...common, closeYm: input.month })
    const next = billFor({ ...common, closeYm: shiftMonth(input.month, 1) })
    cycles.push({
      account,
      statementDay: account.statement_day,
      current,
      next,
      thisMonth: { onCurrent: current.byMonth[input.month] ?? 0, onNext: next.byMonth[input.month] ?? 0 },
    })
  }
  return { cycles, missingStatementDay: cards.filter((a) => !a.statement_day) }
}
