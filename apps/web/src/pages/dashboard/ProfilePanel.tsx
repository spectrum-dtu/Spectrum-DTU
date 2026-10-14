import { useState, type FormEvent } from 'react'
import { Async, Button, Field, Notice, TextArea } from '../../components/ui'
import { api } from '../../lib/api'
import { useAction } from '../../lib/useAction'
import { useApi } from '../../lib/useApi'
import ImageUpload from './ImageUpload'

interface Profile {
  name: string; email: string; photoUrl?: string | null; domain?: string | null; branch?: string | null; year?: string | null
  bio?: string | null; github?: string | null; linkedin?: string | null; instagram?: string | null; otherLink?: string | null
}

export default function ProfilePanel() {
  const remote = useApi<Profile>('/me/profile')
  return (
    <section aria-labelledby="panel-h" className="space-y-12">
      <div>
        <h2 id="panel-h" className="text-xl font-semibold text-navy">Profile</h2>
        <p className="mt-1 text-sm text-muted">This is what appears on the public team page. You can only edit your own profile.</p>
        <div className="mt-6">
          <Async remote={remote} isEmpty={() => false} empty={null}>{(p) => <ProfileForm p={p} />}</Async>
        </div>
      </div>
      <ChangePassword />
    </section>
  )
}

function ProfileForm({ p }: { p: Profile }) {
  const [v, setV] = useState({
    name: p.name, photoUrl: p.photoUrl ?? '', domain: p.domain ?? '', branch: p.branch ?? '', year: p.year ?? '', bio: p.bio ?? '',
    github: p.github ?? '', linkedin: p.linkedin ?? '', instagram: p.instagram ?? '', otherLink: p.otherLink ?? '',
  })
  const a = useAction()
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  return (
    <form onSubmit={(e: FormEvent) => { e.preventDefault(); void a.run(() => api('/me/profile', { method: 'PATCH', json: v }), 'Profile saved') }} className="max-w-xl space-y-5">
      <ImageUpload id="photo" label="Photograph" value={v.photoUrl} onChange={(u) => setV({ ...v, photoUrl: u })} />
      <Field id="name" label="Name" value={v.name} onChange={set('name')} maxLength={100} />
      <Field id="domain" label="Domain or area of interest" value={v.domain} onChange={set('domain')} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="branch" label="Branch" value={v.branch} onChange={set('branch')} />
        <Field id="year" label="Academic year" value={v.year} onChange={set('year')} />
      </div>
      <TextArea id="bio" label="Short biography" rows={5} maxLength={1500} value={v.bio} onChange={set('bio')} />
      <Field id="github" label="GitHub" type="url" placeholder="https://github.com/…" value={v.github} onChange={set('github')} />
      <Field id="linkedin" label="LinkedIn" type="url" value={v.linkedin} onChange={set('linkedin')} />
      <Field id="instagram" label="Instagram" type="url" value={v.instagram} onChange={set('instagram')} />
      <Field id="other" label="Other link" type="url" value={v.otherLink} onChange={set('otherLink')} />
      {a.error && <Notice kind="error">{a.error}</Notice>}
      {a.done && <Notice kind="success">{a.done}</Notice>}
      <Button type="submit" disabled={a.busy || !v.name.trim()}>{a.busy ? 'Saving…' : 'Save profile'}</Button>
    </form>
  )
}

function ChangePassword() {
  const [sent, setSent] = useState(false)
  const [otp, setOtp] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const a = useAction()
  const mismatch = pw2 !== '' && pw !== pw2
  return (
    <div className="max-w-xl space-y-4 border-t border-line pt-8">
      <h3 className="font-semibold text-navy">Change password</h3>
      <p className="text-sm text-muted">We'll email a verification code to your DTU address. Other devices are signed out afterwards.</p>
      {!sent ? (
        <Button variant="secondary" disabled={a.busy} onClick={async () => { if (await a.run(() => api('/auth/change-password/request', { method: 'POST' }))) setSent(true) }}>Send verification code</Button>
      ) : (
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault()
          if (await a.run(() => api('/auth/change-password', { method: 'POST', json: { otp, password: pw } }), 'Password updated')) { setSent(false); setOtp(''); setPw(''); setPw2('') }
        }}>
          <Field id="cp-otp" label="Verification code" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} autoComplete="one-time-code" />
          <Field id="cp-new" type="password" label="New password" hint="At least 10 characters." autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <Field id="cp-confirm" type="password" label="Confirm new password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} error={mismatch ? 'Passwords do not match.' : undefined} />
          <Button type="submit" disabled={a.busy || mismatch || pw.length < 10 || otp.length !== 6}>Update password</Button>
        </form>
      )}
      {a.error && <Notice kind="error">{a.error}</Notice>}
      {a.done && <Notice kind="success">{a.done}</Notice>}
    </div>
  )
}
