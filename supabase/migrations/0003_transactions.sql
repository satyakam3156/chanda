-- Step 3: transactions and the review inbox.
-- Run once in Supabase → SQL Editor, after 0002.

create table public.transactions (
  id                 uuid primary key default gen_random_uuid(),
  occurred_on        date not null,
  amount             numeric(12, 2) not null check (amount > 0),
  -- 'debit' = money spent. 'credit' = money back (refund, cashback), which reduces its category.
  direction          text not null default 'debit' check (direction in ('debit', 'credit')),
  description        text not null,
  -- Null = cash, UPI from an account not set up in Chanda, etc.
  account_id         uuid references public.accounts (id),
  -- Who the money actually came from (for a card: the card holder, who pays the bill).
  paid_by_member_id  uuid not null references public.members (id),
  category_id        uuid references public.categories (id),

  -- Leave split_type null to follow the category (including its monthly limit).
  -- Set it only to override the split for this one transaction.
  split_type         text check (split_type in ('equal', 'payer', 'member', 'custom')),
  bearer_member_id   uuid references public.members (id),
  bearer_pct         numeric(5, 2) check (bearer_pct between 0 and 100),

  -- 'needs_review' shows in the Inbox. 'ignored' never counts (card bill payments, duplicates…).
  status             text not null default 'confirmed' check (status in ('needs_review', 'confirmed', 'ignored')),
  source             text not null default 'manual' check (source in ('manual', 'email')),
  -- For imported transactions: the email's id, so the same email is never imported twice.
  source_ref         text unique,
  raw                jsonb,
  notes              text,

  created_by         uuid references public.members (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  check ((coalesce(split_type, '') in ('member', 'custom')) = (bearer_member_id is not null)),
  check ((coalesce(split_type, '') = 'custom') = (bearer_pct is not null)),
  -- A confirmed transaction must have a category, so it can be counted.
  check (status <> 'confirmed' or category_id is not null)
);

create index transactions_occurred_on_idx on public.transactions (occurred_on);
create index transactions_inbox_idx on public.transactions (occurred_on) where status = 'needs_review';

-- Fill created_by from the signed-in member, and keep updated_at current.
create or replace function public.transactions_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.created_by is null then
    select m.id into new.created_by from public.members m where m.user_id = (select auth.uid());
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.transactions_stamp() from public, anon, authenticated;

create trigger transactions_stamp
  before insert or update on public.transactions
  for each row execute function public.transactions_stamp();

alter table public.transactions enable row level security;

create policy "Members manage transactions"
  on public.transactions for all
  to authenticated
  using (public.is_member())
  with check (public.is_member());
