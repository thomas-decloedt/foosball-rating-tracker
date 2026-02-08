import { Hono } from "hono";
import type { Env } from "./bindings";
import { sessionMiddleware } from "./middleware/session";
import { requireAuth } from "./middleware/auth";
import { authRoutes } from "./routes/auth";
import { matchRoutes } from "./routes/match";
import { playerRoutes } from "./routes/player";
import { adminRoutes } from "./routes/admin";
import { commentRoutes } from "./routes/comment";
import { memeRoutes } from "./routes/meme";
import { seasonRoutes } from "./routes/season";
import { inviteRoutes } from "./routes/invite";
import { passwordResetRoutes } from "./routes/password-reset";
import { tableRoutes } from "./routes/table";

export function createRouter() {
  const router = new Hono<{ Bindings: Env }>();

  // Apply session middleware to all routes
  router.use("*", sessionMiddleware);

  // Add logging middleware to see profile image requests
  router.use("*", async (c, next) => {
    const pathname = new URL(c.req.url).pathname;
    if (pathname.includes("profile-images")) {
      console.log(`[Worker] === INCOMING REQUEST ===`);
      console.log(`[Worker] Pathname: ${pathname}`);
      console.log(`[Worker] Method: ${c.req.method}`);
      console.log(`[Worker] Full URL: ${c.req.url}`);
    }
    await next();
  });

  // Serve profile images from R2
  // Requires authentication - any logged-in user can view profile images
  // This prevents unauthorized access while allowing team members to see each other's images
  // Use wildcard pattern to handle query parameters correctly
  router.get("/profile-images/*", requireAuth, async (c) => {
    // Extract filename from pathname directly to handle query parameters correctly
    // This is the most reliable method - pathname doesn't include query params
    const pathname = new URL(c.req.url).pathname;
    const match = pathname.match(/\/profile-images\/([^/?]+)/);

    if (!match) {
      console.log(`[Worker] No filename match in pathname: ${pathname}`);
      return c.notFound();
    }

    const filename = match[1];

    // Log wildcard parameter for comparison (Hono stores wildcard in param('*'))
    const wildcardParam = c.req.param("*");
    if (wildcardParam && wildcardParam !== filename) {
      console.log(
        `[Worker] Wildcard param vs pathname - param('*'): "${wildcardParam}", pathname: "${filename}"`,
      );
    }

    console.log(`[Worker] === PROFILE IMAGE REQUEST ===`);
    console.log(
      `[Worker] Wildcard param('*'): ${wildcardParam || "undefined"}`,
    );
    console.log(`[Worker] Filename from pathname: ${filename}`);
    console.log(`[Worker] Request URL: ${c.req.url}`);
    console.log(`[Worker] Request pathname: ${new URL(c.req.url).pathname}`);
    console.log(`[Worker] Request search: ${new URL(c.req.url).search}`);
    console.log(
      `[Worker] Request Headers:`,
      Object.fromEntries(c.req.raw.headers.entries()),
    );

    if (!filename || filename.length === 0) {
      console.log(`[Worker] Invalid filename (empty)`);
      return c.notFound();
    }

    // Filename format: userId.ext (e.g., "ko6b3fz7e8tbognc0u818mg6.webp")
    const lastDotIndex = filename.lastIndexOf(".");
    if (lastDotIndex === -1) {
      console.log(`[Worker] Invalid filename (no extension)`);
      return c.notFound();
    }

    const userId = filename.substring(0, lastDotIndex);
    const ext = filename.substring(lastDotIndex + 1);
    const key = `profile-images/${userId}.${ext}`;

    console.log(
      `[Worker] Parsed - userId: ${userId}, ext: ${ext}, R2 key: ${key}`,
    );

    try {
      console.log(`[Worker] Fetching from R2: ${key}`);
      const object = await c.env.PROFILE_IMAGES_R2.get(key);

      if (!object) {
        console.error(`[Worker] Not found in R2: ${key}`);
        return c.notFound();
      }

      console.log(`[Worker] R2 object retrieved successfully`);
      console.log(`[Worker] R2 object size: ${object.size} bytes`);
      console.log(`[Worker] R2 object httpEtag: ${object.httpEtag}`);
      console.log(`[Worker] R2 object uploaded: ${object.uploaded}`);

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);

      console.log(
        `[Worker] Headers after writeHttpMetadata:`,
        Object.fromEntries(headers.entries()),
      );

      // Ensure Content-Type is explicitly set (writeHttpMetadata should set it, but be explicit)
      if (!headers.has("content-type")) {
        console.log(
          `[Worker] Content-Type not set, using fallback from extension`,
        );
        // Fallback: determine content-type from extension
        const contentTypeMap: Record<string, string> = {
          gif: "image/gif",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          png: "image/png",
          webp: "image/webp",
        };
        const contentType =
          contentTypeMap[ext.toLowerCase()] || "application/octet-stream";
        headers.set("content-type", contentType);
        console.log(`[Worker] Set Content-Type to: ${contentType}`);
      }

      // Ensure WebP files have correct content-type
      // (GIFs are now converted to WebP, so we primarily serve WebP now)
      const isWebP = ext.toLowerCase() === "webp";
      const isGif = ext.toLowerCase() === "gif";
      if (isWebP) {
        headers.set("content-type", "image/webp");
        console.log(
          `[Worker] WebP detected, ensuring Content-Type: image/webp`,
        );
      } else if (isGif) {
        headers.set("content-type", "image/gif");
        console.log(`[Worker] GIF detected, ensuring Content-Type: image/gif`);
      }

      console.log(
        `[Worker] Final headers before Response:`,
        Object.fromEntries(headers.entries()),
      );
      console.log(`[Worker] Creating Response with object.body`);
      console.log(`[Worker] object.body is null: ${object.body === null}`);
      console.log(
        `[Worker] object.body is locked: ${object.body?.locked || "N/A"}`,
      );

      const response = new Response(object.body, {
        status: 200,
        headers,
      });

      console.log(`[Worker] Response created - Status: ${response.status}`);
      console.log(
        `[Worker] Response headers:`,
        Object.fromEntries(response.headers.entries()),
      );
      console.log(`[Worker] Response.body is null: ${response.body === null}`);
      console.log(`[Worker] === PROFILE IMAGE RESPONSE RETURNED ===`);

      return response;
    } catch (error) {
      console.error(`[Worker] === ERROR SERVING PROFILE IMAGE ===`);
      console.error(
        `[Worker] Error type: ${error instanceof Error ? error.constructor.name : typeof error}`,
      );
      console.error(
        `[Worker] Error message: ${error instanceof Error ? error.message : String(error)}`,
      );
      console.error(
        `[Worker] Error stack:`,
        error instanceof Error ? error.stack : "N/A",
      );
      return c.json({ error: "Failed to serve image" }, 500);
    }
  });

  // Serve season icons from R2
  // Requires authentication - any logged-in user can view season icons
  router.get("/season-icons/*", requireAuth, async (c) => {
    const pathname = new URL(c.req.url).pathname;
    const match = pathname.match(/\/season-icons\/([^/?]+)/);

    if (!match) {
      console.log(`[Worker] No filename match in pathname: ${pathname}`);
      return c.notFound();
    }

    const filename = match[1];

    if (!filename || filename.length === 0) {
      console.log(`[Worker] Invalid filename (empty)`);
      return c.notFound();
    }

    // Filename format: seasonId.ext (e.g., "ko6b3fz7e8tbognc0u818mg6.webp")
    const lastDotIndex = filename.lastIndexOf(".");
    if (lastDotIndex === -1) {
      console.log(`[Worker] Invalid filename (no extension)`);
      return c.notFound();
    }

    const seasonId = filename.substring(0, lastDotIndex);
    const ext = filename.substring(lastDotIndex + 1);
    const key = `season-icons/${seasonId}.${ext}`;

    console.log(
      `[Worker] Season icon request - seasonId: ${seasonId}, ext: ${ext}, R2 key: ${key}`,
    );

    try {
      const object = await c.env.SEASON_ICONS_R2.get(key);

      if (!object) {
        console.error(`[Worker] Season icon not found in R2: ${key}`);
        return c.notFound();
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);

      // Ensure Content-Type is set
      if (!headers.has("content-type")) {
        const contentTypeMap: Record<string, string> = {
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          png: "image/png",
          gif: "image/gif",
          webp: "image/webp",
          svg: "image/svg+xml",
          mp4: "video/mp4",
          webm: "video/webm",
          mov: "video/quicktime",
          pdf: "application/pdf",
        };
        const contentType =
          contentTypeMap[ext.toLowerCase()] || "application/octet-stream";
        headers.set("content-type", contentType);
      }

      return new Response(object.body, {
        headers,
      });
    } catch (error) {
      console.error(`[Worker] Error serving season icon: ${error}`);
      return c.json({ error: "Failed to serve season icon" }, 500);
    }
  });

  // Mount route modules at root - routes define full paths
  router.route("/", authRoutes);
  router.route("/", matchRoutes);
  router.route("/", playerRoutes);
  router.route("/", adminRoutes);
  router.route("/", commentRoutes);
  router.route("/", memeRoutes);
  router.route("/", seasonRoutes);
  router.route("/", inviteRoutes);
  router.route("/", passwordResetRoutes);
  router.route("/", tableRoutes);

  router.get("/realtime", requireAuth, async (c) => {
    const id = c.env.STATS_HUB.idFromName("global");
    const stub = c.env.STATS_HUB.get(id);
    return stub.fetch(c.req.raw);
  });

  // Catch-all for unmatched routes in this router (for debugging)
  // Must be LAST so other routes are checked first
  router.all("*", (c) => {
    const pathname = new URL(c.req.url).pathname;
    console.log(`[Worker] === ROUTER CATCH-ALL (UNMATCHED) ===`);
    console.log(`[Worker] Pathname: ${pathname}`);
    console.log(`[Worker] Method: ${c.req.method}`);
    console.log(`[Worker] URL: ${c.req.url}`);
    return c.json({ error: "Route not found in router", path: pathname }, 404);
  });

  return router;
}
