import { forwardRef, useId, useState } from 'react';
import clsx from 'clsx';
import { Eye, EyeOff } from 'lucide-react';

/**
 * Form controls for the sign-in screen.
 *
 * The sign-in design has its own look (compact 40px fields, bold labels),
 * so these are kept apart from the app-wide `Input`, which follows the
 * application theme.
 */
const CONTROL = [
  'block h-10 w-full rounded-[10px] border bg-white px-3.5 text-[14px] text-[#12233C]',
  'placeholder:text-[#8797AC] transition',
  'hover:border-[#B9C7DA]',
  'focus:border-[#2556E8] focus:outline-hidden focus:ring-[3px] focus:ring-[#2556E8]/15',
].join(' ');

function Field({ id, label, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-bold text-[#23344F]">
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export const AuthInput = forwardRef(function AuthInput({ label, error, id, ...props }, ref) {
  const generatedId = useId();
  const inputId = id || generatedId;
  return (
    <Field id={inputId} label={label} error={error}>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={Boolean(error) || undefined}
        className={clsx(CONTROL, error ? 'border-red-400 hover:border-red-400' : 'border-[#C4D0E0]')}
        {...props}
      />
    </Field>
  );
});

export const AuthPasswordInput = forwardRef(function AuthPasswordInput({ label, error, id, ...props }, ref) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id || generatedId;
  return (
    <Field id={inputId} label={label} error={error}>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={visible ? 'text' : 'password'}
          aria-invalid={Boolean(error) || undefined}
          className={clsx(CONTROL, 'pr-10', error ? 'border-red-400 hover:border-red-400' : 'border-[#C4D0E0]')}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-[10px] text-[#71829A] transition hover:text-[#12233C] focus-visible:text-[#2556E8] focus-visible:outline-hidden"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
        </button>
      </div>
    </Field>
  );
});
