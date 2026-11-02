import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
  Search,
  Sun,
  Moon,
  X,
} from 'lucide-react'
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { cn, fmtNumber, statusLabel } from '../lib/utils'
import { useToastStore } from '../store/appStore'

/* -------------------------------------------------------------------------- */
/* Buttons                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark'
type ButtonSize = 'xs' | 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  iconLeft?: ReactNode
  iconRight?: ReactNode
}

const buttonIcons: Record<string, ReactNode> = {
  sun: <Sun className="h-3 w-3" />,
  moon: <Moon className="h-3 w-3" />,
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'border-cyan/50 bg-[linear-gradient(180deg,rgba(56,217,245,0.22),rgba(79,140,255,0.14))] text-cyan shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_8px_24px_-16px_rgba(56,217,245,0.7)] hover:border-cyan/80 hover:bg-[linear-gradient(180deg,rgba(56,217,245,0.3),rgba(79,140,255,0.18))] active:translate-y-px',
  secondary:
    'border-line bg-subtle text-ink hover:border-lineHover hover:bg-subtleHover active:translate-y-px',
  ghost: 'border-transparent bg-transparent text-muted hover:bg-subtleHover hover:text-ink',
  danger:
    'border-critical/40 bg-critical/10 text-critical hover:border-critical/60 hover:bg-critical/[0.16] active:translate-y-px',
  dark: 'border-line bg-input text-muted hover:border-lineHover hover:text-ink',
}

const buttonSizes: Record<ButtonSize, string> = {
  xs: 'h-7 gap-1.5 px-2.5 text-[10.5px]',
  sm: 'h-8 gap-2 px-3 text-[11.5px]',
  md: 'h-9 gap-2 px-4 text-[12px]',
}

export function ThemeToggleButton({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  const currentTheme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  const currentIcon = buttonIcons[currentTheme === 'dark' ? 'moon' : 'sun']

  return (
    <Button
      variant="secondary"
      size="sm"
      iconLeft={currentIcon}
      onClick={() => {
        const next = currentTheme === 'dark' ? 'light' : 'dark'
        document.documentElement.dataset.theme = next
        try { localStorage.setItem('mirrorworld-theme', next) } catch {}
      }}
      className={className}
    >
      {currentTheme === 'dark' ? 'Bright Mode' : 'Dark Mode'}
    </Button>
  )
}

export function Button({
  variant = 'secondary',
  size = 'sm',
  loading,
  iconLeft,
  iconRight,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'focus-ring inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : iconLeft}
      {children}
      {iconRight}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  variant?: 'default' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

export function IconButton({ label, variant = 'default', size = 'md', className, children, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'focus-ring inline-flex items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' ? 'h-7 w-7' : 'h-8 w-8',
        variant === 'default' && 'border-line bg-subtle text-muted hover:border-lineHover hover:text-ink',
        variant === 'ghost' && 'border-transparent text-muted hover:bg-subtleHover hover:text-ink',
        variant === 'danger' && 'border-critical/30 text-critical hover:bg-critical/10',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Badges and status                                                           */
/* -------------------------------------------------------------------------- */

type Tone = 'critical' | 'warning' | 'success' | 'info' | 'violet' | 'neutral'

const toneClasses: Record<Tone, string> = {
  critical: 'border-critical/30 bg-critical/10 text-critical',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  success: 'border-success/30 bg-success/10 text-success',
  info: 'border-cyan/30 bg-cyan/10 text-cyan',
  violet: 'border-violet/30 bg-violet/10 text-violet',
  neutral: 'border-line bg-subtle text-muted',
}

const dotClasses: Record<Tone, string> = {
  critical: 'bg-critical',
  warning: 'bg-warning',
  success: 'bg-success',
  info: 'bg-cyan',
  violet: 'bg-violet',
  neutral: 'bg-faint',
}

export function Badge({
  tone = 'neutral',
  dot = false,
  children,
  className,
}: {
  tone?: Tone
  dot?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <span className={cn('chip', toneClasses[tone], className)}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dotClasses[tone])} aria-hidden />}
      {children}
    </span>
  )
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone: Tone =
    status === 'FEASIBLE' || status === 'OPTIMAL' || status === 'optimized' || status === 'completed'
      ? 'success'
      : status === 'INFEASIBLE' || status === 'failed' || status === 'AUDIT_FAILED'
        ? 'critical'
        : status === 'UNKNOWN' || status === 'FEASIBLE_HEURISTIC' || status === 'timeout' || status === 'optimizing' || status === 'running' || status === 'cancelling'
          ? 'warning'
          : status === 'simulated' || status === 'queued'
            ? 'info'
            : 'neutral'
  return (
    <Badge tone={tone} dot className={className}>
      {statusLabel(status)}
    </Badge>
  )
}

export function StatusDot({ tone = 'success', pulse = false }: { tone?: Tone; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2" aria-hidden>
      {pulse && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-40', dotClasses[tone])} />}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', dotClasses[tone])} />
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Surfaces and headers                                                        */
/* -------------------------------------------------------------------------- */

export function Panel({ className, children, ...props }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn('panel min-w-0', className)} {...props}>
      {children}
    </section>
  )
}

export function PanelHeader({
  eyebrow,
  title,
  subtitle,
  action,
  className,
}: {
  eyebrow?: string
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('panel-header', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="telemetry mb-1.5">{eyebrow}</div>}
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-faint">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: {
  eyebrow: string
  title: ReactNode
  description: ReactNode
  actions?: ReactNode
  meta?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="telemetry text-cyan/80">{eyebrow}</span>
          {meta}
        </div>
        <h1 className="text-[25px] font-semibold leading-[1.15] tracking-[-0.025em] text-ink sm:text-[29px]">{title}</h1>
        <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-muted">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('telemetry', className)}>{children}</div>
}

export function DataValue({
  label,
  value,
  unit,
  hint,
  tone,
}: {
  label: string
  value: ReactNode
  unit?: string
  hint?: ReactNode
  tone?: Tone
}) {
  return (
    <div>
      <div className="telemetry mb-1.5">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn('font-mono text-[18px] font-semibold tracking-[-0.02em] tabular-nums', tone && dotClasses[tone] ? '' : 'text-ink')}>
          {value}
        </span>
        {unit && <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-faint">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-[10.5px] text-faint">{hint}</div>}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Empty, loading and error states                                             */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  description: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-subtle text-cyan/80">
        {icon ?? <Info className="h-5 w-5" />}
      </div>
      <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[11.5px] leading-relaxed text-faint">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin text-cyan', className)} aria-hidden />
}

export function LoadingBlock({ label = 'Loading model data', rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-3 p-5" aria-busy="true" aria-label={label}>
      <div className="flex items-center gap-2 text-[11px] text-faint">
        <Spinner className="h-3.5 w-3.5" />
        {label}…
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-8 animate-pulse rounded border border-lineSoft bg-subtle" />
      ))}
    </div>
  )
}

export function ErrorState({
  title = 'Data could not be loaded',
  message,
  onRetry,
  compact = false,
}: {
  title?: string
  message: string
  onRetry?: () => void
  compact?: boolean
}) {
  return (
    <div className={cn('flex items-start gap-3 border border-critical/25 bg-critical/[0.06] text-critical', compact ? 'rounded-md p-3' : 'rounded-lg p-4')}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium">{title}</div>
        <p className="mt-0.5 break-words text-[11px] leading-relaxed text-critical/80">{message}</p>
      </div>
      {onRetry && (
        <Button size="xs" variant="ghost" onClick={onRetry} className="text-critical">
          Retry
        </Button>
      )}
    </div>
  )
}

export function ProgressBar({ value, indeterminate = false, tone = 'info' }: { value?: number; indeterminate?: boolean; tone?: Tone }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-subtleHover"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(value ?? 0)}
    >
      {indeterminate ? (
        <div className={cn('h-full w-1/3 animate-sweep rounded-full', dotClasses[tone])} />
      ) : (
        <div className={cn('h-full rounded-full transition-[width] duration-500', dotClasses[tone])} style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Form controls                                                               */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className,
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  htmlFor?: string
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="flex items-center justify-between gap-2 text-[11px] font-medium text-muted">
        <span>{label}</span>
        {hint && <span className="font-mono text-[9px] font-normal uppercase tracking-[0.08em] text-faint">{hint}</span>}
      </label>
      {children}
      {error && <p className="text-[10.5px] leading-relaxed text-critical">{error}</p>}
    </div>
  )
}

export const Input = function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('input-base', className)} {...props} />
}

export const Select = function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn('input-base appearance-none pr-8', className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
  ariaLabel = 'Search',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  ariaLabel?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="input-base h-9 pl-9 pr-8"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-faint hover:text-ink"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
}) {
  return (
    <label className={cn('flex cursor-pointer items-start justify-between gap-4', disabled && 'cursor-not-allowed opacity-50')}>
      <span className="min-w-0">
        <span className="block text-[11.5px] font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[10.5px] leading-relaxed text-faint">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === 'string' ? label : 'Toggle'}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'focus-ring relative h-5 w-9 shrink-0 rounded-full border transition-colors',
          checked ? 'border-cyan/60 bg-cyan/25' : 'border-line bg-subtleHover',
        )}
      >
        <span
          className={cn(
            'absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-all',
            checked ? 'left-[18px] bg-cyan' : 'left-[3px] bg-faint',
          )}
        />
      </button>
    </label>
  )
}

export function Checkbox({
  checked,
  onChange,
  label,
  indeterminate = false,
  disabled = false,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label?: ReactNode
  indeterminate?: boolean
  disabled?: boolean
}) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-2.5 text-[11.5px] text-muted', disabled && 'cursor-not-allowed opacity-50')}>
      <button
        type="button"
        role="checkbox"
        aria-checked={indeterminate ? 'mixed' : checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'focus-ring flex h-4 w-4 items-center justify-center rounded border transition-colors',
          checked || indeterminate ? 'border-cyan/60 bg-cyan/20 text-cyan' : 'border-line bg-subtle text-transparent',
        )}
      >
        {indeterminate ? <span className="h-0.5 w-2 rounded bg-cyan" /> : <Check className="h-3 w-3" />}
      </button>
      {label}
    </label>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
}: {
  options: { value: T; label: string; icon?: ReactNode }[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <div className={cn('inline-flex rounded-md border border-line bg-input p-0.5', className)} role="tablist">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'focus-ring inline-flex items-center justify-center gap-1.5 rounded px-3 font-medium transition-colors',
              size === 'sm' ? 'h-6 text-[10.5px]' : 'h-7 text-[11px]',
              active ? 'bg-cyan/[0.13] text-cyan shadow-[inset_0_0_0_1px_rgba(56,217,245,0.2)]' : 'text-faint hover:text-muted',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function Tabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: string; label: string; count?: number }[]
  value: string
  onChange: (id: string) => void
  className?: string
}) {
  return (
    <div className={cn('flex gap-0 overflow-x-auto border-b border-lineSoft', className)} role="tablist">
      {tabs.map((tab) => {
        const active = tab.id === value
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              'focus-ring relative -mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-[11.5px] font-medium transition-colors',
              active ? 'border-cyan text-ink' : 'border-transparent text-faint hover:text-muted',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn('rounded px-1 font-mono text-[9px]', active ? 'bg-cyan/10 text-cyan' : 'bg-subtleHover text-faint')}>{tab.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function Slider({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  label,
  valueLabel,
  description,
}: {
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
  label: string
  valueLabel: string
  description?: string
}) {
  const id = useId()
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-[11px] font-medium text-muted">
          {label}
        </label>
        <span className="font-mono text-[10px] tabular-nums text-cyan">{valueLabel}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-subtleHover accent-cyan [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-canvas [&::-webkit-slider-thumb]:bg-cyan [&::-webkit-slider-thumb]:shadow-[0_0_0_3px_rgba(56,217,245,0.16)]"
      />
      {description && <p className="mt-1 text-[10px] leading-relaxed text-faint">{description}</p>}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Overlays                                                                    */
/* -------------------------------------------------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'md',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    const timer = window.setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      focusable?.focus()
    }, 30)
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab' && panelRef.current) {
        const nodes = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
        ).filter((node) => node.offsetParent !== null)
        if (!nodes.length) return
        const first = nodes[0]
        const last = nodes[nodes.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => {
      window.clearTimeout(timer)
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handler)
      previous?.focus?.()
    }
  }, [open, onClose])
  if (!open) return null
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0 bg-overlay/80 backdrop-blur-[3px] animate-fade-in" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Dialog'}
        className={cn('relative max-h-[88vh] w-full overflow-hidden rounded-xl border border-line bg-panel shadow-float animate-fade-up', widths[width])}
      >
        <div className="flex items-start justify-between gap-4 border-b border-lineSoft px-5 py-4">
          <div>
            <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
            {description && <p className="mt-1 text-[11px] leading-relaxed text-faint">{description}</p>}
          </div>
          <IconButton label="Close dialog" variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="max-h-[65vh] overflow-y-auto px-5 py-4 scroll-thin">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-lineSoft bg-subtle px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onClose,
  loading = false,
}: {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
  loading?: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[12px] leading-relaxed text-muted">{description}</div>
    </Modal>
  )
}

export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' }) {
  return (
    <span className="group/tooltip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          // display toggles keep hidden tooltips from extending the scroll area
          'pointer-events-none absolute left-1/2 z-50 hidden w-max max-w-[240px] -translate-x-1/2 rounded-md border border-line bg-popover px-2.5 py-1.5 text-[10.5px] font-normal leading-relaxed text-muted shadow-float group-hover/tooltip:block group-focus-within/tooltip:block',
          side === 'top' ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]',
        )}
      >
        {content}
      </span>
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Toasts                                                                      */
/* -------------------------------------------------------------------------- */

export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts)
  const dismiss = useToastStore((state) => state.dismiss)
  if (!toasts.length) return null
  return createPortal(
    <div className="fixed bottom-5 right-5 z-[100] flex w-[min(360px,calc(100vw-2.5rem))] flex-col gap-2" aria-live="polite" aria-atomic="false">
      {toasts.map((item) => (
        <div
          key={item.id}
          className="flex items-start gap-3 rounded-lg border border-line bg-popover/95 p-3 shadow-float backdrop-blur animate-slide-in-right"
        >
          <div className="mt-0.5">
            {item.tone === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : item.tone === 'error' ? (
              <AlertCircle className="h-4 w-4 text-critical" />
            ) : (
              <Info className="h-4 w-4 text-cyan" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11.5px] font-medium text-ink">{item.title}</div>
            {item.description && <p className="mt-0.5 text-[10.5px] leading-relaxed text-faint">{item.description}</p>}
          </div>
          <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(item.id)} className="text-faint hover:text-ink">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}

/* -------------------------------------------------------------------------- */
/* Delta indicator                                                             */
/* -------------------------------------------------------------------------- */

export function DeltaBadge({
  value,
  percent,
  better,
  unit = '',
  invert = false,
  className,
}: {
  value: number | null | undefined
  percent?: number | null
  better?: boolean | null
  unit?: string
  invert?: boolean
  className?: string
}) {
  if (value === null || value === undefined) {
    return <span className={cn('font-mono text-[10px] text-faint', className)}>—</span>
  }
  const positive = invert ? value < 0 : value > 0
  const negative = invert ? value > 0 : value < 0
  const good = better ?? positive
  const Icon = value === 0 ? null : value > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-mono text-[10px] tabular-nums',
        value === 0 ? 'text-faint' : good ? 'text-success' : negative || positive ? 'text-critical' : 'text-muted',
        className,
      )}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {value > 0 ? '+' : ''}
      {fmtNumber(value, Number.isInteger(value) ? 0 : 1)}
      {unit}
      {percent !== null && percent !== undefined && <span className="text-faint">({percent > 0 ? '+' : ''}{fmtNumber(percent, 1)}%)</span>}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Misc                                                                        */
/* -------------------------------------------------------------------------- */

export function InfoLine({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warning' | 'critical' | 'info' }) {
  const icon =
    tone === 'critical' ? <AlertCircle className="h-3.5 w-3.5" /> : tone === 'warning' ? <AlertCircle className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-[10.5px] leading-relaxed',
        tone === 'critical'
          ? 'border-critical/25 bg-critical/[0.06] text-critical/90'
          : tone === 'warning'
            ? 'border-warning/25 bg-warning/[0.06] text-warning/90'
            : tone === 'info'
              ? 'border-cyan/20 bg-cyan/[0.05] text-cyan/90'
              : 'border-lineSoft bg-subtle text-faint',
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{children}</span>
    </div>
  )
}

export function BreadcrumbChevron() {
  return <ChevronRight className="h-3 w-3 text-faint/60" aria-hidden />
}

const CollapsibleContext = createContext<{ open: boolean; setOpen: (v: boolean) => void } | null>(null)

export function Collapsible({ defaultOpen = true, children }: { defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return <CollapsibleContext.Provider value={{ open, setOpen }}>{children}</CollapsibleContext.Provider>
}

export function CollapsibleTrigger({ children }: { children: ReactNode }) {
  const ctx = useContext(CollapsibleContext)
  if (!ctx) return null
  return (
    <button
      type="button"
      aria-expanded={ctx.open}
      onClick={() => ctx.setOpen(!ctx.open)}
      className="focus-ring flex w-full items-center justify-between gap-3 text-left"
    >
      {children}
      <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-faint transition-transform', ctx.open && 'rotate-90')} />
    </button>
  )
}

export function CollapsibleContent({ children }: { children: ReactNode }) {
  const ctx = useContext(CollapsibleContext)
  if (!ctx?.open) return null
  return <div className="animate-fade-in">{children}</div>
}
