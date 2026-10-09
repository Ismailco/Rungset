const DEFAULT_CALLBACK_URL = "/dashboard";
const CALLBACK_BASE_URL = "https://rungset.invalid";
const CALLBACK_BASE_ORIGIN = new URL(CALLBACK_BASE_URL).origin;

export function getSafeCallbackUrl(callbackUrl: string | null): string {
  if (
    !callbackUrl ||
    !callbackUrl.startsWith("/") ||
    callbackUrl.includes("\\") ||
    /%5c/i.test(callbackUrl)
  ) {
    return DEFAULT_CALLBACK_URL;
  }

  try {
    decodeURI(callbackUrl);
    const parsedUrl = new URL(callbackUrl, CALLBACK_BASE_URL);

    if (parsedUrl.origin !== CALLBACK_BASE_ORIGIN) {
      return DEFAULT_CALLBACK_URL;
    }

    const normalizedPathname = decodeURIComponent(parsedUrl.pathname).toLowerCase();
    if (
      normalizedPathname.includes("\\") ||
      normalizedPathname === "/auth" ||
      normalizedPathname.startsWith("/auth/")
    ) {
      return DEFAULT_CALLBACK_URL;
    }

    return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
  } catch {
    return DEFAULT_CALLBACK_URL;
  }
}

export function getEmailVerificationCallbackUrl(callbackUrl: string): string {
  return `/auth/verify-email?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}
