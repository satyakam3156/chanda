-- Step 7 fixes, round 3. Run in Supabase → SQL Editor, after 0009. Safe to run again.
--
-- Card spends in another currency (e.g. "USD 23.6 spent on credit card") are imported
-- to the Inbox with the foreign amount as a placeholder, the currency in the
-- description, and never auto-confirmed. The Inbox asks for the ₹ amount first.

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
  v_currency    text := upper(nullif(p_alert->>'currency', ''));
  v_foreign     boolean;
begin
  v_foreign := v_currency is not null and v_currency <> 'INR';
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
    -- Banks shorten names ("NIVEDITA"), so a name that starts the other counts.
    select m.id into v_person
    from public.members m, unnest(array_append(m.bank_names, m.display_name)) n
    where m.id <> v_payer and n <> ''
      and (v_text like '%' || lower(n) || '%' or (length(v_cp) >= 4 and lower(n) like v_cp || '%'))
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

  -- Charged in another currency: the amount is a placeholder until you enter the ₹
  -- amount from the statement, so it always waits in the Inbox.
  if v_foreign and v_status = 'confirmed' then
    v_status := 'needs_review';
  end if;

  v_description := case
    when v_kind in ('account_debit', 'account_credit') and v_cp = '' then
      coalesce(p_alert->>'bank', 'Bank') || ' ' || v_direction
    when v_kind = 'account_debit' then coalesce(nullif(p_alert->>'via', ''), 'UPI') || ' to ' || (p_alert->>'counterparty')
    when v_kind = 'account_credit' then coalesce(nullif(p_alert->>'via', ''), 'UPI') || ' from ' || (p_alert->>'counterparty')
    else coalesce(nullif(p_alert->>'merchant', ''), 'Card transaction')
  end;
  if v_foreign then
    v_description := v_description || ' (' || v_currency || ' ' || (p_alert->>'foreign_amount') || ')';
  end if;

  insert into public.transactions (
    occurred_on, amount, direction, description, account_id, paid_by_member_id,
    category_id, status, source, source_ref, raw, notes
  ) values (
    (p_alert->>'occurred_on')::date, v_amount, v_direction, left(v_description, 200), v_account.id, v_payer,
    v_category, v_status, 'email', v_ref,
    jsonb_strip_nulls(jsonb_build_object(
      'kind', v_kind, 'bank', p_alert->>'bank',
      'merchant', p_alert->>'merchant', 'counterparty', p_alert->>'counterparty',
      'settle_member_id', v_person,
      'currency', case when v_foreign then v_currency end,
      'foreign_amount', case when v_foreign then (p_alert->>'foreign_amount')::numeric end
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
