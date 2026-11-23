# Akei Payday II
Folders: `backend/` (Railway), `frontend/` (Netlify), `extension/` (Chrome). Prices are simulated by the backend every 5 s (shared by all players, saved in PostgreSQL, continues with nobody online). Tables are created automatically on first start (no manual migration).

## 1. Backend + database on Railway
1. Put the whole project on GitHub.
2. railway.app → New Project → **Deploy from GitHub repo** → set **Root Directory** to `backend`. Start command is `npm start` (automatic).
3. In the same project: **New → Database → PostgreSQL**.
4. Open your backend service → **Variables** and add:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `JWT_SECRET` = a long random string (generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   - `CORS_ORIGINS` = `https://YOUR-SITE.netlify.app,chrome-extension://YOUR_EXTENSION_ID` (comma separated; leave empty while testing to allow all)
5. Service → **Settings → Networking → Generate Domain**. Visit `https://YOUR-DOMAIN/health` – you should see `{"ok":1}`.

## 2. Website on Netlify
1. Edit `frontend/config.js`: `window.API_URL="https://YOUR-DOMAIN.up.railway.app";`
2. Netlify → Add new site → **Deploy manually** → drag the `frontend` folder in (or connect Git: base directory `frontend`, no build command, publish directory `frontend`).
3. Put the Netlify URL into `CORS_ORIGINS` on Railway.

## 3. Chrome extension
1. Edit `extension/config.js` with the same API URL. If your Railway domain doesn't end in `.up.railway.app`, add it to `host_permissions` in `manifest.json`.
2. Open `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → choose the `extension` folder. Copy the extension ID shown and add `chrome-extension://ID` to `CORS_ORIGINS`.
3. Publishing: zip the *contents* of `extension/`, create a developer account at chrome.google.com/webstore/devconsole (one-time $5 fee), upload the zip, add description/screenshots/privacy policy, submit for review.

## Local test
`cd backend && npm install && JWT_SECRET=change-me-please-1234 DATABASE_URL=postgres://user:pass@localhost/stocks npm start`, then open `frontend/index.html`.

## Notes
- Website login lives in sessionStorage (new tab = login again). Extension login lives in `chrome.storage.local` (survives restart; Logout clears it).
- Frontend and extension share the same code; after editing `frontend/app.js` or `style.css`, copy them into `extension/`.
- Virtual money only; not an investment platform.

## UPDATE: Supabase database
1. supabase.com → New project (save the database password).
2. Project → **Connect** → copy the **Session pooler** URI (works from Railway; the direct one is IPv6-only). Replace `[YOUR-PASSWORD]` with your password.
3. Railway → backend service → Variables → set `DATABASE_URL` to that URI (replaces the Railway Postgres reference; you can delete the Railway database). Redeploy. Tables are created automatically, with Row Level Security enabled so the public Supabase API can't read them.
4. Your old Railway accounts do not move over; everyone starts fresh on Supabase.

## Admin (username **Akei**)
- **Create the account "Akei" before anyone else does** — whoever registers that name is the admin (change it with the `ADMIN_USERNAME` variable).
- Stock page → "Admin" box: × multiply, ÷ divide, + add, − subtract, Set price. Applies instantly to every player.
- Leaderboard → click a player: set / add / take away money, Ban / Unban. Banned players are logged out and can't log in.
- Akei shows a 👑 with animated sparkles on the leaderboard. All admin checks happen on the server.

## Netlify
Deploy the `frontend` folder (drag-and-drop or Git, publish dir `frontend`; `netlify.toml` included). Tab title is "Google Docs" with a blue document icon. The address (URL) still shows in history, so pick a Netlify site name under Site configuration → Change site name.
