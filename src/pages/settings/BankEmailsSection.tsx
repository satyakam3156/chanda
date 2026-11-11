import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ErrorText, SectionCard } from '@/components/forms'
import { supabase } from '@/lib/supabase'

function parseKeywords(text: string): string[] {
  return text
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)
}

/** Payees whose bank emails are imported as "ignored": kept, but never in the Inbox or the totals. */
export function BankEmailsSection() {
  const [saved, setSaved] = useState<string[] | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('ingest_rules')
      .select('ignore_keywords')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return setError(`${error.message}. Run supabase/migrations/0008_ingest_fixes.sql in Supabase.`)
        const words = data?.ignore_keywords ?? []
        setSaved(words)
        setText(words.join(', '))
      })
  }, [])

  const parsed = parseKeywords(text)
  const dirty = saved !== null && parsed.join('|') !== saved.join('|')

  async function save() {
    setBusy(true)
    const { error } = await supabase.from('ingest_rules').upsert({ id: 1, ignore_keywords: parsed })
    setBusy(false)
    setError(error?.message ?? null)
    if (!error) {
      setSaved(parsed)
      setText(parsed.join(', '))
    }
  }

  return (
    <SectionCard
      title="Bank emails: always ignore"
      description="Payees or merchants never to count. Their alerts are still imported, but as Ignored (see Transactions → Show ignored), so they don't fill the Inbox. Applies to new emails."
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Input
            aria-label="Always ignore these payees"
            placeholder="e.g. liquor collective, some shop"
            value={text}
            disabled={saved === null}
            onChange={(e) => setText(e.target.value)}
          />
          <Button variant="outline" disabled={!dirty || busy} onClick={save}>
            Save
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Separate with commas. A payee is ignored if its name contains any of these.</p>
        <ErrorText>{error}</ErrorText>
      </div>
    </SectionCard>
  )
}
