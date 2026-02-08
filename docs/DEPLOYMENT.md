# Deployment Guide

This guide will help you deploy the Foosball ELO Tracker to Vercel with Neon PostgreSQL.

## Prerequisites

1. GitHub account with the repository pushed
2. Vercel account (free tier works)
3. Neon account (free tier works)

## Step 1: Set up Neon PostgreSQL Database

1. Go to [Neon Console](https://console.neon.tech/)
2. Sign up or log in
3. Create a new project
4. Copy the connection string (it will look like: `postgresql://user:password@host/database?sslmode=require`)
5. Keep this connection string handy for Step 3

## Step 2: Set up Upstash Redis (for sessions)

Since Vercel serverless functions need a Redis-compatible service:

1. Go to [Upstash Console](https://console.upstash.com/)
2. Sign up or log in
3. Click "Create a new database" or go to Redis → Create database
4. Configure the database:
   - **Name**: `foosball-sessions` (or any name you prefer)
   - **Type**: Regional (recommended) or Global
   - **Region**: Choose the same region as your Neon database (Europe Central 1/Frankfurt) if available, or closest region
   - **Primary region**: Select your preferred region
   - **Eviction**: Enabled (recommended)
   - **TLS**: Enabled (required for production)
5. Click "Create"
6. After creation, you'll see connection details:
   - Click on your database name to view details
   - Copy the **Redis URL** (it will look like: `redis://default:password@host:port` or `rediss://default:password@host:port` for TLS)
   - The URL format is: `redis://default:YOUR_PASSWORD@YOUR_ENDPOINT:PORT`
7. Keep this URL handy for Step 3

## Step 3: Deploy to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New Project"
3. Import your GitHub repository: `thomas-decloedt/foosball-elo-tracker`
4. Configure the project:
   - **Framework Preset**: Other
   - **Root Directory**: `./` (default)
   - **Build Command**: `pnpm build:client`
   - **Output Directory**: `dist`
   - **Install Command**: `pnpm install`

5. Add Environment Variables:
   - `DATABASE_URL` - Your Neon PostgreSQL connection string
   - `REDIS_URL` - Your Upstash Redis URL (format: `rediss://default:TOKEN@ENDPOINT:6379`)
   - `SESSION_SECRET` - A random secret string (generate with: `openssl rand -base64 32`)
   - `NODE_ENV` - `production`

   **For REDIS_URL**:
   - Click on "Token" in Upstash dashboard to reveal it
   - Format: `rediss://default:YOUR_TOKEN@harmless-pheasant-40131.upstash.io:6379`
   - Note: Use `rediss://` (with double 's') for TLS, or `redis://` if TLS is disabled

6. Click "Deploy"

## Step 4: Run Database Migrations

After deployment, you need to run the database migrations:

### Option 1: Using Neon SQL Editor (Easiest)

1. In Neon dashboard, go to "SQL Editor" (left sidebar)
2. Click "New query"
3. **First, run the base migration:**
   - Copy the contents of `drizzle/0000_blushing_owl.sql`
   - Paste and run it in the SQL editor
4. **Then, add the missing columns:**
   - Copy the contents of `scripts/add-missing-columns.sql`
   - Paste and run it in the SQL editor
   - This adds `profile_image` to the `user` table and `is_friendly` to the `match` table

### Option 2: Using Command Line

1. Get your Neon connection string from Step 1
2. Locally, update your `.env` file with the production database URL:
   ```bash
   DATABASE_URL="postgresql://user:password@ep-xxx-xxx.region.aws.neon.tech/dbname?sslmode=require"
   ```
3. Run migrations:
   ```bash
   pnpm db:migrate
   ```
4. Add missing columns:
   ```bash
   psql "$DATABASE_URL" -f scripts/add-missing-columns.sql
   ```

**Important**: The `add-missing-columns.sql` script is required! Without it, you'll get 500 errors when trying to log in.

## Step 5: Create Admin User

After the database is set up, you need to create the first admin user. Registration is now **admin-only** for security.

### Option 1: Using the Script (Recommended)

1. Make sure your `.env` file has the production `DATABASE_URL`:

   ```bash
   DATABASE_URL="postgresql://neondb_owner:npg_StqLb4IJEn2h@ep-small-paper-agixngr8-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
   ```

2. Run the create-admin script:

   ```bash
   pnpm create-admin <email> <password> [name] [displayName]
   ```

   Example:

   ```bash
   pnpm create-admin admin@example.com mySecurePassword123 "Admin User" "Admin"
   ```

### Option 2: Using SQL (Neon SQL Editor)

1. Go to Neon Dashboard → SQL Editor
2. Open `scripts/create-admin.sql`
3. Replace the placeholder values:
   - `admin@example.com` → Your admin email
   - `YOUR_PASSWORD_HASH` → SHA256 hash of your password (use: https://emn178.github.io/online-tools/sha256.html)
   - `Admin User` → Your name
   - `Admin` → Display name
4. Run the SQL script

**Note**: After creating the admin, you can create additional users through the admin dashboard once logged in.

## Environment Variables Reference

| Variable         | Description                       | Example                                          |
| ---------------- | --------------------------------- | ------------------------------------------------ |
| `DATABASE_URL`   | Neon PostgreSQL connection string | `postgresql://user:pass@host/db?sslmode=require` |
| `REDIS_URL`      | Upstash Redis URL                 | `redis://default:pass@host:port`                 |
| `SESSION_SECRET` | Secret for session encryption     | Random 32+ character string                      |
| `NODE_ENV`       | Environment mode                  | `production`                                     |

## Troubleshooting

### API routes not working

- Check that `api/vercel.ts` is in the root directory
- Verify environment variables are set in Vercel dashboard
- Check Vercel function logs for errors

### Database connection issues

- Verify `DATABASE_URL` is correct and includes `?sslmode=require`
- Check that Neon database is accessible (not paused)
- Ensure migrations have been run

### Redis connection issues

- Verify `REDIS_URL` is correct
- Check Upstash dashboard to ensure database is active
- For production, consider using Upstash's REST API if WebSocket connections fail

## Notes

- The free tier of Vercel has some limitations (function execution time, bandwidth)
- Neon free tier includes 0.5GB storage and should be sufficient for initial use
- Upstash free tier includes 10,000 commands/day
- Consider upgrading if you need more resources
