import { useId } from 'react'

/** Chanda mark: a coin split into two halves, one for each partner. */
export function Logo({ className }: { className?: string }) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '')
  const bg = `bg${raw}`
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Chanda">
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1f1630" />
          <stop offset="1" stopColor="#0f1424" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${bg})`} />
      {/* left half */}
      <path d="M30 14a18 18 0 0 0 0 36z" fill="#f59e0b" />
      {/* right half */}
      <path d="M34 14a18 18 0 0 1 0 36z" fill="#fb7185" />
      <text x="32" y="38" textAnchor="middle" fontSize="16" fontWeight="700" fill="#1f1630" fontFamily="system-ui, sans-serif">₹</text>
    </svg>
  )
}
