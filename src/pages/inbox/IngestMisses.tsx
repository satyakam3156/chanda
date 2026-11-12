import { useEffect, useState } from 'react'
import { MailQuestion, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SectionCard } from '@/components/forms'
import { supabase } from '@/lib/supabase'
import type { IngestMiss } from '@/types/database'

/**
 * Bank emails the Gmail script found but couldn't read (a new format).
 * Only sender and subject are kept. Add the transaction by hand if needed, then dismiss.
 */
export function IngestMisses() {
  const [rows, setRows] = useState<IngestMiss[]>([])
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('ingest_misses')
      .select('*')
      .eq('dismissed', false)
      .order('received_on', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!cancelled) setRows(data ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [version])

  if (rows.length === 0) return null

  async function dismiss(id: string) {
    await supabase.from('ingest_misses').update({ dismissed: true }).eq('id', id)
    setVersion((v) => v + 1)
  }

  return (
    <SectionCard
      title={`${rows.length} bank email${rows.length === 1 ? '' : 's'} couldn’t be read`}
      description="A format Chanda doesn't know yet (e.g. a refund). Add it by hand if it matters, then dismiss. Send a masked copy to add the format."
    >
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
            <MailQuestion className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{r.subject ?? '(no subject)'}</span>
              <span className="line-clamp-2 text-xs text-muted-foreground">
                {[r.sender, r.received_on].filter(Boolean).join(' · ')}
              </span>
            </span>
            <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={() => dismiss(r.id)}>
              <X />
            </Button>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
