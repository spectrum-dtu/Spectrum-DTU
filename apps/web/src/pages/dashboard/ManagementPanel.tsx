import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Async, Button, EmptyState, Field, formatDate, Notice, TextArea } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAction } from '../../lib/useAction'
import { useApiReload } from '../../lib/useApi'
import { KIND_META, type Kind } from './fields'

const H = ({ children }: { children: string }) => <h3 className="mb-3 text-lg font-semibold text-navy">{children}</h3>

export default function ManagementPanel() {
  const { user } = useAuth()
  return (
    <section aria-labelledby="panel-h" className="space-y-14">
      <h2 id="panel-h" className="text-xl font-semibold text-navy">Approvals and Management</h2>
      <Applications />
      <ReviewQueue />
      <Removals />
      {user?.isAdmin && <Promotion />}
      <Messages />
    </section>
  )
}

interface App { id: string; name: string; email: string; branch: string; year: string; domain?: string; statement?: string; createdAt: string }

function Applications() {
  const [remote, reload] = useApiReload<App[]>('/membership/applications')
  const a = useAction()
  const [note, setNote] = useState<Record<string, string>>({})
  return (
    <div>
      <H>Membership applications</H>
      {a.error && <div className="mb-3"><Notice kind="error">{a.error}</Notice></div>}
      <Async remote={remote} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No pending applications" />}>
        {(d) => (
          <ul className="divide-y divide-line border-y border-line">
            {d.map((x) => (
              <li key={x.id} className="space-y-3 py-4">
                <div>
                  <p className="font-medium text-navy">{x.name} <span className="text-sm font-normal text-muted">· {x.email}</span></p>
                  <p className="text-sm text-muted">{x.branch}, year {x.year}{x.domain ? ` · interested in ${x.domain}` : ''} · applied {formatDate(x.createdAt)}</p>
                  {x.statement && <p className="mt-2 text-sm whitespace-pre-line text-muted">{x.statement}</p>}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <Button disabled={a.busy} onClick={() => a.run(async () => { await api(`/membership/applications/${x.id}/approve`, { method: 'POST' }); reload() })}>Approve</Button>
                  <input aria-label="Optional note for rejection" placeholder="Optional note (sent on rejection)" value={note[x.id] ?? ''} onChange={(e) => setNote({ ...note, [x.id]: e.target.value })}
                    className="min-h-11 min-w-56 flex-1 rounded-md border border-line bg-white px-3 text-sm" maxLength={500} />
                  <Button variant="secondary" disabled={a.busy} onClick={() => window.confirm(`Reject ${x.name}'s application?`) && a.run(async () => { await api(`/membership/applications/${x.id}/reject`, { method: 'POST', json: { note: note[x.id] || undefined } }); reload() })}>Reject</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Async>
    </div>
  )
}

interface QueueItem { itemId: string; kind: Kind; title: string; revision: number; isRevision: boolean; submittedAt: string; contributors: string[] }

function ReviewQueue() {
  const [remote] = useApiReload<QueueItem[]>('/review/queue')
  return (
    <div>
      <H>Content awaiting review</H>
      <Async remote={remote} isEmpty={(d) => d.length === 0} empty={<EmptyState title="Nothing is waiting for review" />}>
        {(d) => (
          <ul className="divide-y divide-line border-y border-line">
            {d.map((q) => (
              <li key={`${q.itemId}-${q.revision}`} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <p className="font-medium text-navy">{q.title}</p>
                  <p className="text-xs text-muted">{KIND_META[q.kind].label}{q.isRevision ? ' revision' : ''} · {q.contributors.join(', ')} · submitted {formatDate(q.submittedAt)}</p>
                </div>
                <Link className="text-sm font-medium text-violet" to={`/dashboard/${KIND_META[q.kind].path}/${q.itemId}`}>Review</Link>
              </li>
            ))}
          </ul>
        )}
      </Async>
    </div>
  )
}

interface Removal {
  id: string; target: { personId?: string; name?: string }; reason: string | null; status: string
  eligible: number; yes: number; no: number; myVote: boolean | null; canVote: boolean; createdAt: string
}

function Removals() {
  const [remote, reload] = useApiReload<Removal[]>('/removals')
  const a = useAction()
  const open = useAction()
  const [q, setQ] = useState('')
  const [found, setFound] = useState<{ id: string; name: string }[]>([])
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return }
    const t = setTimeout(() => {
      api<{ id: string; name: string }[]>(`/members/search?q=${encodeURIComponent(q.trim())}`).then(setFound).catch(() => setFound([]))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div>
      <H>Member removal votes</H>
      <p className="mb-4 max-w-2xl text-sm text-muted">
        Removal needs <strong>more than 50%</strong> of eligible Core members (every active Core member except the person concerned,
        counted when the vote opens). The member is not notified.
      </p>
      <div className="mb-6 max-w-md space-y-3 rounded-lg border border-line bg-white p-4">
        <Field id="rm-q" label="Start a removal vote" placeholder="Search member by name" value={q} onChange={(e) => setQ(e.target.value)} />
        {found.length > 0 && (
          <ul className="divide-y divide-line rounded-md border border-line">
            {found.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                {p.name}
                <Button variant="ghost" disabled={open.busy} onClick={() => window.confirm(`Open a removal vote for ${p.name}? All other Core members will be asked to vote.`) &&
                  open.run(async () => { await api('/removals', { method: 'POST', json: { personId: p.id, reason: reason || undefined } }); setQ(''); setReason(''); reload() })}>Open vote</Button>
              </li>
            ))}
          </ul>
        )}
        <TextArea id="rm-reason" label="Reason (visible to Core)" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
        {open.error && <Notice kind="error">{open.error}</Notice>}
      </div>
      {a.error && <div className="mb-3"><Notice kind="error">{a.error}</Notice></div>}
      <Async remote={remote} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No removal votes" />}>
        {(d) => (
          <ul className="divide-y divide-line border-y border-line">
            {d.map((r) => (
              <li key={r.id} className="space-y-2 py-4">
                <p className="font-medium text-navy">{r.target.name ?? 'Member'} <span className="ml-2 text-xs font-normal text-muted">{r.status}</span></p>
                {r.reason && <p className="text-sm text-muted">Reason: {r.reason}</p>}
                <p className="text-sm text-muted">{r.yes} in favour · {r.no} against · {r.eligible} eligible (more than {Math.floor(r.eligible / 2)} needed)</p>
                {r.canVote && r.myVote === null && (
                  <div className="flex gap-2">
                    <Button disabled={a.busy} onClick={() => window.confirm('Vote to remove this member?') && a.run(async () => { await api(`/removals/${r.id}/vote`, { method: 'POST', json: { approve: true } }); reload() })}>Vote to remove</Button>
                    <Button variant="secondary" disabled={a.busy} onClick={() => a.run(async () => { await api(`/removals/${r.id}/vote`, { method: 'POST', json: { approve: false } }); reload() })}>Vote to keep</Button>
                  </div>
                )}
                {r.myVote !== null && <p className="text-sm text-muted">You voted {r.myVote ? 'to remove' : 'to keep'}.</p>}
              </li>
            ))}
          </ul>
        )}
      </Async>
    </div>
  )
}

function Promotion() {
  const [remote, reload] = useApiReload<{ id: string; name: string; email: string }[]>('/admin/members')
  const a = useAction()
  return (
    <div>
      <H>Promote a member to Core (admin)</H>
      {a.error && <div className="mb-3"><Notice kind="error">{a.error}</Notice></div>}
      <Async remote={remote} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No members available to promote" />}>
        {(d) => (
          <ul className="divide-y divide-line border-y border-line">
            {d.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span><span className="font-medium text-navy">{m.name}</span> <span className="text-muted">{m.email}</span></span>
                <Button variant="secondary" disabled={a.busy} onClick={() => window.confirm(`Promote ${m.name} to the Core team?`) && a.run(async () => { await api(`/admin/members/${m.id}/promote`, { method: 'POST' }); reload() })}>Promote</Button>
              </li>
            ))}
          </ul>
        )}
      </Async>
    </div>
  )
}

function Messages() {
  const [remote] = useApiReload<{ id: string; name: string; email: string; subject: string; message: string; createdAt: string }[]>('/contact/submissions')
  return (
    <div>
      <H>Contact messages</H>
      <Async remote={remote} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No messages yet" />}>
        {(d) => (
          <ul className="divide-y divide-line border-y border-line">
            {d.map((m) => (
              <li key={m.id} className="py-4">
                <p className="font-medium text-navy">{m.subject}</p>
                <p className="text-xs text-muted">{m.name} · <a className="text-violet" href={`mailto:${m.email}`}>{m.email}</a> · {formatDate(m.createdAt)}</p>
                <p className="mt-2 text-sm whitespace-pre-line text-muted">{m.message}</p>
              </li>
            ))}
          </ul>
        )}
      </Async>
    </div>
  )
}
