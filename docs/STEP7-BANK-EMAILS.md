# Step 7 — Import bank alert emails

Done when new ICICI / Axis / HDFC alerts show up in Chanda's Inbox by themselves, every 15 minutes.

```
Gmail ──(Apps Script in your Google account, every 15 min)──► reads alerts, keeps only:
        date, amount, merchant / payee name, bank
     ──► Supabase: ingest_bank_alert(secret, fields) ──► Chanda Inbox
```

- Email bodies never leave Google. Only the fields above are sent. Card and account digits stay in Gmail unless you turn on `SEND_LAST4` (only needed if you ever have two cards from one bank).
- The script can **only read** Gmail (read-only permission). It can't send, delete or change mail.
- The script can only **add** Inbox items. It can't read or change anything else in Chanda.
- Each email is imported at most once (keyed by Gmail's message ID), so re-runs are safe.

## What it understands

| Email | Becomes |
|---|---|
| ICICI card: "…has been used for a transaction of INR … Info: SWIGGY…" | Spend on the ICICI card |
| Axis card: "INR … spent on credit card no. XX…" | Spend on the Axis card |
| HDFC: "Rs.… is debited from your account ending … towards VPA … (NAME)" | Bank debit ("UPI to NAME") |
| HDFC: "Rs.… is credited to your account ending … by VPA … (NAME)" | Bank credit ("UPI from NAME"). *Best guess, not yet seen in a real email* |
| ICICI "Payment received", card bill payments | Skipped |
| Any other email from these banks | Listed in the Inbox as **"couldn't be read"** (subject only) |

## 1. Run the SQL

Supabase → **SQL Editor** → paste all of [`supabase/migrations/0007_email_ingest.sql`](../supabase/migrations/0007_email_ingest.sql) → **Run**.

The result shows one row, **`ingest_secret_for_gmail_script`**. Copy that value; it's needed in part 3.
(To see it again later: `select value from private.settings where key = 'ingest_secret';`)

## 2. Settings in Chanda

**Cards and accounts:** emails are matched to a card by **bank name**. With one ICICI card, one Axis card and one HDFC account, that's all Chanda needs, so **last 4 digits are optional**. Fill them in only if you later have two cards from the same bank. Then an email goes to the card whose last 4 match.

Each card now has **Bank email rules**:
- **Default category:** used when the merchant matches no keyword. E.g. set the ICICI food card to *Food delivery* if everything on it is food; leave it as *None* to review unknown merchants (like "AMAZON PAY").
- **Confirm automatically when a category is found:** off means everything waits in the Inbox; on means keyword or default-category matches are counted straight away. Travel refunds always wait for you.

**The two of you:** under each name, enter how that person appears in bank alerts. For her, it's the name HDFC shows in brackets on her UPI transfers, e.g. `NIVEDITA GAWANDE`. Her transfers to you then get a **Record as settle-up** button in the Inbox.

## 3. Install the Gmail script (once)

Do this **signed in to the Gmail account that receives the bank alerts**.

1. Go to https://script.google.com → **New project**. Rename it `Chanda importer`.
2. **Project Settings** (gear icon):
   - Tick **Show "appsscript.json" manifest file in editor**.
   - Under **Script properties** → **Add script property**, add three:

     | Property | Value |
     |---|---|
     | `SUPABASE_URL` | same as `VITE_SUPABASE_URL` in your `.env` |
     | `SUPABASE_KEY` | same as `VITE_SUPABASE_ANON_KEY` in your `.env` |
     | `INGEST_SECRET` | the value from part 1 |
3. **Editor** (`< >` icon):
   - Open `appsscript.json` → replace everything with [`gmail/appsscript.json`](../gmail/appsscript.json) → Save.
   - Rename `Code.gs` if needed and replace its content with [`gmail/Code.gs`](../gmail/Code.gs).
   - **+** → **Script** → name it `Parsers` → paste [`gmail/Parsers.gs`](../gmail/Parsers.gs).
   - Save (Cmd+S).
4. At the top, pick the function **`setup`** → **Run**.
   - Google asks for permission. Because this is your own script and not a published app, it shows **"Google hasn't verified this app"** → **Advanced** → **Go to Chanda importer (unsafe)** → **Allow**.
   - The permissions listed should be: view your email (read-only), connect to an external service, run when you're not present.
5. `setup` imports the last 3 days, then repeats every 15 minutes. **Executions** (left menu) shows each run's log, e.g. `{"inbox":3,"duplicate":5,"skip":1,…}`.

**Import older alerts (optional):** pick **`backfill`** → Run. It imports the last 31 days. All of it lands in the Inbox (or is auto-confirmed per your card rules).

## 4. Using it

- **Inbox:** pick or check the category → **Confirm**, or **Ignore**.
- **Record as settle-up:** for a UPI transfer between you two. It creates the settle-up for that month and ignores the transaction.
- **Is this a fixed cost? → Tick it:** for a bank debit like the rent transfer. It ticks Rent for that month with this amount and ignores the transaction, so it isn't counted twice.
- **"Couldn't be read":** a bank email in a new format (e.g. a refund). Add it by hand if needed, then dismiss. Send me a masked copy and I'll add that format.

## Changing the parsers later

The parsers are in `gmail/Parsers.gs`. Test them without Google:

```bash
node gmail/test-parsers.mjs
```

After changing them, paste the new `Parsers.gs` into the Apps Script project again.
