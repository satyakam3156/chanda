-- Step 4: "Yes, we paid it" for fixed costs.
-- Run once in Supabase → SQL Editor, after 0003.
--
-- One row per fixed cost per month it was paid. A fixed cost only counts in a
-- month's balance once it has a row here. The amount, payer and split are copied
-- from the fixed cost when ticked, so changing the fixed cost later doesn't
-- rewrite past months.

create table public.fixed_cost_payments (
  id                 uuid primary key default gen_random_uuid(),
  fixed_cost_id      uuid not null references public.fixed_costs (id),
  month              date not null check (extract(day from month) = 1),
  amount             numeric(12, 2) not null check (amount > 0),
  paid_by_member_id  uuid not null references public.members (id),
  paid_on            date,

  split_type         text not null check (split_type in ('equal', 'payer', 'member', 'custom')),
  bearer_member_id   uuid references public.members (id),
  bearer_pct         numeric(5, 2) check (bearer_pct between 0 and 100),

  created_by         uuid references public.members (id),
  created_at         timestamptz not null default now(),

  unique (fixed_cost_id, month),
  check ((split_type in ('member', 'custom')) = (bearer_member_id is not null)),
  check ((split_type = 'custom') = (bearer_pct is not null))
);

create or replace function public.stamp_created_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is null then
    select m.id into new.created_by from public.members m where m.user_id = (select auth.uid());
  end if;
  return new;
end;
$$;

revoke execute on function public.stamp_created_by() from public, anon, authenticated;

create trigger fixed_cost_payments_stamp
  before insert on public.fixed_cost_payments
  for each row execute function public.stamp_created_by();

alter table public.fixed_cost_payments enable row level security;

create policy "Members manage fixed cost payments"
  on public.fixed_cost_payments for all
  to authenticated
  using (public.is_member())
  with check (public.is_member());
