import { useSettings } from '@/data/useSettings'
import { AccountsSection } from './AccountsSection'
import { BankEmailsSection } from './BankEmailsSection'
import { CategoriesSection } from './CategoriesSection'
import { FixedCostsSection } from './FixedCostsSection'
import { PeopleSection } from './PeopleSection'

export function SettingsPage() {
  const { data, error, reload } = useSettings()

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Couldn’t load settings: {error}. If this mentions a missing table or column, run the newest file in{' '}
        <code>supabase/migrations/</code> you haven’t run yet, in Supabase.
      </p>
    )
  }
  if (!data) return <p className="py-16 text-center text-sm text-muted-foreground">Loading settings…</p>

  return (
    <div className="space-y-5">
      <PeopleSection />
      <AccountsSection accounts={data.accounts} categories={data.categories} onChanged={reload} />
      <CategoriesSection categories={data.categories} onChanged={reload} />
      <FixedCostsSection fixedCosts={data.fixedCosts} onChanged={reload} />
      <BankEmailsSection />
    </div>
  )
}
