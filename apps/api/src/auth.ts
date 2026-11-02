import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { schema } from "@jerico/database/schema";
import type { ApiBindings } from "./database";
import { sendEmail } from "./email";

export function createAuth(database: NodePgDatabase<typeof schema>, env: ApiBindings) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  }
  if (env.APP_ENV === "production" && (!env.BETTER_AUTH_URL || !env.WEB_APP_URL)) {
    throw new Error("BETTER_AUTH_URL and WEB_APP_URL must be configured in production.");
  }
  const baseURL = env.BETTER_AUTH_URL ?? "http://localhost:8787";
  const webURL = env.WEB_APP_URL ?? "http://localhost:3000";

  return betterAuth({
    appName: "Jerico",
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [webURL],
    database: drizzleAdapter(database, { provider: "pg", schema }),
    advanced: { database: { generateId: "uuid" } },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      sendResetPassword: async ({ user, url }) => sendEmail(env, {
        to: user.email,
        subject: "Reset your Jerico password",
        text: "Use the secure link below to reset your Jerico password.",
        actionUrl: url,
        actionLabel: "Reset password",
      }),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => sendEmail(env, {
        to: user.email,
        subject: "Verify your Jerico email",
        text: "Verify your email address to finish creating your Jerico account.",
        actionUrl: url,
        actionLabel: "Verify email",
      }),
    },
    plugins: [
      organization({
        allowUserToCreateOrganization: true,
        organizationLimit: 5,
        requireEmailVerificationOnInvitation: true,
        sendInvitationEmail: async (data) => sendEmail(env, {
          to: data.email,
          subject: "Invitation to join " + data.organization.name + " on Jerico",
          text: "You have been invited to join " + data.organization.name + " on Jerico.",
          actionUrl: webURL + "/accept-invitation/" + encodeURIComponent(data.id),
          actionLabel: "Review invitation",
        }),
      }),
    ],
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { socialProviders: { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } } }
      : {}),
  });
}
