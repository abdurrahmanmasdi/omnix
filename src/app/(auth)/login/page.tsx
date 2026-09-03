'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { loginSchema, type LoginFormData } from '@/lib/validations/auth';

// IMPORTANT: Update this import to match the exact name Orval generated for you!
import { useAuthControllerLogin } from '@/lib/api/generated/authentication/authentication';

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
import { useAuthStore } from '@/store/auth-store';

export default function LoginPage() {
  const router = useRouter();
  
  // 1. Initialize React Hook Form with Zod validation
  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  // 2. Initialize our Orval-generated React Query Mutation
  const loginMutation = useAuthControllerLogin();

  // 3. Handle the submit event
  const onSubmit = (data: LoginFormData) => {
    loginMutation.mutate(
      { data }, // Orval expects the body payload inside a 'data' property
      {
        onSuccess: (response) => {
          toast.success('Welcome back!');
          
          // The backend sends us { access_token, user }
          const { access_token, user } = response;
          
          useAuthStore.getState().setAuth(access_token, user);
          
          // Route based on whether they have an organization yet!
          if (user.hasCompletedOnboarding) {
            router.push('/dashboard');
          } else {
            router.push('/onboarding/create-organization');
          }
        },
        onError: (error: any) => {
          // Extract the error message from our NestJS backend
          const message = error.response?.data?.message || 'Invalid email or password';
          toast.error(message);
        },
      }
    );
  };

  return (
    <Card className="w-full shadow-lg">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold tracking-tight">
          OmniDesk
        </CardTitle>
        <CardDescription>
          Enter your email and password to log in to your CRM.
        </CardDescription>
      </CardHeader>
      
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          {/* Email Field */}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@clinic.com"
              {...form.register('email')}
              disabled={loginMutation.isPending}
            />
            {form.formState.errors.email && (
              <p className="text-sm text-red-500">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          {/* Password Field */}
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              {...form.register('password')}
              disabled={loginMutation.isPending}
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
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? 'Logging in...' : 'Log in'}
          </Button>
          <div className="text-center text-sm text-slate-500">
            Don't have an account?{' '}
            <Link href="/signup" className="text-blue-600 hover:underline font-medium">
              Sign up
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}