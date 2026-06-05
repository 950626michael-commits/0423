import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import * as schema from "../db/auth-schema.ts";
import { user as userTable } from "../db/auth-schema.ts";
import type { SessionUser } from "../shared/contracts.ts";
import { toSessionUser } from "./user-mapper.ts";

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret || secret === "replaceme") {
  throw new Error(
    "BETTER_AUTH_SECRET is required and must not be 'replaceme'. " +
      "Generate one with: bun -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
}

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const extraOrigin = process.env.API_ALLOWED_ORIGIN;
const trustedOrigins =
  extraOrigin && extraOrigin !== "*" ? [baseURL, extraOrigin] : [baseURL];

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const isGoogleProviderConfigured = Boolean(
  googleClientId && googleClientSecret,
);

export const auth = betterAuth({
  baseURL,
  secret,
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: false,
  },
  ...(isGoogleProviderConfigured
    ? {
        socialProviders: {
          google: {
            clientId: googleClientId!,
            clientSecret: googleClientSecret!,
          },
        },
      }
    : {}),
});

export async function getCurrentUser(
  request: Request,
): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;

  const [dbUser] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, session.user.id))
    .limit(1);

  return toSessionUser(dbUser ?? session.user);
}
