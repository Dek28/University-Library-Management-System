import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

/**
 * Solid variants use the dedicated action colours rather than a ramp stop, so
 * the fill stays legible against its own foreground in either theme while the
 * ramps stay free to be tuned for text.
 */
const VARIANTS = {
  primary: 'bg-action text-on-solid hover:bg-action-hover active:brightness-95 disabled:bg-action/50',
  secondary: 'border border-line-strong bg-panel text-slate-700 hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100',
  subtle: 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-200',
  danger: 'bg-destructive text-on-solid hover:bg-destructive-hover active:brightness-95 disabled:bg-destructive/50',
  success: 'bg-positive text-on-solid hover:bg-positive-hover active:brightness-95',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  link: 'px-0 text-brand-600 underline-offset-4 hover:text-brand-700 hover:underline',
};

const SIZES = {
  sm: 'h-8 gap-1.5 px-3 text-sm',
  md: 'h-9 gap-2 px-3.5 text-base',
  lg: 'h-11 gap-2 px-5 text-md',
};

/**
 * The application's single button primitive.
 *
 * Buttons carry a label and nothing else. A glyph beside a word that already
 * says "Export" adds no information, so the only mark a button ever shows is
 * the busy spinner, which does say something the label cannot.
 *
 * `loading` also disables the control, so a submit cannot be double-fired.
 */
export default function Button({
  as: Component = 'button',
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className,
  children,
  ...props
}) {
  const isDisabled = disabled || loading;

  return (
    <Component
      className={clsx(
        'inline-flex select-none items-center justify-center whitespace-nowrap rounded-lg font-medium',
        'transition-[background-color,border-color,color,filter] duration-100',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={Component === 'button' ? isDisabled : undefined}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </Component>
  );
}

/** Compact icon-only action used inside table rows. */
export function IconButton({ icon: Icon, label, tone = 'brand', className, ...props }) {
  const tones = {
    brand: 'text-slate-500 hover:bg-brand-50 hover:text-brand-700',
    success: 'text-slate-500 hover:bg-emerald-50 hover:text-emerald-700',
    danger: 'text-slate-500 hover:bg-red-50 hover:text-red-600',
    muted: 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
  };
  return (
    <button type="button" className={clsx('icon-btn', tones[tone], className)} title={label} aria-label={label} {...props}>
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
