# Step 3 — Transactions and the review inbox

Done when you can enter a month of transactions by hand, and the inbox works.

## 1. Create the table

Supabase → **SQL Editor** → **New query** → paste all of [`supabase/migrations/0003_transactions.sql`](../supabase/migrations/0003_transactions.sql) → **Run**.

## 2. What each transaction stores

| Field | Meaning |
|---|---|
| Money spent / Money back | Money back = refund or cashback. It **reduces** its category's total |
| Amount, Date, Description | Description is usually the merchant, e.g. "Swiggy" |
| Card / account | Which card or account. "Cash / UPI / other" if none |
| Paid by | Who the money came from. Picking a card fills in its owner (you, for both cards) |
| Category | Suggested automatically from the description using the category's keywords (e.g. "swiggy" → Food delivery) |
| Split | **Use the category's split** (default; food delivery's monthly limit applies), or untick to set a different split **for this one transaction** |
| Status | **Confirmed** = counted. **Needs review** = waits in the Inbox. **Ignored** = never counted (card bill payments, duplicates) |

## 3. Try it

**Transactions** page:
1. **Add** → "Swiggy", ₹450, food card → the category fills in as Food delivery → Save.
2. Add one with **Leave in the inbox to review later** ticked.
3. Add a **Money back** of ₹100 → it shows in green, and the "Money back" total goes up.
4. Use **‹ ›** to switch months, and the filters for category and who paid.
5. Tap any transaction to edit it, change its status, or delete it (tap Delete twice).

**Inbox** page:
- The transaction you left for review shows here. Pick or check the category → **Confirm** (it's counted) or **Ignore** (it's not). The pencil opens the full editor.
- For **money back**, Confirm reduces the category total and Ignore leaves totals alone. That's the "ask us whether to reduce" rule from your requirements.

Both of you see and can edit the same transactions.

## Notes

- The month view uses the **calendar month** (1st–end). The billed vs not-yet-billed split comes in step 8.
- The inbox is mostly for step 7. Bank emails will arrive there as "Needs review".
- A category or card used by transactions can't be deleted. Untick **Active** instead, and it stops appearing in pickers.
