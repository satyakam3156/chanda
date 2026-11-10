import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { FixedCostPayment } from '@/types/database'

/** Fixed-cost payments ticked for one calendar month ("YYYY-MM"). */
export function usePayments(month: string) {
  const [rows, setRows] = useState<FixedCostPayment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('fixed_cost_payments')
      .select('*')
      .eq('month', `${month}-01`)
      .then(({ data, error }) => {
        if (cancelled) return
        setError(error?.message ?? null)
        setRows(data ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [month, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { rows, error, reload }
}
