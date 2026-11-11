-- ⚠️  DELETES ALL DATA AND SETTINGS. Cannot be undone.
--
-- Back to a fresh install: the same state as running every migration on a new project.
-- Run in Supabase → SQL Editor. All or nothing: if any line fails, nothing is deleted.
--
-- Deleted:
--   everything clean-activity.sql deletes, plus cards and accounts, fixed costs,
--   your categories (limits, splits, keywords) and the "always ignore" payees.
--   Bank names under each person are cleared.
--
-- Restored, as on a fresh install:
--   the starting categories with their merchant keywords (all 50/50, no limit;
--   Personal = whoever paid), and the starting "always ignore" list.
--
-- Kept, so you can still sign in and the Gmail scripts still connect:
--   the two of you (members) and your Google sign-ins, the Gmail script's secret.
--
-- Afterwards: add your cards and accounts again in Settings before the Gmail scripts
-- next run. Alerts for cards that aren't in Settings are dropped, not stored.

begin;

-- Activity
delete from public.emi_payments;
delete from public.emi_plans;
delete from public.settlements;
delete from public.month_closes;
delete from public.fixed_cost_payments;
delete from public.card_payments;
delete from public.ingest_misses;
delete from public.transactions;
delete from public.trips;

-- Settings
delete from public.fixed_costs;
delete from public.accounts;
delete from public.categories;
update public.members set bank_names = '{}';
delete from public.ingest_rules;

-- Fresh-install defaults (from migrations 0002 and 0008)
insert into public.categories (name, kind, match_keywords, split_type, sort_order) values
  ('Food delivery',    'regular', '{swiggy,blinkit,zepto,blink commerce}',                                  'equal', 10),
  ('Travel',           'travel',  '{}',                                                                     'equal', 20),
  ('EMI',              'emi',     '{}',                                                                     'equal', 30),
  ('Home & utilities', 'regular', '{atria convergence,furlenco,livpure}',                                   'equal', 35),
  ('Subscriptions',    'regular', '{amazon india,apple media services,google play,jiohotstar,youtube}',     'equal', 36),
  ('Shared – other',   'regular', '{}',                                                                     'equal', 40),
  ('Personal',         'regular', '{}',                                                                     'payer', 50);

insert into public.ingest_rules (id, ignore_keywords) values (1, '{liquor collective}');

commit;

-- What's left.
select 'transactions' as "table", count(*) from public.transactions
union all select 'trips', count(*) from public.trips
union all select 'emi_plans', count(*) from public.emi_plans
union all select 'settlements', count(*) from public.settlements
union all select 'accounts', count(*) from public.accounts
union all select 'fixed_costs', count(*) from public.fixed_costs
union all select 'categories (defaults)', count(*) from public.categories
union all select '— kept: members', count(*) from public.members;
