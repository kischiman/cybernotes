# Cybernotes

A personal note-taking and sense-making app for tracking a Vision, Projects, Protocols, Entries, Photos, To-dos, and People over time.

## Local Development

```bash
npm install
npm run db:apply:local
npm run dev
```

The app runs as a single Cloudflare Worker plus React SPA through the Cloudflare Vite plugin. Local development uses `.dev.vars`; the checked-in `.dev.vars.example` includes `DEV_AUTH_BYPASS="true"` so the app can run before Google OAuth is configured.

## Production Setup

Create the Cloudflare resources:

```bash
npx wrangler d1 create cybernotes
npx wrangler kv namespace create SESSIONS
npx wrangler r2 bucket create cybernotes-photos
```

Paste the returned D1 and KV IDs into `wrangler.toml`, replacing the placeholder IDs.

Configure secrets:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put ALLOWED_EMAIL
npx wrangler secret put SESSION_SECRET
npx wrangler secret put GEMINI_API_KEY
```

Set your Google OAuth redirect URI to:

```text
https://<your-worker>.workers.dev/auth/callback
```

Apply the schema remotely and deploy:

```bash
npm run db:apply:remote
npm run deploy
```

## Notes

- `schema.sql` corrects the implementation guide typo by making `entries.protocol_id` reference `protocols(id)`.
- `photos` stores both `r2_key` and `r2_url` so delete operations can remove the R2 object reliably.
- When `R2_PUBLIC_BASE_URL` is unset, photo URLs use the protected `/api/photos/:id/file` route, which is useful locally and keeps photos private by default.
