"use client";
import { useBackendError } from "@/i18n/backend";
import { useCopy } from "@/i18n/copy";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { authControllerConsumeRecovery } from "@/lib/api/generated/authentication/authentication";

export default function RecoverPage() {
  const copy = useCopy();
  const backendError = useBackendError();

  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const t = params.get("token");
    if (t) {
      setToken(t);
    } else {
      setError("Invalid recovery link. No token provided.");
    }
    setIsInitializing(false);
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (newPassword.length < 12) {
      setError("Password must be at least 12 characters");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await authControllerConsumeRecovery({
        token,
        newPassword,
      });
      setSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 3000);
    } catch (err: any) {
      setError(
        err.response?.data?.code ||
          err.response?.data?.message ||
          "Failed to reset password. The link may have expired.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isInitializing) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 pt-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {copy("Loading recovery info...")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-6 sm:w-[400px]">
      <div className="flex flex-col space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {copy("Reset Password")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {copy("Enter a new password for your account.")}
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{copy("Error")}</AlertTitle>
          <AlertDescription>
            {backendError(
              {
                response: {
                  data: {
                    code: error ?? undefined,
                    message: error ?? undefined,
                  },
                },
              },
              "",
            )}
          </AlertDescription>
        </Alert>
      )}

      {success ? (
        <Alert className="border-green-500 bg-green-50 text-green-900">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle>{copy("Password Reset")}</AlertTitle>
          <AlertDescription>
            {copy(
              "Your password has been successfully reset. Redirecting to login...",
            )}
          </AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newPassword">{copy("New Password")}</Label>
            <Input
              id="newPassword"
              type="password"
              placeholder={copy("At least 12 characters")}
              disabled={!token || isSubmitting}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={!token || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                {copy("Resetting...")}
              </>
            ) : (
              copy("Reset Password")
            )}
          </Button>
        </form>
      )}
    </div>
  );
}
