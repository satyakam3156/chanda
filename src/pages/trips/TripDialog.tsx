import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { EditDialog } from '@/components/EditDialog'
import { Field, NativeSelect, SplitPicker } from '@/components/forms'
import { useAuth } from '@/context/AuthProvider'
import { todayISO } from '@/lib/month'
import { EQUAL_SPLIT, normaliseSplit, validateSplit } from '@/lib/split'
import type { Split } from '@/lib/split'
import { supabase } from '@/lib/supabase'
import type { Trip } from '@/types/database'

export function TripDialog({ trip, onClose, onSaved }: { trip: Trip | null; onClose: () => void; onSaved: (id?: string) => void }) {
  const { members } = useAuth()
  const [name, setName] = useState(trip?.name ?? '')
  const [start, setStart] = useState(trip?.start_date ?? todayISO())
  const [end, setEnd] = useState(trip?.end_date ?? '')
  const [type, setType] = useState<Trip['trip_type']>(trip?.trip_type ?? 'couple')
  const [headcount, setHeadcount] = useState(trip && trip.trip_type === 'group' ? String(trip.headcount) : '4')
  const [split, setSplit] = useState<Split>(
    trip ? { split_type: trip.split_type, bearer_member_id: trip.bearer_member_id, bearer_pct: trip.bearer_pct } : EQUAL_SPLIT,
  )
  const [notes, setNotes] = useState(trip?.notes ?? '')

  async function save(): Promise<string | null> {
    if (!name.trim()) return 'Give the trip a name, e.g. “Goa, Dec 2026”.'
    if (!start) return 'Pick the start date.'
    if (end && end < start) return 'End date is before the start date.'
    const count = type === 'couple' ? 2 : Number(headcount)
    if (type === 'group' && !(Number.isInteger(count) && count > 2)) return 'A group trip needs 3 or more people (including you both).'
    const err = validateSplit(split)
    if (err) return err
    const row = {
      name: name.trim(),
      start_date: start,
      end_date: end || null,
      trip_type: type,
      headcount: count,
      ...normaliseSplit(split),
      notes: notes.trim() || null,
    }
    if (trip) {
      const { error } = await supabase.from('trips').update(row).eq('id', trip.id)
      if (!error) onSaved()
      return error?.message ?? null
    }
    const { data, error } = await supabase.from('trips').insert(row).select('id').single()
    if (!error) onSaved(data?.id)
    return error?.message ?? null
  }

  async function remove(): Promise<string | null> {
    const { error } = await supabase.from('trips').delete().eq('id', trip!.id)
    if (error?.code === '23503') return 'Transactions or EMIs are linked to this trip. Unlink them first.'
    if (!error) onSaved()
    return error?.message ?? null
  }

  return (
    <EditDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={trip ? `Edit ${trip.name}` : 'New trip'}
      onSave={save}
      onDelete={trip ? remove : undefined}
    >
      <Field label="Name" htmlFor="trip-name">
        <Input id="trip-name" placeholder="Goa, Dec 2026" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start" htmlFor="trip-start">
          <Input id="trip-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="End" htmlFor="trip-end">
          <Input id="trip-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Who's going" htmlFor="trip-type">
          <NativeSelect id="trip-type" value={type} onChange={(e) => setType(e.target.value as Trip['trip_type'])}>
            <option value="couple">Just the two of us</option>
            <option value="group">A group</option>
          </NativeSelect>
        </Field>
        {type === 'group' && (
          <Field label="People in total" htmlFor="trip-count" hint="Including you both">
            <Input id="trip-count" type="number" inputMode="numeric" min={3} value={headcount} onChange={(e) => setHeadcount(e.target.value)} />
          </Field>
        )}
      </div>
      <Field label="How the two of you split it" htmlFor="trip-split">
        <SplitPicker idPrefix="trip-split" value={split} onChange={setSplit} members={members} />
      </Field>
      <Field label="Notes" htmlFor="trip-notes">
        <Input id="trip-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </EditDialog>
  )
}
