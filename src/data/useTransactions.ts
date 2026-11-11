import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { monthRange } from '@/lib/month'
import type { Transaction } from '@/types/database'

type Query = { month: string } | { inbox: true }

/** Transactions for one calendar month, or everything waiting in the inbox. */
export function useTransactions(query: Query) {
  const [rows, setRows] = useState<Transaction[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const key = 'month' in query ? query.month : 'inbox'

  useEffect(() => {
    let cancelled = false
    let q = supabase.from('transactions').select('*')
    if (key === 'inbox') {
      q = q.eq('status', 'needs_review')
    } else {
      const [from, to] = monthRange(key)
      q = q.gte('occurred_on', from).lt('occurred_on', to)
    }
    q.order('occurred_on', { ascending: false })
      .order('occurred_time', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        setError(error?.message ?? null)
        setRows(data ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [key, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { rows, error, reload }
}
