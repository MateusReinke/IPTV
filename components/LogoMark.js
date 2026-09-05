import { useId } from 'react';

// Small brand mark: a rounded gradient tile with a play glyph, echoing the
// full app icon (public/icon.svg) at a size where the grid detail would just
// be noise. Sizing comes from the className the caller passes in (each spot
// that used to render a plain color swatch already has one).
export default function LogoMark({ className }) {
  const gradientId = useId();
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-strong)" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="22" height="22" rx="6.5" fill={`url(#${gradientId})`} />
      <path
        d="M10 8.3v7.4c0 .64.7 1.04 1.26.72l6.4-3.7a.83.83 0 0 0 0-1.44l-6.4-3.7A.83.83 0 0 0 10 8.3Z"
        fill="#fff"
      />
    </svg>
  );
}
