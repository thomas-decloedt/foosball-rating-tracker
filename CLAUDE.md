# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Foosball Rating Tracker - A full-stack foosball rating system using OpenSkill (not ELO) deployed on Cloudflare's free tier ($0/month).

**Live App**: https://foosball-elo-tracker.pages.dev

**Stack**:

- Backend: Cloudflare Workers + Hono framework
- Frontend: React 19 + Vite + TailwindCSS 4.1
- Database: Neon PostgreSQL + Cloudflare Hyperdrive (connection pooling)
- ORM: Drizzle ORM (schema) + Atlas (migrations)
- Session: Cloudflare KV (encrypted with AES-GCM)
- Auth: Scrypt password hashing with constant-time comparison

## Development Commands

### Starting Dev Servers

```bash
pnpm dev:api      # Cloudflare Workers on port 8787 (wrangler dev)
pnpm dev:client   # Vite dev server on port 5173
pnpm dev          # Both servers (runs in parallel)
```

### Code Quality

```bash
pnpm typecheck    # TypeScript type checking (does not emit)
pnpm format       # Format with Prettier
pnpm lint         # ESLint
```

### Database Operations

**Generate migration from schema changes**:

```bash
pnpm db:generate
# Creates migration files in drizzle/ directory based on schema changes
```

**Apply migrations locally**:

```bash
pnpm db:migrate
# Applies all pending migrations to local database
```

**Bonus features**:

```bash
pnpm db:push      # Direct schema push (no migration files, useful for rapid dev)
pnpm db:studio    # Visual database browser
pnpm db:check     # Validate migrations
```

**Migration Workflow**:

1. Edit [src/backend/drizzle/schema.ts](src/backend/drizzle/schema.ts)
2. Run `pnpm db:generate`
3. Review generated SQL in `drizzle/` directory
4. Run `pnpm db:migrate` to apply locally
5. Commit migration files to `drizzle/`
6. Push to main - migrations auto-apply to production via GitHub Actions

**Production deployment** (automatic via GitHub Actions):

- Migrations are applied automatically when pushing to main
- Uses `pnpm db:migrate` with `DATABASE_URL` secret

### Deployment

**Automatic** (push to main):

```bash
git push origin main  # Auto-deploys Workers + Pages via GitHub Actions
```

**Manual**:

```bash
pnpm wrangler deploy  # Deploy Workers
pnpm deploy:pages     # Deploy Pages
```

## Architecture

### Backend Structure (Cloudflare Workers + Hono)

**Entry point**: [src/backend/index.ts](src/backend/index.ts)

- Hono app with typed bindings (`Env` from [bindings.d.ts](src/backend/bindings.d.ts))
- Global middleware: logger, CORS (origin whitelist), security headers
- Health checks: `/` and `/api/v1/health`
- Mounts all API routes at `/api/v1` via [router.ts](src/backend/router.ts)

**Router**: [src/backend/router.ts](src/backend/router.ts)

- Applies session middleware globally to all routes
- Mounts route modules: auth, match, player, admin, comment, meme, season, invite

**Middleware Pattern**:

- `sessionMiddleware` ([src/backend/middleware/session.ts](src/backend/middleware/session.ts)): Manages encrypted sessions in Cloudflare KV
- `requireAuth` ([src/backend/middleware/auth.ts](src/backend/middleware/auth.ts)): Route-level auth enforcement, attaches `c.get("user")`
- `requireAdmin` ([src/backend/middleware/auth.ts](src/backend/middleware/auth.ts)): Admin-only routes
- `publicRoute` ([src/backend/middleware/auth.ts](src/backend/middleware/auth.ts)): Documentation marker for intentionally public endpoints
- `errorHandler` ([src/backend/middleware/errorHandler.ts](src/backend/middleware/errorHandler.ts)): Centralized error handling with proper status codes

**Route Modules** ([src/backend/routes/](src/backend/routes/)):

- Each route file creates its own `Hono<{ Bindings: Env }>()` instance
- Apply middleware per-route: `matchRoutes.post("/match/create", requireAuth, handler)`
- All routes use centralized error handler: `matchRoutes.onError(errorHandler)`
- Input validation via Zod with `zValidator("json", schema)` or `zValidator("query", schema)`

**Authentication Context** ([src/backend/auth/context.ts](src/backend/auth/context.ts)):

- `getCurrentUser(c)`: Throws if not authenticated, returns user
- `requireAdminUser(c)`: Throws if not admin, returns user
- Session data stored in `c.get("session")` with helper methods: `.get(key)`, `.set(key, value)`, `.destroy()`

**Database Access**:

- `createDatabase(c.env)`: Factory function in [src/backend/drizzle/db.ts](src/backend/drizzle/db.ts)
- Uses Drizzle ORM with Hyperdrive connection string for connection pooling
- Schema: [src/backend/drizzle/schema.ts](src/backend/drizzle/schema.ts)
- All queries use parameterized statements (SQL injection protection)

**OpenSkill Rating Calculation** ([src/backend/utils/openSkill.ts](src/backend/utils/openSkill.ts)):

- Uses OpenSkill Glicko-2 derivative rating system
- Each player has μ (mean) and σ (sigma/uncertainty) ratings
- Starting rating: μ=25, σ=8.333
- Tracks position-specific ratings:
  - `general_mu/sigma`: Overall rating
  - `defense_mu/sigma`: Defense position rating
  - `attack_mu/sigma`: Attack position rating
  - `solo_mu/sigma`: Solo play rating
- Match types: 1v1, 1v2, 2v2
- Each player's rating is calculated against opposing team average

**Match Validation** ([src/backend/utils/match-validator.ts](src/backend/utils/match-validator.ts)):

- 2-4 players total
- All players unique
- No ties allowed
- Must win by 2 points when score ≥11
- Scores must be non-negative

### Frontend Structure (React 19 + React Router)

**Entry**: [src/frontend/main.tsx](src/frontend/main.tsx) → [src/frontend/App.tsx](src/frontend/App.tsx) → [src/frontend/AppRoutes.tsx](src/frontend/AppRoutes.tsx)

**Pages** ([src/frontend/pages/](src/frontend/pages/)):

- Organized by feature: Leaderboard, MatchHistory, PlayerProfile, RecordMatch, Admin\*
- Admin pages use [AdminLayout.tsx](src/frontend/components/AdminLayout.tsx) wrapper
- Protected routes use [AdminRoute.tsx](src/frontend/components/AdminRoute.tsx) for auth checks

**State Management**:

- Auth context: [src/frontend/contexts/auth-context.tsx](src/frontend/contexts/auth-context.tsx)
- Zustand for other client state

**API Client** ([src/frontend/utils/fetch.ts](src/frontend/utils/fetch.ts)):

- Wrapper around fetch with credentials and error handling

**Styling**: TailwindCSS 4.1 (imported in main.tsx)

### Database Schema

**Key tables** ([src/backend/drizzle/schema.ts](src/backend/drizzle/schema.ts)):

- `user`: Authentication (email, passwordHash, isAdmin)
- `player`: Game profiles (displayName, currentElo, defenseElo, attackElo, soloElo, stats)
- `match`: Match records (players, scores, positions, type, soft delete via deletedAt)
- `eloHistory`: Complete ELO change history with algorithm versioning
- `meme`: Meme uploads for match celebrations
- `season`: Season tracking with stats
- `comment`: Match comments

**Important patterns**:

- All IDs use `createId()` from `@paralleldrive/cuid2`
- Foreign keys with cascade delete/update
- Soft deletes on matches (deletedAt timestamp)
- Enums defined as `pgEnum()` and exported as TypeScript types
- Indexes on commonly queried columns (ELO, userId, timestamps)

## Security Guidelines

**IMPORTANT**: Authentication and authorization use centralized helpers (`requireAuth`, `requireAdmin`, `publicRoute`). Review [src/backend/middleware/auth.ts](src/backend/middleware/auth.ts) before making changes.

**Critical rules**:

1. **Never expose endpoints without authentication** unless explicitly marked with `publicRoute` middleware
2. **Always validate admin access** on admin endpoints using `requireAdmin` middleware
3. **Use centralized auth helpers**: `requireAuth`, `requireAdmin`, `publicRoute`
4. **Never bypass Drizzle ORM** - all queries must use parameterized statements
5. **CORS whitelist**: Only specific origins allowed ([src/backend/index.ts:17-34](src/backend/index.ts#L17-L34))
6. **Rate limiting**: Required on auth endpoints and comment creation
7. **Input validation**: All endpoints use Zod schemas
8. **Session security**: Encrypted session IDs, HttpOnly cookies, SameSite=Lax (considering Strict)
9. **Password security**: Scrypt hashing with constant-time comparison
10. **Error messages**: Never leak internal details (DB errors, stack traces)

**Authentication patterns**:

```typescript
// Require authentication
matchRoutes.post("/match/create", requireAuth, handler);

// Require admin
adminRoutes.post("/admin/seasons", requireAdmin, handler);

// Public (use sparingly, document why)
authRoutes.post("/auth/login", publicRoute, handler);
```

## Common Patterns

### Adding a new API endpoint

1. Choose or create route module in [src/backend/routes/](src/backend/routes/)
2. Define Zod schema for input validation
3. Apply middleware: `requireAuth` or `requireAdmin` or `publicRoute`
4. Use `zValidator("json", schema)` or `zValidator("query", schema)`
5. Get authenticated user: `const user = c.get("user")!`
6. Create database instance: `const db = createDatabase(c.env)`
7. Use transactions for multi-step operations
8. Return JSON with proper status codes
9. Add route to [src/backend/router.ts](src/backend/router.ts) if new module
10. Update endpoint list in security documentation if applicable

### Database schema changes

1. Edit [src/backend/drizzle/schema.ts](src/backend/drizzle/schema.ts)
2. Run `pnpm db:generate descriptive_name`
3. Review generated SQL in `atlas/migrations/`
4. Test locally: `pnpm db:migrate`
5. Commit both schema and migration files
6. For complex changes (enum modifications, etc.), see [atlas/CLAUDE.md](atlas/CLAUDE.md)

### Working with sessions

```typescript
// In middleware/route handler
const session = c.get("session");

// Get session data
const uid = await session.get("uid");

// Set session data
await session.set("uid", user.id);

// Destroy session
await session.destroy();
```

### Error handling

```typescript
import { CustomError } from "../error/CustomError";
import { ErrorCode } from "../error/ErrorCodes";

throw new CustomError("User not found", ErrorCode.NOT_FOUND);
throw new CustomError("Not authenticated", ErrorCode.UNAUTHORIZED);
throw new CustomError("Admin required", ErrorCode.PERMISSION_DENIED);
```

Status codes are automatically mapped by errorHandler middleware.

## Path Aliases

TypeScript paths configured in [tsconfig.json](tsconfig.json):

- `@/*` → `./src/*`

Example: `import { PlayerPosition } from "@/api-models/position"`

## Environment Configuration

**Cloudflare Workers** ([wrangler.toml](wrangler.toml)):

- Hyperdrive binding: `HYPERDRIVE` (PostgreSQL connection pooling)
- KV binding: `SESSIONS_KV` (session storage)
- Secrets (set via `wrangler secret put`):
  - `SESSION_SECRET`: 32+ character random string for session encryption
  - `RESEND_API_KEY`: For sending invitation emails

**Environment variables**:

- `ENVIRONMENT`: "production" or "development"
- `SESSION_TTL`: Session lifetime in seconds (default: 604800 = 7 days)
- `INVITE_BASE_URL`: Frontend URL for invite links
- `FRONTEND_URL`: CORS whitelist

## OpenSkill Rating System Details

**Configuration**:

- Uses OpenSkill Glicko-2 derivative algorithm
- Starting rating: μ=25, σ=8.333
- Each rating has mean (μ) and uncertainty (σ) components
- Uncertainty decreases with more matches, increases over time

**Match types**:

- **1v1**: Direct rating comparison between two players
- **1v2**: Solo player rated against duo average; each duo player rated against solo
- **2v2**: Each player rated against opposing team average

**Position-specific ratings**:

- Defense position → updates `defense_mu/sigma`
- Attack position → updates `attack_mu/sigma`
- Solo position → updates `solo_mu/sigma`
- Mixed position → no position-specific update

All matches always update `general_mu/sigma` (overall rating).

## Code Quality Rules

### Documentation & Comments

- **No JSDoc/TSDoc** unless logic is genuinely complex
- **No inline comments** explaining obvious code or design choices
- **No "what" comments** - code should be self-documenting
- Design rationale belongs in PRs/docs, not code

### Code Structure

- **Early returns/guards** - avoid deep nesting
- **Prefer early exits** over nested if/else chains
- **Extract nested logic** into named functions
- **Guard clauses first** - validate inputs and handle edge cases at function start
- **Short-circuit trivial cases** - return early for empty arrays, null values, or other cases that make expensive operations unnecessary
- **Extract duplicated logic** - if conditional blocks repeat, extract to a helper function
- **One level of nesting preferred** - more than two levels suggests refactoring needed
- **Flatten deeply nested loops** - when a while/for loop contains multiple if/else branches, convert to explicit guard clauses with early `continue` or `break` statements
  - Example: Instead of `if (cond1) { ... } else if (cond2) { ... } else { ... }` inside a loop, use sequential `if (cond1) { ...; break; }` then `if (cond2) { ...; break; }` then fallback
  - This improves readability by making each branch intent explicit rather than buried in else chains

### Functional Programming Style

- **Prefer functional array methods** - use `.map()`, `.filter()`, `.reduce()`, `.find()`, `.some()`, `.every()` over imperative loops for readability in most cases
- **Use `for` loops for performance** - when function logic is complex, filter logic gets complex quickly, iterator size is very large, or you're chaining many operations
- **Choose the right method** - use `.map()` for transformations, `.filter()` for selecting items, `.forEach()` for side effects only
- **Avoid mutation** - prefer returning new arrays/objects rather than mutating existing ones
- **Use immutable patterns** - prefer spread operators (`...`) and methods that return new values
- **Precompute in array operations** - avoid redundant lookups or calculations in sort comparators or other repeated callbacks. Precompute values once before sorting/filtering when the same lookup happens multiple times

### Logging

- **Never use `console.log/error/warn`** in production code
- **Use module-specific loggers** (e.g., `logger.info()`)
- Remove all console statements before committing

### TypeScript Strictness

- **No `any` types**
- **No `@ts-ignore` or `@ts-expect-error`** - fix the type issue
- **No type assertions (`as`)** unless absolutely unavoidable
- All function parameters and returns must be explicitly typed
- `unknown` may be used with type guards
- **No inline type imports** - import types at the top of the file, not inline in function signatures. Bad: `foo: import('@/utils').Bar`. Good: `import type { Bar } from '@/utils'` then `foo: Bar`
- **No redundant type unions** - avoid `string | string` or `number | number` (likely copy-paste errors)
- **Use enum values, not string literals** - when comparing against enum types, use the enum value instead of the underlying string literal, ensuring type safety and preventing bugs if enum values change

### JSX & React Components

- **Always use JSX syntax** - render components with `<Component />`, never as function calls like `Component(props)`
- **Extract props to interface** - all components with multiple props should have a named interface (e.g., `ComponentProps`)
- **Use proper component patterns** - ensures React's reconciliation, hooks, and lifecycle work correctly

### Security

- **Validate file paths** - always resolve and validate paths before file system operations to prevent path traversal attacks
- **Sanitize user input** - validate and sanitize all external input before using in sensitive operations

### Database Query Optimization

- Check [src/backend/drizzle/schema.ts](src/backend/drizzle/schema.ts) for indexes
- **Sort in db query, not JS memory when possible** - Use `orderBy` clauses matching existing indexes instead of `.sort()` in JS
- **Query at the right table level** - Use aggregated fields when available (e.g., cached counts vs querying all related rows)

## Testing

Currently no automated tests. Manual testing via:

- Postman/curl against local API
- Manual UI testing in browser

## Known Issues / Tech Debt

1. Rate limiting uses in-memory Map (doesn't work across Workers instances) - should migrate to KV
2. No automated tests
3. Session cookie is SameSite=Lax (considering Strict for better security)
4. No account lockout mechanism for failed logins
5. No cleanup job for expired invitations

## Cloudflare-Specific Notes

- **Workers runtime**: Node.js APIs available via `nodejs_compat` flag
- **Hyperdrive**: Connection pooling for PostgreSQL (required for Workers)
- **KV**: Eventually consistent, global key-value store
- **Deployment**: GitHub Actions automatically deploys on push to main
- **Logs**: View via Cloudflare dashboard or `wrangler tail`

## File References

Quick links to key files:

- API entry: [src/backend/index.ts](src/backend/index.ts)
- Routes: [src/backend/router.ts](src/backend/router.ts)
- Schema: [src/backend/drizzle/schema.ts](src/backend/drizzle/schema.ts)
- Auth middleware: [src/backend/middleware/auth.ts](src/backend/middleware/auth.ts)
- Session middleware: [src/backend/middleware/session.ts](src/backend/middleware/session.ts)
- OpenSkill calculator: [src/backend/utils/openskill-calculator.ts](src/backend/utils/openskill-calculator.ts)
- Frontend routes: [src/frontend/AppRoutes.tsx](src/frontend/AppRoutes.tsx)
- Auth middleware: [src/backend/middleware/auth.ts](src/backend/middleware/auth.ts)
