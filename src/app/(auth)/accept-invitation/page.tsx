"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AcceptInvitationPage() {
  const token = useRef("");
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const supplied = new URLSearchParams(window.location.hash.slice(1)).get(
      "token",
    );
    if (supplied) token.current = supplied;
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname,
    );
  }, []);

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!/^[a-f0-9]{64}$/.test(token.current)) {
      setError("Open the invitation link provided by your pilot contact.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (new TextEncoder().encode(password).length > 72) {
      setError("Please choose a password no longer than 72 UTF-8 bytes.");
      return;
    }
    setPending(true);
    setError("");
    try {
      // Activation has no session; do not invoke authenticated refresh/retry handling.
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/auth/accept-invitation`,
        {
          token: token.current,
          password,
          firstName: String(form.get("firstName") ?? "").trim(),
          lastName: String(form.get("lastName") ?? "").trim(),
        },
        { withCredentials: false },
      );
      token.current = "";
      setComplete(true);
    } catch {
      setError(
        "Activation could not be completed. Your invitation may have expired or already been used. Try logging in, or ask your pilot contact for a new invitation.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="w-full shadow-lg">
      <CardHeader>
        <CardTitle>
          {complete ? "Account activated" : "Accept your pilot invitation"}
        </CardTitle>
        <CardDescription>
          {complete
            ? "Log in with your invited email address and the password you just chose."
            : "Choose your account details to join the invitation-only pilot."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {complete ? (
          <Link href="/login" className="text-blue-600 hover:underline">
            Continue to login
          </Link>
        ) : (
          <form onSubmit={accept} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                name="firstName"
                autoComplete="given-name"
                required
                maxLength={100}
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                name="lastName"
                autoComplete="family-name"
                required
                maxLength={100}
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={72}
                disabled={pending}
              />
              <p className="text-sm text-slate-500">
                Use at least 12 characters.
              </p>
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Activating…" : "Activate account"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
