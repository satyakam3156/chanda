# Step 2 — Settings

Done when your real setup (cards, food limit, rent, maintenance) is saved in Chanda.

## 1. Create the tables

Supabase → **SQL Editor** → **New query** → paste all of [`supabase/migrations/0002_settings.sql`](../supabase/migrations/0002_settings.sql) → **Run**.

This creates `accounts`, `categories` and `fixed_costs` with security rules (only the two of you can read or change them). It also adds five starting categories, all 50/50: Food delivery, Travel, EMI, Shared – other, Personal.

## 2. Fill in Settings

Open http://localhost:5173/settings and go through each section.

### The two of you
Change display names if needed.

### Cards and accounts → **Add**, three times
| Field | Axis card | ICICI card | HDFC savings |
|---|---|---|---|
| Type | Credit card | Credit card | Bank account |
| Bank | Axis | ICICI | HDFC |
| Last 4 digits | from the card | from the card | from the account |
| In whose name | you | you | you |
| Statement date | 17 | 17 | — |
| Due date | your due day | your due day | — |
| Used for | e.g. "Swiggy, Blinkit, Zepto" | e.g. "EMIs" | e.g. "Rent, transfers" |

### Categories
- **Food delivery** → *Who bears it (up to the limit)*: **Only <her name>** → tick **Monthly limit** → enter the limit → *Above the limit*: **50/50** (or your agreed split).
- **Travel / EMI / Shared – other:** check that 50/50 is right.
- **Personal:** "Whoever paid". Use it for personal buys on a shared card.
- Add, rename or deactivate categories as you like.

### Fixed shared costs → **Add**
- **Rent:** amount · *Who pays it*: you · *Who bears it*: 50/50 · *Repeats*: every month · *First due month*: this month.
- **Maintenance:** amount · *Who pays it*: her · *Who bears it*: 50/50 · *Repeats*: every 3 months · *First due month*: the next month it's due.
  The row then shows "next <month>". Check that it's right.

## 3. Check

- Everything you saved is still there after a page reload.
- Her account sees the same settings.
- Delete asks for a second tap before anything is removed.

## Split options, explained

| Option | Meaning |
|---|---|
| 50/50 | Each bears half |
| Only <name> | That person bears all of it, whoever paid |
| Whoever paid | The payer bears all of it (personal spending) |
| Custom % | One person bears X%, the other the rest |

**Monthly limit:** spending in that category up to the limit uses the first split. Only the amount **above** the limit uses the second split. The month's balance (step 4) applies this.
