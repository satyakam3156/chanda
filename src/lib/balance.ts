/**
 * The month's net balance. Pure functions only: no database calls, so the maths
 * can be read (and checked) in one place.
 *
 * For every counted item we record two things per person:
 *   paid  — money that actually came out of their pocket
 *   share — what they should bear, according to the split
 * A person's balance is paid − share. Positive means the other person owes them.
 */
import type { Split } from '@/lib/split'
import { emiSeqInMonth, groupFactor, tripKindLabel, tripSplit } from '@/lib/trips'
import type { Category, EmiPayment, EmiPlan, FixedCost, FixedCostPayment, Member, Transaction, Trip } from '@/types/database'

export type Amounts = Record<string, number>

export type LineKind = 'category' | 'limit_under' | 'limit_over' | 'custom' | 'fixed' | 'trip' | 'emi'

export type Line = {
  key: string
  kind: LineKind
  label: string
  /** Short explanation, e.g. "₹20,000 limit · Only Priya". */
  detail: string
  total: number
  paid: Amounts
  share: Amounts
  count: number
}

export type LimitStatus = { category: Category; spent: number; limit: number }

export type FixedDue = { fixedCost: FixedCost; payment: FixedCostPayment | null }

export type EmiDue = { plan: EmiPlan; seq: number; payment: EmiPayment | null }

export type MonthResult = {
  lines: Line[]
  paid: Amounts
  share: Amounts
  /** paid − share, per member. */
  balance: Amounts
  /** Who owes whom overall, or null when even. */
  net: { from: Member; to: Member; amount: number } | null
  limits: LimitStatus[]
  fixedDue: FixedDue[]
  emiDue: EmiDue[]
  /** Confirmed transactions without a category can't exist (DB check), but inbox items are reported. */
  pendingReview: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

function zero(members: Member[]): Amounts {
  return Object.fromEntries(members.map((m) => [m.id, 0]))
}

function addInto(target: Amounts, src: Amounts, factor = 1) {
  for (const [k, v] of Object.entries(src)) target[k] = (target[k] ?? 0) + v * factor
}

/** How `amount` is borne under `split`. Negative amounts (money back) work the same way. */
export function shareOf(split: Split, amount: number, payerId: string, members: Member[]): Amounts {
  const out = zero(members)
  switch (split.split_type) {
    case 'equal':
      for (const m of members) out[m.id] = amount / members.length
      break
    case 'payer':
      out[payerId] = amount
      break
    case 'member':
      out[split.bearer_member_id!] = amount
      break
    case 'custom': {
      const pct = Number(split.bearer_pct) / 100
      for (const m of members) out[m.id] = m.id === split.bearer_member_id ? amount * pct : amount * (1 - pct)
      break
    }
  }
  return out
}

/** Is this fixed cost due in month "YYYY-MM"? */
export function isDue(f: FixedCost, ym: string): boolean {
  const [sy, sm] = f.start_month.split('-').map(Number)
  const [y, m] = ym.split('-').map(Number)
  const diff = y * 12 + (m - 1) - (sy * 12 + (sm - 1))
  return diff >= 0 && diff % f.every_months === 0
}

function signed(t: Transaction): number {
  return t.direction === 'credit' ? -Number(t.amount) : Number(t.amount)
}

function splitOfCategory(c: Category): Split {
  return { split_type: c.split_type, bearer_member_id: c.bearer_member_id, bearer_pct: c.bearer_pct }
}

function overSplitOfCategory(c: Category): Split {
  return { split_type: c.over_split_type!, bearer_member_id: c.over_bearer_member_id, bearer_pct: c.over_bearer_pct }
}

export function computeMonth(input: {
  month: string
  members: Member[]
  categories: Category[]
  transactions: Transaction[]
  fixedCosts: FixedCost[]
  payments: FixedCostPayment[]
  trips?: Trip[]
  emiPlans?: EmiPlan[]
  /** EMI instalments ticked for this month. */
  emiPayments?: EmiPayment[]
  describe: (s: Split) => string
  formatINR: (n: number) => string
}): MonthResult {
  const { month, members, categories, transactions, fixedCosts, payments, describe, formatINR } = input
  const trips = input.trips ?? []
  const emiPlans = input.emiPlans ?? []
  const emiPayments = input.emiPayments ?? []
  const lines: Line[] = []
  const limits: LimitStatus[] = []
  const confirmedAll = transactions.filter((t) => t.status === 'confirmed' && t.category_id)
  // Trip transactions are counted per trip (below), not under their category.
  const confirmed = confirmedAll.filter((t) => !t.trip_id)

  for (const cat of categories) {
    const txs = confirmed.filter((t) => t.category_id === cat.id)
    if (txs.length === 0) {
      if (cat.monthly_limit != null) limits.push({ category: cat, spent: 0, limit: Number(cat.monthly_limit) })
      continue
    }
    const following = txs.filter((t) => !t.split_type)
    const custom = txs.filter((t) => t.split_type)

    if (following.length > 0) {
      const net = following.reduce((s, t) => s + signed(t), 0)
      const limit = cat.monthly_limit != null ? Number(cat.monthly_limit) : null

      if (limit != null && cat.over_split_type) {
        limits.push({ category: cat, spent: net, limit })
        // Spend up to the limit uses the category split, the rest uses the over-limit split.
        // Each transaction is divided in the same proportion, so "whoever paid" stays fair
        // when both of you paid into the same category.
        const under = Math.min(Math.max(net, 0), limit)
        const over = Math.max(net - limit, 0)
        const fracUnder = net > 0 ? under / net : 1
        const underLine = newLine(`${cat.id}:under`, 'limit_under', cat.name, `up to ${formatINR(limit)} · ${describe(splitOfCategory(cat))}`, members)
        const overLine = newLine(`${cat.id}:over`, 'limit_over', `${cat.name}`, `above ${formatINR(limit)} · ${describe(overSplitOfCategory(cat))}`, members)
        for (const t of following) {
          const amt = signed(t)
          const u = amt * fracUnder
          const o = amt - u
          addTx(underLine, u, t.paid_by_member_id, shareOf(splitOfCategory(cat), u, t.paid_by_member_id, members))
          if (over > 0) addTx(overLine, o, t.paid_by_member_id, shareOf(overSplitOfCategory(cat), o, t.paid_by_member_id, members))
        }
        underLine.count = following.length
        lines.push(underLine)
        if (over > 0) {
          overLine.count = following.length
          lines.push(overLine)
        }
      } else {
        const line = newLine(cat.id, 'category', cat.name, describe(splitOfCategory(cat)), members)
        for (const t of following) {
          addTx(line, signed(t), t.paid_by_member_id, shareOf(splitOfCategory(cat), signed(t), t.paid_by_member_id, members))
        }
        line.count = following.length
        lines.push(line)
      }
    }

    if (custom.length > 0) {
      const line = newLine(`${cat.id}:custom`, 'custom', cat.name, 'own split per transaction', members)
      for (const t of custom) {
        const split: Split = { split_type: t.split_type!, bearer_member_id: t.bearer_member_id, bearer_pct: t.bearer_pct }
        addTx(line, signed(t), t.paid_by_member_id, shareOf(split, signed(t), t.paid_by_member_id, members))
      }
      line.count = custom.length
      lines.push(line)
    }
  }

  // Trips: each trip's transactions this month, scaled for whole-group bills, using the trip's split.
  for (const trip of trips) {
    const txs = confirmedAll.filter((t) => t.trip_id === trip.id)
    if (txs.length === 0) continue
    const line = newLine(`trip:${trip.id}`, 'trip', `Trip: ${trip.name}`, `${tripKindLabel(trip)} · ${describe(tripSplit(trip))}`, members)
    for (const t of txs) {
      const amt = signed(t) * groupFactor(trip, t.for_whole_group)
      const split: Split = t.split_type ? { split_type: t.split_type, bearer_member_id: t.bearer_member_id, bearer_pct: t.bearer_pct } : tripSplit(trip)
      addTx(line, amt, t.paid_by_member_id, shareOf(split, amt, t.paid_by_member_id, members))
    }
    line.count = txs.length
    lines.push(line)
  }

  // EMIs: an instalment is listed when due this month, and counted once ticked.
  const emiDue: EmiDue[] = []
  for (const plan of emiPlans) {
    const payment = emiPayments.find((p) => p.plan_id === plan.id) ?? null
    const seq = payment?.seq ?? emiSeqInMonth(plan, month)
    if (seq == null) continue
    emiDue.push({ plan, seq, payment })
    if (!payment) continue
    const trip = trips.find((t) => t.id === plan.trip_id)
    const category = categories.find((c) => c.id === plan.category_id)
    const split: Split = plan.split_type
      ? { split_type: plan.split_type, bearer_member_id: plan.bearer_member_id, bearer_pct: plan.bearer_pct }
      : trip
        ? tripSplit(trip)
        : category
          ? splitOfCategory(category)
          : { split_type: 'equal', bearer_member_id: null, bearer_pct: null }
    const amt = Number(payment.amount) * groupFactor(trip, plan.for_whole_group)
    const line = newLine(`emi:${plan.id}`, 'emi', `EMI: ${plan.name}`, `instalment ${seq} of ${plan.instalments} · ${describe(split)}`, members)
    addTx(line, amt, plan.paid_by_member_id, shareOf(split, amt, plan.paid_by_member_id, members))
    line.count = 1
    lines.push(line)
  }

  // Fixed costs: listed when due this month (or already ticked), counted only once ticked.
  const fixedDue: FixedDue[] = []
  for (const f of fixedCosts) {
    const payment = payments.find((p) => p.fixed_cost_id === f.id) ?? null
    if (!payment && !(f.is_active && isDue(f, month))) continue
    fixedDue.push({ fixedCost: f, payment })
    if (payment) {
      const split: Split = { split_type: payment.split_type, bearer_member_id: payment.bearer_member_id, bearer_pct: payment.bearer_pct }
      const line = newLine(`fixed:${f.id}`, 'fixed', f.name, describe(split), members)
      addTx(line, Number(payment.amount), payment.paid_by_member_id, shareOf(split, Number(payment.amount), payment.paid_by_member_id, members))
      line.count = 1
      lines.push(line)
    }
  }

  const paid = zero(members)
  const share = zero(members)
  for (const l of lines) {
    addInto(paid, l.paid)
    addInto(share, l.share)
  }
  const balance = Object.fromEntries(members.map((m) => [m.id, round2(paid[m.id] - share[m.id])]))

  let net: MonthResult['net'] = null
  if (members.length === 2) {
    const [a, b] = members
    const owedToA = balance[a.id]
    if (Math.abs(owedToA) >= 0.01) {
      net = owedToA > 0 ? { from: b, to: a, amount: owedToA } : { from: a, to: b, amount: -owedToA }
    }
  }

  return {
    lines,
    paid,
    share,
    balance,
    net,
    limits,
    fixedDue,
    emiDue,
    pendingReview: transactions.filter((t) => t.status === 'needs_review').length,
  }
}

function newLine(key: string, kind: LineKind, label: string, detail: string, members: Member[]): Line {
  return { key, kind, label, detail, total: 0, paid: zero(members), share: zero(members), count: 0 }
}

function addTx(line: Line, amount: number, payerId: string, shares: Amounts) {
  line.total += amount
  line.paid[payerId] = (line.paid[payerId] ?? 0) + amount
  addInto(line.share, shares)
}
