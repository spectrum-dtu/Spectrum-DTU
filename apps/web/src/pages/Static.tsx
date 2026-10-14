import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, Container, EmptyState, Field, ImagePlaceholder, LinkButton, Notice, PageHeader } from '../components/ui'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { MaterialList } from './dashboard/LearningPanel'
import { domains, equipment } from './content'

export function About() {
  return (
    <>
      <PageHeader eyebrow="About" title="A technology team built around real systems"
        intro="Spectrum DTU is a multidisciplinary team at Delhi Technological University focused on telecommunications, 5G-based applications, experimentation, and engineering research." />
      <Container className="grid gap-12 py-16 lg:grid-cols-2">
        <div className="space-y-5 leading-relaxed text-muted">
          <p>Unlike a purely software-oriented club, Spectrum works with physical infrastructure: networking equipment, sensors, embedded boards, cameras, a drone, and immersive hardware.</p>
          <p>Members learn by building and testing on that hardware, connecting telecommunications with the other fields they work in.</p>
        </div>
        <ImagePlaceholder label="Laboratory photograph" className="min-h-60 w-full" />
      </Container>
      <Container className="border-t border-line py-16">
        <h2 className="text-2xl font-semibold text-navy">How telecommunications connects</h2>
        <ul className="mt-8 grid gap-x-10 md:grid-cols-2">
          {domains.map((d) => (
            <li key={d.title} className="border-t border-line py-5">
              <p className="font-medium text-navy">{d.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{d.text}</p>
            </li>
          ))}
        </ul>
      </Container>
      <Container className="border-t border-line py-16">
        <h2 className="text-2xl font-semibold text-navy">Laboratory equipment</h2>
        <ul className="mt-8 grid gap-x-10 md:grid-cols-2">
          {equipment.map((e) => (
            <li key={e.name} className="border-t border-line py-5">
              <p className="font-medium text-navy">{e.name}</p>
              <p className="mt-1 text-sm text-muted">{e.use}</p>
            </li>
          ))}
        </ul>
        <div className="mt-8"><LinkButton to="/projects">See what we build</LinkButton></div>
      </Container>
    </>
  )
}

export function Learning() {
  const { user, loading } = useAuth()
  return (
    <>
      <PageHeader eyebrow="Learning" title="Learning materials" intro="Resources shared by the core team for team members." />
      <Container className="py-14">
        {loading ? <p role="status" className="text-muted">Loading…</p> : !user ? (
          <EmptyState title="Members only">
            Learning materials are available to signed-in team members. <Link className="text-violet" to="/login">Log in</Link>.
          </EmptyState>
        ) : <MaterialList />}
      </Container>
    </>
  )
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function Contact() {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const form = ev.currentTarget
    const f = new FormData(form)
    const v = (k: string) => String(f.get(k) ?? '').trim()
    const next: Record<string, string> = {}
    if (!v('name')) next.name = 'Please enter your name.'
    if (!EMAIL_RE.test(v('email'))) next.email = 'Enter a valid email address.'
    if (!v('subject')) next.subject = 'Please add a subject.'
    if (v('message').length < 10) next.message = 'Message should be at least 10 characters.'
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    setResult(null)
    try {
      await api('/contact', { method: 'POST', json: { name: v('name'), email: v('email'), subject: v('subject'), message: v('message'), website: v('website') } })
      setResult({ ok: true, msg: 'Thanks. Your message has been sent to the core team.' })
      form.reset()
    } catch (e) {
      setResult({ ok: false, msg: e instanceof ApiError ? e.message : 'Message could not be sent.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader eyebrow="Contact" title="Get in touch" intro="Questions, collaboration ideas, or sponsorship enquiries are welcome." />
      <Container className="py-14">
        <form onSubmit={onSubmit} noValidate className="mx-auto max-w-3xl space-y-6 rounded-2xl border border-navy bg-white p-6 sm:p-10">
          <Field id="name" name="name" label="Name" autoComplete="name" error={errors.name} />
          <Field id="email" name="email" type="email" label="Email" autoComplete="email" error={errors.email} />
          <Field id="subject" name="subject" label="Subject" error={errors.subject} />
          <div>
            <label htmlFor="message" className="mb-1.5 block text-sm font-medium text-navy">Message</label>
            <textarea id="message" name="message" rows={9} maxLength={4000} aria-invalid={errors.message ? true : undefined}
              className="w-full rounded-lg border border-line bg-white px-3.5 py-3 text-sm aria-invalid:border-error focus:border-violet" />
            {errors.message && <p className="mt-2 text-xs text-error">{errors.message}</p>}
          </div>
          {/* Honeypot: hidden from people, filled by naive bots. */}
          <div aria-hidden className="absolute -left-[9999px]">
            <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
          </div>
          {result && <Notice kind={result.ok ? 'success' : 'error'}>{result.msg}</Notice>}
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send message'}</Button>
          </div>
        </form>
      </Container>
    </>
  )
}

export function NotFound() {
  return (
    <Container className="py-24 text-center">
      <p className="text-sm font-medium text-violet">404</p>
      <h1 className="mt-3 text-3xl font-semibold text-navy">Page not found</h1>
      <p className="mt-3 text-muted">The page you're looking for doesn't exist or has moved.</p>
      <div className="mt-8"><LinkButton to="/">Back to home</LinkButton></div>
    </Container>
  )
}
