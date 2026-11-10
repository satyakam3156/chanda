-- Step 2: settings — accounts, categories (with optional monthly limit), fixed costs.
-- Run once in Supabase → SQL Editor, after 0001.
--
-- How a split is stored (same four columns wherever a split appears):
--   split_type        'equal'  → 50/50
--                     'payer'  → whoever paid bears all of it (personal spend)
--                     'member' → bearer_member_id bears all of it, whoever paid
--                     'custom' → bearer_member_id bears bearer_pct %, the other the rest
--   bearer_member_id  needed for 'member' and 'custom'
--   bearer_pct        needed for 'custom' (0–100)

-- Members may rename themselves and each other, but never change emails or links.
revoke update on public.members from authenticated;
grant update (display_name) on public.members to authenticated;

create policy "Members can rename members"
  on public.members for update
  to authenticated
  using (public.is_member())
  with check (public.is_member());

-- Cards and bank accounts ------------------------------------------------------

create table public.accounts (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  bank             text not null,
  kind             text not null check (kind in ('credit_card', 'bank_account')),
  last4            text check (last4 ~ '^[0-9]{4}$'),
  owner_member_id  uuid not null references public.members (id),
  -- Credit cards only. Day of month the statement is generated (the cycle ends that day).
  statement_day    smallint check (statement_day between 1 and 31),
  -- Credit cards only. Day of month the bill is due.
  due_day          smallint check (due_day between 1 and 31),
  purpose          text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  check (kind = 'credit_card' or (statement_day is null and due_day is null))
);

-- Categories ---------------------------------------------------------------------

create table public.categories (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null unique,
  -- 'travel' links to trips (step 6), 'emi' to EMI plans (step 6). Everything else is 'regular'.
  kind                   text not null default 'regular' check (kind in ('regular', 'travel', 'emi')),
  -- Merchant words that suggest this category for a new transaction (step 3 and 7).
  match_keywords         text[] not null default '{}',

  split_type             text not null default 'equal' check (split_type in ('equal', 'payer', 'member', 'custom')),
  bearer_member_id       uuid references public.members (id),
  bearer_pct             numeric(5, 2) check (bearer_pct between 0 and 100),

  -- Optional monthly limit. Spend up to the limit uses the split above;
  -- only the amount ABOVE the limit uses the over_* split.
  monthly_limit          numeric(12, 2) check (monthly_limit > 0),
  over_split_type        text check (over_split_type in ('equal', 'payer', 'member', 'custom')),
  over_bearer_member_id  uuid references public.members (id),
  over_bearer_pct        numeric(5, 2) check (over_bearer_pct between 0 and 100),

  is_active              boolean not null default true,
  sort_order             integer not null default 0,
  created_at             timestamptz not null default now(),

  check ((split_type in ('member', 'custom')) = (bearer_member_id is not null)),
  check ((split_type = 'custom') = (bearer_pct is not null)),
  check ((monthly_limit is null) = (over_split_type is null)),
  check ((coalesce(over_split_type, '') in ('member', 'custom')) = (over_bearer_member_id is not null)),
  check ((coalesce(over_split_type, '') = 'custom') = (over_bearer_pct is not null))
);

-- Fixed shared costs (rent, maintenance, …) ------------------------------------

create table public.fixed_costs (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  amount            numeric(12, 2) not null check (amount > 0),
  -- Who actually pays it (e.g. you pay the landlord).
  payer_member_id   uuid not null references public.members (id),

  split_type        text not null default 'equal' check (split_type in ('equal', 'payer', 'member', 'custom')),
  bearer_member_id  uuid references public.members (id),
  bearer_pct        numeric(5, 2) check (bearer_pct between 0 and 100),

  -- 1 = every month, 3 = every three months, …
  every_months      smallint not null default 1 check (every_months between 1 and 12),
  -- First month it's due (always the 1st of that month). Repeats every_months from here.
  start_month       date not null check (extract(day from start_month) = 1),
  is_active         boolean not null default true,
  notes             text,
  created_at        timestamptz not null default now(),

  check ((split_type in ('member', 'custom')) = (bearer_member_id is not null)),
  check ((split_type = 'custom') = (bearer_pct is not null))
);

-- Security: only the two members can read or change anything. --------------------

alter table public.accounts    enable row level security;
alter table public.categories  enable row level security;
alter table public.fixed_costs enable row level security;

create policy "Members manage accounts"    on public.accounts    for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "Members manage categories"  on public.categories  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "Members manage fixed costs" on public.fixed_costs for all to authenticated using (public.is_member()) with check (public.is_member());

-- Starting categories. All start as 50/50 with no limit. Set who covers food delivery,
-- and its limit, in Settings → Categories.
insert into public.categories (name, kind, match_keywords, split_type, sort_order) values
  ('Food delivery',  'regular', '{swiggy,blinkit,zepto}', 'equal', 10),
  ('Travel',         'travel',  '{}',                     'equal', 20),
  ('EMI',            'emi',     '{}',                     'equal', 30),
  ('Shared – other', 'regular', '{}',                     'equal', 40),
  ('Personal',       'regular', '{}',                     'payer', 50);
