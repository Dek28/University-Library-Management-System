import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, PasswordInput } from '../../components/ui';
import { authApi } from '../../api/endpoints';
import { passwordSchema } from '../../validators/schemas';

const schema = z.object({
  newPassword: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'The two passwords do not match',
  path: ['confirmPassword'],
});

export default function ResetPassword() {
  const [params] = useSearchParams();
  const [formError, setFormError] = useState(null);
  const navigate = useNavigate();

  const token = params.get('token') || '';
  const email = params.get('email') || '';

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async (values) => {
    setFormError(null);
    try {
      await authApi.resetPassword({ token, email, newPassword: values.newPassword });
      toast.success('Password reset. You can now sign in.');
      navigate('/login', { replace: true });
    } catch (error) {
      setFormError(error.message);
    }
  };

  if (!token || !email) {
    return (
      <div className="text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertCircle className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="text-lg font-semibold text-slate-900">This reset link is incomplete</h1>
        <p className="mt-2 text-sm text-slate-500">
          Open the link exactly as it was sent to you, or request a new one.
        </p>
        <Link to="/forgot-password" className="mt-5 inline-block text-sm font-medium text-brand-600 hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Set a new password</h1>
      <p className="mt-1.5 text-sm text-slate-500">Resetting the password for <span className="font-medium text-slate-700">{email}</span>.</p>

      {formError && (
        <div role="alert" className="mt-5 flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 px-3.5 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
          <p className="text-sm text-red-700">{formError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <PasswordInput
          label="New password"
          autoComplete="new-password"
          autoFocus
          error={errors.newPassword?.message}
          hint="At least 8 characters, with an uppercase letter, a lowercase letter and a number."
          {...register('newPassword')}
        />
        <PasswordInput
          label="Confirm new password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">Reset password</Button>
      </form>

      <Link to="/login" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
      </Link>
    </div>
  );
}
