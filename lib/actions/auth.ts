"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp, rateLimit, tooManyMessage } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site-url";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { validateSignup, type SignupFieldErrors } from "@/lib/signup-validation";

export type AuthFormState = { error?: string; message?: string } | undefined;

export async function login(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  // A first line against password guessing (lib/rate-limit.ts); Supabase
  // Auth has its own per-IP limit too.
  const limited = rateLimit("login", clientIp((await headers()).get("x-forwarded-for")));
  if (!limited.ok) return { error: tooManyMessage(limited.retryAfterSeconds) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Supabase's own message here ("Email not confirmed") doesn't tell the
    // student what to do next.
    if (error.code === "email_not_confirmed") {
      return {
        error:
          "Please confirm your email first — check your inbox (and spam folder) for the confirmation link.",
      };
    }
    return { error: error.message };
  }

  // Back to the page they were trying to open, if any (only paths on this site).
  redirect(safeRedirectPath(formData.get("next") as string | null, "/recommendations"));
}

export type SignupFormState =
  | { error?: string; message?: string; fieldErrors?: SignupFieldErrors }
  | undefined;

export async function signup(
  _prevState: SignupFormState,
  formData: FormData
): Promise<SignupFormState> {
  // Checked here on the server too: the browser check can be bypassed.
  // The result never contains the passwords, so they're never sent back
  // to the page or logged.
  const result = validateSignup(
    String(formData.get("email") ?? ""),
    String(formData.get("password") ?? ""),
    String(formData.get("confirmPassword") ?? "")
  );
  if (!result.ok) return { error: "Please fix the highlighted fields.", fieldErrors: result.errors };
  const { email, password } = result;

  const limited = rateLimit("signup", clientIp((await headers()).get("x-forwarded-for")));
  if (!limited.ok) return { error: tooManyMessage(limited.retryAfterSeconds) };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // The deployed address (see lib/site-url.ts), so the email doesn't
      // point at localhost once the site is live.
      emailRedirectTo: `${siteUrl()}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  // If email confirmation is required, Supabase won't return a session yet.
  if (!data.session) {
    return {
      message:
        "Account created! Check your email to confirm it before logging in.",
    };
  }

  redirect("/profile");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
