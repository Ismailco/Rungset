"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Code2, Globe2, X } from "lucide-react";
import AppLogoFull from "@/components/app/shared/AppLogoFull";
import { signIn, signUp, useSession } from "@/lib/auth/auth-client";
import { getAuthError } from "@/lib/auth/auth-errors";
import { getSafeCallbackUrl } from "@/lib/auth/callback-url";
import {
  type AuthFieldName,
  getAuthFieldError,
  signInCredentialsSchema,
  signUpCredentialsSchema,
} from "@/lib/auth/auth-validation";

interface AuthFormProps {
  mode: "signin" | "signup";
}

interface FormErrors {
  name?: string;
  email?: string;
  password?: string;
  passwordConfirm?: string;
  [key: string]: string | undefined;
}

export function AuthForm({ mode }: AuthFormProps) {
  const [formData, setFormData] = useState({ name: "", email: "", password: "", passwordConfirm: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<"google" | "github" | null>(null);
  const requestInProgress = useRef(false);
  const hasStartedNavigation = useRef(false);
  const { data: session, isPending } = useSession();
  const searchParams = useSearchParams();
  const callbackUrl = getSafeCallbackUrl(searchParams.get("callbackUrl"));

  const goToApp = useCallback(() => {
    if (hasStartedNavigation.current) return;

    hasStartedNavigation.current = true;
    sessionStorage.removeItem('goalgenius-logged-out');
    window.location.replace(callbackUrl);
  }, [callbackUrl]);

  useEffect(() => {
    if (!isPending && session) goToApp();
  }, [goToApp, isPending, session]);

  useEffect(() => {
    if (searchParams.get("authError") === "provider") {
      setError(getAuthError({ code: "PROVIDER_ERROR" }, mode).message);
    }
  }, [mode, searchParams]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    const field = name as AuthFieldName;
    const fieldError = getAuthFieldError(field, value, mode, formData.password);
    setFormData((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => {
      const next = { ...previous, [name]: fieldError };
      if (name === "password" && mode === "signup" && formData.passwordConfirm) {
        next.passwordConfirm = getAuthFieldError("passwordConfirm", formData.passwordConfirm, mode, value);
      }
      return next;
    });
    setError(null);
    setNotice(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const newErrors: FormErrors = {};
    const validation = mode === "signin"
      ? signInCredentialsSchema.safeParse(formData)
      : signUpCredentialsSchema.safeParse(formData);
    if (!validation.success) {
      for (const issue of validation.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && !newErrors[field]) newErrors[field] = issue.message;
      }
    }
    if (mode === "signup") {
      const passwordConfirmError = getAuthFieldError("passwordConfirm", formData.passwordConfirm, mode, formData.password);
      if (passwordConfirmError) newErrors.passwordConfirm = passwordConfirmError;
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      const firstInvalidField = mode === "signup"
        ? ["name", "email", "password", "passwordConfirm"].find((field) => newErrors[field])
        : ["email", "password"].find((field) => newErrors[field]);
      if (firstInvalidField) document.getElementById(firstInvalidField)?.focus();
      return;
    }

    if (requestInProgress.current) return;
    requestInProgress.current = true;
    setLoading(true);
    try {
      setErrors({});
      if (mode === "signin") {
        const credentials = signInCredentialsSchema.parse(formData);
        const result = await signIn.email({ email: credentials.email, password: credentials.password, callbackURL: callbackUrl });
        if (result?.error) {
          setError(getAuthError(result.error, mode).message);
          setFormData((previous) => ({ ...previous, password: "", passwordConfirm: "" }));
          return;
        }
        if (!result?.data) throw new Error("Sign in failed");
        goToApp();
      } else {
        const credentials = signUpCredentialsSchema.parse(formData);
        const result = await signUp.email({ name: credentials.name, email: credentials.email, password: credentials.password, callbackURL: callbackUrl });
        if (result?.error) {
          setError(getAuthError(result.error, mode).message);
          setFormData((previous) => ({ ...previous, password: "", passwordConfirm: "" }));
          return;
        }
        if (!result?.data) throw new Error("Sign up failed");
        setFormData((previous) => ({ ...previous, password: "", passwordConfirm: "" }));
        setNotice("If an account can be created with these details, you can now sign in.");
      }
    } catch (submissionError) {
      setError(getAuthError(submissionError, mode).message);
      setFormData((previous) => ({ ...previous, password: "", passwordConfirm: "" }));
    } finally {
      requestInProgress.current = false;
      setLoading(false);
    }
  };

  const handleSocialSignIn = async (provider: "google" | "github") => {
    if (requestInProgress.current) return;

    requestInProgress.current = true;
    setLoading(true);
    setPendingProvider(provider);
    setError(null);
    setNotice(null);

    try {
      const errorCallbackURL = new URL(mode === "signin" ? "/auth/signin" : "/auth/signup", window.location.origin);
      errorCallbackURL.searchParams.set("authError", "provider");
      errorCallbackURL.searchParams.set("callbackUrl", callbackUrl);
      const result = await signIn.social({ provider, callbackURL: callbackUrl, errorCallbackURL: errorCallbackURL.toString() });
      if (result?.error) {
        setError(getAuthError(result.error, mode).message);
      } else if (!result?.data) {
        throw new Error("OAuth provider unavailable");
      }
    } catch (submissionError) {
      setError(getAuthError(submissionError, mode).message);
    } finally {
      requestInProgress.current = false;
      setLoading(false);
      setPendingProvider(null);
    }
  };

  const hasFieldErrors = Object.keys(errors).some((key) => errors[key] && (mode === "signin"
    ? ["email", "password"].includes(key)
    : ["email", "password", "passwordConfirm", "name"].includes(key)));

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="mb-8">
          <AppLogoFull className="h-8 max-w-40" />
        </div>

        <h1 id="auth-title" className="text-2xl font-semibold tracking-tight text-white">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          {mode === "signin" ? "Sign in to continue to Rungset." : "Start using Rungset."}
        </p>

        <form onSubmit={handleSubmit} noValidate aria-busy={loading} className="mt-7 space-y-5">
          {error ? (
            <div className="flex items-start gap-3 rounded-[var(--radius-control)] border border-[rgba(255,111,130,0.3)] bg-[var(--danger-soft)] px-3 py-3" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-sm leading-5 text-[#ffdce2]">{error}</p>
              <button type="button" className="app-button-ghost app-button-icon app-button-sm -mr-1 -mt-1" onClick={() => setError(null)} aria-label="Dismiss error">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}
          {notice ? <p className="app-form-hint rounded-[var(--radius-control)] border border-[var(--border-subtle)] px-3 py-3" role="status">{notice}</p> : null}

          {mode === "signup" ? (
            <AuthField id="name" name="name" label="Full Name" type="text" value={formData.name} onChange={handleChange} error={errors.name} placeholder="Your name" autoComplete="name" disabled={loading} />
          ) : null}
          <AuthField id="email" name="email" label="Email" type="email" value={formData.email} onChange={handleChange} error={errors.email} placeholder="you@example.com" autoComplete="email" disabled={loading} />
          <AuthField id="password" name="password" label="Password" type="password" value={formData.password} onChange={handleChange} error={errors.password} placeholder="Enter your password" autoComplete={mode === "signin" ? "current-password" : "new-password"} disabled={loading} hint={mode === "signup" ? "At least 8 characters with uppercase, lowercase, and a number." : undefined} />
          {mode === "signup" ? (
            <AuthField id="passwordConfirm" name="passwordConfirm" label="Confirm Password" type="password" value={formData.passwordConfirm} onChange={handleChange} error={errors.passwordConfirm} placeholder="Re-enter your password" autoComplete="new-password" disabled={loading} />
          ) : null}

          <button type="submit" disabled={loading || hasFieldErrors} className="app-button w-full disabled:cursor-not-allowed">
            {loading ? (mode === "signin" ? "Signing in..." : "Creating account...") : mode === "signin" ? "Sign in" : "Sign up"}
          </button>

          <div className="flex items-center gap-3 py-1" aria-hidden="true">
            <div className="h-px flex-1 bg-[var(--border-subtle)]" />
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">or</span>
            <div className="h-px flex-1 bg-[var(--border-subtle)]" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => void handleSocialSignIn("google")} disabled={loading} aria-busy={pendingProvider === "google"} className="auth-social-button w-full disabled:cursor-not-allowed">
              <Globe2 className="h-4 w-4" aria-hidden="true" />
              <span>{pendingProvider === "google" ? "Connecting to Google..." : "Continue with Google"}</span>
            </button>
            <button type="button" onClick={() => void handleSocialSignIn("github")} disabled={loading} aria-busy={pendingProvider === "github"} className="auth-social-button w-full disabled:cursor-not-allowed">
              <Code2 className="h-4 w-4" aria-hidden="true" />
              <span>{pendingProvider === "github" ? "Connecting to GitHub..." : "Continue with GitHub"}</span>
            </button>
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
          {mode === "signin" ? <>Don&apos;t have an account? <Link href="/auth/signup" prefetch={false} className="font-semibold text-[var(--brand-primary)] hover:text-white hover:underline">Sign up</Link></> : <>Already have an account? <Link href="/auth/signin" prefetch={false} className="font-semibold text-[var(--brand-primary)] hover:text-white hover:underline">Sign in</Link></>}
        </p>
      </section>
    </main>
  );
}

function AuthField({
  id,
  name,
  label,
  type,
  value,
  onChange,
  error,
  placeholder,
  autoComplete,
  disabled,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  type: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  placeholder: string;
  autoComplete: string;
  disabled: boolean;
  hint?: string;
}) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">{label}</label>
      <input id={id} name={name} type={type} value={value} onChange={onChange} disabled={disabled} required maxLength={id === "email" ? 254 : id === "password" || id === "passwordConfirm" ? 128 : 100} placeholder={placeholder} autoComplete={autoComplete} className={`app-field ${error ? "border-red-500" : ""}`} aria-invalid={!!error} aria-describedby={[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined} />
      {error ? <p id={errorId} className="app-form-error mt-1" role="alert">{error}</p> : null}
      {hint ? <p id={hintId} className="app-form-hint mt-1">{hint}</p> : null}
    </div>
  );
}
