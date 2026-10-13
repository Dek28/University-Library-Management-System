import { useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
} from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, LogIn } from 'lucide-react';
import toast from 'react-hot-toast';

import {
  Button,
  Input,
  PasswordInput,
  Checkbox,
} from '../../components/ui';

import { useAuthStore } from '../../store/auth';

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

      {/* Login card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">

        {/* Heading */}
        <div className="mb-7">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">
            Account Access
          </p>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Welcome back
          </h1>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            Sign in using your university email, registration number or staff ID.
          </p>
        </div>

        {/* Error message */}
        {formError && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
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
          className="space-y-5"
          noValidate
        >
          <Input
            label="Email, Registration Number or Staff ID"
            placeholder="e.g. REG/2026/001"
            autoComplete="username"
            autoFocus
            error={errors.identifier?.message}
            {...register('identifier')}
          />

          <PasswordInput
            label="Password"
            placeholder="Enter your password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />

          {/* Options */}
          <div className="flex items-center justify-between gap-4">
            <Checkbox
              label="Remember me"
              {...register('remember')}
            />

            <Link
              to="/forgot-password"
              className="whitespace-nowrap text-sm font-semibold text-blue-700 transition hover:text-blue-800 hover:underline focus:outline-hidden focus:ring-2 focus:ring-blue-500/30"
            >
              Forgot password?
            </Link>
          </div>

          {/* Sign in */}
          <Button
            type="submit"
            size="lg"
            loading={isSubmitting}
            className="w-full bg-blue-700 text-white hover:bg-blue-800"
          >
            {!isSubmitting && (
              <LogIn
                className="mr-2 h-4 w-4"
                aria-hidden="true"
              />
            )}

            Sign in
          </Button>
        </form>

        {/* Support */}
        <div className="mt-7 border-t border-slate-100 pt-5">
          <p className="text-center text-xs leading-5 text-slate-400">
            Trouble signing in? Contact the library circulation desk.
          </p>
        </div>

      </div>
    </section>
  );
}