import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { monthLabel, shiftMonth } from '@/lib/month'

export function MonthSwitcher({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => onChange(shiftMonth(month, -1))}>
        <ChevronLeft />
      </Button>
      <span className="min-w-[9rem] text-center text-sm font-semibold">{monthLabel(month)}</span>
      <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => onChange(shiftMonth(month, 1))}>
        <ChevronRight />
      </Button>
    </div>
  )
}
