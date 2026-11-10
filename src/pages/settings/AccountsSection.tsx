import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EditDialog } from '@/components/EditDialog'
import { Checkbox, Field, ListRow, NativeSelect, SectionCard } from '@/components/forms'
import { useAuth } from '@/context/AuthProvider'
import { supabase } from '@/lib/supabase'
import type { Account } from '@/types/database'

type Draft = {
  name: string
  bank: string
  kind: Account['kind']
  last4: string
  owner_member_id: string
  statement_day: string
  due_day: string
  purpose: string
  is_active: boolean
}

function toDraft(a: Account | null, defaultOwner: string): Draft {
  return {
    name: a?.name ?? '',
    bank: a?.bank ?? '',
    kind: a?.kind ?? 'credit_card',
    last4: a?.last4 ?? '',
    owner_member_id: a?.owner_member_id ?? defaultOwner,
    statement_day: a?.statement_day?.toString() ?? '',
    due_day: a?.due_day?.toString() ?? '',
    purpose: a?.purpose ?? '',
    is_active: a?.is_active ?? true,
  }
}

function dayOrNull(v: string): number | null {
  return v.trim() === '' ? null : Number(v)
}

export function AccountsSection({ accounts, onChanged }: { accounts: Account[]; onChanged: () => void }) {
  const { members, member: me } = useAuth()
  const [editing, setEditing] = useState<Account | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>(() => toDraft(null, me?.id ?? ''))

  function open(a: Account | 'new') {
    setDraft(toDraft(a === 'new' ? null : a, me?.id ?? ''))
    setEditing(a)
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const isCard = draft.kind === 'credit_card'

  async function save(): Promise<string | null> {
    if (!draft.name.trim() || !draft.bank.trim()) return 'Name and bank are required.'
    if (draft.last4 && !/^\d{4}$/.test(draft.last4)) return 'Last 4 digits must be exactly 4 numbers.'
    for (const d of [draft.statement_day, draft.due_day]) {
      if (d && !(Number(d) >= 1 && Number(d) <= 31)) return 'Days must be between 1 and 31.'
    }
    const row = {
      name: draft.name.trim(),
      bank: draft.bank.trim(),
      kind: draft.kind,
      last4: draft.last4 || null,
      owner_member_id: draft.owner_member_id,
      statement_day: isCard ? dayOrNull(draft.statement_day) : null,
      due_day: isCard ? dayOrNull(draft.due_day) : null,
      purpose: draft.purpose.trim() || null,
      is_active: draft.is_active,
    }
    const { error } =
      editing === 'new'
        ? await supabase.from('accounts').insert(row)
        : await supabase.from('accounts').update(row).eq('id', (editing as Account).id)
    if (!error) onChanged()
    return error?.message ?? null
  }

  async function remove(): Promise<string | null> {
    const { error } = await supabase.from('accounts').delete().eq('id', (editing as Account).id)
    if (!error) onChanged()
    if (error?.code === '23503') return 'Transactions use this, so it can’t be deleted. Untick Active instead.'
    return error?.message ?? null
  }

  return (
    <SectionCard
      title="Cards and accounts"
      description="The last 4 digits are how bank alert emails get matched to a card."
      action={
        <Button size="sm" variant="outline" onClick={() => open('new')}>
          <Plus /> Add
        </Button>
      }
    >
      <div className="space-y-2">
        {accounts.length === 0 && <p className="text-sm text-muted-foreground">No cards or accounts yet.</p>}
        {accounts.map((a) => (
          <ListRow
            key={a.id}
            title={`${a.name}${a.last4 ? ` ··${a.last4}` : ''}`}
            subtitle={[
              a.bank,
              a.kind === 'credit_card' ? 'Credit card' : 'Bank account',
              a.statement_day ? `statement on the ${ordinal(a.statement_day)}` : null,
              a.purpose,
            ]
              .filter(Boolean)
              .join(' · ')}
            badge={!a.is_active && <Badge variant="secondary">Inactive</Badge>}
            onClick={() => open(a)}
          />
        ))}
      </div>

      <EditDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === 'new' ? 'Add card or account' : 'Edit card or account'}
        onSave={save}
        onDelete={editing !== 'new' ? remove : undefined}
      >
        <Field label="Type" htmlFor="acc-kind">
          <NativeSelect id="acc-kind" value={draft.kind} onChange={(e) => set('kind', e.target.value as Account['kind'])}>
            <option value="credit_card">Credit card</option>
            <option value="bank_account">Bank account</option>
          </NativeSelect>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" htmlFor="acc-name">
            <Input id="acc-name" placeholder="e.g. Food card" value={draft.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Bank" htmlFor="acc-bank">
            <Input id="acc-bank" placeholder="Axis, ICICI, HDFC…" value={draft.bank} onChange={(e) => set('bank', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Last 4 digits" htmlFor="acc-last4">
            <Input
              id="acc-last4"
              inputMode="numeric"
              maxLength={4}
              placeholder="1234"
              value={draft.last4}
              onChange={(e) => set('last4', e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <Field label="In whose name" htmlFor="acc-owner">
            <NativeSelect id="acc-owner" value={draft.owner_member_id} onChange={(e) => set('owner_member_id', e.target.value)}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        {isCard && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Statement date" htmlFor="acc-stmt" hint="Day the bill is generated (cycle ends that day)">
              <Input
                id="acc-stmt"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                placeholder="17"
                value={draft.statement_day}
                onChange={(e) => set('statement_day', e.target.value)}
              />
            </Field>
            <Field label="Due date" htmlFor="acc-due" hint="Day the bill must be paid">
              <Input
                id="acc-due"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                value={draft.due_day}
                onChange={(e) => set('due_day', e.target.value)}
              />
            </Field>
          </div>
        )}
        <Field label="Used for" htmlFor="acc-purpose" hint="A note for yourselves, e.g. “Swiggy, Blinkit, Zepto” or “EMIs”">
          <Input id="acc-purpose" value={draft.purpose} onChange={(e) => set('purpose', e.target.value)} />
        </Field>
        <Checkbox checked={draft.is_active} onChange={(v) => set('is_active', v)} label="Active" />
      </EditDialog>
    </SectionCard>
  )
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
