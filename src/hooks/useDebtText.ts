import { useAuth } from '@/context/AuthProvider'
import type { Debt } from '@/lib/settle'
import { formatINR } from '@/lib/utils'

/** "Nivedita owes Satyakam ₹X", or with mine=true "Nivedita owes you ₹X" / "You owe … ". */
export function useDebtText() {
  const { members, member: me } = useAuth()
  const name = (id: string) => members.find((m) => m.id === id)?.display_name ?? '?'
  return (d: Debt, mine = false, withAmount = true): string => {
    if (!d) return 'Even'
    const amt = withAmount ? ` ${formatINR(d.amount)}` : ''
    if (mine && me) {
      if (d.to === me.id) return `${name(d.from)} owes you${amt}`
      if (d.from === me.id) return `You owe ${name(d.to)}${amt}`
    }
    return `${name(d.from)} owes ${name(d.to)}${amt}`
  }
}
