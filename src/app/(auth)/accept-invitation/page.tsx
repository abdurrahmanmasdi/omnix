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
import { useAuthStore } from "@/store/auth-store";

export default function AcceptInvitationPage() {
  const token = useRef("");
  const [invitationType, setInvitationType] = useState("");
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const { accessToken, user } = useAuthStore();

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const suppliedToken = params.get("token");
    const suppliedType = params.get("type");
    if (suppliedToken) token.current = suppliedToken;
    if (suppliedType) setInvitationType(suppliedType);
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname,
    );
  }, []);

  async function accept(event?: FormEvent<HTMLFormElement>) {
    if (event) event.preventDefault();
    if (pending) return;
    if (!/^[a-f0-9]{64}$/.test(token.current)) {
      setError("Open the invitation link provided by your pilot contact.");
      return;
    }
    
    let password = "";
    let firstName = "";
    let lastName = "";

    if (event) {
      const form = new FormData(event.currentTarget);
      password = String(form.get("password") ?? "");
      firstName = String(form.get("firstName") ?? "").trim();
      lastName = String(form.get("lastName") ?? "").trim();
      
      if (new TextEncoder().encode(password).length > 72) {
        setError("Please choose a password no longer than 72 UTF-8 bytes.");
        return;
      }
    }

    setPending(true);
    setError("");
    try {
      const url = invitationType === "clinic"
        ? `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/auth/invitations/clinic/accept`
        : `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/auth/accept-invitation`;

      const payload: any = { token: token.current };
      if (password) payload.password = password;
      if (firstName) payload.firstName = firstName;
      if (lastName) payload.lastName = lastName;

      const options: Record<string, any> = { withCredentials: false };
      if (accessToken) {
        options.headers = { Authorization: `Bearer ${accessToken}` };
      }

      await axios.post(url, payload, options);
      
      token.current = "";
      setComplete(true);
      
      if (accessToken && invitationType === "clinic") {
        setTimeout(() => {
           window.location.href = "/";
        }, 1500);
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Activation could not be completed. Your invitation may have expired or already been used. Try logging in, or ask your pilot contact for a new invitation.",
      );
    } finally {
      setPending(false);
    }
  }

  const isExistingUserClinicInvite = invitationType === "clinic" && user;

  return (
    <Card className="w-full shadow-lg">
      <CardHeader>
        <CardTitle>
          {complete ? (isExistingUserClinicInvite ? "Invitation accepted" : "Account activated") : (isExistingUserClinicInvite ? "Accept Clinic Invitation" : "Accept your pilot invitation")}
        </CardTitle>
        <CardDescription>
          {complete
            ? (isExistingUserClinicInvite ? "You have successfully joined the clinic." : "Log in with your invited email address and the password you just chose.")
            : (isExistingUserClinicInvite ? `You are logged in as ${user.firstName || "this account"}. Click below to accept the invitation.` : "Choose your account details to join.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {complete ? (
          !isExistingUserClinicInvite && (
            <Link href="/login" className="text-blue-600 hover:underline">
              Continue to login
            </Link>
          )
        ) : isExistingUserClinicInvite ? (
           <div className="space-y-4">
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <Button onClick={() => accept()} className="w-full" disabled={pending}>
              {pending ? "Accepting…" : "Accept invitation"}
            </Button>
          </div>
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
