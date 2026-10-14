import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Container, Field, Notice } from '../components/ui'
import { api, ApiError } from '../lib/api'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 10
type Errs = Partial<Record<string, string>>

function Shell({ title, intro, children, footer }: { title: string; intro?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Container className="py-16 sm:py-24">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-navy">{title}</h1>
        {intro && <p className="mt-2 text-sm leading-relaxed text-muted">{intro}</p>}
        <div className="mt-8 space-y-5">{children}</div>
        {footer && <div className="mt-8 text-sm text-muted">{footer}</div>}
      </div>
    </Container>
  )
}

// Shared submit helper: validates, calls the API, surfaces real errors only.
function useSubmit() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Errs>({})
  async function run(validate: () => Errs, action: () => Promise<void>) {
    const v = validate()
    setErrors(v)
    setError(null)
    if (Object.keys(v).length) return
    setBusy(true)
    try { await action() } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong.') } finally { setBusy(false) }
  }
  return { busy, error, errors, run }
}

const val = (f: FormData, k: string) => String(f.get(k) ?? '')

export function Login() {
  const loc = useLocation()
  const s = useSubmit()
  const onSubmit = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault()
    const f = new FormData(ev.currentTarget)
    s.run(
      () => ({
        ...(EMAIL_RE.test(val(f, 'email').trim()) ? {} : { email: 'Enter your DTU email address.' }),
        ...(val(f, 'password') ? {} : { password: 'Enter your password.' }),
      }),
      async () => {
        await api('/auth/login', { method: 'POST', json: { email: val(f, 'email').trim(), password: val(f, 'password'), remember: f.get('remember') === 'on' } })
        // Full reload so the session context re-reads the new cookie.
        window.location.assign((loc.state as { from?: string } | null)?.from ?? '/dashboard')
      },
    )
  }
  return (
    <Shell title="Log in" intro="Use your DTU email address."
      footer={<><Link className="text-violet" to="/forgot-password">Forgot password?</Link> · <Link className="text-violet" to="/register">Apply to join</Link></>}>
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <Field id="email" name="email" type="email" label="DTU email" autoComplete="username" error={s.errors.email} />
        <Field id="password" name="password" type="password" label="Password" autoComplete="current-password" error={s.errors.password} />
        <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" name="remember" className="size-4" /> Remember me for 7 days</label>
        {s.error && <Notice kind="error">{s.error}</Notice>}
        <Button type="submit" disabled={s.busy} className="w-full">{s.busy ? 'Signing in…' : 'Log in'}</Button>
      </form>
    </Shell>
  )
}

type RegStep = 'account' | 'otp'

export function Register() {
  const [step, setStep] = useState<RegStep>('account')
  const [email, setEmail] = useState('')
  const s = useSubmit()
  const submit = (fn: (f: FormData) => { validate: Errs; action: () => Promise<void> }) => (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault()
    const f = new FormData(ev.currentTarget)
    const { validate, action } = fn(f)
    s.run(() => validate, action)
  }

  if (step === 'otp') {
    return (
      <Shell title="Verify your email" intro={`Enter the code sent to ${email}.`}>
        <form noValidate className="space-y-5" onSubmit={submit((f) => ({
          validate: /^\d{6}$/.test(val(f, 'otp').trim()) ? {} : { otp: 'Enter the 6-digit code.' },
          action: async () => {
            await api('/auth/register/verify', { method: 'POST', json: { email, otp: val(f, 'otp').trim() } })
            window.location.assign('/apply') // reload so the new session is picked up
          },
        }))}>
          <Field id="otp" name="otp" label="Verification code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} error={s.errors.otp} />
          {s.error && <Notice kind="error">{s.error}</Notice>}
          <Button type="submit" disabled={s.busy} className="w-full">{s.busy ? 'Verifying…' : 'Verify'}</Button>
        </form>
      </Shell>
    )
  }
  return (
    <Shell title="Apply to join Spectrum" intro="Register with your DTU email. Applications are reviewed by the core team; registering does not guarantee membership."
      footer={<>Already a member? <Link className="text-violet" to="/login">Log in</Link></>}>
      <form noValidate className="space-y-5" onSubmit={submit((f) => ({
        validate: {
          ...(EMAIL_RE.test(val(f, 'email').trim()) ? {} : { email: 'Enter your DTU email address.' }),
          ...(val(f, 'password').length >= MIN_PASSWORD ? {} : { password: `Use at least ${MIN_PASSWORD} characters.` }),
          ...(val(f, 'password') === val(f, 'confirm') ? {} : { confirm: 'Passwords do not match.' }),
        },
        action: async () => {
          const e = val(f, 'email').trim()
          await api('/auth/register', { method: 'POST', json: { email: e, password: val(f, 'password') } })
          setEmail(e)
          setStep('otp')
        },
      }))}>
        <Field id="email" name="email" type="email" label="DTU email" autoComplete="email" error={s.errors.email} />
        <Field id="password" name="password" type="password" label="Password" autoComplete="new-password" hint={`At least ${MIN_PASSWORD} characters.`} error={s.errors.password} />
        <Field id="confirm" name="confirm" type="password" label="Confirm password" autoComplete="new-password" error={s.errors.confirm} />
        {s.error && <Notice kind="error">{s.error}</Notice>}
        <Button type="submit" disabled={s.busy} className="w-full">{s.busy ? 'Sending code…' : 'Continue'}</Button>
      </form>
    </Shell>
  )
}

export function ForgotPassword() {
  const nav = useNavigate()
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [email, setEmail] = useState('')
  const s = useSubmit()
  const onEmail = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault()
    const e = val(new FormData(ev.currentTarget), 'email').trim()
    s.run(() => (EMAIL_RE.test(e) ? {} : { email: 'Enter a valid email address.' }), async () => {
      await api('/auth/forgot', { method: 'POST', json: { email: e } })
      setEmail(e)
      setStep('otp')
    })
  }
  const onOtp = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault()
    const otp = val(new FormData(ev.currentTarget), 'otp').trim()
    s.run(() => (/^\d{6}$/.test(otp) ? {} : { otp: 'Enter the 6-digit code.' }), async () => {
      const r = await api<{ resetToken: string }>('/auth/forgot/verify', { method: 'POST', json: { email, otp } })
      nav('/reset-password', { state: { token: r.resetToken } })
    })
  }
  return step === 'email' ? (
    <Shell title="Forgot password" intro="Enter your email. If an account exists, we'll send a verification code."
      footer={<Link className="text-violet" to="/login">Back to login</Link>}>
      <form onSubmit={onEmail} noValidate className="space-y-5">
        <Field id="email" name="email" type="email" label="DTU email" autoComplete="email" error={s.errors.email} />
        {s.error && <Notice kind="error">{s.error}</Notice>}
        <Button type="submit" disabled={s.busy} className="w-full">{s.busy ? 'Sending…' : 'Send code'}</Button>
      </form>
    </Shell>
  ) : (
    <Shell title="Enter verification code" intro="If an account exists for that email, a code is on its way.">
      <form onSubmit={onOtp} noValidate className="space-y-5">
        <Field id="otp" name="otp" label="Verification code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} error={s.errors.otp} />
        {s.error && <Notice kind="error">{s.error}</Notice>}
        <Button type="submit" disabled={s.busy} className="w-full">{s.busy ? 'Verifying…' : 'Verify'}</Button>
      </form>
    </Shell>
  )
}

export function ResetPassword() {
  const loc = useLocation()
  const [params] = useSearchParams()
  const token = (loc.state as { token?: string } | null)?.token ?? params.get('token') ?? ''
  const [done, setDone] = useState(false)
  const s = useSubmit()
  const onSubmit = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault()
    const f = new FormData(ev.currentTarget)
    s.run(
      () => ({
        ...(val(f, 'password').length >= MIN_PASSWORD ? {} : { password: `Use at least ${MIN_PASSWORD} characters.` }),
        ...(val(f, 'password') === val(f, 'confirm') ? {} : { confirm: 'Passwords do not match.' }),
      }),
      async () => { await api('/auth/reset', { method: 'POST', json: { token, password: val(f, 'password') } }); setDone(true) },
    )
  }
  if (!token) {
    return <Shell title="Reset link invalid" intro="This reset link is missing or has expired."><Link className="text-sm text-violet" to="/forgot-password">Request a new code</Link></Shell>
  }
  if (done) {
    return <Shell title="Password updated" intro="You can now log in with your new password."><Link className="text-sm text-violet" to="/login">Go to login</Link></Shell>
  }
  return (
    <Shell title="Set a new password">
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <Field id="password" name="password" type="password" label="New password" autoComplete="new-password" hint={`At least ${MIN_PASSWORD} characters.`} error={s.errors.password} />
        <Field id="confirm" name="confirm" type="password" label="Confirm password" autoComplete="new-password" error={s.errors.confirm} />
        {s.error && <Notice kind="error">{s.error}</Notice>}
        <Button type="submit" disabled={s.busy} className="w-full">{s.busy ? 'Saving…' : 'Update password'}</Button>
      </form>
    </Shell>
  )
}
