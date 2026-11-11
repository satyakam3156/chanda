-- Step 7: import bank alert emails from Gmail.
-- Run in Supabase → SQL Editor, after 0006. Safe to run again (e.g. after an update).
-- At the end it shows the secret to paste into the Gmail script.
--
-- The Gmail script (gmail/*.gs) reads alert emails, pulls out only the fields below,
-- and calls public.ingest_bank_alert(secret, alert). That function is the script's
-- only way in: it can add Inbox items and "couldn't read" notes, nothing else.

-- Per-card rules -----------------------------------------------------------------

alter table public.accounts
  -- Category for transactions on this card whose merchant matches no keyword.
  add column if not exists default_category_id uuid references public.categories (id),
  -- Confirm imported transactions straight away when a category was found
  -- (keyword or card default). Off = everything waits in the Inbox.
  add column if not exists auto_confirm boolean not null default false;

-- How each of you appears in bank alerts (name or UPI ID), e.g. 'NIVEDITA GAWANDE'.
-- A UPI credit or debit between you two is then offered as a settle-up.
alter table public.members
  add column if not exists bank_names text[] not null default '{}';

grant update (display_name, bank_names) on public.members to authenticated;

-- Bank emails the script found but couldn't read (new formats). Only the subject is kept.
create table if not exists public.ingest_misses (
  id           uuid primary key default gen_random_uuid(),
  source_ref   text not null unique,
  sender       text,
  subject      text,
  received_on  date,
  dismissed    boolean not null default false,
  created_at   timestamptz not null default now()
);

alter table public.ingest_misses enable row level security;
drop policy if exists "Members manage ingest misses" on public.ingest_misses;
create policy "Members manage ingest misses" on public.ingest_misses for all to authenticated using (public.is_member()) with check (public.is_member());

-- The shared secret. The private schema isn't exposed through the API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.settings (
  key   text primary key,
  value text not null
);

insert into private.settings (key, value)
values ('ingest_secret', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

-- The import function ---------------------------------------------------------------
--
-- alert fields (all text unless noted):
--   source_ref   Gmail message id (required, used to never import twice)
--   kind         card_spend | card_credit | account_debit | account_credit | unreadable
--   bank         'ICICI' | 'Axis' | 'HDFC'
--   last4        optional. Only used when two cards of the same bank need telling apart,
--                and never stored.
--   amount       number
--   occurred_on  'YYYY-MM-DD'
--   merchant     merchant name (cards)
--   counterparty name in brackets on UPI alerts
--   mailbox      the Gmail address the script runs in (fallback payer)
--   sender, subject  for 'unreadable' only

create or replace function public.ingest_bank_alert(p_secret text, p_alert jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind        text := p_alert->>'kind';
  v_ref         text := p_alert->>'source_ref';
  v_account     public.accounts%rowtype;
  v_acc_kind    text;
  v_candidates  int;
  v_payer       uuid;
  v_text        text;
  v_category    uuid;
  v_cat_kind    text;
  v_by_rule     boolean := false;
  v_person      uuid;
  v_status      text := 'needs_review';
  v_direction   text;
  v_description text;
  v_amount      numeric;
  v_inserted    uuid;
begin
  if p_secret is null or p_secret <> (select value from private.settings where key = 'ingest_secret') then
    raise exception 'Chanda: invalid ingest secret';
  end if;
  if v_ref is null or v_ref = '' then
    raise exception 'Chanda: source_ref is required';
  end if;

  if v_kind = 'unreadable' then
    insert into public.ingest_misses (source_ref, sender, subject, received_on)
    values (v_ref, left(p_alert->>'sender', 200), left(p_alert->>'subject', 300), (p_alert->>'occurred_on')::date)
    on conflict (source_ref) do nothing;
    return 'miss';
  end if;

  if v_kind not in ('card_spend', 'card_credit', 'account_debit', 'account_credit') then
    raise exception 'Chanda: unknown alert kind %', v_kind;
  end if;

  v_amount := (p_alert->>'amount')::numeric;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Chanda: amount must be positive';
  end if;
  v_direction := case when v_kind in ('card_spend', 'account_debit') then 'debit' else 'credit' end;

  -- Which card/account: same bank, and card vs bank account. If an account has
  -- last 4 digits saved and the alert has them too, they must match. With one
  -- card per bank, the bank name alone is enough.
  v_acc_kind := case when v_kind like 'card_%' then 'credit_card' else 'bank_account' end;
  select count(*) into v_candidates
  from public.accounts a
  where a.kind = v_acc_kind
    and lower(a.bank) like '%' || lower(coalesce(p_alert->>'bank', '')) || '%'
    and (a.last4 is null or p_alert->>'last4' is null or a.last4 = p_alert->>'last4');
  if v_candidates >= 1 then
    select * into v_account
    from public.accounts a
    where a.kind = v_acc_kind
      and lower(a.bank) like '%' || lower(coalesce(p_alert->>'bank', '')) || '%'
      and (a.last4 is null or p_alert->>'last4' is null or a.last4 = p_alert->>'last4')
    order by (a.last4 is not null and a.last4 = p_alert->>'last4') desc, a.is_active desc, a.created_at
    limit 1;
  end if;

  v_payer := coalesce(
    v_account.owner_member_id,
    (select m.id from public.members m where m.email = lower(p_alert->>'mailbox'))
  );
  if v_payer is null then
    raise exception 'Chanda: no % account in Settings, and the mailbox is not a member', p_alert->>'bank';
  end if;

  v_text := lower(coalesce(p_alert->>'merchant', '') || ' ' || coalesce(p_alert->>'counterparty', ''));

  -- A UPI transfer to/from one of you? Then it's probably a settle-up, not spending.
  if v_kind in ('account_debit', 'account_credit') and coalesce(p_alert->>'counterparty', '') <> '' then
    select m.id into v_person
    from public.members m, unnest(m.bank_names) n
    where m.id <> v_payer and n <> '' and v_text like '%' || lower(n) || '%'
    limit 1;
  end if;

  if v_person is null then
    -- Category from merchant keywords (longest match wins), else the card's default.
    select c.id, c.kind into v_category, v_cat_kind
    from public.categories c, unnest(c.match_keywords) k
    where c.is_active and k <> '' and v_text like '%' || k || '%'
    order by length(k) desc
    limit 1;
    if v_category is not null then
      v_by_rule := true;
    elsif v_account.default_category_id is not null then
      v_category := v_account.default_category_id;
      select c.kind into v_cat_kind from public.categories c where c.id = v_category;
      v_by_rule := true;
    end if;

    -- Auto-confirm only when the card allows it and a category was found.
    -- Money back on travel always waits for you to decide.
    if coalesce(v_account.auto_confirm, false) and v_by_rule
       and not (v_direction = 'credit' and v_cat_kind = 'travel') then
      v_status := 'confirmed';
    end if;
  end if;

  v_description := case
    when v_kind = 'account_debit' then 'UPI to ' || coalesce(nullif(p_alert->>'counterparty', ''), 'unknown')
    when v_kind = 'account_credit' then 'UPI from ' || coalesce(nullif(p_alert->>'counterparty', ''), 'unknown')
    else coalesce(nullif(p_alert->>'merchant', ''), 'Card transaction')
  end;

  insert into public.transactions (
    occurred_on, amount, direction, description, account_id, paid_by_member_id,
    category_id, status, source, source_ref, raw, notes
  ) values (
    (p_alert->>'occurred_on')::date, v_amount, v_direction, left(v_description, 200), v_account.id, v_payer,
    v_category, v_status, 'email', v_ref,
    jsonb_strip_nulls(jsonb_build_object(
      'kind', v_kind, 'bank', p_alert->>'bank',
      'merchant', p_alert->>'merchant', 'counterparty', p_alert->>'counterparty',
      'settle_member_id', v_person
    )),
    case
      when v_account.id is null then 'No ' || coalesce(p_alert->>'bank', '?') || ' ' || replace(v_acc_kind, '_', ' ') || ' in Settings'
      when v_candidates > 1 then 'More than one ' || coalesce(p_alert->>'bank', '?') || ' ' || replace(v_acc_kind, '_', ' ') || ': add last 4 digits in Settings to tell them apart'
    end
  )
  on conflict (source_ref) do nothing
  returning id into v_inserted;

  return case when v_inserted is null then 'duplicate' when v_status = 'confirmed' then 'confirmed' else 'inbox' end;
end;
$$;

revoke execute on function public.ingest_bank_alert(text, jsonb) from public;
grant execute on function public.ingest_bank_alert(text, jsonb) to anon, authenticated;

-- Show the secret once, to paste into the Gmail script's settings.
select value as ingest_secret_for_gmail_script from private.settings where key = 'ingest_secret';
