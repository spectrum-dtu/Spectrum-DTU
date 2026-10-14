import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, Container, Field, Notice, TextArea } from '../components/ui'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'

// Step 3 of registration: the applicant is signed in with a limited session.
export default function Apply() {
  const { user } = useAuth()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const f = new FormData(ev.currentTarget)
    const v = (k: string) => String(f.get(k) ?? '').trim()
    const next: Record<string, string> = {}
    if (!v('name')) next.name = 'Please enter your name.'
    if (!v('branch')) next.branch = 'Please enter your branch.'
    if (!v('year')) next.year = 'Please enter your academic year.'
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    setError(null)
    try {
      await api('/membership/applications', {
        method: 'POST',
        json: { name: v('name'), branch: v('branch'), year: v('year'), domain: v('domain') || undefined, statement: v('statement') || undefined },
      })
      setSent(true)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not submit your application.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Container className="py-16 sm:py-24">
      <div className="mx-auto max-w-md">
        {sent ? (
          <>
            <h1 className="text-2xl font-semibold text-navy">Application submitted</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Your application has been sent to the core team. You'll receive an email once it has been reviewed.
              Submitting an application does not guarantee membership.
            </p>
            <Link className="mt-6 inline-block text-sm text-violet" to="/">Back to home</Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-navy">Membership application</h1>
            <p className="mt-2 text-sm text-muted">
              {user?.status === 'REJECTED' ? 'Your previous application was not approved. You may apply again.' : 'Tell the core team a little about yourself.'}
            </p>
            <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
              <Field id="name" name="name" label="Full name" autoComplete="name" defaultValue={user?.name} error={errors.name} />
              <Field id="branch" name="branch" label="Branch" error={errors.branch} />
              <Field id="year" name="year" label="Academic year" error={errors.year} />
              <Field id="domain" name="domain" label="Area of interest (optional)" />
              <TextArea id="statement" name="statement" label="Why do you want to join? (optional)" maxLength={2000} />
              {error && <Notice kind="error">{error}</Notice>}
              <Button type="submit" disabled={busy} className="w-full">{busy ? 'Submitting…' : 'Submit application'}</Button>
            </form>
          </>
        )}
      </div>
    </Container>
  )
}
