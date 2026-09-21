'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { signupSchema, type SignupFormData } from '@/lib/validations/auth';

import { useAuthControllerSignup } from '@/lib/api/generated/authentication/authentication';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { installSession } from '@/lib/session-manager';

export default function SignupPage() {
  const router = useRouter();
  
  const form = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
    },
  });

  const signupMutation = useAuthControllerSignup();

  const onSubmit = (data: SignupFormData) => {
    signupMutation.mutate(
      { data },
      {
        onSuccess: (response: unknown) => {
          const res = response as unknown as { access_token?: string; user?: { hasCompletedOnboarding: boolean, id: string, organizationId: string } };
          // If the backend returns an access_token, log them in automatically
          if (res?.access_token && res?.user) {
            toast.success('Account created successfully!');
            installSession(res.access_token, res.user);
            
            if (res.user.hasCompletedOnboarding) {
              router.push('/dashboard');
            } else {
              router.push('/onboarding/create-organization');
            }
          } else {
            // Otherwise, prompt them to log in
            toast.success('Account created! Please log in.');
            router.push('/login');
          }
        },
        onError: (error: unknown) => {
          const err = error as { response?: { data?: { message?: string | string[] } } };
          const message = err.response?.data?.message || 'Failed to create account';
          toast.error(
            Array.isArray(message) ? message[0] : message
          );
        },
      }
    );
  };

  return (
    <Card className="w-full shadow-lg">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold tracking-tight">
          Create an Account
        </CardTitle>
        <CardDescription>
          Sign up to get started with your AI Sales Agent.
        </CardDescription>
      </CardHeader>
      
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                placeholder="John"
                {...form.register('firstName')}
                disabled={signupMutation.isPending}
              />
              {form.formState.errors.firstName && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.firstName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                placeholder="Doe"
                {...form.register('lastName')}
                disabled={signupMutation.isPending}
              />
              {form.formState.errors.lastName && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.lastName.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@clinic.com"
              {...form.register('email')}
              disabled={signupMutation.isPending}
            />
            {form.formState.errors.email && (
              <p className="text-sm text-red-500">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              {...form.register('password')}
              disabled={signupMutation.isPending}
            />
            {form.formState.errors.password && (
              <p className="text-sm text-red-500">
                {form.formState.errors.password.message}
              </p>
            )}
          </div>
        </CardContent>
        
        <CardFooter className="flex flex-col gap-4">
          <Button 
            type="submit" 
            className="w-full" 
            disabled={signupMutation.isPending}
          >
            {signupMutation.isPending ? 'Creating Account...' : 'Sign Up'}
          </Button>
          <div className="text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-600 hover:underline font-medium">
              Log in
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
