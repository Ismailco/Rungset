import "server-only";

export type EmailPreferenceAction = "confirm" | "unsubscribe";

export interface EmailPreferenceTokenClaims {
  action: EmailPreferenceAction;
  userId: string;
  version: number;
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getKey(secret: string, usage: KeyUsage[]) {
  if (!secret) throw new Error("Better Auth secret is not configured.");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usage,
  );
}

export async function createEmailPreferenceToken(
  userId: string,
  version: number,
  action: EmailPreferenceAction,
  secret: string,
) {
  const payload = new TextEncoder().encode(JSON.stringify({ userId, version, action }));
  const signature = await crypto.subtle.sign("HMAC", await getKey(secret, ["sign"]), payload);
  return `${encodeBase64Url(payload)}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyEmailPreferenceToken(
  token: string,
  secret: string,
  expectedAction?: EmailPreferenceAction,
): Promise<EmailPreferenceTokenClaims | null> {
  try {
    const separator = token.indexOf(".");
    if (separator < 1 || separator === token.length - 1) return null;
    const payload = decodeBase64Url(token.slice(0, separator));
    const signature = decodeBase64Url(token.slice(separator + 1));
    const valid = await crypto.subtle.verify(
      "HMAC",
      await getKey(secret, ["verify"]),
      signature,
      payload,
    );
    if (!valid) return null;

    const claims = JSON.parse(new TextDecoder().decode(payload)) as Partial<EmailPreferenceTokenClaims>;
    if (
      typeof claims.userId !== "string" ||
      claims.userId.length === 0 ||
      !Number.isSafeInteger(claims.version) ||
      claims.version! < 0 ||
      (claims.action !== "confirm" && claims.action !== "unsubscribe") ||
      (expectedAction && claims.action !== expectedAction)
    ) {
      return null;
    }

    return claims as EmailPreferenceTokenClaims;
  } catch {
    return null;
  }
}
