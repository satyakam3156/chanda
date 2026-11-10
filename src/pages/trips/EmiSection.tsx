import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ListRow } from '@/components/forms'
import { monthLabel } from '@/lib/month'
import { emiLastMonth } from '@/lib/trips'
import { formatINR } from '@/lib/utils'
import type { Account, Category, EmiPayment, EmiPlan, Trip } from '@/types/database'
import { EmiDialog } from './EmiDialog'

export function EmiSection({
  plans,
  trips,
  accounts,
  categories,
  emiPayments,
  onChanged,
  title = 'EMIs',
}: {
  plans: EmiPlan[]
  trips: Trip[]
  accounts: Account[]
  categories: Category[]
  emiPayments: EmiPayment[]
  onChanged: () => void
  title?: string
}) {
  const [dialog, setDialog] = useState<{ plan: EmiPlan | null; n: number } | null>(null)

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <Button size="sm" variant="outline" onClick={() => setDialog({ plan: null, n: Date.now() })}>
          <Plus /> New EMI
        </Button>
      </div>
      {plans.length === 0 && (
        <p className="text-sm text-muted-foreground">No EMIs. Add one when a big charge is converted to monthly instalments.</p>
      )}
      <div className="space-y-2">
        {plans.map((p) => {
          const paid = emiPayments.filter((x) => x.plan_id === p.id).length
          const trip = trips.find((t) => t.id === p.trip_id)
          return (
            <ListRow
              key={p.id}
              title={`${p.name} · ${formatINR(p.instalment_amount)} × ${p.instalments}`}
              subtitle={[
                `${monthLabel(p.first_month.slice(0, 7))} – ${monthLabel(emiLastMonth(p))}`,
                `${paid} of ${p.instalments} paid`,
                trip && `Trip: ${trip.name}`,
              ]
                .filter(Boolean)
                .join(' · ')}
              badge={
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {Math.round((paid / p.instalments) * 100)}%
                </span>
              }
              onClick={() => setDialog({ plan: p, n: Date.now() })}
            />
          )
        })}
      </div>

      {dialog && (
        <EmiDialog
          key={dialog.n}
          plan={dialog.plan}
          trips={trips}
          accounts={accounts}
          categories={categories}
          paidCount={dialog.plan ? emiPayments.filter((x) => x.plan_id === dialog.plan!.id).length : 0}
          onClose={() => setDialog(null)}
          onSaved={onChanged}
        />
      )}
    </section>
  )
}
