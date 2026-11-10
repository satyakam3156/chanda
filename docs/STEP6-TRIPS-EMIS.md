# Step 6 — Trips and EMIs

Done when you can track a trip's cost to the two of you (couple or group), see where the money went, and count EMI instalments month by month.

## 1. Create the tables

Supabase → **SQL Editor** → **New query** → paste all of [`supabase/migrations/0006_trips_emis.sql`](../supabase/migrations/0006_trips_emis.sql) → **Run**.

> Until this is run, the Month, Transactions, Inbox, Trips and Settings pages show a "missing table" message.

## 2. Trips

**Trips → New trip:** name, dates, **Just the two of us** or **A group** (with the total number of people, including you both), and how the two of you split it (default 50/50).

**Adding trip expenses:** in the transaction form, pick the **Trip**, then **What for** (getting there, stay, food, local travel, activities, shopping, other). On a group trip there's one more choice:

| "Paid for the whole group of 6" | What counts between you two |
|---|---|
| ✅ ticked: e.g. you paid the ₹60,000 villa for everyone | ₹60,000 × 2/6 = **₹20,000**. Friends pay you back outside Chanda |
| ☐ unticked: e.g. a ₹3,000 dinner for just you two | **₹3,000** |

- A trip expense uses the **trip's split**, not the Travel category's, unless you give it its own split.
- Trip expenses count in the **month they happened**, so they're already in each month's balance.
- Trip expenses don't count towards a category's monthly limit.

**Trip page:** the cost to the two of you so far, paid and share for each of you, a "Where the money went" breakdown, every expense across all months, and the trip's EMIs. "Add" on a trip page starts the expense already linked to that trip.

## 3. EMIs

**Trips → New EMI** (or "EMIs for this trip" on a trip page):

- **Converted from**: pick the original big charge. Chanda sets it to **Ignored** (with a note) so it isn't counted twice.
- **Monthly instalment** (including interest), **number of instalments**, **first instalment month**. The form shows the total and the last month.
- Card, paid by, category (default EMI), optional trip + what for + whole-group, and split (default: trip's split if linked to a trip, otherwise the category's).

**Each month:** the Month page shows **EMIs this month**. Tick an instalment once it's charged ("Yes, it's paid"). You can change that month's amount if the charge differed. **Only ticked instalments count**, the same as rent.

The EMI list shows progress, e.g. "2 of 6 paid".

## 4. Try it

1. Create a trip (try a group of 4).
2. Add one expense ticked "whole group" and one not. Check the trip page and this month's Month page.
3. Create an EMI from a big charge. Check the charge is now Ignored, and that this month's instalment appears on the Month page to tick.
