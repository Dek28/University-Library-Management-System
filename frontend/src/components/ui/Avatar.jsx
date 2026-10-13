import clsx from 'clsx';
import { useState } from 'react';
import { initials } from '../../utils/format';

const SIZES = {
  xs: 'h-7 w-7 text-2xs',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-20 w-20 text-2xl',
};

/** Profile photo with an initials fallback when the image is absent or fails. */
export default function Avatar({ user, src, size = 'md', className, alt }) {
  const [failed, setFailed] = useState(false);
  const source = src || user?.profilePhoto;
  const label = alt || (user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'User');

  if (source && !failed) {
    return (
      <img
        src={source}
        alt={label}
        onError={() => setFailed(true)}
        className={clsx('shrink-0 rounded-full bg-slate-100 object-cover', SIZES[size], className)}
      />
    );
  }

  return (
    <span
      className={clsx(
        'flex shrink-0 select-none items-center justify-center rounded-full bg-brand-50 font-semibold uppercase tracking-tight text-brand-700',
        SIZES[size],
        className,
      )}
      aria-label={label}
      role="img"
    >
      {initials(user)}
    </span>
  );
}
