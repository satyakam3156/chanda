import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/context/AuthProvider'
import { useSettings } from '@/data/useSettings'
import { useTripData } from '@/data/useTripData'
import { tripDates, tripKindLabel } from '@/lib/trips'
import { summariseTrip } from '@/lib/tripSummary'
import { formatINR } from '@/lib/utils'
import { EmiSection } from './EmiSection'
import { TripDialog } from './TripDialog'

export function TripsPage() {
  const { members } = useAuth()
  const settings = useSettings()
  const tripData = useTripData()
  const [dialog, setDialog] = useState<number | null>(null)

  const loadError = settings.error ?? tripData.error
  if (loadError) {
    return (
      <p className="text-sm text-destructive">
        Couldn’t load trips: {loadError}. If this mentions a missing table, run <code>supabase/migrations/0006_trips_emis.sql</code> in
        Supabase.
      </p>
    )
  }
  if (!settings.data || !tripData.data) return <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
  const { trips, emiPlans } = settings.data
  const reloadAll = () => {
    settings.reload()
    tripData.reload()
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Trips</h2>
          <Button size="sm" onClick={() => setDialog(Date.now())}>
            <Plus /> New trip
          </Button>
        </div>
        {trips.length === 0 && <p className="text-sm text-muted-foreground">No trips yet. Create one, then pick it when adding trip expenses.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {trips.map((trip) => {
            const s = summariseTrip({ trip, transactions: tripData.data!.transactions, plans: emiPlans, emiPayments: tripData.data!.emiPayments, members })
            return (
              <Link key={trip.id} to={`/trips/${trip.id}`}>
                <Card className="h-full transition-colors hover:bg-accent/40">
                  <CardContent className="space-y-1 p-4">
                    <p className="font-medium">{trip.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {tripDates(trip.start_date, trip.end_date)} · {tripKindLabel(trip)}
                    </p>
                    <p className="pt-2 text-xl font-semibold tabular-nums">{formatINR(s.counted)}</p>
                    <p className="text-xs text-muted-foreground">
                      Cost to the two of you
                      {s.emiRemaining > 0 && ` · ${formatINR(s.emiRemaining)} still to come in EMIs`}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </section>

      <EmiSection
        plans={emiPlans}
        trips={trips}
        accounts={settings.data.accounts}
        categories={settings.data.categories}
        emiPayments={tripData.data.emiPayments}
        onChanged={reloadAll}
      />

      {dialog && <TripDialog key={dialog} trip={null} onClose={() => setDialog(null)} onSaved={reloadAll} />}
    </div>
  )
}
