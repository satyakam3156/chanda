import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ErrorText, SectionCard } from '@/components/forms'
import { useAuth } from '@/context/AuthProvider'
import { supabase } from '@/lib/supabase'
import type { Member } from '@/types/database'

export function PeopleSection() {
  const { members, member: me } = useAuth()
  return (
    <SectionCard
      title="The two of you"
      description="Names shown across Chanda, and how each of you appears in bank alerts (so UPI transfers between you are offered as settle-ups)."
    >
      <div className="space-y-3">
        {members.map((m) => (
          <PersonRow key={m.id} member={m} isMe={m.id === me?.id} />
        ))}
      </div>
    </SectionCard>
  )
}

function PersonRow({ member, isMe }: { member: Member; isMe: boolean }) {
  const { reloadMembers } = useAuth()
  const [name, setName] = useState(member.display_name)
  const [bankNames, setBankNames] = useState((member.bank_names ?? []).join(', '))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const parsedBankNames = bankNames.split(',').map((n) => n.trim()).filter(Boolean)
  const dirty = name.trim() !== member.display_name || parsedBankNames.join('|') !== (member.bank_names ?? []).join('|')

  async function save() {
    if (!name.trim()) return setError('Name can’t be empty.')
    setBusy(true)
    const { error } = await supabase.from('members').update({ display_name: name.trim(), bank_names: parsedBankNames }).eq('id', member.id)
    setBusy(false)
    setError(error?.message ?? null)
    if (!error) reloadMembers()
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Input aria-label={`Name for ${member.email}`} value={name} onChange={(e) => setName(e.target.value)} />
        <Button variant="outline" disabled={!dirty || busy} onClick={save}>
          Save
        </Button>
      </div>
      <Input
        aria-label={`How ${member.display_name} appears in bank alerts`}
        placeholder="In bank alerts as, e.g. NIVEDITA GAWANDE"
        value={bankNames}
        onChange={(e) => setBankNames(e.target.value)}
      />
      <p className="truncate text-xs text-muted-foreground">
        {member.email}
        {isMe && ' · you'}
      </p>
      <ErrorText>{error}</ErrorText>
    </div>
  )
}
