# Cloudflare Deployment Guide

## Overview

This app is deployed on Cloudflare's free tier using:

- **Cloudflare Workers** - Backend API (Hono framework)
- **Cloudflare Pages** - Frontend (React SPA)
- **Cloudflare Hyperdrive** - PostgreSQL connection pooling (FREE!)
- **Cloudflare KV** - Session storage
- **Cloudflare R2** - Profile image storage (FREE!)
- **Neon PostgreSQL** - Database (free tier)

**Total cost: $0/month** (everything on free tiers)

## Prerequisites

1. Cloudflare account (free)
2. Neon PostgreSQL database (free tier)
3. GitHub account (for CI/CD)

## Initial Setup

### 1. Install Wrangler CLI

```bash
# Already installed via package.json
pnpm install

# Login to Cloudflare
pnpm wrangler login
```

### 2. Get Neon Connection String

1. Go to https://console.neon.tech
2. Create a new project (or use existing)
3. Copy the connection string (looks like: `postgresql://user:pass@host/dbname`)
4. Keep this handy for next step

### 3. Create Cloudflare Resources

```bash
# Create Hyperdrive configuration (paste your Neon connection string when prompted)
pnpm wrangler hyperdrive create foosball-db --connection-string="postgresql://YOUR_NEON_CONNECTION_STRING"

# Copy the Hyperdrive ID from the output
# Update wrangler.toml: replace the empty id in [[hyperdrive]] section

# Create KV namespace for sessions
pnpm wrangler kv:namespace create SESSIONS_KV

# Copy the KV namespace ID from the output
# Update wrangler.toml: replace the empty id in [[kv_namespaces]] section

# Create R2 bucket for profile images
pnpm wrangler r2 bucket create foosball-profile-images

# R2 bucket binding is already configured in wrangler.toml
# The bucket will be automatically bound when deploying
# 
# IMPORTANT: The bucket must exist before deploying the Worker
# If the bucket doesn't exist, the Worker will fail to start
# 
# To verify the bucket exists:
pnpm wrangler r2 bucket list

# To check if bucket is accessible:
pnpm wrangler r2 object list foosball-profile-images
```

### 4. Set Secrets

```bash
# Generate a strong session secret (32+ characters)
openssl rand -base64 32

# Set the secret in Cloudflare
pnpm wrangler secret put SESSION_SECRET
# Paste the generated secret when prompted
```

### 5. Apply Database Migrations

```bash
# Your existing Drizzle migrations from drizzle/ directory
# Apply them to your Neon database using regular Drizzle commands
# (This uses your Neon connection string from .env or DATABASE_URL)
```

## GitHub Actions Setup

### 1. Get Cloudflare Credentials

**API Token:**

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click "Create Token"
3. Use template "Edit Cloudflare Workers" or create custom token with:
   - Workers Scripts:Edit
   - Pages:Edit
   - Account Settings:Read
4. Copy the token

**Account ID:**

1. Go to https://dash.cloudflare.com
2. Your Account ID is in the URL: `https://dash.cloudflare.com/{ACCOUNT_ID}/`
3. Copy it

### 2. Add GitHub Secrets

Go to your GitHub repo → Settings → Secrets and variables → Actions

Add these secrets:

- `CLOUDFLARE_API_TOKEN` - The API token from step 1
- `CLOUDFLARE_ACCOUNT_ID` - Your account ID

### 3. Deploy!

```bash
git add .
git commit -m "Migrate to Cloudflare"
git push origin main
```

GitHub Actions will automatically:

1. Deploy Workers API
2. Deploy Pages frontend
3. Set up preview URLs for PRs

## Local Development

### Option 1: Test with Cloudflare (Remote)

```bash
# Start Workers with remote bindings (uses your real Hyperdrive/KV)
pnpm dev:api

# In another terminal, start frontend
pnpm dev:client

# Frontend runs on http://localhost:5173
# API proxied through Vite to Wrangler
```

### Option 2: Test with Local Database

For local development without Cloudflare, you can still use the old setup temporarily:

- Keep Docker Compose for local Postgres
- Use local dev scripts

## Production URLs

After deployment, your app will be available at:

- **Workers**: `https://foosball-elo-tracker-api.{subdomain}.workers.dev`
- **Pages**: `https://foosball-elo-tracker.pages.dev`

## Custom Domain (Optional)

### Workers:

1. Go to Cloudflare Workers dashboard
2. Select your Worker
3. Go to Settings → Domains & Routes
4. Add custom domain (e.g., `api.yourdomain.com`)

### Pages:

1. Go to Cloudflare Pages dashboard
2. Select your project
3. Go to Custom domains
4. Add custom domain (e.g., `foosball.yourdomain.com`)

## Monitoring

### View Logs

```bash
# Tail Workers logs in real-time
pnpm wrangler tail

# View KV keys
pnpm wrangler kv:key list --binding=SESSIONS_KV

# Query Hyperdrive
pnpm wrangler hyperdrive get foosball-db
```

### Analytics

- Workers analytics: https://dash.cloudflare.com → Workers & Pages → your-worker → Analytics
- Pages analytics: https://dash.cloudflare.com → Workers & Pages → your-pages → Analytics

## Troubleshooting

### Workers not deploying

```bash
# Check wrangler.toml has correct IDs
cat wrangler.toml

# Deploy manually
pnpm wrangler deploy
```

### Database connection errors

```bash
# Test Hyperdrive connection
pnpm wrangler hyperdrive get foosball-db

# Check if Neon database is accessible
```

### Session issues

```bash
# List sessions in KV
pnpm wrangler kv:key list --binding=SESSIONS_KV

# Delete all sessions (force re-login)
pnpm wrangler kv:key list --binding=SESSIONS_KV | # then delete each
```

## Cost Breakdown

**Current usage (free tier limits):**

- Workers: 100,000 requests/day (way more than you need)
- Pages: Unlimited requests
- Hyperdrive: FREE (recently made free!)
- KV: 100,000 reads/day, 1,000 writes/day
- R2: 10GB storage, 1M Class A operations/month, 10M Class B operations/month for free
- Neon: 0.5GB storage, enough for small team

**Expected cost: $0/month** ✅

## R2 Profile Images Setup

Profile images are stored in Cloudflare R2 instead of the database to reduce:

- Database size (no base64 blobs)
- API response sizes (URLs instead of base64)
- CPU time (no base64 encoding/decoding)

### R2 Bucket Configuration

1. Create the bucket (already done in setup step 3):

   ```bash
   pnpm wrangler r2 bucket create foosball-profile-images
   ```

2. The bucket is automatically bound via `wrangler.toml`:

   ```toml
   [[r2_buckets]]
   binding = "PROFILE_IMAGES_R2"
   bucket_name = "foosball-profile-images"
   ```

3. Profile images are served via Worker endpoint at `/profile-images/{userId}.{ext}`
   - Images are uploaded via `POST /api/v1/auth/update-profile`
   - URLs are stored in database (not base64)
   - Backward compatible with existing base64 images

### R2 Public Access

Profile images are served through the Worker endpoint, so no public bucket policy is needed. The Worker handles authentication and CORS.

## Migration from Other Providers

To migrate away from Cloudflare later (if needed):

1. Update `src/backend/drizzle/db.ts` - change connection method
2. Update deployment config (replace wrangler.toml)
3. Business logic stays 100% identical (thanks to Drizzle ORM)

Only 2 files to change!
