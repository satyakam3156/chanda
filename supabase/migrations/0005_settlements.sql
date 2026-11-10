-- Step 5: settle-ups and closing a month (carry-over).
-- Run once in Supabase → SQL Editor, after 0004.

-- Money sent between the two of you to settle a month (e.g. her UPI to you).
create table public.settlements (
  id               uuid primary key default gen_random_uuid(),
  -- The month this payment settles (1st of the month). Can differ from paid_on,
  -- e.g. November settled on 2 December.
  month            date not null check (extract(day from month) = 1),
  from_member_id   uuid not null references public.members (id),
  to_member_id     uuid not null references public.members (id),
  amount           numeric(12, 2) not null check (amount > 0),
  paid_on          date not null,
  method           text not null default 'upi' check (method in ('upi', 'bank', 'cash', 'other')),
  note             text,
  -- Step 7: the bank credit email this came from, if any.
  transaction_id   uuid references public.transactions (id) on delete set null,
  created_by       uuid references public.members (id),
  created_at       timestamptz not null default now(),
  check (from_member_id <> to_member_id)
);

create index settlements_month_idx on public.settlements (month);

create trigger settlements_stamp
  before insert on public.settlements
  for each row execute function public.stamp_created_by();

-- A closed month: the numbers you both confirmed, and what carries into the next month.
create table public.month_closes (
  month              date primary key check (extract(day from month) = 1),
  -- The month's own balance (transactions + fixed costs), as shown when closing.
  own_from_member_id uuid references public.members (id),
  own_amount         numeric(12, 2) not null default 0 check (own_amount >= 0),
  -- Carried in from the previous closed month.
  carry_in_from_member_id uuid references public.members (id),
  carry_in_amount    numeric(12, 2) not null default 0 check (carry_in_amount >= 0),
  -- Total settled during the month (net, in the direction of the debt).
  settled_amount     numeric(12, 2) not null default 0,
  -- What's still owed after settle-ups. Carries into next month.
  carry_out_from_member_id uuid references public.members (id),
  carry_out_amount   numeric(12, 2) not null default 0 check (carry_out_amount >= 0),
  closed_by          uuid references public.members (id),
  closed_at          timestamptz not null default now(),
  check ((own_amount = 0) = (own_from_member_id is null)),
  check ((carry_in_amount = 0) = (carry_in_from_member_id is null)),
  check ((carry_out_amount = 0) = (carry_out_from_member_id is null))
);

create or replace function public.stamp_closed_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.closed_by is null then
    select m.id into new.closed_by from public.members m where m.user_id = (select auth.uid());
  end if;
  return new;
end;
$$;

revoke execute on function public.stamp_closed_by() from public, anon, authenticated;

create trigger month_closes_stamp
  before insert on public.month_closes
  for each row execute function public.stamp_closed_by();

alter table public.settlements  enable row level security;
alter table public.month_closes enable row level security;

create policy "Members manage settlements"  on public.settlements  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "Members manage month closes" on public.month_closes for all to authenticated using (public.is_member()) with check (public.is_member());
