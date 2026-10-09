import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createEmailPreferenceToken } from "@/lib/email/preference-token";

export async function sendMarketingConfirmation(user: {
  id: string;
  name: string;
  email: string;
  marketingEmailTokenVersion: number;
}) {
  const { env } = getCloudflareContext();
  const token = await createEmailPreferenceToken(
    user.id,
    user.marketingEmailTokenVersion,
    "confirm",
    env.BETTER_AUTH_SECRET,
  );
  const confirmationUrl = new URL("/email-preferences/confirm", env.NEXT_PUBLIC_APP_URL);
  confirmationUrl.searchParams.set("token", token);

  await env.EMAIL.send({
    from: "hello@rungset.com",
    to: user.email,
    subject: "Confirm Rungset product updates",
    text: [
      `Hi ${user.name},`,
      "",
      "Confirm that you want to receive optional Rungset product news and updates:",
      confirmationUrl.toString(),
      "",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
  });
}
