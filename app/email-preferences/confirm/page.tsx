import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { user } from "@/lib/db/schema";
import { verifyEmailPreferenceToken } from "@/lib/email/preference-token";

export const dynamic = "force-dynamic";

export default async function ConfirmEmailPreferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; token?: string }>;
}) {
  const params = await searchParams;
  if (params.status === "confirmed") {
    return <PreferenceMessage title="You’re subscribed" message="Your choice to receive Rungset product updates has been confirmed." />;
  }
  if (params.status === "expired") {
    return <PreferenceMessage title="This link is no longer valid" message="Request email updates again from your Rungset account settings." />;
  }
  if (!params.token) notFound();

  const claims = await verifyEmailPreferenceToken(params.token, process.env.BETTER_AUTH_SECRET ?? "", "confirm");
  if (!claims) notFound();
  const [account] = await db.select({
    marketingEmailPending: user.marketingEmailPending,
    marketingEmailTokenVersion: user.marketingEmailTokenVersion,
  }).from(user).where(eq(user.id, claims.userId)).limit(1);
  if (!account) notFound();
  if (!account.marketingEmailPending || account.marketingEmailTokenVersion !== claims.version) {
    return <PreferenceMessage title="This link is no longer valid" message="Request email updates again from your Rungset account settings." />;
  }

  return (
    <section className="mx-auto max-w-lg px-6 py-16">
      <p className="page-kicker">Rungset email preferences</p>
      <h1 className="page-title mt-2">Confirm product updates</h1>
      <p className="page-description mt-3">Confirm that you want to receive optional Rungset product news and updates. You can unsubscribe at any time.</p>
      <form className="mt-8" method="post" action={`/api/email-preferences/confirm?token=${encodeURIComponent(params.token)}`}>
        <button className="app-button" type="submit">Confirm subscription</button>
      </form>
    </section>
  );
}

function PreferenceMessage({ title, message }: { title: string; message: string }) {
  return (
    <section className="mx-auto max-w-lg px-6 py-16">
      <p className="page-kicker">Rungset email preferences</p>
      <h1 className="page-title mt-2">{title}</h1>
      <p className="page-description mt-3">{message}</p>
    </section>
  );
}
