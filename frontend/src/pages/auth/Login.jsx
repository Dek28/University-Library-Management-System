import { useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
} from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { useAuthStore } from '../../store/auth';
import { AuthInput, AuthPasswordInput } from './AuthFields';

const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(3, 'Enter your email, registration number or staff ID'),

  password: z
    .string()
    .min(1, 'Enter your password'),

  remember: z.boolean().optional(),
});

export default function Login() {
  const [formError, setFormError] = useState(null);

  const login = useAuthStore((state) => state.login);

  const navigate = useNavigate();
  const location = useLocation();

  const {
    register,
    handleSubmit,
    formState: {
      errors,
      isSubmitting,
    },
  } = useForm({
    resolver: zodResolver(loginSchema),

    defaultValues: {
      identifier: '',
      password: '',
      remember: true,
    },
  });

  const onSubmit = async (values) => {
    setFormError(null);

    try {
      const user = await login({
        identifier: values.identifier.trim(),
        password: values.password,
      });

      toast.success(
        user?.firstName
          ? `Welcome back, ${user.firstName}`
          : 'Welcome back',
      );

      const destination =
        location.state?.from?.pathname ||
        (user?.mustChangePassword
          ? '/profile?tab=security'
          : '/dashboard');

      navigate(destination, {
        replace: true,
      });
    } catch (error) {
      setFormError(
        error?.message ||
        'Unable to sign in. Please check your credentials and try again.',
      );
    }
  };

  return (
    <section className="w-full">

      {/* Heading */}
      <div className="mb-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#2C62D2]">
          Account Access
        </p>

        <h1 className="mt-2.5 text-[24px] font-bold leading-tight tracking-tight text-[#12233C]">
          Welcome back
        </h1>

        <p className="mt-1.5 text-sm leading-5 text-[#71829A]">
          Sign in using your university credentials.
        </p>
      </div>

      {/* Error message */}
      {formError && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-[10px] border border-red-200 bg-red-50 px-3.5 py-2.5"
        >
          <AlertCircle
            className="mt-0.5 h-4 w-4 shrink-0 text-red-600"
            aria-hidden="true"
          />

          <p className="text-sm leading-5 text-red-700">
            {formError}
          </p>
        </div>
      )}

      {/* Login form */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
        noValidate
      >
        <AuthInput
          label="Email, Registration Number or Staff ID"
          placeholder="e.g. REG/2026/001"
          autoComplete="username"
          autoFocus
          error={errors.identifier?.message}
          {...register('identifier')}
        />

        <AuthPasswordInput
          label="Password"
          placeholder="Enter your password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />

        {/* Options */}
        <div className="flex items-center justify-between gap-4">
          <label className="flex cursor-pointer select-none items-center gap-2 text-[13px] text-[#334A68]">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer rounded accent-[#2556E8]"
              {...register('remember')}
            />
            Remember me
          </label>

          <Link
            to="/forgot-password"
            className="whitespace-nowrap rounded text-[13px] font-medium text-[#2457CF] transition hover:text-[#1D45A8] hover:underline focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-[#2556E8]/20"
          >
            Forgot password?
          </Link>
        </div>

        {/* Sign in */}
        <button
          type="submit"
          disabled={isSubmitting}
          aria-busy={isSubmitting || undefined}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-[#2556E8] text-[15px] font-bold text-white transition hover:bg-[#1D47C4] active:bg-[#193FAB] focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-[#2556E8]/25 disabled:cursor-not-allowed disabled:opacity-70"
        >
          Sign in

          {isSubmitting ? (
            <Loader2
              className="h-4 w-4 animate-spin"
              aria-hidden="true"
            />
          ) : (
            <ArrowRight
              className="h-4 w-4"
              aria-hidden="true"
            />
          )}
        </button>
      </form>

    </section>
  );
}
