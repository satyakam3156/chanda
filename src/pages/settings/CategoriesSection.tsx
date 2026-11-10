import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EditDialog } from '@/components/EditDialog'
import { Checkbox, Field, ListRow, NativeSelect, SectionCard, SplitPicker } from '@/components/forms'
import { useAuth } from '@/context/AuthProvider'
import { supabase } from '@/lib/supabase'
import { describeSplit, EQUAL_SPLIT, normaliseSplit, validateSplit } from '@/lib/split'
import type { Split } from '@/lib/split'
import { formatINR } from '@/lib/utils'
import type { Category } from '@/types/database'

type Draft = {
  name: string
  kind: Category['kind']
  keywords: string
  split: Split
  hasLimit: boolean
  monthly_limit: string
  overSplit: Split
  is_active: boolean
}

function toDraft(c: Category | null): Draft {
  return {
    name: c?.name ?? '',
    kind: c?.kind ?? 'regular',
    keywords: c?.match_keywords.join(', ') ?? '',
    split: c ? { split_type: c.split_type, bearer_member_id: c.bearer_member_id, bearer_pct: c.bearer_pct } : EQUAL_SPLIT,
    hasLimit: c?.monthly_limit != null,
    monthly_limit: c?.monthly_limit?.toString() ?? '',
    overSplit:
      c?.over_split_type != null
        ? { split_type: c.over_split_type, bearer_member_id: c.over_bearer_member_id, bearer_pct: c.over_bearer_pct }
        : EQUAL_SPLIT,
    is_active: c?.is_active ?? true,
  }
}

const KIND_LABEL: Record<Category['kind'], string> = {
  regular: 'Regular',
  travel: 'Travel (linked to trips)',
  emi: 'EMI (linked to EMI plans)',
}

export function CategoriesSection({ categories, onChanged }: { categories: Category[]; onChanged: () => void }) {
  const { members } = useAuth()
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>(() => toDraft(null))

  function open(c: Category | 'new') {
    setDraft(toDraft(c === 'new' ? null : c))
    setEditing(c)
  }
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))

  async function save(): Promise<string | null> {
    if (!draft.name.trim()) return 'Name is required.'
    const splitErr = validateSplit(draft.split)
    if (splitErr) return splitErr
    let limit: number | null = null
    if (draft.hasLimit) {
      limit = Number(draft.monthly_limit)
      if (!(limit > 0)) return 'Monthly limit must be more than 0.'
      const overErr = validateSplit(draft.overSplit)
      if (overErr) return `Above the limit: ${overErr}`
    }
    const split = normaliseSplit(draft.split)
    const over = draft.hasLimit ? normaliseSplit(draft.overSplit) : null
    const row = {
      name: draft.name.trim(),
      kind: draft.kind,
      match_keywords: draft.keywords
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean),
      ...split,
      monthly_limit: limit,
      over_split_type: over?.split_type ?? null,
      over_bearer_member_id: over?.bearer_member_id ?? null,
      over_bearer_pct: over?.bearer_pct ?? null,
      is_active: draft.is_active,
    }
    const { error } =
      editing === 'new'
        ? await supabase.from('categories').insert({ ...row, sort_order: (categories.at(-1)?.sort_order ?? 0) + 10 })
        : await supabase.from('categories').update(row).eq('id', (editing as Category).id)
    if (!error) onChanged()
    if (error?.code === '23505') return 'A category with this name already exists.'
    return error?.message ?? null
  }

  async function remove(): Promise<string | null> {
    const { error } = await supabase.from('categories').delete().eq('id', (editing as Category).id)
    if (!error) onChanged()
    if (error?.code === '23503') return 'Transactions use this, so it can’t be deleted. Untick Active instead.'
    return error?.message ?? null
  }

  return (
    <SectionCard
      title="Categories"
      description="Each category has a default split. A monthly limit changes the split only for spending above it."
      action={
        <Button size="sm" variant="outline" onClick={() => open('new')}>
          <Plus /> Add
        </Button>
      }
    >
      <div className="space-y-2">
        {categories.map((c) => {
          const base = describeSplit(c, members)
          const limit =
            c.monthly_limit != null && c.over_split_type
              ? ` · up to ${formatINR(c.monthly_limit)}/month, then ${describeSplit(
                  { split_type: c.over_split_type, bearer_member_id: c.over_bearer_member_id, bearer_pct: c.over_bearer_pct },
                  members,
                )}`
              : ''
          return (
            <ListRow
              key={c.id}
              title={c.name}
              subtitle={base + limit}
              badge={!c.is_active && <Badge variant="secondary">Inactive</Badge>}
              onClick={() => open(c)}
            />
          )
        })}
      </div>

      <EditDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === 'new' ? 'Add category' : `Edit ${draft.name || 'category'}`}
        onSave={save}
        onDelete={editing !== 'new' ? remove : undefined}
      >
        <Field label="Name" htmlFor="cat-name">
          <Input id="cat-name" value={draft.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Type" htmlFor="cat-kind">
          <NativeSelect id="cat-kind" value={draft.kind} onChange={(e) => set('kind', e.target.value as Category['kind'])}>
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label="Merchant keywords"
          htmlFor="cat-kw"
          hint="Comma-separated. A transaction whose merchant contains one of these gets this category suggested."
        >
          <Input id="cat-kw" placeholder="swiggy, blinkit, zepto" value={draft.keywords} onChange={(e) => set('keywords', e.target.value)} />
        </Field>
        <Field label={draft.hasLimit ? 'Who bears it (up to the limit)' : 'Who bears it'} htmlFor="cat-split">
          <SplitPicker idPrefix="cat-split" value={draft.split} onChange={(s) => set('split', s)} members={members} />
        </Field>

        <div className="space-y-3 rounded-md border border-border p-3">
          <Checkbox checked={draft.hasLimit} onChange={(v) => set('hasLimit', v)} label="Monthly limit" />
          {draft.hasLimit && (
            <>
              <Field label="Limit per calendar month (₹)" htmlFor="cat-limit" hint="Total of all transactions in this category for the month.">
                <Input
                  id="cat-limit"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  value={draft.monthly_limit}
                  onChange={(e) => set('monthly_limit', e.target.value)}
                />
              </Field>
              <Field label="Above the limit, who bears it" htmlFor="cat-over">
                <SplitPicker idPrefix="cat-over" value={draft.overSplit} onChange={(s) => set('overSplit', s)} members={members} allowPayer={false} />
              </Field>
            </>
          )}
        </div>
        <Checkbox checked={draft.is_active} onChange={(v) => set('is_active', v)} label="Active" />
      </EditDialog>
    </SectionCard>
  )
}
