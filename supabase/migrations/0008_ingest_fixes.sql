-- Step 7 fixes, after the first real import. Run in Supabase → SQL Editor, after 0007.
-- Safe to run again.
--
--   1. Card bill payments through CRED (HDFC "UPI to CRED Club") are kept as card
--      payments, not spending. Used later to show which bills were paid.
--   2. UPI transfers to yourself (e.g. HDFC → Axis) are skipped.
--   3. Blinkit card spends ("BLINK COMMERCE PVT LTD") are suggested as Food delivery.
--   4. Offers, statements and account notices already listed as "couldn't be read" are dismissed.
--   5. Bank debits/credits without a payee name get a plain description ("Axis debit").
--   6. New categories "Home & utilities" and "Subscriptions" (50/50, change in Settings)
--      with payee keywords, and an "always ignore" list (Settings → Bank emails).
--   7. Her Gmail can run the script too: alerts are matched only to the mailbox owner's
--      accounts, alerts for accounts not in Settings are dropped, and an account can be
--      limited to some categories (her Axis account: Food delivery only).
--
-- Only Inbox items (not yet confirmed) are moved or removed. Confirmed ones are untouched.

-- Categories and keywords from the first import ------------------------------------

insert into public.categories (name, kind, match_keywords, split_type, sort_order) values
  ('Home & utilities', 'regular', '{}', 'equal', 35),
  ('Subscriptions',    'regular', '{}', 'equal', 36)
on conflict (name) do nothing;

update public.categories c
set match_keywords = array(select distinct unnest(c.match_keywords || v.words) order by 1)
from (values
  ('Food delivery',    array['blink commerce']),
  ('Home & utilities', array['atria convergence', 'livpure', 'furlenco']),
  ('Subscriptions',    array['jiohotstar', 'youtube', 'apple media services', 'google play', 'amazon india'])
) as v (name, words)
where c.name = v.name;

-- Per account: only import these categories (empty = everything). For her account,
-- e.g. Food delivery only, so her personal spending never reaches Chanda.
alter table public.accounts
  add column if not exists import_category_ids uuid[] not null default '{}';

-- Payees whose emails are imported straight as "ignored": kept, never counted, never in the Inbox.
create table if not exists public.ingest_rules (
  id               int primary key default 1 check (id = 1),
  ignore_keywords  text[] not null default '{}'
);
alter table public.ingest_rules enable row level security;
drop policy if exists "Members manage ingest rules" on public.ingest_rules;
create policy "Members manage ingest rules" on public.ingest_rules for all to authenticated using (public.is_member()) with check (public.is_member());

insert into public.ingest_rules (id, ignore_keywords) values (1, '{liquor collective}')
on conflict (id) do nothing;

-- Card payments ------------------------------------------------------------------

create table if not exists public.card_payments (
  id                 uuid primary key default gen_random_uuid(),
  source_ref         text not null unique,
  paid_on            date not null,
  amount             numeric(12, 2) not null check (amount > 0),
  via                text not null,                                   -- e.g. 'CRED'
  from_account_id    uuid references public.accounts (id),            -- the bank account it left
  card_account_id    uuid references public.accounts (id),            -- which card, when known
  paid_by_member_id  uuid references public.members (id),
  created_at         timestamptz not null default now()
);

alter table public.card_payments enable row level security;
drop policy if exists "Members manage card payments" on public.card_payments;
create policy "Members manage card payments" on public.card_payments for all to authenticated using (public.is_member()) with check (public.is_member());

-- The import function (replaces the one from 0007) ---------------------------------

create or replace function public.ingest_bank_alert(p_secret text, p_alert jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind        text := p_alert->>'kind';
  v_ref         text := p_alert->>'source_ref';
  v_cp          text := lower(trim(coalesce(p_alert->>'counterparty', '')));
  v_mailbox     uuid;
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

  -- Whose Gmail this came from. Only that person's cards/accounts are matched,
  -- so two Axis accounts (one each) never get mixed up.
  select m.id into v_mailbox from public.members m where m.email = lower(p_alert->>'mailbox');

  -- Which card/account: same owner, same bank, card vs bank account. If an account
  -- has last 4 digits saved and the alert has them too, they must match.
  v_acc_kind := case when v_kind like 'card_%' then 'credit_card' else 'bank_account' end;
  select count(*) into v_candidates
  from public.accounts a
  where a.kind = v_acc_kind
    and (v_mailbox is null or a.owner_member_id = v_mailbox)
    and lower(a.bank) like '%' || lower(coalesce(p_alert->>'bank', '')) || '%'
    and (a.last4 is null or p_alert->>'last4' is null or a.last4 = p_alert->>'last4');
  if v_candidates = 0 then
    -- Not a card/account in Settings (e.g. a personal account): nothing is stored.
    delete from public.ingest_misses where source_ref = v_ref;
    return 'no_account';
  end if;
  select * into v_account
  from public.accounts a
  where a.kind = v_acc_kind
    and (v_mailbox is null or a.owner_member_id = v_mailbox)
    and lower(a.bank) like '%' || lower(coalesce(p_alert->>'bank', '')) || '%'
    and (a.last4 is null or p_alert->>'last4' is null or a.last4 = p_alert->>'last4')
  order by (a.last4 is not null and a.last4 = p_alert->>'last4') desc, a.is_active desc, a.created_at
  limit 1;
  v_payer := v_account.owner_member_id;

  v_text := lower(coalesce(p_alert->>'merchant', '') || ' ' || coalesce(p_alert->>'counterparty', ''));

  -- Category from merchant keywords (longest match wins), else the account's default.
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

  -- "Only import these categories" on the account (e.g. her account: food delivery only).
  -- Anything else from it is personal: nothing is stored.
  if cardinality(v_account.import_category_ids) > 0
     and (v_category is null or not (v_category = any (v_account.import_category_ids))) then
    delete from public.ingest_misses where source_ref = v_ref;
    return 'not_shared';
  end if;

  if v_kind in ('account_debit', 'account_credit') and v_cp <> '' then
    -- Money moved between the owner's own accounts: not spending, not income.
    -- Banks shorten names ("SATYAKAM"), so a name that starts the other counts.
    if exists (
      select 1 from public.members m
      where m.id = v_payer
        and exists (
          select 1 from unnest(array_append(m.bank_names, m.display_name)) n
          where n <> '' and (v_cp like '%' || lower(n) || '%' or (length(v_cp) >= 4 and lower(n) like v_cp || '%'))
        )
    ) then
      delete from public.ingest_misses where source_ref = v_ref;
      return 'skip';
    end if;

    -- A credit card bill paid through CRED: a card payment, not spending.
    if v_kind = 'account_debit' and v_cp ~ '^cred\M' then
      insert into public.card_payments (source_ref, paid_on, amount, via, from_account_id, paid_by_member_id)
      values (v_ref, (p_alert->>'occurred_on')::date, v_amount, 'CRED', v_account.id, v_payer)
      on conflict (source_ref) do nothing;
      delete from public.ingest_misses where source_ref = v_ref;
      return 'card_payment';
    end if;

    -- A transfer to/from the other one of you? Then it's probably a settle-up.
    select m.id into v_person
    from public.members m, unnest(m.bank_names) n
    where m.id <> v_payer and n <> '' and v_text like '%' || lower(n) || '%'
    limit 1;
  end if;

  if v_person is not null then
    v_category := null;
  elsif exists (
    -- On the "always ignore" list: keep it, but as ignored.
    select 1 from public.ingest_rules r, unnest(r.ignore_keywords) k
    where k <> '' and v_text like '%' || lower(k) || '%'
  ) then
    v_status := 'ignored';
    v_category := null;
  elsif coalesce(v_account.auto_confirm, false) and v_by_rule
        and not (v_direction = 'credit' and v_cat_kind = 'travel') then
    -- Auto-confirm only when the account allows it and a category was found.
    -- Money back on travel always waits for you to decide.
    v_status := 'confirmed';
  end if;

  v_description := case
    when v_kind in ('account_debit', 'account_credit') and v_cp = '' then
      coalesce(p_alert->>'bank', 'Bank') || ' ' || v_direction
    when v_kind = 'account_debit' then coalesce(nullif(p_alert->>'via', ''), 'UPI') || ' to ' || (p_alert->>'counterparty')
    when v_kind = 'account_credit' then coalesce(nullif(p_alert->>'via', ''), 'UPI') || ' from ' || (p_alert->>'counterparty')
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
    case when v_candidates > 1 then
      'More than one ' || coalesce(p_alert->>'bank', '?') || ' ' || replace(v_acc_kind, '_', ' ') || ': add last 4 digits in Settings to tell them apart'
    end
  )
  on conflict (source_ref) do nothing
  returning id into v_inserted;

  -- An email that used to be unreadable and now parses: drop its "couldn't read" note.
  delete from public.ingest_misses where source_ref = v_ref;

  return case when v_inserted is null then 'duplicate' when v_status in ('confirmed', 'ignored') then v_status else 'inbox' end;
end;
$$;

revoke execute on function public.ingest_bank_alert(text, jsonb) from public;
grant execute on function public.ingest_bank_alert(text, jsonb) to anon, authenticated;

-- Tidy up what the first import brought in ------------------------------------------

-- 1. CRED payments waiting in the Inbox → card payments.
insert into public.card_payments (source_ref, paid_on, amount, via, from_account_id, paid_by_member_id)
select t.source_ref, t.occurred_on, t.amount, 'CRED', t.account_id, t.paid_by_member_id
from public.transactions t
where t.source = 'email' and t.status = 'needs_review' and t.direction = 'debit'
  and lower(trim(coalesce(t.raw->>'counterparty', ''))) ~ '^cred\M'
on conflict (source_ref) do nothing;

delete from public.transactions t
where t.source = 'email' and t.status = 'needs_review' and t.direction = 'debit'
  and lower(trim(coalesce(t.raw->>'counterparty', ''))) ~ '^cred\M';

-- 2. Transfers to yourself waiting in the Inbox.
delete from public.transactions t
using public.members m
where t.source = 'email' and t.status = 'needs_review'
  and m.id = t.paid_by_member_id
  and t.raw->>'kind' in ('account_debit', 'account_credit')
  and coalesce(t.raw->>'counterparty', '') <> ''
  and exists (
    select 1 from unnest(array_append(m.bank_names, m.display_name)) n, lower(trim(t.raw->>'counterparty')) cp
    where n <> '' and (cp like '%' || lower(n) || '%' or (length(cp) >= 4 and lower(n) like cp || '%'))
  );

-- 3. Inbox items on the ignore list → ignored.
update public.transactions t
set status = 'ignored'
from public.ingest_rules r
where t.source = 'email' and t.status = 'needs_review'
  and exists (select 1 from unnest(r.ignore_keywords) k where k <> '' and lower(t.description) like '%' || lower(k) || '%');

-- 3b. Inbox items without a category: try the keywords again (longest match wins).
update public.transactions t
set category_id = (
  select c.id from public.categories c, unnest(c.match_keywords) k
  where c.is_active and k <> '' and lower(t.description) like '%' || k || '%'
  order by length(k) desc limit 1
)
where t.source = 'email' and t.status = 'needs_review' and t.category_id is null
  and t.raw->>'settle_member_id' is null;

-- 4. Offers, statements and notices listed as "couldn't be read".
update public.ingest_misses
set dismissed = true
where not dismissed
  and (sender ~ '^(custcomm|customer|mailers?|marketing|offers|promotions?|news(letter)?)\.'
       or subject ~* '(statement|important update|update on applicable charges|missed call|upcoming payment notification)');

-- What's left, for a quick check.
select
  (select count(*) from public.card_payments)                                        as card_payments,
  (select count(*) from public.transactions where status = 'needs_review')           as inbox_items,
  (select count(*) from public.ingest_misses where not dismissed)                    as unreadable_left;
