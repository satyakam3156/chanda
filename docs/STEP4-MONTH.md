# Step 4 — The monthly statement

Done when the Month page shows who owes whom, and you can follow exactly how the number was reached.

## 1. Create the table

Supabase → **SQL Editor** → **New query** → paste all of [`supabase/migrations/0004_fixed_cost_payments.sql`](../supabase/migrations/0004_fixed_cost_payments.sql) → **Run**.

## 2. How the balance is worked out

For every counted item, Chanda records two numbers per person:

- **Paid**: money that actually left their pocket (for a card, the card holder)
- **Share**: what they should bear, according to the split

**Your balance = paid − share.** If you paid more than your share, the other person owes you the difference.

What counts:
| Item | Counted when |
|---|---|
| Transactions | **Confirmed** (inbox items aren't counted until confirmed; ignored never) |
| Money back | Confirmed; it reduces its category |
| Fixed costs | **Ticked** on the Month page ("Yes, we paid it") |

### Monthly limit (food delivery)

With a ₹20,000 limit, "Only Nivedita" up to it, and 50/50 above it:

| Food this month | Up to limit (hers) | Above limit (50/50) | Her share | Your share |
|---|---|---|---|---|
| ₹15,000 | ₹15,000 | — | ₹15,000 | ₹0 |
| ₹30,000 | ₹20,000 | ₹10,000 | ₹25,000 | ₹5,000 |
| ₹30,000 − ₹2,000 refund | ₹20,000 | ₹8,000 | ₹24,000 | ₹4,000 |

The limit is checked against the month's **total** for the category (Swiggy + Blinkit + Zepto together), after refunds.
A transaction you give its own split doesn't count towards the limit.

### Fixed costs
Only ticked ones count. Ticking copies the amount, payer and split. You can change the amount or payer for that month when ticking, and later edits to the fixed cost in Settings don't change months already ticked.

## 3. The Month page

- **Headline:** "Nivedita owes Satyakam ₹X" (or "All even").
- **Per person:** "paid ₹A, share is ₹B → +/− ₹C".
- **Warnings:** inbox items not counted yet; fixed costs not ticked yet.
- **Monthly limits:** a bar showing spend against the limit, and how much is over.
- **Fixed costs this month:** tap to tick ("Yes, we paid it"); tap again to edit or un-tick.
- **How the balance is made:** every line with its total, and paid vs share for each of you.
- **Both of us / Only me:** "Only me" shows just your numbers ("You owe …" / "… owes you"). This choice is saved per device.

The headline is **before** settle-ups and carry-over from last month. Those come in step 5.

## 4. Try it

1. In Settings, set the Food delivery limit and add Rent and Maintenance (if not done yet).
2. Add a few transactions for this month on the Transactions page.
3. Open **Month**, tick Rent, and check the numbers against your own calculation.
4. Switch to **Only me**.
