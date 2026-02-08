# Cloudflare Deployment Checklist

## Pre-Deployment Setup (One-time)

### 1. Cloudflare Account Setup

- [ ] Create Cloudflare account at https://dash.cloudflare.com
- [ ] Run `pnpm wrangler login` to authenticate

### 2. Database Setup (Neon)

- [ ] Create Neon database at https://console.neon.tech (free tier)
- [ ] Copy connection string
- [ ] Apply existing migrations to Neon database

### 3. Cloudflare Resources

- [ ] Create Hyperdrive: `pnpm wrangler hyperdrive create foosball-db --connection-string="postgresql://..."`
- [ ] Update `wrangler.toml` with Hyperdrive ID
- [ ] Create KV namespace: `pnpm wrangler kv:namespace create SESSIONS_KV`
- [ ] Update `wrangler.toml` with KV namespace ID
- [ ] Generate session secret: `openssl rand -base64 32`
- [ ] Set secret: `pnpm wrangler secret put SESSION_SECRET`

### 4. GitHub Setup

- [ ] Go to GitHub repo → Settings → Secrets and variables → Actions
- [ ] Add `CLOUDFLARE_API_TOKEN` (from https://dash.cloudflare.com/profile/api-tokens)
- [ ] Add `CLOUDFLARE_ACCOUNT_ID` (from Cloudflare dashboard URL)

## Deploy

```bash
git add .
git commit -m "Migrate to Cloudflare"
git push origin main
```

GitHub Actions will auto-deploy both Workers and Pages!

## Post-Deployment

- [ ] Visit Workers URL: `https://foosball-elo-tracker-api.{your-subdomain}.workers.dev/api/v1/health`
- [ ] Visit Pages URL: `https://foosball-elo-tracker.pages.dev`
- [ ] Register first admin account
- [ ] Test creating a match
- [ ] Test all user flows

## Verification Commands

```bash
# Check Workers deployment
pnpm wrangler deployments list

# Tail Workers logs
pnpm wrangler tail

# Check KV sessions
pnpm wrangler kv:key list --binding=SESSIONS_KV

# Check Hyperdrive config
pnpm wrangler hyperdrive get foosball-db
```

## Quick Reference

**Local development:**

```bash
pnpm dev:api    # Start Workers dev server
pnpm dev:client # Start Vite dev server
```

**Manual deployment:**

```bash
pnpm deploy:workers # Deploy Workers
pnpm deploy:pages   # Deploy Pages
```

**Database migrations:**

- Use existing Drizzle migrations from `drizzle/` directory
- Apply to Neon database using standard Drizzle commands

## Troubleshooting

**"Error: No such binding"**

- Make sure wrangler.toml has the correct IDs filled in

**"Database connection failed"**

- Check Hyperdrive configuration: `pnpm wrangler hyperdrive get foosball-db`
- Verify Neon database is accessible

**"Session not persisting"**

- Check KV namespace is created and ID is in wrangler.toml
- Verify SESSION_SECRET is set: `pnpm wrangler secret list`

**TypeScript errors in old code**

- Ignore errors from `src/backend/api/`, `src/backend/endpoints/`, `api/` - these will be deleted after confirming new code works
