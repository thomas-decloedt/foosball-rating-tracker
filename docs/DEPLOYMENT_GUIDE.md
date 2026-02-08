# Deployment Guide

Complete guide for deploying Foosball ELO Tracker to Cloudflare Workers + Pages.

## Overview

This app deploys to:

- **Cloudflare Workers**: Backend API (`src/backend/`)
- **Cloudflare Pages**: Frontend React app (`src/frontend/`)
- **Neon PostgreSQL**: Database (via Hyperdrive)
- **Cloudflare KV**: Session storage

## Prerequisites

1. Cloudflare account (free tier works)
2. Neon PostgreSQL database (free tier works)
3. GitHub repository with workflows enabled

## Step 1: Initial Cloudflare Setup

### 1.1 Authenticate Wrangler

```bash
pnpm wrangler login
```

This opens your browser to authenticate with Cloudflare.

### 1.2 Create Hyperdrive (Database Connection)

```bash
# Get your Neon connection string from https://console.neon.tech
# Format: postgresql://user:password@host/database?sslmode=require

pnpm wrangler hyperdrive create foosball-db \
  --connection-string="postgresql://user:password@host/database?sslmode=require"
```

This will output a Hyperdrive ID. Update `wrangler.toml`:

```toml
[[hyperdrive]]
binding = "HYPERDRIVE"
id = "YOUR_HYPERDRIVE_ID_HERE"  # Replace with the ID from above
```

### 1.3 Create KV Namespace (Sessions)

```bash
pnpm wrangler kv:namespace create SESSIONS_KV
```

This will output a namespace ID. Update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "SESSIONS_KV"
id = "YOUR_KV_NAMESPACE_ID_HERE"  # Replace with the ID from above
```

### 1.4 Set Secrets

```bash
# Generate a secure session secret
openssl rand -base64 32

# Set the secret in Cloudflare
pnpm wrangler secret put SESSION_SECRET
# Paste your generated secret when prompted

# Set Resend API key (for email invites)
pnpm wrangler secret put RESEND_API_KEY
# Get key from https://resend.com/api-keys
```

### 1.5 Update Environment Variables

Edit `wrangler.toml`:

```toml
[vars]
ENVIRONMENT = "production"
SESSION_TTL = "604800"  # 7 days
INVITE_BASE_URL = "https://foosball-elo-tracker.pages.dev"  # Your actual Pages URL
```

## Step 2: Database Setup

### 2.1 Create Neon Database

1. Go to [Neon Console](https://console.neon.tech/)
2. Create a new project
3. Copy the connection string

### 2.2 Apply Migrations

**Option A: Via GitHub Actions (Recommended)**

1. Set `DATABASE_URL` secret in GitHub (see Step 3)
2. Push to main - migrations run automatically

**Option B: Manual**

```bash
# Set DATABASE_URL environment variable
export DATABASE_URL="postgresql://user:password@host/database?sslmode=require"

# Apply migrations
pnpm db:migrate:prod
```

### 2.3 Create First Admin User

```bash
# Set DATABASE_URL
export DATABASE_URL="postgresql://user:password@host/database?sslmode=require"

# Create admin
pnpm create-admin-cloudflare admin@example.com password123 "Admin Name" "Admin"
```

Or use the SQL script in `scripts/create-admin.sql`.

## Step 3: GitHub Secrets Setup

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**

Add these secrets:

1. **`DATABASE_URL`**
   - Your Neon PostgreSQL connection string
   - Format: `postgresql://user:password@host/database?sslmode=require`
   - Used for running migrations in CI/CD

2. **`CLOUDFLARE_API_TOKEN`**
   - Create at: https://dash.cloudflare.com/profile/api-tokens
   - Click "Create Token"
   - Use "Edit Cloudflare Workers" template
   - Add permissions:
     - Account: Cloudflare Pages: Edit
     - Account: Workers Scripts: Edit
   - Copy the token and add as secret

3. **`CLOUDFLARE_ACCOUNT_ID`**
   - Find in Cloudflare Dashboard → Right sidebar
   - Or in the URL: `https://dash.cloudflare.com/ACCOUNT_ID/...`
   - Add as secret

## Step 4: Deploy

### Automatic Deployment (Recommended)

Just push to `main` branch:

```bash
git add .
git commit -m "Deploy to Cloudflare"
git push origin main
```

GitHub Actions will automatically:

1. Run database migrations (if `DATABASE_URL` is set)
2. Deploy Workers API (on backend changes)
3. Deploy Pages frontend (on frontend changes)

### Manual Deployment

```bash
# Deploy Workers API
pnpm deploy:workers

# Build and deploy Pages
pnpm build:client
pnpm deploy:pages
```

## Step 5: Verify Deployment

### Check Workers

```bash
# List deployments
pnpm wrangler deployments list

# Tail logs
pnpm wrangler tail

# Test API
curl https://foosball-elo-tracker-api.YOUR_SUBDOMAIN.workers.dev/api/v1/health
```

### Check Pages

Visit: `https://foosball-elo-tracker.pages.dev`

### Verify Database

```bash
# Check Hyperdrive
pnpm wrangler hyperdrive get foosball-db

# Check migrations applied
pnpm atlas:status --env deployed
```

## Step 6: Post-Deployment

1. **Create Admin User** (if not done already)

   ```bash
   pnpm create-admin-cloudflare admin@example.com password "Admin" "Admin"
   ```

2. **Test the App**
   - Visit your Pages URL
   - Log in with admin credentials
   - Test creating a match
   - Test sending an invite

3. **Configure Resend Domain** (for production emails)
   - Go to [Resend Dashboard](https://resend.com/domains)
   - Add and verify your domain
   - Update email "from" address in `src/backend/utils/email.ts`

## Environment Variables Reference

### Cloudflare Workers (via wrangler.toml)

| Variable          | Description               | Set Via                |
| ----------------- | ------------------------- | ---------------------- |
| `ENVIRONMENT`     | Environment name          | `wrangler.toml` [vars] |
| `SESSION_TTL`     | Session TTL in seconds    | `wrangler.toml` [vars] |
| `INVITE_BASE_URL` | Base URL for invite links | `wrangler.toml` [vars] |
| `SESSION_SECRET`  | Session encryption secret | `wrangler secret put`  |
| `RESEND_API_KEY`  | Resend API key for emails | `wrangler secret put`  |

### GitHub Actions Secrets

| Secret                  | Description                | Used By    |
| ----------------------- | -------------------------- | ---------- |
| `DATABASE_URL`          | Neon PostgreSQL connection | Migrations |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare API token       | Deployment |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID      | Deployment |

## Troubleshooting

### "required flag 'url' not set"

- **Cause**: `DATABASE_URL` secret is not set in GitHub
- **Fix**: Add `DATABASE_URL` secret in GitHub repository settings

### "CLOUDFLARE_API_TOKEN environment variable required"

- **Cause**: `CLOUDFLARE_API_TOKEN` secret is not set
- **Fix**: Add `CLOUDFLARE_API_TOKEN` secret in GitHub repository settings

### "No such binding"

- **Cause**: Hyperdrive or KV namespace IDs are incorrect in `wrangler.toml`
- **Fix**: Verify IDs match what was created with `wrangler hyperdrive list` and `wrangler kv:namespace list`

### Database connection fails

- **Cause**: Hyperdrive configuration issue
- **Fix**:
  ```bash
  pnpm wrangler hyperdrive get foosball-db
  # Verify connection string is correct
  ```

### Migrations not running

- **Cause**: `DATABASE_URL` secret is not set or empty
- **Fix**: Add `DATABASE_URL` secret in GitHub, then re-run workflow

### Email invites not sending

- **Cause**: `RESEND_API_KEY` not set or invalid
- **Fix**:
  ```bash
  pnpm wrangler secret put RESEND_API_KEY
  # Get key from https://resend.com/api-keys
  ```

## Quick Commands

```bash
# Local development
pnpm dev              # Start both API and frontend
pnpm dev:api          # Start Workers API only
pnpm dev:client       # Start frontend only

# Database
pnpm db:generate      # Generate migration from schema changes
pnpm db:migrate       # Apply migrations locally
pnpm db:migrate:prod  # Apply migrations to production

# Deployment
pnpm deploy:workers   # Deploy Workers API manually
pnpm deploy:pages     # Deploy Pages manually

# Verification
pnpm wrangler tail    # Watch Workers logs
pnpm atlas:status     # Check migration status
```

## Deployment Workflows

The repository has two GitHub Actions workflows:

1. **`deploy-workers.yml`**: Deploys Workers API
   - Triggers on: `src/backend/**`, `wrangler.toml`, `package.json` changes
   - Runs migrations if `DATABASE_URL` is set
   - Deploys Workers

2. **`deploy-pages.yml`**: Deploys Pages frontend
   - Triggers on: `src/frontend/**`, `package.json` changes
   - Runs migrations if `DATABASE_URL` is set
   - Builds and deploys Pages

Both workflows run automatically on push to `main` branch.
