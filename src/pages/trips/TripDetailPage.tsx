import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SectionCard } from '@/components/forms'
import { TransactionDialog } from '@/components/TransactionDialog'
import { TransactionRow } from '@/components/TransactionRow'
import { useAuth } from '@/context/AuthProvider'
import { useSettings } from '@/data/useSettings'
import { useTripData } from '@/data/useTripData'
import { describeSplit } from '@/lib/split'
import { TRIP_PART_SHORT, tripDates, tripKindLabel, tripSplit } from '@/lib/trips'
import { summariseTrip } from '@/lib/tripSummary'
import { formatINR } from '@/lib/utils'
import type { Transaction } from '@/types/database'
import { EmiSection } from './EmiSection'
import { TripDialog } from './TripDialog'

export function TripDetailPage() {
  const { id } = useParams()
  const { members } = useAuth()
  const settings = useSettings()
  const tripData = useTripData()
  const [editTrip, setEditTrip] = useState<number | null>(null)
  const [txDialog, setTxDialog] = useState<{ t: Transaction | null; n: number } | null>(null)

  const loadError = settings.error ?? tripData.error
  if (loadError) return <p className="text-sm text-destructive">Couldn’t load the trip: {loadError}</p>
  if (!settings.data || !tripData.data) return <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>

  const { trips, emiPlans, accounts, categories } = settings.data
  const trip = trips.find((t) => t.id === id)
  if (!trip) {
    return (
      <p className="text-sm">
        Trip not found. <Link to="/trips" className="underline">Back to trips</Link>
      </p>
    )
  }

  const reloadAll = () => {
    settings.reload()
    tripData.reload()
  }
  const plans = emiPlans.filter((p) => p.trip_id === trip.id)
  const txs = tripData.data.transactions.filter((t) => t.trip_id === trip.id)
  const s = summariseTrip({ trip, transactions: tripData.data.transactions, plans: emiPlans, emiPayments: tripData.data.emiPayments, members })
  const maxPart = Math.max(...s.byPart.map((p) => p.amount), 1)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/trips">
            <ChevronLeft /> Trips
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => setEditTrip(Date.now())}>
          <Pencil /> Edit trip
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div>
            <h2 className="text-xl font-semibold">{trip.name}</h2>
            <p className="text-xs text-muted-foreground">
              {tripDates(trip.start_date, trip.end_date)} · {tripKindLabel(trip)} · {describeSplit(tripSplit(trip), members)}
            </p>
          </div>
          <div>
            <p className="text-3xl font-bold tabular-nums">{formatINR(s.counted)}</p>
            <p className="text-xs text-muted-foreground">
              Cost to the two of you so far
              {trip.trip_type === 'group' && s.grossPaid !== s.counted && ` · you paid ${formatINR(s.grossPaid)} in total, the rest is the group's`}
              {s.emiRemaining > 0 && ` · ${formatINR(s.emiRemaining)} still to come in EMIs`}
            </p>
          </div>
          <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 border-t border-border pt-3 text-sm tabular-nums">
            <span />
            <span className="text-xs text-muted-foreground">Paid</span>
            <span className="text-xs text-muted-foreground">Share</span>
            {members.map((m) => (
              <Row key={m.id} name={m.display_name} paid={s.paid[m.id]} share={s.share[m.id]} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Trip expenses are counted in the month they happened, so they’re already in each month’s balance.
          </p>
        </CardContent>
      </Card>

      {s.byPart.length > 0 && (
        <SectionCard title="Where the money went">
          <div className="space-y-3">
            {s.byPart.map((p) => (
              <div key={p.part} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{p.part === 'unspecified' ? 'Not specified' : TRIP_PART_SHORT[p.part]}</span>
                  <span className="tabular-nums">{formatINR(p.amount)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, (p.amount / maxPart) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard
        title="Expenses"
        description={`${txs.length} transaction${txs.length === 1 ? '' : 's'}, all months`}
        action={
          <Button size="sm" variant="outline" onClick={() => setTxDialog({ t: null, n: Date.now() })}>
            <Plus /> Add
          </Button>
        }
      >
        {txs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expenses on this trip yet.</p>
        ) : (
          <div className="-mx-3 divide-y divide-border">
            {txs.map((t) => (
              <TransactionRow key={t.id} t={t} accounts={accounts} categories={categories} trips={trips} onClick={() => setTxDialog({ t, n: Date.now() })} />
            ))}
          </div>
        )}
      </SectionCard>

      <EmiSection
        title="EMIs for this trip"
        plans={plans}
        trips={trips}
        accounts={accounts}
        categories={categories}
        emiPayments={tripData.data.emiPayments}
        onChanged={reloadAll}
      />

      {editTrip && <TripDialog key={editTrip} trip={trip} onClose={() => setEditTrip(null)} onSaved={reloadAll} />}
      {txDialog && (
        <TransactionDialog
          key={txDialog.n}
          open
          onOpenChange={(o) => !o && setTxDialog(null)}
          transaction={txDialog.t}
          defaultTripId={trip.id}
          accounts={accounts}
          categories={categories}
          trips={trips}
          defaultDate={trip.start_date}
          onSaved={reloadAll}
        />
      )}
    </div>
  )
}

function Row({ name, paid, share }: { name: string; paid: number; share: number }) {
  return (
    <>
      <span className="truncate text-muted-foreground">{name}</span>
      <span>{formatINR(paid)}</span>
      <span>{formatINR(share)}</span>
    </>
  )
}
