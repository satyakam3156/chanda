import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { monthRange, shiftMonth } from '@/lib/month'
import type { CardPayment, EmiPayment, Transaction } from '@/types/database'

type CardBillData = {
  /** Transactions from the previous month to the next one (a bill spans two months). */
  transactions: Transaction[]
  /** EMI instalments ticked in those three months. */
  emiPayments: EmiPayment[]
  /** Card bill payments (e.g. through CRED) made in the selected month. */
  cardPayments: CardPayment[]
}

/** Everything the card bills panel needs for month "YYYY-MM". */
export function useCardBills(month: string) {
  const [data, setData] = useState<CardBillData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    const from = monthRange(shiftMonth(month, -1))[0]
    const to = monthRange(shiftMonth(month, 1))[1]
    const [mFrom, mTo] = monthRange(month)
    Promise.all([
      supabase.from('transactions').select('*').gte('occurred_on', from).lt('occurred_on', to),
      supabase.from('emi_payments').select('*').gte('month', from).lt('month', to),
      supabase.from('card_payments').select('*').gte('paid_on', mFrom).lt('paid_on', mTo).order('paid_on'),
    ]).then(([t, e, c]) => {
      if (cancelled) return
      const err = t.error ?? e.error ?? c.error
      setError(err?.message ?? null)
      if (!err) setData({ transactions: t.data ?? [], emiPayments: e.data ?? [], cardPayments: c.data ?? [] })
    })
    return () => {
      cancelled = true
    }
  }, [month, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { data, error, reload }
}
