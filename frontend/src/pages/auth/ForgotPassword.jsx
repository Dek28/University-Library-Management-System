import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { Button, Input } from '../../components/ui';
import { authApi } from '../../api/endpoints';

const schema = z.object({ email: z.string().trim().email('Enter a valid email address') });

export default function ForgotPassword() {
  const [sent, setSent] = useState(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async (values) => {
    // The API answers identically whether or not the address exists, so the
    // screen must not imply that a match was found.
    const response = await authApi.forgotPassword(values).catch((error) => ({ message: error.message, data: null }));
    setSent(response);
  };

  if (sent) {
    return (
      <div className="rounded-xl border border-line bg-panel p-8 text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <MailCheck className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="text-lg font-semibold text-slate-900">Check your email</h1>
        <p className="mt-2 text-sm text-slate-500">
          If that account exists, we have issued a password reset link. It expires in 30 minutes.
        </p>

        {sent.data?.resetUrl && (
          <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-left">
            <p className="text-2xs font-semibold uppercase tracking-wide text-amber-700">Development only</p>
            <p className="mt-1 text-xs text-amber-800">
              No mail transport is configured, so the link is shown here:
            </p>
            <a href={sent.data.resetUrl} className="mt-2 block break-all text-xs font-medium text-brand-700 underline">
              {sent.data.resetUrl}
            </a>
          </div>
        )}

        <Link to="/login" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-panel p-6 sm:p-8">
      <h1 className="text-xl font-semibold text-slate-900">Forgot your password?</h1>
      <p className="mt-1.5 text-sm text-slate-500">
        Enter the email address on your library account and we will send a reset link.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <Input
          label="Email address"
          type="email"
          placeholder="you@university.edu"
          autoComplete="email"
          autoFocus
          error={errors.email?.message}
          {...register('email')}
        />
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">Send reset link</Button>
      </form>

      <Link to="/login" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
      </Link>
    </div>
  );
}
