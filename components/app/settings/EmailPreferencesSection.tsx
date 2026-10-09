'use client';

import { useEffect, useState } from 'react';
import { AppPanel } from '@/components/app/shared/AppPage';

interface EmailPreferenceState {
  marketingEmailOptIn: boolean;
  pending: boolean;
  unsubscribed: boolean;
}

export function EmailPreferencesSection() {
  const [preference, setPreference] = useState<EmailPreferenceState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/account/email-preferences', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load email preferences.');
        return response.json() as Promise<EmailPreferenceState>;
      })
      .then(setPreference)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setMessage(error instanceof Error ? error.message : 'Could not load email preferences.');
        }
      });
    return () => controller.abort();
  }, []);

  async function updatePreference(marketingEmailOptIn: boolean) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/account/email-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketingEmailOptIn }),
      });
      const result = await response.json() as EmailPreferenceState & { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Could not update email preferences.');
      setPreference(result);
      setMessage(result.pending
        ? 'Check your inbox to confirm your subscription.'
        : result.marketingEmailOptIn
          ? 'You are subscribed to product updates.'
          : 'You are unsubscribed from product updates.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update email preferences.');
    } finally {
      setBusy(false);
    }
  }

  const checked = Boolean(preference?.marketingEmailOptIn || preference?.pending);

  return (
    <AppPanel className="p-6">
      <h2 className="text-lg font-semibold text-white">Email updates</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
        Choose whether to receive optional Rungset product news. New subscriptions require email confirmation; every update includes an unsubscribe link.
      </p>
      <label className="mt-5 flex items-start gap-3 text-sm leading-5 text-[var(--text-primary)]">
        <input
          type="checkbox"
          checked={checked}
          disabled={!preference || busy}
          onChange={(event) => void updatePreference(event.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand-primary)]"
          aria-describedby="email-updates-status"
        />
        <span>Send me product news and updates.</span>
      </label>
      <p id="email-updates-status" className="mt-3 text-sm text-[var(--text-secondary)]" role="status" aria-live="polite">
        {message ?? (preference?.pending
          ? 'Subscription requested. Confirm it using the email we sent you.'
          : preference?.marketingEmailOptIn
            ? 'You are subscribed.'
            : preference?.unsubscribed
              ? 'You are unsubscribed.'
              : preference
                ? 'You are not subscribed.'
                : 'Loading email preferences…')}
      </p>
    </AppPanel>
  );
}
