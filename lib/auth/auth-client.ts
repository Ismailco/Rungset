import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "@/lib/auth/auth";

export const { useSession, signIn, signOut, signUp } = createAuthClient({
  basePath: '/api/auth',
  plugins: [inferAdditionalFields<typeof auth>()],
});
