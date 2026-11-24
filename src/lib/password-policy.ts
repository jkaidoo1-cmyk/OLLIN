/**
 * Shared password rules for self-service accounts.
 *
 * Length alone is not a strong-password test: "password1" clears an
 * eight-character minimum. These rules ask for a length people must actually
 * type something for, require more than one character class, and reject the
 * handful of passwords that appear at the top of every breach list.
 *
 * Client-safe (no fs), so the signup/change forms and the API routes enforce
 * exactly the same thing.
 */

export const MIN_PASSWORD_LENGTH = 10;

export const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters, with a letter and a number.`;

const COMMON_PASSWORDS = new Set([
  "1234567890",
  "12345678910",
  "password12",
  "password123",
  "password1234",
  "passw0rd123",
  "qwerty1234",
  "qwertyuiop",
  "iloveyou123",
  "letmein1234",
  "welcome1234",
  "admin12345",
  "abc12345678",
]);

/**
 * Returns the first rule the password breaks, or null when it is acceptable.
 * `email` is optional so callers that don't have it still get every other rule.
 */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`;
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Include at least one letter and one number.";
  }
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) {
    return "That password is too common. Choose something less predictable.";
  }
  const localPart = email?.split("@")[0]?.toLowerCase().trim();
  if (localPart && localPart.length >= 3 && lower.includes(localPart)) {
    return "Don't use your email address in your password.";
  }
  return null;
}
