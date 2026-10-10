export function isAdminEmailAddress(email: string, configuredEmails: unknown) {
  if (typeof configuredEmails !== "string") return false;

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return false;

  return configuredEmails
    .split(",")
    .some((allowedEmail) => allowedEmail.trim().toLowerCase() === normalizedEmail);
}
