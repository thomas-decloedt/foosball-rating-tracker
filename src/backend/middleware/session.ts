import { createMiddleware } from "hono/factory";
import type { Env } from "../bindings";
import { decryptString, encryptString } from "../utils/encryption";

export interface SessionData {
  uid?: string;
  [key: string]: any;
}

export interface SessionHelpers {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  destroy(): Promise<void>;
}

declare module "hono" {
  interface ContextVariableMap {
    session: SessionHelpers;
  }
}

export const sessionMiddleware = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const cookieHeader = c.req.header("cookie");
    let sessionId: string | null = null;
    let sessionData: SessionData = {};

    // Parse session cookie
    if (cookieHeader) {
      const cookies = cookieHeader.split(";").map((c) => c.trim());
      const sessionCookie = cookies.find((c) => c.startsWith("sessionId="));
      if (sessionCookie) {
        const encryptedId = sessionCookie.split("=")[1];
        if (encryptedId && c.env.SESSION_SECRET) {
          try {
            sessionId = await decryptString(c.env.SESSION_SECRET, encryptedId);
            // Load session from KV
            const data = await c.env.SESSIONS_KV.get(
              `sess:${sessionId}`,
              "json",
            );
            if (data) sessionData = data as SessionData;
          } catch (err) {
            console.error(
              "Failed to decrypt session (likely old cookie with different key):",
              err,
            );
            // Clear the invalid cookie so browser doesn't keep sending it
            c.header(
              "Set-Cookie",
              "sessionId=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
            );
            // Continue without session - user will need to log in again
            sessionId = null;
            sessionData = {};
          }
        }
      }
    }

    // Session helpers
    const session: SessionHelpers = {
      get: async (key: string) => sessionData[key] ?? null,

      set: async (key: string, value: any) => {
        if (!c.env.SESSION_SECRET) {
          throw new Error("SESSION_SECRET is not configured");
        }
        if (!sessionId) {
          // Generate new session ID
          sessionId = crypto.randomUUID();
          const encrypted = await encryptString(
            c.env.SESSION_SECRET,
            sessionId,
          );
          c.header(
            "Set-Cookie",
            `sessionId=${encrypted}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${c.env.SESSION_TTL}`,
          );
        }
        sessionData[key] = value;
        // Save to KV with TTL
        await c.env.SESSIONS_KV.put(
          `sess:${sessionId}`,
          JSON.stringify(sessionData),
          { expirationTtl: parseInt(c.env.SESSION_TTL) },
        );
      },

      destroy: async () => {
        if (sessionId) {
          await c.env.SESSIONS_KV.delete(`sess:${sessionId}`);
          sessionData = {};
          c.header(
            "Set-Cookie",
            "sessionId=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
          );
        }
      },
    };

    c.set("session", session);
    await next();
  },
);
