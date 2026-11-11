-- ⚠️  DELETES DATA. Cannot be undone.
--
-- Clean everything you've recorded, keep your settings.
-- Run in Supabase → SQL Editor. All or nothing: if any line fails, nothing is deleted.
--
-- Deleted (activity):
--   transactions (incl. the Inbox), settle-ups, month closes, fixed-cost ticks,
--   trips, EMI plans and their instalments, card bill payments (CRED),
--   "couldn't be read" bank emails
--
-- Kept (settings):
--   the two of you (and your Google sign-ins), cards and accounts, categories,
--   fixed costs, "always ignore" payees, the Gmail script's secret
--
-- Afterwards the Gmail scripts carry on as before. Their next run re-imports the
-- last 3 days of bank emails into the Inbox; run `backfill` to bring back a month.

begin;

delete from public.emi_payments;
delete from public.emi_plans;
delete from public.settlements;
delete from public.month_closes;
delete from public.fixed_cost_payments;
delete from public.card_payments;
delete from public.ingest_misses;
delete from public.transactions;
delete from public.trips;

commit;

-- What's left: activity should be all 0, settings unchanged.
select 'transactions' as "table", count(*) from public.transactions
union all select 'settlements', count(*) from public.settlements
union all select 'month_closes', count(*) from public.month_closes
union all select 'fixed_cost_payments', count(*) from public.fixed_cost_payments
union all select 'trips', count(*) from public.trips
union all select 'emi_plans', count(*) from public.emi_plans
union all select 'card_payments', count(*) from public.card_payments
union all select 'ingest_misses', count(*) from public.ingest_misses
union all select '— kept: members', count(*) from public.members
union all select '— kept: accounts', count(*) from public.accounts
union all select '— kept: categories', count(*) from public.categories
union all select '— kept: fixed_costs', count(*) from public.fixed_costs;
