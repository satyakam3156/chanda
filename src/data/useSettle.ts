import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { shiftMonth } from '@/lib/month'
import type { MonthClose, Settlement } from '@/types/database'

type SettleData = {
  settlements: Settlement[]
  close: MonthClose | null
  prevClose: MonthClose | null
  nextClose: MonthClose | null
  /** True when the previous month has transactions or settle-ups but isn't closed. */
  prevOpenWithActivity: boolean
}

/** Settle-ups for a month, plus the close records of it and its neighbours. */
export function useSettle(month: string) {
  const [data, setData] = useState<SettleData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    const prev = shiftMonth(month, -1)
    const next = shiftMonth(month, 1)
    Promise.all([
      supabase.from('settlements').select('*').eq('month', `${month}-01`).order('paid_on'),
      supabase.from('month_closes').select('*').in('month', [`${prev}-01`, `${month}-01`, `${next}-01`]),
      supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'confirmed')
        .gte('occurred_on', `${prev}-01`)
        .lt('occurred_on', `${month}-01`),
    ]).then(([s, c, prevTx]) => {
      if (cancelled) return
      const err = s.error ?? c.error ?? prevTx.error
      if (err) {
        setError(err.message)
        return
      }
      const closes = c.data ?? []
      const find = (m: string) => closes.find((x) => x.month === `${m}-01`) ?? null
      const prevClose = find(prev)
      setError(null)
      setData({
        settlements: s.data ?? [],
        close: find(month),
        prevClose,
        nextClose: find(next),
        prevOpenWithActivity: !prevClose && (prevTx.count ?? 0) > 0,
      })
    })
    return () => {
      cancelled = true
    }
  }, [month, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { data, error, reload }
}
