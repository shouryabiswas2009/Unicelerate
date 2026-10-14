"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signup } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/auth/password-input";
import { MIN_PASSWORD_LENGTH, validateSignup, type SignupFieldErrors } from "@/lib/signup-validation";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, undefined);
  // Controlled fields: React clears a form after a server action, but these
  // keep their values in state, so a failed sign-up doesn't wipe what the
  // student typed. (The server never sends the passwords back.)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Errors found in the browser before sending; the server's own check
  // (same rule, lib/signup-validation.ts) shows in state.fieldErrors.
  const [clientErrors, setClientErrors] = useState<SignupFieldErrors | null>(null);
  const errors: SignupFieldErrors = clientErrors ?? state?.fieldErrors ?? {};

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    const result = validateSignup(email, password, confirmPassword);
    if (!result.ok) {
      event.preventDefault();
      setClientErrors(result.errors);
    } else {
      setClientErrors(null);
    }
  }

  // Typing in a field clears its message.
  function clearError(field: keyof SignupFieldErrors) {
    if (clientErrors?.[field]) setClientErrors({ ...clientErrors, [field]: undefined });
  }

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            clearError("email");
          }}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-error" : undefined}
        />
        {errors.email && <p id="email-error" className="text-sm text-destructive">{errors.email}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          name="password"
          label="Password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            clearError("password");
          }}
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? "password-error" : "password-hint"}
        />
        {errors.password ? (
          <p id="password-error" className="text-sm text-destructive">{errors.password}</p>
        ) : (
          <p id="password-hint" className="text-xs text-muted-foreground">
            At least {MIN_PASSWORD_LENGTH} characters, and not a very common password like &ldquo;password1&rdquo; or
            &ldquo;12345678&rdquo;.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          label="Confirm password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            clearError("confirmPassword");
          }}
          aria-invalid={!!errors.confirmPassword}
          aria-describedby={errors.confirmPassword ? "confirm-error" : undefined}
        />
        {errors.confirmPassword && (
          <p id="confirm-error" className="text-sm text-destructive">{errors.confirmPassword}</p>
        )}
      </div>

      {state?.error && !state.fieldErrors && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.message && <p className="text-sm text-muted-foreground">{state.message}</p>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Sign up"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-foreground hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
