// The sign-up rules, in one place. The sign-up form checks them in the
// browser (for a quick message) and the sign-up server action checks them
// again (the browser check can be skipped, so the server one is the real
// one). Both call these functions, so they can't disagree.
//
// Passwords themselves are never returned, stored or logged by this code;
// Supabase handles them (hashing, storage) exactly as before.

// At least 8 characters. Supabase Auth's own minimum must be set to the same
// number in the dashboard (Authentication → Providers → Email → minimum
// password length), so the server refuses shorter ones too.
export const MIN_PASSWORD_LENGTH = 8;

// Passwords that are long enough but guessed first by anyone trying. A small
// local list (no network call): very common passwords and keyboard patterns
// of 8+ characters. Compared ignoring case.
export const COMMON_PASSWORDS = new Set([
  "password", "password1", "password12", "password123", "passw0rd", "p@ssw0rd", "p@ssword",
  "12345678", "123456789", "1234567890", "0123456789", "87654321", "11111111", "00000000",
  "12341234", "11223344", "123123123", "1q2w3e4r", "1q2w3e4r5t", "zaq12wsx", "1qaz2wsx",
  "qwertyui", "qwertyuiop", "qwerty123", "qwerty12", "asdfghjk", "asdfghjkl", "zxcvbnm1",
  "abcd1234", "abc12345", "abcdefgh", "iloveyou", "iloveyou1", "sunshine", "princess",
  "football", "baseball", "superman", "starwars", "whatever", "trustno1", "letmein1",
  "welcome1", "welcome123", "admin123", "administrator", "computer", "internet", "michelle",
  "jennifer", "charlie1", "liverpool", "chelsea1", "arsenal1", "pokemon1", "minecraft",
  "unicelerate", "university", "student1", "college1",
]);

// Plain-language reasons a password is too easy to guess, or null when fine.
export function weakPasswordReason(password: string): string | null {
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return "That's one of the most common passwords. Pick something harder to guess.";
  if (/^(.)\1+$/.test(password)) return "Don't use one character repeated. Pick something harder to guess.";
  return null;
}

export type SignupFieldErrors = {
  email?: string;
  password?: string;
  confirmPassword?: string;
};

export function passwordErrors(password: string, confirmPassword: string): SignupFieldErrors {
  const errors: SignupFieldErrors = {};
  if (password.length === 0) errors.password = "Enter a password.";
  else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  } else {
    const weak = weakPasswordReason(password);
    if (weak) errors.password = weak;
  }
  if (confirmPassword.length === 0) errors.confirmPassword = "Type your password again to confirm it.";
  else if (confirmPassword !== password) errors.confirmPassword = "Passwords don't match.";
  return errors;
}

export function emailError(email: string): string | undefined {
  if (email.trim().length === 0) return "Enter your email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Enter a valid email address.";
  return undefined;
}

export type SignupValidation =
  | { ok: true; email: string; password: string }
  | { ok: false; errors: SignupFieldErrors };

export function validateSignup(email: string, password: string, confirmPassword: string): SignupValidation {
  const errors: SignupFieldErrors = { ...passwordErrors(password, confirmPassword) };
  const badEmail = emailError(email);
  if (badEmail) errors.email = badEmail;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, email: email.trim(), password };
}
