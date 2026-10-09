'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLogoFull from '@/components/app/shared/AppLogoFull';
import { sendVerificationEmail, signOut, useSession } from '@/lib/auth/auth-client';

export function EmailVerificationPage() {
  const { data: session, isPending } = useSession();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user.email && !email) setEmail(session.user.email);
  }, [email, session?.user.email]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;

    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await sendVerificationEmail({ email: email.trim(), callbackURL: '/' });
      if (result?.error) throw result.error;
      setNotice('If this address has an account that needs verification, a fresh link has been sent.');
    } catch {
      setError('Could not send a verification email right now. Please try again shortly.');
    } finally {
      setSending(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    window.location.replace('/auth/signin');
  }

  if (!isPending && session?.user.emailVerified) {
    return (
      <main className="auth-page">
        <section className="auth-panel" aria-labelledby="verification-title">
          <div className="mb-8"><AppLogoFull className="h-8 max-w-40" /></div>
          <h1 id="verification-title" className="text-2xl font-semibold tracking-tight text-white">Email verified</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">Your email address is verified. You can continue to Rungset.</p>
          <Link href="/dashboard" className="app-button mt-6 w-full">Continue to Rungset</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="verification-title">
        <div className="mb-8"><AppLogoFull className="h-8 max-w-40" /></div>
        <h1 id="verification-title" className="text-2xl font-semibold tracking-tight text-white">Verify your email</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          Confirm your email address before using your Rungset workspace. Check your inbox and spam folder for the verification link.
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <div>
            <label htmlFor="verification-email" className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">Email</label>
            <input
              id="verification-email"
              className="app-field"
              type="email"
              autoComplete="email"
              required
              value={email}
              disabled={sending || Boolean(session?.user.email)}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          {notice ? <p className="app-form-hint rounded-[var(--radius-control)] border border-[var(--border-subtle)] px-3 py-3" role="status">{notice}</p> : null}
          {error ? <p className="rounded-[var(--radius-control)] border border-[rgba(255,111,130,0.3)] bg-[var(--danger-soft)] px-3 py-3 text-sm text-[#ffdce2]" role="alert">{error}</p> : null}
          <button type="submit" className="app-button w-full disabled:cursor-not-allowed" disabled={sending || isPending}>
            {sending ? 'Sending verification email…' : 'Send verification email'}
          </button>
        </form>

        {session ? (
          <button type="button" onClick={() => void handleSignOut()} className="app-button-secondary mt-3 w-full">Use a different account</button>
        ) : (
          <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
            Already verified? <Link href="/auth/signin" className="font-semibold text-[var(--brand-primary)] hover:text-white hover:underline">Sign in</Link>
          </p>
        )}
      </section>
    </main>
  );
}
