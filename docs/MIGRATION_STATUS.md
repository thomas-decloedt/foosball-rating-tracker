# Cloudflare Migration Status

## ✅ Completed

### Infrastructure

- ✅ Wrangler configuration (`wrangler.toml`) - Hyperdrive + KV bindings
- ✅ TypeScript bindings (`src/backend/bindings.d.ts`)
- ✅ Dependencies installed (Hono, postgres.js, @noble/hashes)
- ✅ Package.json scripts updated

### Database

- ✅ PostgreSQL schema preserved (no migration needed!)
- ✅ Database client migrated to Hyperdrive (`src/backend/drizzle/db.ts`)
- ✅ Uses postgres.js (Workers-compatible driver)

### Core Backend

- ✅ Workers entry point (`src/backend/index.ts`)
- ✅ Hono router setup (`src/backend/router.ts`)
- ✅ Session middleware migrated (Redis → KV) (`src/backend/middleware/session.ts`)
- ✅ Crypto utilities migrated to Web Crypto API (`src/backend/utils/encryption.ts`)
- ✅ Password hashing upgraded to scrypt (`src/backend/auth/password.ts`) - **more secure than old SHA-256!**

### Routes

- ✅ **Auth routes** (5/5 endpoints migrated) - `src/backend/routes/auth.ts`
  - POST /auth/login
  - POST /auth/register
  - POST /auth/logout
  - GET /auth/me
  - POST /auth/update-profile

## ⏳ In Progress / TODO

### Routes (26 endpoints remaining)

- ⏳ Match routes (3 endpoints) - `src/backend/routes/match.ts`
  - POST /match/create
  - GET /match/list
  - GET /match/:id

- ⏳ Player routes (7 endpoints) - `src/backend/routes/player.ts`
  - GET /players/list
  - GET /players/:id
  - GET /players/:id/history
  - GET /players/head-to-head
  - GET /players/monthly-mvp
  - GET /players/:id/opponents
  - GET /players/team-rankings

- ⏳ Admin routes (5 endpoints) - `src/backend/routes/admin.ts`
  - POST /admin/season/create
  - POST /admin/season/:id/end
  - DELETE /admin/match/:id
  - GET /admin/match/:id
  - POST /admin/recalculate-elo

- ⏳ Comment routes (3 endpoints) - `src/backend/routes/comment.ts`
  - POST /comment/create
  - GET /comment/list
  - DELETE /comment/:id

- ⏳ Meme routes (5 endpoints) - `src/backend/routes/meme.ts`
  - POST /meme/create
  - GET /meme/list
  - GET /meme/random
  - PATCH /meme/:id
  - DELETE /meme/:id

- ⏳ Season routes (2 endpoints) - `src/backend/routes/season.ts`
  - GET /season/list
  - GET /season/:id/leaderboard

### Frontend

- ⏳ Update frontend fetch utils (`src/frontend/utils/fetch.ts`) - remove VITE_API_BASE_URL
- ⏳ Add SPA routing support (`public/_redirects` or `dist/_redirects`)

### CI/CD

- ⏳ GitHub Actions workflow for Workers (`.github/workflows/deploy-workers.yml`)
- ⏳ GitHub Actions workflow for Pages (`.github/workflows/deploy-pages.yml`)

## Migration Pattern

Each endpoint follows this pattern:

### Old (Fastify):

```typescript
export class LoginEndpoint extends Endpoint {
  method = HTTPMethod.Post;
  url = "/api/v1/auth/login";

  async handleRequest(req: FastifyRequest, reply: FastifyReply) {
    const body = req.body;
    await req.session.set("uid", user.id);
    reply.status(200).send(response);
  }
}
```

### New (Hono):

```typescript
authRoutes.post("/login", zValidator("json", schema), async (c) => {
  const body = c.req.valid("json");
  const session = c.get("session");
  const db = createDatabase(c.env);

  // ... business logic stays the same ...

  await session.set("uid", user.id);
  return c.json(response, 200);
});
```

## Next Steps

1. **Migrate remaining endpoints** - Follow the pattern from auth routes
2. **Update frontend** - Minimal changes (remove API_BASE_URL, add \_redirects)
3. **Setup Cloudflare resources**:
   ```bash
   wrangler login
   wrangler hyperdrive create foosball-db --connection-string="postgresql://..."
   wrangler kv:namespace create SESSIONS_KV
   wrangler secret put SESSION_SECRET
   ```
4. **Test locally**: `wrangler dev`
5. **Deploy**: Push to GitHub (CI/CD will auto-deploy)

## Key Benefits

✅ **100% Free** - Hyperdrive, KV, Workers, Pages all on free tier
✅ **No data migration** - Kept PostgreSQL, just using Hyperdrive
✅ **More secure passwords** - Upgraded from SHA-256 to scrypt
✅ **Better architecture** - Hono is faster and built for Workers
✅ **Easy to migrate away later** - Only 2 files to change (db.ts + config)

## File Locations

- Old endpoints: `src/backend/endpoints/` (delete after migration)
- New routes: `src/backend/routes/`
- Database client: `src/backend/drizzle/db.ts`
- Session middleware: `src/backend/middleware/session.ts`
- Entry point: `src/backend/index.ts`
