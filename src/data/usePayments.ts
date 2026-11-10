import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { EmiPayment, FixedCostPayment } from '@/types/database'

/** Fixed-cost payments and EMI instalments ticked for one calendar month ("YYYY-MM"). */
export function usePayments(month: string) {
  const [rows, setRows] = useState<FixedCostPayment[] | null>(null)
  const [emiRows, setEmiRows] = useState<EmiPayment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('fixed_cost_payments').select('*').eq('month', `${month}-01`),
      supabase.from('emi_payments').select('*').eq('month', `${month}-01`),
    ]).then(([f, e]) => {
      if (cancelled) return
      setError(f.error?.message ?? e.error?.message ?? null)
      setRows(f.data ?? [])
      setEmiRows(e.data ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [month, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { rows, emiRows, error, reload }
}
