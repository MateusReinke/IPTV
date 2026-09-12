export default function HeartIcon({ filled, size = 15 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      aria-hidden="true"
    >
      <path
        d="M12 20.6s-7-4.3-9.4-8.6C1 8.9 2.5 5.5 5.8 5.5c2 0 3.4 1.1 4.4 2.6 1-1.5 2.4-2.6 4.4-2.6 3.3 0 4.8 3.4 3.2 6.5-2.4 4.3-9.4 8.6-9.4 8.6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
