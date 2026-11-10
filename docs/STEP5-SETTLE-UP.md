# Step 5 — Settle up and close the month

Done when you can record her UPI payment, close a month with the numbers you both agreed, and see any leftover carried into the next month.

## 1. Create the tables

Supabase → **SQL Editor** → **New query** → paste all of [`supabase/migrations/0005_settlements.sql`](../supabase/migrations/0005_settlements.sql) → **Run**.

## 2. How it works

```
Month's spending (step 4)        Nivedita owes Satyakam ₹25,000
+ Carried in from last month      Nivedita owes Satyakam ₹5,000
= Total due                       Nivedita owes Satyakam ₹30,000
− Settled (her UPI payments)      ₹28,000
= Still owed → carries forward    Nivedita owes Satyakam ₹2,000
```

- **Record**: log a payment between you (who sent it, amount, date, UPI / bank / cash). The amount is pre-filled with what's still owed. Check it before saving.
- A settle-up belongs to the month it **settles**, not the day it was sent. Paying November's share on 2 December: open **November** and record it there.
- **Close <month>**: shows the final numbers (spending, carried in, settled, what carries forward) for you both to check. Saving confirms them.
- **Carry-over**: what's still owed in a closed month appears in the next month as "Carried in". Only **closed** months carry over. If last month has transactions but isn't closed, you'll see a warning.
- **Reopen**: if something changes after closing, reopen the month, fix it, and close again. Reopen the later month first if that one is closed too.
- **Changed after closing**: if a closed month's numbers no longer match what was confirmed, the page says so in red.

The big number at the top of the Month page is now **what's still owed**, after carry-over and settle-ups.

## 3. Try it

1. Open this month → **Settle up** → **Record** → keep or change the amount → Save.
2. Watch "Still owed" and the headline drop.
3. **Close** the month → check the numbers → Save.
4. Go to the next month (›) → "Carried in from …" shows the leftover.
5. Go back → **Reopen** to undo.

Her UPI credit emails will be suggested as settle-ups automatically in step 7.
