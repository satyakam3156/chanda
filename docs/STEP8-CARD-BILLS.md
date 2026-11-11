# Step 8 — Card bills

Done when the Month page shows, for each credit card, which part of the month's spending is on this month's bill and which part moves to next month's, with each person's share of every bill.

No SQL to run.

## Set it up

**Settings → Cards and accounts →** each card → **Statement date** = the day the bill is generated (the last day of the cycle). A cycle of 18th → 17th means statement date **17**.

A card without a statement date is listed with a reminder instead of its bills.

## What the Month page shows

Under **Card bills**, per card:

- **"Nov on this card: ₹A on the 17 Nov bill · ₹B goes to the 17 Dec bill"**: the calendar month's spending, split by bill.
- **This month's bill** (e.g. 18 Oct – 17 Nov) and **next month's bill** (18 Nov – 17 Dec), each with:
  - the total as the bank will bill it, and **"so far · closes in N days"** until it's generated;
  - **each person's share**, worked out exactly like the month's balance (food limit, trips, custom splits). Group-trip bills only count your couple's part;
  - how the total splits across calendar months (e.g. *Oct ₹11,386 + Nov ₹18,243*);
  - anything **still in the Inbox** (on the card, not counted yet), and anything **not counted here** (ignored, or ticked as a fixed cost);
  - **EMI instalments** charged to the card, on the bill closing in the month they're ticked;
  - foreign-currency charges still waiting for their ₹ amount: listed, not added (their placeholder would swamp the total).
- **Card bill payments this month**: payments made through CRED, from the HDFC alerts.

Settling up doesn't change: she still pays her share of the **whole calendar month**. The bills panel is there to see what each bill holds and who it belongs to.
