import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ApiError } from '../lib/api'
import type { Remote } from '../lib/useApi'

const base =
  'inline-flex items-center justify-center gap-2 rounded-md px-5 min-h-11 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none'
const variants = {
  primary: 'bg-navy text-white hover:bg-violet-deep',
  secondary: 'border border-navy/25 text-navy hover:border-navy hover:bg-white',
  ghost: 'text-violet hover:text-violet-deep',
} as const
export type Variant = keyof typeof variants
export const btnClass = (v: Variant = 'primary') => `${base} ${variants[v]}`

export function LinkButton({ to, variant = 'primary', children }: { to: string; variant?: Variant; children: ReactNode }) {
  return <Link to={to} className={btnClass(variant)}>{children}</Link>
}

export function Button({ variant = 'primary', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...p} className={`${btnClass(variant)} ${p.className ?? ''}`} />
}

export const Eyebrow = ({ children }: { children: ReactNode }) => (
  <p className="text-xs font-medium tracking-[0.18em] text-violet uppercase">{children}</p>
)

export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>
}

export function Section({ id, eyebrow, title, intro, action, children, tint = false }: {
  id?: string; eyebrow?: string; title: string; intro?: string; action?: ReactNode; children: ReactNode; tint?: boolean
}) {
  return (
    <section id={id} className={`py-16 sm:py-24 ${tint ? 'bg-white border-y border-line' : ''}`}>
      <Container>
        <Reveal>
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-navy sm:text-3xl">{title}</h2>
              {intro && <p className="mt-3 leading-relaxed text-muted">{intro}</p>}
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
      <Container className="py-14 sm:py-20">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-navy sm:text-4xl">{title}</h1>
        {intro && <p className="mt-4 max-w-2xl leading-relaxed text-muted">{intro}</p>}
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
    <div className="rounded-lg border border-dashed border-line bg-white/60 px-6 py-12 text-center">
      <p className="font-medium text-navy">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</p>}
    </div>
  )
}

export function ErrorState({ error }: { error?: ApiError }) {
  return (
    <div role="alert" className="rounded-lg border border-line bg-white px-6 py-10 text-center">
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
      className={`flex items-center justify-center rounded-md border border-line bg-lavender/60 text-xs tracking-wide text-muted ${className}`}>
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
        className="min-h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink placeholder:text-muted/60 focus:border-violet" />
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-err`} className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  )
}

export function Notice({ kind, children }: { kind: 'error' | 'success'; children: ReactNode }) {
  const tone = kind === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-md border px-4 py-3 text-sm ${tone}`}>{children}</div>
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
        className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink focus:border-violet" />
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-err`} className="mt-1 text-xs text-red-700">{error}</p>}
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
  DRAFT: 'bg-lavender text-violet-deep border-violet/20',
}
export const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft', AWAITING_CONFIRMATION: 'Awaiting member confirmation', AWAITING_CORE_APPROVAL: 'Awaiting Core approval',
  PUBLISHED: 'Published', CHANGES_REQUESTED: 'Changes requested', UNPUBLISHED: 'Unpublished', ARCHIVED: 'Archived',
}
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${BADGE[status] ?? BADGE.DRAFT}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

export function Spinner({ label = 'Working…' }: { label?: string }) {
  return <span role="status" className="text-sm text-muted">{label}</span>
}
