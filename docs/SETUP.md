# Step 0 — Setup

Done when `pnpm dev` opens the Chanda placeholder page at http://localhost:5173.

Parts A–D are one-time. Go in order: part C needs a value from part B, and part B needs values from part C.

---

## A. Install Node 20 and pnpm

This Mac doesn't have Node yet. Chanda uses the same Node version as Munshi (`.nvmrc` = 20).

1. Install nvm (Node Version Manager):
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
   ```
2. Close the terminal and open a new one.
3. From the Chanda folder, install the Node version in `.nvmrc`:
   ```bash
   cd ~/Desktop/Projects/Chanda && nvm install && nvm use
   ```
4. Turn on pnpm (it ships with Node through corepack):
   ```bash
   corepack enable pnpm
   ```
5. Check: `node -v` shows `v20.19` or newer (Vite 8 needs at least 20.19), and `pnpm -v` prints a version.

> Node 20 stopped receiving updates in April 2026. It's fine for local work. We can move both Munshi and Chanda to Node 22 together later.

---

## B. Create the Supabase project

1. Go to https://supabase.com/dashboard → **New project**.
   - Name: `chanda` (keep it separate from Munshi)
   - Region: **South Asia (Mumbai)**
   - Database password: generate a strong one and save it in your password manager. The app doesn't need it.
2. When the project is ready, click **Connect** (or open **Project Settings → API Keys**) and copy:
   - the **Project URL**, like `https://abcd1234.supabase.co`
   - the **publishable key**, starting `sb_publishable_…` (the old name is "anon key")

   Both are safe to use in the browser. **Never** copy the `service_role` / secret key into the frontend.
3. **Authentication → Sign In / Providers**
   - **Email**: turn it **off**. Chanda only uses Google.
   - **Google**: open it and copy the **Callback URL** shown there (like `https://abcd1234.supabase.co/auth/v1/callback`). You'll need it in part C. Leave this panel open.
   - Keep **Allow new users to sign up** **on**. Each of you is "signed up" the first time you log in with Google. In step 1 we add a database rule that rejects every email except your two, so other Google accounts are blocked.
4. **Authentication → URL Configuration**
   - Site URL: `http://localhost:5173`
   - Redirect URLs: add `http://localhost:5173/**`

---

## C. Create the Google sign-in key

1. Go to https://console.cloud.google.com → project picker → **New project** → name it `Chanda`.
2. Open **Google Auth Platform** (search for "OAuth consent screen" if you can't find it) → **Get started**:
   - App name: `Chanda`; support email: yours
   - Audience: **External**
   - Contact email: yours → Create
3. **Audience → Test users → Add users**: add **your Google email and hers**.
   Leave the app in **Testing** mode. Then only these two Google accounts can sign in at all, which is a second lock on top of the database rule from step 1.
4. **Clients → Create client**
   - Application type: **Web application**, name `Chanda web`
   - Authorized JavaScript origins: `http://localhost:5173`
   - Authorized redirect URIs: the **Supabase Callback URL** from B.3
   - Create, then copy the **Client ID** and **Client secret**.
5. Back in Supabase (**Authentication → Sign In / Providers → Google**): paste the Client ID and Client secret, turn the provider **on**, and Save.

> Chanda only asks Google for your name and email when you sign in, not for Gmail access. Reading the bank emails (step 7) is done separately by a script inside your own Gmail.

---

## D. Connect the app and run it

1. Create your local env file (git ignores it):
   ```bash
   cp .env.example .env.local
   ```
2. Open `.env.local` and fill in the two values from B.2:
   ```
   VITE_SUPABASE_URL=https://abcd1234.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_...
   ```
3. Install and run:
   ```bash
   pnpm install
   ```
   ```bash
   pnpm dev
   ```
4. Open http://localhost:5173. You should see the Chanda logo with the line "Setup works. Sign-in comes next."

The page doesn't talk to Supabase yet. Step 1 is where sign-in gets tested end to end.

---

## Checklist before step 1

- [ ] `node -v` ≥ 20.19 and `pnpm -v` works
- [ ] Supabase project `chanda` created, email login off, Google login on
- [ ] Google client created, both of you added as test users
- [ ] `.env.local` filled in
- [ ] `pnpm dev` shows the placeholder page
- [ ] Have both Google emails ready. Step 1 puts them in the allowed list through a seed file that stays out of git.
