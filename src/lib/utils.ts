import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatINR(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN')
}

export function monthLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric' })
}

export function monthSortKey(label: string): number {
  const d = new Date('1 ' + label)
  return d.getFullYear() * 100 + d.getMonth()
}

export function monthFirstDay(label: string): string {
  const d = new Date('1 ' + label)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

export function prevMonthLabel(label: string): string {
  const d = new Date('1 ' + label)
  d.setMonth(d.getMonth() - 1)
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric' })
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function addMonthsISO(iso: string, months: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}
