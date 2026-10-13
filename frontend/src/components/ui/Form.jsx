import { forwardRef, useId } from 'react';
import clsx from 'clsx';
import { ChevronDown, Eye, EyeOff, Search as SearchIcon } from 'lucide-react';
import { useState } from 'react';

/**
 * Field wrapper: label, control, hint and error message.
 * The label is always rendered and tied to the control, and errors are
 * announced through `aria-describedby` rather than colour alone.
 */
export function Field({ label, htmlFor, required, error, hint, className, children }) {
  return (
    <div className={clsx('w-full', className)}>
      {label && (
        <label className="form-label" htmlFor={htmlFor}>
          {label}
          {required && <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="form-hint">{hint}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

export const Input = forwardRef(function Input(
  { label, error, hint, required, className, wrapperClassName, id, ...props }, ref,
) {
  const generatedId = useId();
  const inputId = id || generatedId;
  return (
    <Field label={label} htmlFor={inputId} required={required} error={error} hint={hint} className={wrapperClassName}>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={Boolean(error) || undefined}
        className={clsx('form-control', error && 'form-control-error', className)}
        {...props}
      />
    </Field>
  );
});

export const PasswordInput = forwardRef(function PasswordInput({ label, error, required, id, ...props }, ref) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id || generatedId;
  return (
    <Field label={label} htmlFor={inputId} required={required} error={error}>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={visible ? 'text' : 'password'}
          aria-invalid={Boolean(error) || undefined}
          className={clsx('form-control pr-10', error && 'form-control-error')}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </Field>
  );
});

export const Select = forwardRef(function Select(
  { label, error, hint, required, options = [], placeholder, className, wrapperClassName, id, children, ...props }, ref,
) {
  const generatedId = useId();
  const selectId = id || generatedId;
  return (
    <Field label={label} htmlFor={selectId} required={required} error={error} hint={hint} className={wrapperClassName}>
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          aria-invalid={Boolean(error) || undefined}
          className={clsx('form-control appearance-none pr-9', error && 'form-control-error', className)}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value ?? option} value={option.value ?? option}>
              {option.label ?? option}
            </option>
          ))}
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      </div>
    </Field>
  );
});

export const Textarea = forwardRef(function Textarea(
  { label, error, hint, required, rows = 4, className, id, ...props }, ref,
) {
  const generatedId = useId();
  const areaId = id || generatedId;
  return (
    <Field label={label} htmlFor={areaId} required={required} error={error} hint={hint}>
      <textarea
        ref={ref}
        id={areaId}
        rows={rows}
        aria-invalid={Boolean(error) || undefined}
        className={clsx('form-control resize-y', error && 'form-control-error', className)}
        {...props}
      />
    </Field>
  );
});

export const Checkbox = forwardRef(function Checkbox({ label, description, id, className, ...props }, ref) {
  const generatedId = useId();
  const boxId = id || generatedId;
  return (
    <div className={clsx('flex items-start gap-2.5', className)}>
      <input
        ref={ref}
        id={boxId}
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        {...props}
      />
      <div className="leading-tight">
        <label htmlFor={boxId} className="text-sm font-medium text-slate-700">{label}</label>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
    </div>
  );
});

/** Search box with a leading magnifier, used in list toolbars. */
export const SearchInput = forwardRef(function SearchInput({ className, wrapperClassName, ...props }, ref) {
  return (
    <div className={clsx('relative', wrapperClassName)}>
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input
        ref={ref}
        type="search"
        className={clsx('form-control pl-9', className)}
        {...props}
      />
    </div>
  );
});
