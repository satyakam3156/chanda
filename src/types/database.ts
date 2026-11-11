// Hand-written to match supabase/migrations. Once the Supabase CLI is set up, this can be
// regenerated with: npx supabase gen types typescript --project-id <project-id>

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

/** Row → Insert/Update shapes. `Opt` lists columns the database fills in by default. */
type TableDef<R, Opt extends keyof R> = {
  Row: R
  Insert: Omit<R, Opt> & Partial<Pick<R, Opt>>
  Update: Partial<R>
  Relationships: []
}

export type SplitType = 'equal' | 'payer' | 'member' | 'custom'

export type TripPart = 'travel' | 'stay' | 'food' | 'local' | 'activities' | 'shopping' | 'other'

export type Member = {
  id: string
  email: string
  display_name: string
  user_id: string | null
  bank_names: string[]
  created_at: string
}

export type Account = {
  id: string
  name: string
  bank: string
  kind: 'credit_card' | 'bank_account'
  last4: string | null
  owner_member_id: string
  statement_day: number | null
  due_day: number | null
  purpose: string | null
  is_active: boolean
  default_category_id: string | null
  auto_confirm: boolean
  import_category_ids: string[]
  created_at: string
}

export type Category = {
  id: string
  name: string
  kind: 'regular' | 'travel' | 'emi'
  match_keywords: string[]
  split_type: SplitType
  bearer_member_id: string | null
  bearer_pct: number | null
  monthly_limit: number | null
  over_split_type: SplitType | null
  over_bearer_member_id: string | null
  over_bearer_pct: number | null
  is_active: boolean
  sort_order: number
  created_at: string
}

export type FixedCost = {
  id: string
  name: string
  amount: number
  payer_member_id: string
  split_type: SplitType
  bearer_member_id: string | null
  bearer_pct: number | null
  every_months: number
  start_month: string
  is_active: boolean
  notes: string | null
  created_at: string
}

export type Transaction = {
  id: string
  occurred_on: string
  /** 'HH:MM:SS', India time. From the bank alert, or entered by hand. */
  occurred_time: string | null
  amount: number
  direction: 'debit' | 'credit'
  description: string
  account_id: string | null
  paid_by_member_id: string
  category_id: string | null
  split_type: SplitType | null
  bearer_member_id: string | null
  bearer_pct: number | null
  status: 'needs_review' | 'confirmed' | 'ignored'
  source: 'manual' | 'email'
  source_ref: string | null
  raw: Json | null
  notes: string | null
  trip_id: string | null
  trip_part: TripPart | null
  for_whole_group: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type FixedCostPayment = {
  id: string
  fixed_cost_id: string
  month: string
  amount: number
  paid_by_member_id: string
  paid_on: string | null
  split_type: SplitType
  bearer_member_id: string | null
  bearer_pct: number | null
  created_by: string | null
  created_at: string
}

export type Settlement = {
  id: string
  month: string
  from_member_id: string
  to_member_id: string
  amount: number
  paid_on: string
  method: 'upi' | 'bank' | 'cash' | 'other'
  note: string | null
  transaction_id: string | null
  created_by: string | null
  created_at: string
}

export type MonthClose = {
  month: string
  own_from_member_id: string | null
  own_amount: number
  carry_in_from_member_id: string | null
  carry_in_amount: number
  settled_amount: number
  carry_out_from_member_id: string | null
  carry_out_amount: number
  closed_by: string | null
  closed_at: string
}

export type Trip = {
  id: string
  name: string
  start_date: string
  end_date: string | null
  trip_type: 'couple' | 'group'
  headcount: number
  split_type: SplitType
  bearer_member_id: string | null
  bearer_pct: number | null
  notes: string | null
  created_at: string
}

export type EmiPlan = {
  id: string
  name: string
  category_id: string
  trip_id: string | null
  trip_part: TripPart | null
  for_whole_group: boolean
  account_id: string | null
  source_transaction_id: string | null
  instalment_amount: number
  instalments: number
  first_month: string
  paid_by_member_id: string
  split_type: SplitType | null
  bearer_member_id: string | null
  bearer_pct: number | null
  notes: string | null
  created_at: string
}

export type EmiPayment = {
  id: string
  plan_id: string
  seq: number
  month: string
  amount: number
  paid_on: string | null
  created_by: string | null
  created_at: string
}

export type IngestMiss = {
  id: string
  source_ref: string
  sender: string | null
  subject: string | null
  received_on: string | null
  dismissed: boolean
  created_at: string
}

export type IngestRules = {
  id: number
  ignore_keywords: string[]
}

export type CardPayment = {
  id: string
  source_ref: string
  paid_on: string
  amount: number
  via: string
  from_account_id: string | null
  card_account_id: string | null
  paid_by_member_id: string | null
  created_at: string
}

export type Database = {
  public: {
    Tables: {
      members: TableDef<Member, 'id' | 'user_id' | 'bank_names' | 'created_at'>
      accounts: TableDef<
        Account,
        'id' | 'created_at' | 'is_active' | 'last4' | 'statement_day' | 'due_day' | 'purpose' | 'default_category_id' | 'auto_confirm' | 'import_category_ids'
      >
      ingest_misses: TableDef<IngestMiss, 'id' | 'sender' | 'subject' | 'received_on' | 'dismissed' | 'created_at'>
      ingest_rules: TableDef<IngestRules, 'id' | 'ignore_keywords'>
      card_payments: TableDef<CardPayment, 'id' | 'from_account_id' | 'card_account_id' | 'paid_by_member_id' | 'created_at'>
      categories: TableDef<
        Category,
        | 'id'
        | 'created_at'
        | 'kind'
        | 'match_keywords'
        | 'split_type'
        | 'bearer_member_id'
        | 'bearer_pct'
        | 'monthly_limit'
        | 'over_split_type'
        | 'over_bearer_member_id'
        | 'over_bearer_pct'
        | 'is_active'
        | 'sort_order'
      >
      fixed_costs: TableDef<
        FixedCost,
        'id' | 'created_at' | 'split_type' | 'bearer_member_id' | 'bearer_pct' | 'every_months' | 'is_active' | 'notes'
      >
      transactions: TableDef<
        Transaction,
        | 'id'
        | 'occurred_time'
        | 'direction'
        | 'account_id'
        | 'category_id'
        | 'split_type'
        | 'bearer_member_id'
        | 'bearer_pct'
        | 'status'
        | 'source'
        | 'source_ref'
        | 'raw'
        | 'notes'
        | 'trip_id'
        | 'trip_part'
        | 'for_whole_group'
        | 'created_by'
        | 'created_at'
        | 'updated_at'
      >
      fixed_cost_payments: TableDef<FixedCostPayment, 'id' | 'paid_on' | 'bearer_member_id' | 'bearer_pct' | 'created_by' | 'created_at'>
      trips: TableDef<Trip, 'id' | 'end_date' | 'trip_type' | 'headcount' | 'split_type' | 'bearer_member_id' | 'bearer_pct' | 'notes' | 'created_at'>
      emi_plans: TableDef<
        EmiPlan,
        | 'id'
        | 'trip_id'
        | 'trip_part'
        | 'for_whole_group'
        | 'account_id'
        | 'source_transaction_id'
        | 'split_type'
        | 'bearer_member_id'
        | 'bearer_pct'
        | 'notes'
        | 'created_at'
      >
      emi_payments: TableDef<EmiPayment, 'id' | 'paid_on' | 'created_by' | 'created_at'>
      settlements: TableDef<Settlement, 'id' | 'method' | 'note' | 'transaction_id' | 'created_by' | 'created_at'>
      month_closes: TableDef<
        MonthClose,
        | 'own_from_member_id'
        | 'own_amount'
        | 'carry_in_from_member_id'
        | 'carry_in_amount'
        | 'settled_amount'
        | 'carry_out_from_member_id'
        | 'carry_out_amount'
        | 'closed_by'
        | 'closed_at'
      >
    }
    Views: { [_ in never]: never }
    Functions: {
      is_member: { Args: Record<string, never>; Returns: boolean }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
