import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .max(254, "Email must be 254 characters or fewer")
  .email("Please enter a valid email address")
  .transform((email) => email.toLowerCase());

const passwordSchema = z
  .string()
  .min(1, "Password is required")
  .max(128, "Password must be 128 characters or fewer");

export const signInCredentialsSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
  })
  .passthrough();

export const signUpCredentialsSchema = z
  .object({
    name: z.string().trim().min(1, "Full name is required").max(100, "Full name must be 100 characters or fewer"),
    email: emailSchema,
    password: passwordSchema
      .min(8, "Password must be at least 8 characters long")
      .refine((password) => /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password), {
        message: "Password must contain at least one uppercase letter, one lowercase letter, and one number",
      }),
  })
  .passthrough();

export type AuthFieldName = "name" | "email" | "password" | "passwordConfirm";

export function getAuthFieldError(
  field: AuthFieldName,
  value: string,
  mode: "signin" | "signup",
  password = "",
): string | undefined {
  if (field === "passwordConfirm") {
    if (!value) return "Please confirm your password";
    if (value !== password) return "Passwords do not match";
    return undefined;
  }

  const schema = field === "email"
    ? signInCredentialsSchema.shape.email
    : field === "password"
      ? mode === "signup" ? signUpCredentialsSchema.shape.password : signInCredentialsSchema.shape.password
      : signUpCredentialsSchema.shape.name;
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}
