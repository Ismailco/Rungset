import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { user } from "@/lib/db/schema";
import { verifyEmailPreferenceToken } from "@/lib/email/preference-token";

export const dynamic = "force-dynamic";

export default async function EmailPreferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; token?: string }>;
}) {
  const params = await searchParams;
  if (params.status === "unsubscribed") {
    return <EmailPreferencesMessage title="You’re unsubscribed" message="You won’t receive further Rungset product updates." />;
  }
  if (!params.token) notFound();

  const claims = await verifyEmailPreferenceToken(params.token, process.env.BETTER_AUTH_SECRET ?? "", "unsubscribe");
  if (!claims) notFound();
  const [account] = await db.select({
    marketingEmailOptIn: user.marketingEmailOptIn,
    marketingEmailPending: user.marketingEmailPending,
  }).from(user).where(eq(user.id, claims.userId)).limit(1);
  if (!account) notFound();

  const active = account.marketingEmailOptIn;
  const pending = account.marketingEmailPending;
  if (!active && !pending) {
    return <EmailPreferencesMessage title="You’re unsubscribed" message="This email preference has already been updated." />;
  }

  return (
    <section className="mx-auto max-w-lg px-6 py-16">
      <p className="page-kicker">Rungset email preferences</p>
      <h1 className="page-title mt-2">Unsubscribe from product updates?</h1>
      <p className="page-description mt-3">You can still use your Rungset account. This only stops optional product news and updates.</p>
      <form className="mt-8" method="post" action={`/api/email/unsubscribe?token=${encodeURIComponent(params.token)}`}>
        <button className="app-button" type="submit">Unsubscribe</button>
      </form>
      <Link href="/auth/signin" className="mt-5 inline-block text-sm text-[var(--text-secondary)] hover:text-white">Back to Rungset</Link>
    </section>
  );
}

function EmailPreferencesMessage({ title, message }: { title: string; message: string }) {
  return (
    <section className="mx-auto max-w-lg px-6 py-16">
      <p className="page-kicker">Rungset email preferences</p>
      <h1 className="page-title mt-2">{title}</h1>
      <p className="page-description mt-3">{message}</p>
      <Link href="/" className="app-button mt-8 inline-flex">Return to Rungset</Link>
    </section>
  );
}
