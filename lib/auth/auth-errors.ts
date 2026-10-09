export type AuthMode = "signin" | "signup";

type AuthErrorType =
  | "AUTHENTICATION_FAILED"
  | "ACCOUNT_CREATION_FAILED"
  | "EMAIL_NOT_VERIFIED"
  | "INVALID_EMAIL"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "NETWORK_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "TIMEOUT"
  | "UNKNOWN";

interface AuthErrorMapping {
  pattern: string | RegExp;
  type: AuthErrorType;
  message: string;
}

const AUTH_ERROR_MAPPINGS: AuthErrorMapping[] = [
  {
    pattern:
      /(invalid email or password|user not found|(invalid|incorrect) password)/i,
    type: "AUTHENTICATION_FAILED",
    message: "Invalid email or password. Please try again.",
  },
  {
    pattern:
      /(email already exists|already registered|user already exists|use another email|email already in use)/i,
    type: "ACCOUNT_CREATION_FAILED",
    message:
      "Unable to create your account. Please review your details and try again.",
  },
  {
    pattern: "invalid email",
    type: "INVALID_EMAIL",
    message: "Please enter a valid email address.",
  },
  {
    pattern: /(network|connection|failed to fetch|fetch failed)/i,
    type: "NETWORK_ERROR",
    message:
      "Unable to connect to the server. Please check your internet connection.",
  },
  {
    pattern: "timeout",
    type: "TIMEOUT",
    message: "The request took too long. Please try again.",
  },
];

export interface AuthError {
  type: AuthErrorType;
  message: string;
}

const DEFAULT_AUTH_ERROR_MESSAGES: Record<AuthMode, string> = {
  signin: "Unable to sign in right now. Please try again.",
  signup:
    "Unable to create your account. Please review your details and try again.",
};

function getErrorDetails(error: unknown) {
  if (typeof error === "string") return { message: error.toLowerCase(), status: undefined, code: "" };
  if (!error || typeof error !== "object") return { message: "", status: undefined, code: "" };

  const details = error as { message?: unknown; status?: unknown; statusCode?: unknown; code?: unknown };
  const status = typeof details.status === "number"
    ? details.status
    : typeof details.statusCode === "number" ? details.statusCode : undefined;
  return {
    message: typeof details.message === "string" ? details.message.toLowerCase() : "",
    status,
    code: typeof details.code === "string" ? details.code.toLowerCase() : "",
  };
}

export const getAuthError = (error: unknown, mode: AuthMode): AuthError => {
  const { message: errorMessage, status, code } = getErrorDetails(error);

  if (status === 429 || /rate.?limit|too many requests/.test(`${code} ${errorMessage}`)) {
    return { type: "RATE_LIMITED", message: "Too many attempts. Wait a little and try again." };
  }

  if (/email.?not.?verified/.test(`${code} ${errorMessage}`) || errorMessage.includes("email not verified")) {
    return {
      type: "EMAIL_NOT_VERIFIED",
      message: "Please verify your email address before signing in. Check your inbox or request a new link.",
    };
  }

  if (/provider|oauth/.test(`${code} ${errorMessage}`)) {
    return {
      type: "PROVIDER_UNAVAILABLE",
      message: "That sign-in provider is temporarily unavailable. Try again or use email and password.",
    };
  }

  if (status !== undefined && status >= 500) {
    return { type: "SERVICE_UNAVAILABLE", message: "Authentication is temporarily unavailable. Please try again." };
  }

  // Find matching error mapping
  const mapping = AUTH_ERROR_MAPPINGS.find((m) =>
    typeof m.pattern === "string"
      ? errorMessage.includes(m.pattern)
      : m.pattern.test(errorMessage),
  );

  if (mapping) {
    return {
      type: mapping.type,
      message: mapping.message,
    };
  }

  // Default error
  return {
    type: "UNKNOWN",
    message: DEFAULT_AUTH_ERROR_MESSAGES[mode],
  };
};
