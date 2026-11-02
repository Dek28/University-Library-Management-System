import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { authApi } from '../../api/endpoints';
import { passwordSchema } from '../../validators/schemas';
import { AuthInput, AuthPasswordInput } from './AuthFields';

const RESEND_SECONDS = 60;

const emailSchema = z.object({ email: z.string().trim().email('Enter a valid email address') });

const resetSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  newPassword: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'The two passwords do not match',
  path: ['confirmPassword'],
});

const SUBMIT_CLASS = 'flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-[#2556E8] text-[15px] font-bold text-white transition hover:bg-[#1D47C4] active:bg-[#193FAB] focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-[#2556E8]/25 disabled:cursor-not-allowed disabled:opacity-70';
const LINK_CLASS = 'text-[13px] font-medium text-[#2457CF] hover:text-[#1D45A8] hover:underline disabled:cursor-not-allowed disabled:text-[#8797AC] disabled:no-underline';

function BackToSignIn() {
  return (
    <Link to="/login" className={`mt-6 inline-flex items-center gap-1.5 ${LINK_CLASS}`}>
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to sign in
    </Link>
  );
}

function FormError({ message }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-[10px] border border-red-200 bg-red-50 px-3.5 py-2.5">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
      <p className="text-sm leading-5 text-red-700">{message}</p>
    </div>
  );
}

/** Step 1: the registered email address. A code is sent to it. */
function RequestCode({ onSent }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(emailSchema) });

  const onSubmit = async ({ email }) => {
    // The API answers the same way whether or not the address is registered,
    // so this screen moves on either way.
    const response = await authApi.forgotPassword({ email }).catch(() => null);
    onSent(email, response?.data?.code || null);
  };

  return (
    <div>
      <h1 className="mb-6 text-[24px] font-bold leading-tight tracking-tight text-[#12233C]">Reset password</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <AuthInput
          label="Email address"
          type="email"
          autoComplete="email"
          autoFocus
          error={errors.email?.message}
          {...register('email')}
        />
        <button type="submit" disabled={isSubmitting} className={SUBMIT_CLASS}>
          Send code
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        </button>
      </form>

      <BackToSignIn />
    </div>
  );
}

/** Step 2: the emailed code and the new password. */
function ConfirmCode({ email, devCode, onResend, onChangeEmail }) {
  const navigate = useNavigate();
  const [formError, setFormError] = useState(null);
  const [wait, setWait] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(resetSchema) });

  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => setWait((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const onSubmit = async ({ code, newPassword }) => {
    setFormError(null);
    try {
      await authApi.resetPassword({ email, code, newPassword });
      toast.success('Password reset. You can now sign in.');
      navigate('/login', { replace: true });
    } catch (error) {
      setFormError(error.message);
    }
  };

  const resend = async () => {
    setResending(true);
    setFormError(null);
    await onResend();
    setWait(RESEND_SECONDS);
    setResending(false);
  };

  return (
    <div>
      <h1 className="text-[24px] font-bold leading-tight tracking-tight text-[#12233C]">Enter your code</h1>
      <p className="mb-6 mt-1.5 text-sm leading-5 text-[#71829A]">
        Sent to <span className="font-semibold text-[#23344F]">{email}</span>
      </p>

      {devCode && (
        <p className="mb-4 rounded-[10px] border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
          Development: your code is <span className="font-mono font-bold">{devCode}</span>
        </p>
      )}

      <FormError message={formError} />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <AuthInput
          label="6-digit code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          error={errors.code?.message}
          {...register('code')}
        />
        <AuthPasswordInput
          label="New password"
          autoComplete="new-password"
          error={errors.newPassword?.message}
          {...register('newPassword')}
        />
        <AuthPasswordInput
          label="Confirm new password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <button type="submit" disabled={isSubmitting} className={SUBMIT_CLASS}>
          Reset password
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        </button>
      </form>

      <div className="mt-4 flex items-center justify-between gap-4">
        <button type="button" onClick={resend} disabled={wait > 0 || resending} className={LINK_CLASS}>
          {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
        </button>
        <button type="button" onClick={onChangeEmail} className={LINK_CLASS}>Use a different email</button>
      </div>

      <BackToSignIn />
    </div>
  );
}

export default function ForgotPassword() {
  const [request, setRequest] = useState(null);

  if (!request) {
    return <RequestCode onSent={(email, devCode) => setRequest({ email, devCode })} />;
  }

  return (
    <ConfirmCode
      email={request.email}
      devCode={request.devCode}
      onResend={async () => {
        const response = await authApi.forgotPassword({ email: request.email }).catch(() => null);
        setRequest((current) => ({ ...current, devCode: response?.data?.code || current.devCode }));
      }}
      onChangeEmail={() => setRequest(null)}
    />
  );
}
