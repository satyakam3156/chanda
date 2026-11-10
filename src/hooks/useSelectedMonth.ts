import { useSearchParams } from 'react-router-dom'
import { currentMonth, isMonth } from '@/lib/month'

/** The selected calendar month lives in the URL (?m=2026-11), so it survives reloads and can be shared. */
export function useSelectedMonth(): [string, (m: string) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get('m')
  const month = isMonth(raw) ? raw : currentMonth()
  const setMonth = (m: string) =>
    setParams(
      (p) => {
        if (m === currentMonth()) p.delete('m')
        else p.set('m', m)
        return p
      },
      { replace: true },
    )
  return [month, setMonth]
}
