import type { ReactNode, SelectHTMLAttributes } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { Split } from '@/lib/split'
import type { Member, SplitType } from '@/types/database'

export function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Native select: the phone's own picker is easier to use than a custom dropdown. */
export function NativeSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 md:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4 accent-current" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="text-sm text-destructive">{children}</p>
}

export function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/** One tappable row in a settings list. */
export function ListRow({ title, subtitle, badge, onClick }: { title: string; subtitle?: string; badge?: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5 text-left transition-colors hover:bg-accent/50"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{title}</span>
        {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
      </span>
      {badge}
    </button>
  )
}

/**
 * Picks who bears a cost. The select value packs type and member together
 * ("member:<id>") so the common choices are one tap.
 */
export function SplitPicker({
  value,
  onChange,
  members,
  allowPayer = true,
  idPrefix,
}: {
  value: Split
  onChange: (s: Split) => void
  members: Member[]
  allowPayer?: boolean
  idPrefix: string
}) {
  const selectValue = value.split_type === 'member' ? `member:${value.bearer_member_id}` : value.split_type

  function pick(v: string) {
    if (v.startsWith('member:')) {
      onChange({ split_type: 'member', bearer_member_id: v.slice(7), bearer_pct: null })
    } else if (v === 'custom') {
      onChange({ split_type: 'custom', bearer_member_id: value.bearer_member_id ?? members[0]?.id ?? null, bearer_pct: value.bearer_pct ?? 50 })
    } else {
      onChange({ split_type: v as SplitType, bearer_member_id: null, bearer_pct: null })
    }
  }

  return (
    <div className="space-y-2">
      <NativeSelect id={idPrefix} value={selectValue} onChange={(e) => pick(e.target.value)}>
        <option value="equal">50/50</option>
        {members.map((m) => (
          <option key={m.id} value={`member:${m.id}`}>
            Only {m.display_name}
          </option>
        ))}
        {allowPayer && <option value="payer">Whoever paid</option>}
        <option value="custom">Custom %</option>
      </NativeSelect>
      {value.split_type === 'custom' && (
        <div className="flex items-center gap-2 text-sm">
          <NativeSelect
            aria-label="Person"
            className="w-auto flex-1"
            value={value.bearer_member_id ?? ''}
            onChange={(e) => onChange({ ...value, bearer_member_id: e.target.value })}
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </NativeSelect>
          <Input
            aria-label="Percentage"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            className="w-20"
            value={value.bearer_pct ?? ''}
            onChange={(e) => onChange({ ...value, bearer_pct: e.target.value === '' ? null : Number(e.target.value) })}
          />
          <span className="shrink-0 text-muted-foreground">%</span>
        </div>
      )}
      {value.split_type === 'custom' && (
        <p className="text-xs text-muted-foreground">
          {members.find((m) => m.id !== value.bearer_member_id)?.display_name} bears the rest (
          {100 - Number(value.bearer_pct ?? 0)}%).
        </p>
      )}
    </div>
  )
}
