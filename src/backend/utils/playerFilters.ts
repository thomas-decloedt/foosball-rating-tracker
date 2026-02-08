import { eq } from "drizzle-orm";
import * as schema from "../drizzle/schema";

// For Drizzle queries - returns condition to exclude admin players
export const excludeAdminPlayers = () => {
  return eq(schema.user.isAdmin, false);
};

// For raw SQL queries - returns SQL fragment
export const excludeAdminPlayersSQL = () => {
  return `INNER JOIN "user" u ON p.user_id = u.id WHERE u.is_admin = false`;
};
