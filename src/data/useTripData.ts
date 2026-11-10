import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { EmiPayment, Transaction } from '@/types/database'

/** All trip transactions (any month) and all ticked EMI instalments, for trip totals and EMI progress. */
export function useTripData() {
  const [data, setData] = useState<{ transactions: Transaction[]; emiPayments: EmiPayment[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('transactions').select('*').not('trip_id', 'is', null).order('occurred_on', { ascending: false }),
      supabase.from('emi_payments').select('*').order('seq'),
    ]).then(([t, e]) => {
      if (cancelled) return
      const err = t.error ?? e.error
      if (err) return setError(err.message)
      setError(null)
      setData({ transactions: t.data ?? [], emiPayments: e.data ?? [] })
    })
    return () => {
      cancelled = true
    }
  }, [version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { data, error, reload }
}
