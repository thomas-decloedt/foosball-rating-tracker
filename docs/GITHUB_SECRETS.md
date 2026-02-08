# GitHub Secrets Configuration

This document lists all required GitHub secrets for CI/CD workflows.

## Required Secrets

### Database

- **`DATABASE_URL`**: PostgreSQL connection string for production database
  - Format: `postgresql://user:password@host:port/database?sslmode=require`
  - Used by: `deploy-workers.yml`, `deploy-pages.yml` (for migrations)
  - Set in: GitHub repository settings → Secrets and variables → Actions

### Cloudflare

- **`CLOUDFLARE_API_TOKEN`**: Cloudflare API token with deployment permissions
  - Create at: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
  - Required permissions:
    - Account: Cloudflare Pages: Edit
    - Account: Workers Scripts: Edit
  - Used by: `deploy-workers.yml`, `deploy-pages.yml`
  - Set in: GitHub repository settings → Secrets and variables → Actions

- **`CLOUDFLARE_ACCOUNT_ID`**: Your Cloudflare account ID
  - Find at: Cloudflare Dashboard → Right sidebar
  - Used by: `deploy-workers.yml`, `deploy-pages.yml`
  - Set in: GitHub repository settings → Secrets and variables → Actions

## Setting Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret with the exact name listed above
5. Save the secret

## Verification

After setting secrets, workflows will:

- ✅ Run database migrations automatically on deploy
- ✅ Deploy to Cloudflare Workers/Pages
- ⚠️ Skip migrations if `DATABASE_URL` is not set (with warning)

## Troubleshooting

### "required flag 'url' not set"

- **Cause**: `DATABASE_URL` secret is not set or is empty
- **Fix**: Add `DATABASE_URL` secret in GitHub repository settings

### "CLOUDFLARE_API_TOKEN environment variable required"

- **Cause**: `CLOUDFLARE_API_TOKEN` secret is not set
- **Fix**: Add `CLOUDFLARE_API_TOKEN` secret in GitHub repository settings

### Migrations skipped

- **Cause**: `DATABASE_URL` secret is not set
- **Fix**: Add `DATABASE_URL` secret to enable automatic migrations
