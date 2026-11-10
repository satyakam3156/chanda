/** Calendar months as "YYYY-MM". Dates as "YYYY-MM-DD" in local (IST) time. */

export function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isMonth(v: string | null): v is string {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)
}

export function shiftMonth(ym: string, by: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + by, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** [first day, first day of next month) — use with gte / lt. */
export function monthRange(ym: string): [string, string] {
  return [`${ym}-01`, `${shiftMonth(ym, 1)}-01`]
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
}

export function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}
