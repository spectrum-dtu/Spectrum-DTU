import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ApiError } from '../lib/api'
import type { Remote } from '../lib/useApi'

const base =
  'inline-flex items-center justify-center gap-2.5 px-5 min-h-12 text-sm font-semibold transition-colors duration-150 disabled:bg-disabled disabled:text-muted disabled:border-disabled disabled:shadow-none disabled:pointer-events-none'
const variants = {
  primary: 'border border-violet bg-violet text-white shadow-(--shadow-button) hover:bg-violet-deep',
  secondary: 'border border-line bg-white text-navy hover:bg-lavender',
  ghost: 'text-violet hover:text-violet-deep',
} as const
export type Variant = keyof typeof variants
export const btnClass = (v: Variant = 'primary', pill = false) => `${base} ${pill ? 'rounded-full' : 'rounded-lg'} ${variants[v]}`

export function LinkButton({ to, variant = 'primary', pill = false, children }: { to: string; variant?: Variant; pill?: boolean; children: ReactNode }) {
  return <Link to={to} className={btnClass(variant, pill)}>{children}</Link>
}

export function Button({ variant = 'primary', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...p} className={`${btnClass(variant)} ${p.className ?? ''}`} />
}

export const Eyebrow = ({ children }: { children: ReactNode }) => (
  <p className="font-mono text-xs leading-normal font-medium text-violet uppercase">{children}</p>
)

export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1440px] px-6 md:px-10 lg:px-20 ${className}`}>{children}</div>
}

export function Section({ id, eyebrow, title, intro, action, children, tint = false }: {
  id?: string; eyebrow?: string; title: string; intro?: string; action?: ReactNode; children: ReactNode; tint?: boolean
}) {
  return (
    <section id={id} className={`py-16 md:py-20 border-t border-line ${tint ? 'bg-white' : ''}`}>
      <Container>
        <Reveal>
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-3xl">
              {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
              <h2 className="mt-3.5 text-[32px] leading-[1.1] font-semibold text-navy lg:text-[40px]">{title}</h2>
              {intro && <p className="mt-3.5 leading-[1.65] text-muted">{intro}</p>}
            </div>
            {action}
          </div>
        </Reveal>
        {children}
      </Container>
    </section>
  )
}

export function PageHeader({ eyebrow, title, intro }: { eyebrow: string; title: string; intro?: string }) {
  return (
    <header className="border-b border-line bg-white">
      <Container className="py-14 md:py-20">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-3.5 max-w-3xl text-[32px] leading-[1.1] font-semibold text-navy lg:text-[40px]">{title}</h1>
        {intro && <p className="mt-4 max-w-2xl leading-[1.65] text-muted">{intro}</p>}
      </Container>
    </header>
  )
}

// Fades content in once; CSS disables this under prefers-reduced-motion.
export function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShown(true)
      return
    }
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) { setShown(true); io.disconnect() }
    }, { rootMargin: '0px 0px -8% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return <div ref={ref} className={`reveal ${shown ? 'is-in' : ''} ${className}`}>{children}</div>
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center">
      <p className="font-medium text-navy">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</p>}
    </div>
  )
}

export function ErrorState({ error }: { error?: ApiError }) {
  return (
    <div role="alert" className="rounded-xl border border-line bg-white px-6 py-10 text-center">
      <p className="font-medium text-navy">This content is unavailable right now.</p>
      <p className="mt-2 text-sm text-muted">{error?.message ?? 'Please try again shortly.'}</p>
    </div>
  )
}

export function LoadingState() {
  return <p role="status" className="py-10 text-center text-sm text-muted">Loading…</p>
}

// Renders loading / error / empty / ready consistently for list sections.
export function Async<T>({ remote, isEmpty, empty, children }: {
  remote: Remote<T>; isEmpty: (d: T) => boolean; empty: ReactNode; children: (d: T) => ReactNode
}) {
  if (remote.status === 'loading') return <LoadingState />
  if (remote.status === 'error') return <ErrorState error={remote.error} />
  return isEmpty(remote.data) ? <>{empty}</> : <>{children(remote.data)}</>
}

// Placeholder for real photography; swap for <img> when assets are supplied.
export function ImagePlaceholder({ label, className = '' }: { label: string; className?: string }) {
  return (
    <div role="img" aria-label={`${label} (image placeholder)`}
      className={`flex flex-col items-center justify-center gap-3 border-line bg-placeholder text-xs text-muted ${className}`}>
      <ImageIcon size={28} aria-hidden />
      {label}
    </div>
  )
}

export function Field({ label, id, error, hint, ...input }: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string; id: string; error?: string; hint?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-navy">{label}</label>
      <input id={id} {...input} aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className="min-h-12 w-full rounded-lg border border-line bg-white px-3.5 text-sm text-ink placeholder:text-muted aria-invalid:border-error focus:border-violet disabled:bg-placeholder" />
      {hint && !error && <p id={`${id}-hint`} className="mt-2 text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-err`} className="mt-1 text-xs text-error">{error}</p>}
    </div>
  )
}

export function Notice({ kind, children }: { kind: 'error' | 'success'; children: ReactNode }) {
  const tone = kind === 'error' ? 'border-error/30 bg-white text-error' : 'border-success/30 bg-white text-success'
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${tone}`}>{children}</div>
}

export const formatDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

export function TextArea({ label, id, error, hint, ...input }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string; id: string; error?: string; hint?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-navy">{label}</label>
      <textarea id={id} rows={4} {...input} aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className="w-full rounded-lg border border-line bg-white px-3.5 py-3 text-sm text-ink placeholder:text-muted aria-invalid:border-error focus:border-violet" />
      {hint && !error && <p id={`${id}-hint`} className="mt-2 text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-err`} className="mt-1 text-xs text-error">{error}</p>}
    </div>
  )
}

const BADGE: Record<string, string> = {
  PUBLISHED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  AWAITING_CORE_APPROVAL: 'bg-amber-50 text-amber-800 border-amber-200',
  AWAITING_CONFIRMATION: 'bg-amber-50 text-amber-800 border-amber-200',
  CHANGES_REQUESTED: 'bg-orange-50 text-orange-800 border-orange-200',
  UNPUBLISHED: 'bg-slate-100 text-slate-700 border-slate-200',
  ARCHIVED: 'bg-slate-100 text-slate-600 border-slate-200',
  DRAFT: 'bg-lavender text-violet-deep border-lavender',
}
export const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft', AWAITING_CONFIRMATION: 'Awaiting member confirmation', AWAITING_CORE_APPROVAL: 'Awaiting Core approval',
  PUBLISHED: 'Published', CHANGES_REQUESTED: 'Changes requested', UNPUBLISHED: 'Unpublished', ARCHIVED: 'Archived',
}
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${BADGE[status] ?? BADGE.DRAFT}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

export function Spinner({ label = 'Working…' }: { label?: string }) {
  return <span role="status" className="text-sm text-muted">{label}</span>
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' }) {
  return (
    <span className={`inline-block rounded-lg px-2.5 py-1 text-[11px] font-semibold ${tone === 'accent' ? 'bg-lavender text-violet-deep' : 'bg-placeholder text-muted'}`}>
      {children}
    </span>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`overflow-hidden rounded-xl border border-line bg-white ${className}`}>{children}</div>
}
