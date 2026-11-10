-- Step 1: who may use Chanda.
-- Run once in Supabase → SQL Editor. Then add your two emails with seed.example.sql.

-- The two people who share expenses. Only emails listed here can sign in.
create table public.members (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique check (email = lower(email)),
  display_name text not null,
  user_id      uuid unique references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

-- Reject any new sign-in whose email is not in members.
-- Runs before Supabase creates the auth user, so other Google accounts never get an account.
create or replace function public.enforce_member_allowlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.members m where m.email = lower(new.email)) then
    raise exception 'Chanda: this account is not on the members list';
  end if;
  return new;
end;
$$;

create trigger enforce_member_allowlist
  before insert on auth.users
  for each row execute function public.enforce_member_allowlist();

-- After the first sign-in, link the auth user to their members row.
create or replace function public.link_member_to_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.members set user_id = new.id where email = lower(new.email);
  return new;
end;
$$;

create trigger link_member_to_user
  after insert on auth.users
  for each row execute function public.link_member_to_user();

-- True when the signed-in user is one of the two members.
-- Every table's security rules (from step 2 on) use this.
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.members m where m.user_id = (select auth.uid()));
$$;

revoke execute on function public.enforce_member_allowlist() from public, anon, authenticated;
revoke execute on function public.link_member_to_user() from public, anon, authenticated;

-- Row Level Security: only members can read the members list. Nobody can write it from the app yet.
alter table public.members enable row level security;

create policy "Members can see both members"
  on public.members for select
  to authenticated
  using (public.is_member());
