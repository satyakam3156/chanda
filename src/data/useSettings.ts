import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Account, Category, EmiPlan, FixedCost, Trip } from '@/types/database'

type SettingsData = {
  accounts: Account[]
  categories: Category[]
  fixedCosts: FixedCost[]
  trips: Trip[]
  emiPlans: EmiPlan[]
}

/** Loads settings tables plus trips and EMI plans. Call reload() after any change. */
export function useSettings() {
  const [data, setData] = useState<SettingsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('accounts').select('*').order('created_at'),
      supabase.from('categories').select('*').order('sort_order').order('name'),
      supabase.from('fixed_costs').select('*').order('created_at'),
      supabase.from('trips').select('*').order('start_date', { ascending: false }),
      supabase.from('emi_plans').select('*').order('first_month', { ascending: false }),
    ]).then(([a, c, f, t, e]) => {
      if (cancelled) return
      const err = a.error ?? c.error ?? f.error ?? t.error ?? e.error
      if (err) {
        setError(err.message)
        return
      }
      setError(null)
      setData({
        accounts: a.data ?? [],
        categories: c.data ?? [],
        fixedCosts: f.data ?? [],
        trips: t.data ?? [],
        emiPlans: e.data ?? [],
      })
    })
    return () => {
      cancelled = true
    }
  }, [version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  return { data, error, reload }
}
