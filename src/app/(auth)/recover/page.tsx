'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { authControllerConsumeRecovery } from '@/lib/api/generated/authentication/authentication';

export default function RecoverPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const t = params.get('token');
    if (t) {
      setToken(t);
    } else {
      setError('Invalid recovery link. No token provided.');
    }
    setIsInitializing(false);
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    
    if (newPassword.length < 12) {
      setError('Password must be at least 12 characters');
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
        router.push('/login');
      }, 3000);
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          'Failed to reset password. The link may have expired.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isInitializing) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 pt-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading recovery info...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-6 sm:w-[400px]">
      <div className="flex flex-col space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Reset Password
        </h1>
        <p className="text-sm text-muted-foreground">
          Enter a new password for your account.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success ? (
        <Alert className="border-green-500 bg-green-50 text-green-900">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle>Password Reset</AlertTitle>
          <AlertDescription>
            Your password has been successfully reset. Redirecting to login...
          </AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <Input
              id="newPassword"
              type="password"
              placeholder="At least 12 characters"
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
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resetting...
              </>
            ) : (
              'Reset Password'
            )}
          </Button>
        </form>
      )}
    </div>
  );
}
