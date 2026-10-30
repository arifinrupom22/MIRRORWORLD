import { cn } from '../lib/utils'

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn('h-7 w-7', className)} aria-hidden>
      <defs>
        <linearGradient id="mw-brand" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38D9F5" />
          <stop offset="1" stopColor="#4F8CFF" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" stroke="#25334A" fill="#0A1322" />
      <path d="M7 23.2V9.5l9 6 9-6v13.7" stroke="url(#mw-brand)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 17.2v5.4" stroke="#8B7CFF" strokeWidth="1.3" strokeLinecap="round" opacity="0.8" />
      <circle cx="16" cy="15.6" r="1" fill="#38D9F5" />
    </svg>
  )
}

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <BrandMark />
      {!compact && (
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold leading-none tracking-[0.16em] text-ink">MIRRORWORLD</div>
          <div className="mt-1 font-mono text-[7px] uppercase tracking-[0.18em] text-faint">Campus digital twin</div>
        </div>
      )}
    </div>
  )
}
