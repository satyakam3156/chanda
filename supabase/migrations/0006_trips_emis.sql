-- Step 6: trips and EMIs.
-- Run once in Supabase → SQL Editor, after 0005.

-- Trips ------------------------------------------------------------------------

create table public.trips (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  start_date        date not null,
  end_date          date,
  -- 'couple' = just the two of you. 'group' = with others; headcount includes you both.
  trip_type         text not null default 'couple' check (trip_type in ('couple', 'group')),
  headcount         smallint not null default 2,
  -- How the two of you split your part of the trip.
  split_type        text not null default 'equal' check (split_type in ('equal', 'payer', 'member', 'custom')),
  bearer_member_id  uuid references public.members (id),
  bearer_pct        numeric(5, 2) check (bearer_pct between 0 and 100),
  notes             text,
  created_at        timestamptz not null default now(),
  check ((trip_type = 'couple' and headcount = 2) or (trip_type = 'group' and headcount > 2)),
  check (end_date is null or end_date >= start_date),
  check ((split_type in ('member', 'custom')) = (bearer_member_id is not null)),
  check ((split_type = 'custom') = (bearer_pct is not null))
);

-- What a trip expense was for, for the trip breakdown.
-- travel = flights/trains/buses to get there; local = cabs, rentals, fuel there.
alter table public.transactions
  add column trip_id uuid references public.trips (id),
  add column trip_part text check (trip_part in ('travel', 'stay', 'food', 'local', 'activities', 'shopping', 'other')),
  -- Group trips: true when this bill covered the whole group (friends pay you back outside Chanda).
  -- Then only 2/headcount of it counts between the two of you.
  add column for_whole_group boolean not null default false,
  add check (trip_id is not null or (trip_part is null and not for_whole_group));

create index transactions_trip_idx on public.transactions (trip_id) where trip_id is not null;

-- EMIs -------------------------------------------------------------------------

create table public.emi_plans (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  category_id            uuid not null references public.categories (id),
  trip_id                uuid references public.trips (id),
  trip_part              text check (trip_part in ('travel', 'stay', 'food', 'local', 'activities', 'shopping', 'other')),
  for_whole_group        boolean not null default false,
  account_id             uuid references public.accounts (id),
  -- The original big charge. It's set to "ignored" so it isn't counted twice.
  source_transaction_id  uuid references public.transactions (id) on delete set null,
  instalment_amount      numeric(12, 2) not null check (instalment_amount > 0),
  instalments            smallint not null check (instalments between 1 and 120),
  first_month            date not null check (extract(day from first_month) = 1),
  paid_by_member_id      uuid not null references public.members (id),
  -- Null = follow the trip's split (if linked to a trip), else the category's.
  split_type             text check (split_type in ('equal', 'payer', 'member', 'custom')),
  bearer_member_id       uuid references public.members (id),
  bearer_pct             numeric(5, 2) check (bearer_pct between 0 and 100),
  notes                  text,
  created_at             timestamptz not null default now(),
  check ((coalesce(split_type, '') in ('member', 'custom')) = (bearer_member_id is not null)),
  check ((coalesce(split_type, '') = 'custom') = (bearer_pct is not null)),
  check (trip_id is not null or (trip_part is null and not for_whole_group))
);

-- One row per instalment ticked as paid. Only ticked instalments count.
create table public.emi_payments (
  id                 uuid primary key default gen_random_uuid(),
  plan_id            uuid not null references public.emi_plans (id) on delete cascade,
  seq                smallint not null check (seq >= 1),
  month              date not null check (extract(day from month) = 1),
  amount             numeric(12, 2) not null check (amount > 0),
  paid_on            date,
  created_by         uuid references public.members (id),
  created_at         timestamptz not null default now(),
  unique (plan_id, seq)
);

create index emi_payments_month_idx on public.emi_payments (month);

create trigger emi_payments_stamp
  before insert on public.emi_payments
  for each row execute function public.stamp_created_by();

alter table public.trips        enable row level security;
alter table public.emi_plans    enable row level security;
alter table public.emi_payments enable row level security;

create policy "Members manage trips"        on public.trips        for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "Members manage EMI plans"    on public.emi_plans    for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "Members manage EMI payments" on public.emi_payments for all to authenticated using (public.is_member()) with check (public.is_member());
