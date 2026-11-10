# Step 1 — Sign-in

Done when you can both sign in with Google, and any other Google account is turned away.

## 1. Create the members list in Supabase

1. Supabase → **SQL Editor** → **New query**.
2. Paste the whole of [`supabase/migrations/0001_members_allowlist.sql`](../supabase/migrations/0001_members_allowlist.sql) → **Run**.
   You should see "Success. No rows returned".
3. New query. Paste this with **your real details**, then **Run**:
   ```sql
   insert into public.members (email, display_name) values
     ('your-google-email@gmail.com', 'Your name'),
     ('her-google-email@gmail.com',  'Her name');
   ```
   - Emails must be **lowercase** and must be the Google accounts you'll sign in with.
   - Don't save the real emails in the repo. Just run the query.
4. Check: **Table Editor → members** shows two rows with `user_id` empty.

## 2. Test it

Run `npm run dev` and open http://localhost:5173.

| Test | Expected |
|---|---|
| You click **Continue with Google** and pick your account | You land on **Month**. The sidebar (desktop) says "Signed in as <your name>" |
| Same on her phone or browser, with her account | She lands on **Month** too |
| Any other Google account | Google stops it first (it isn't a test user). If it somehow gets through, Chanda shows "This Google account isn't allowed to use Chanda" |
| Tap through Month, Inbox, Transactions, Trips, Settings | Each shows a "Coming in step N" card |
| Narrow the browser or open on a phone | Bottom tab bar instead of the sidebar |
| Sign out | Back to the sign-in page |

After both of you sign in, **Table Editor → members** shows a `user_id` filled in on both rows.

## Testing on her phone before Chanda is deployed

`localhost` only works on your Mac. Until step 9, she can test from your Mac's browser with her Google account (sign out of yours first), or you can test in a private window.

## If something goes wrong

- **"This Google account isn't allowed…" for one of you:** the email in `members` doesn't exactly match the Google account (check spelling and capitals). Fix it in Table Editor and try again.
- **Google says "Access blocked: Chanda has not completed verification":** that account isn't in Google Auth Platform → Audience → Test users.
- **Signed in but stuck on "isn't on Chanda's members list":** you signed in before running part 1. Run part 1, then go to Supabase → **Authentication → Users**, delete that user, and sign in again.
