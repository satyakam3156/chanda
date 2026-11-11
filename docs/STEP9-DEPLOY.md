# Step 9 — Put Chanda online (Vercel)

Done when you both can open Chanda on your phones at a `https://….vercel.app` address and sign in with Google.

```
GitHub (private repo) ──push──► Vercel builds `npm run build` ──► https://chanda-….vercel.app
                                                              │
                                     Supabase (unchanged) ◄───┘  sign-in returns to the Vercel address
```

Every push to `main` redeploys automatically. The database, Gmail scripts and SQL don't change.

## 1. Private GitHub repo

1. https://github.com/new
   - **Repository name:** `chanda`
   - **Private**
   - Leave **Add a README**, **.gitignore** and **license** all off. The repo must be empty.
   - **Create repository**.
2. Push the code. In this folder:

   ```bash
   git remote add origin https://github.com/<your-username>/chanda.git
   git push -u origin main
   ```

   If git asks for a password, use a GitHub **personal access token** (GitHub → Settings → Developer settings → Fine-grained tokens, access to the `chanda` repo, *Contents: Read and write*), or sign in through the browser window git opens.

What goes up: the code, SQL migrations, Gmail script and docs. **Not** `.env` (your keys) or `mail samples/`: both are in `.gitignore`.

## 2. Vercel

1. https://vercel.com/signup → **Continue with GitHub** (Hobby plan, free).
2. **Add New… → Project** → **Import** `chanda`. If it isn't listed: **Adjust GitHub App Permissions** → give Vercel access to the `chanda` repo only.
3. **Configure Project:**
   - Framework Preset: **Vite** (picked up from `vercel.json`).
   - **Environment Variables:** add both, with the same values as in your `.env`:

     | Name | Value |
     |---|---|
     | `VITE_SUPABASE_URL` | `https://<project>.supabase.co` |
     | `VITE_SUPABASE_ANON_KEY` | your publishable key (`sb_publishable_…`) |

     Both are safe in the browser by design: what anyone can do is limited by the database's row level security, which only lets the two of you in.
4. **Deploy**. After about a minute you get the address, e.g. `https://chanda-abc123.vercel.app`. Copy it.

Optional: **Project → Settings → Domains** lets you pick a nicer `….vercel.app` name if it's free. Change it **before** part 3, or repeat part 3 with the new address.

## 3. Supabase: allow sign-in to return to the new address

Supabase → **Authentication → URL Configuration**:

- **Site URL:** your Vercel address, e.g. `https://chanda-abc123.vercel.app`
- **Redirect URLs → Add URL:**
  - `https://chanda-abc123.vercel.app/**`
  - keep `http://localhost:5173/**` so the local version keeps working.

**Google Cloud needs no change.** Google sends you back to Supabase, and Supabase sends you on to Chanda.

## 4. Check it

1. Open the Vercel address on your phone → **Continue with Google** → you land on the Month page.
2. Nivedita does the same with her Google account.
3. **Add to Home Screen** (Safari: Share → Add to Home Screen; Chrome: ⋮ → Add to Home screen) to open it like an app.

## Updating later

`git push` → Vercel rebuilds and the site updates within a minute or two. Each deploy is listed under the project's **Deployments**, where you can **Promote** an older one if something breaks.

## If something goes wrong

| Symptom | Fix |
|---|---|
| Blank page, console says the Supabase URL is missing | Environment variables weren't set before deploying. Add them → **Deployments** → ⋯ → **Redeploy** |
| After Google sign-in you land on `localhost` | Part 3: the Vercel address isn't in Site URL / Redirect URLs |
| "This Google account isn't allowed to use Chanda." | Signed in with a Google account that isn't in the members list |
| Refreshing `/inbox` shows 404 | `vercel.json` is missing from the repo (it sends every path to the app) |
