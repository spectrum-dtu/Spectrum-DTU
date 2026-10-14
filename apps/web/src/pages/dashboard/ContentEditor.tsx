import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Async, Button, EmptyState, Field, Notice, StatusBadge, TextArea } from '../../components/ui'
import { ContributorName } from '../../components/cards'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAction } from '../../lib/useAction'
import { useApiReload } from '../../lib/useApi'
import { fromInput, KIND_META, toInput, type Kind } from './fields'
import ImageUpload from './ImageUpload'

interface Rev { id: string; number: number; state: string; title: string; data: Record<string, unknown>; reviewNote: string | null; submittedAt: string | null }
interface Person { id: string; name: string; removed: boolean; role: 'OWNER' | 'CONTRIBUTOR'; contribution: string | null }
interface Detail {
  id: string; kind: Kind; status: string; mode: 'member' | 'draft' | 'core' | 'published'
  canEdit: boolean; isOwner: boolean; awaitingConfirmation: boolean
  published: Rev | null; working: Rev | null; members: Person[]
  invitations: { id: string; personId: string; name: string }[]
  joinRequests: { id: string; personId: string; name: string; message: string | null }[]
  myJoinRequest: { status: string } | null
}

const confirmed = (msg: string) => window.confirm(msg)

export default function ContentEditor({ kind }: { kind: Kind }) {
  const { id = '' } = useParams()
  const meta = KIND_META[kind]
  const [remote, reload] = useApiReload<Detail>(`/content/${encodeURIComponent(id)}`)
  return (
    <div>
      <Link to={`/dashboard/${meta.path}`} className="text-sm text-violet hover:text-violet-deep">← {meta.plural}</Link>
      <div className="mt-6">
        {remote.status === 'error' && remote.error.status === 404 ? (
          <EmptyState title="Not found">This item doesn't exist or you don't have access to it.</EmptyState>
        ) : (
          <Async remote={remote} isEmpty={() => false} empty={null}>
            {(d) => <Editor key={`${d.id}:${d.working?.id ?? 'p'}:${d.working?.state ?? ''}`} d={d} reload={reload} />}
          </Async>
        )}
      </div>
    </div>
  )
}

function Editor({ d, reload }: { d: Detail; reload: () => void }) {
  const meta = KIND_META[d.kind]
  const { user } = useAuth()
  const nav = useNavigate()
  const shown = d.working ?? d.published
  const [title, setTitle] = useState(shown?.title ?? '')
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(meta.fields.map((f) => [f.key, toInput(f.type, shown?.data[f.key])])),
  )
  const save = useAction()
  const act = useAction()
  const isCore = user?.role === 'core'
  const editable = d.canEdit
  const underReview = d.working?.state === 'AWAITING_CORE_APPROVAL'
  const submitted = underReview || d.awaitingConfirmation
  const canSubmit = d.isOwner || (d.kind === 'EVENT' && d.mode === 'member')
  const hasRevision = d.published !== null

  const buildData = () => Object.fromEntries(meta.fields.map((f) => [f.key, fromInput(f.type, vals[f.key] ?? '')]))
  const saveDraft = () => save.run(() => api(`/content/${d.id}`, { method: 'PATCH', json: { title, data: buildData() } }), 'Saved')
  const call = (path: string, json?: unknown, then?: () => void) =>
    act.run(async () => {
      await api(path, { method: 'POST', json: json ?? {} })
      if (then) then()
      else reload()
    })

  return (
    <article className="space-y-8">
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold text-navy">{shown?.title ?? 'Untitled'}</h2>
          <StatusBadge status={d.awaitingConfirmation && d.status !== 'AWAITING_CONFIRMATION' ? 'AWAITING_CONFIRMATION' : d.status} />
          {hasRevision && d.working && <span className="text-xs text-muted">Revision {d.working.number} in progress. The published version is unchanged.</span>}
        </div>
        {d.mode === 'draft' && <p className="mt-2 text-sm text-muted">You're viewing another member's draft (read-only).</p>}
        {d.working?.reviewNote && ['CHANGES_REQUESTED', 'DRAFT'].includes(d.working.state) && (
          <div className="mt-4"><Notice kind="error"><strong>Core feedback:</strong> {d.working.reviewNote}</Notice></div>
        )}
      </header>

      {editable ? (
        <form onSubmit={(e) => { e.preventDefault(); void saveDraft() }} className="max-w-2xl space-y-5">
          <Field id="title" label="Title (required)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          {meta.fields.map((f) =>
            f.type === 'textarea' ? (
              <TextArea key={f.key} id={f.key} label={f.label} rows={6} value={vals[f.key]} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
            ) : f.type === 'image' ? (
              <ImageUpload key={f.key} id={f.key} label={f.label} value={vals[f.key] ?? ''} onChange={(u) => setVals({ ...vals, [f.key]: u })} />
            ) : (
              <Field key={f.key} id={f.key} label={f.label} hint={f.hint}
                type={f.type === 'date' ? 'date' : f.type === 'datetime' ? 'datetime-local' : f.type === 'url' ? 'url' : 'text'}
                value={vals[f.key] ?? ''} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
            ),
          )}
          {save.error && <Notice kind="error">{save.error}</Notice>}
          {save.done && <Notice kind="success">{save.done}</Notice>}
          <Button type="submit" disabled={save.busy || !title.trim()}>{save.busy ? 'Saving…' : 'Save changes'}</Button>
        </form>
      ) : (
        <ReadOnly rev={shown} kind={d.kind} />
      )}

      {/* Owner / editor workflow actions */}
      <section aria-label="Actions" className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
        {editable && canSubmit && (
          <Button disabled={act.busy} onClick={async () => {
            if (!confirmed(`Submit this ${meta.label} for Core review? ${d.kind !== 'EVENT' ? 'Pending invitations will be awaited first.' : ''}`)) return
            await saveDraft()
            await call(`/content/${d.id}/submit`)
          }}>{hasRevision ? 'Submit revision for review' : d.kind === 'EVENT' ? 'Propose to Core' : 'Submit for review'}</Button>
        )}
        {submitted && canSubmit && (
          <Button variant="secondary" disabled={act.busy} onClick={() => confirmed('Withdraw the submission and return to editing?') && call(`/content/${d.id}/withdraw`)}>Withdraw submission</Button>
        )}
        {!d.working && d.published && ['PUBLISHED', 'UNPUBLISHED'].includes(d.status) && (d.mode === 'member' || (isCore && d.kind === 'EVENT')) && (
          <Button variant="secondary" disabled={act.busy} onClick={() => call(`/content/${d.id}/revise`)}>Edit (start a revision)</Button>
        )}
        {d.awaitingConfirmation && <span className="text-sm text-muted">Waiting for invited members to respond before Core sees it.</span>}
        {underReview && <span className="text-sm text-muted">Awaiting Core decision.</span>}
        {d.mode === 'published' && !d.working && null}
      </section>
      {act.error && <Notice kind="error">{act.error}</Notice>}

      {d.mode === 'draft' && <JoinRequest d={d} reload={reload} />}
      {d.kind !== 'EVENT' && d.mode !== 'published' && <Collaboration d={d} reload={reload} />}
      {isCore && underReview && <ReviewBox d={d} reload={reload} />}
      {isCore && d.mode !== 'draft' && (
        <CoreControls d={d} reload={reload} onDeleted={() => nav(`/dashboard/${meta.path}`)} />
      )}
    </article>
  )
}

function ReadOnly({ rev, kind }: { rev: Rev | null; kind: Kind }) {
  if (!rev) return null
  const meta = KIND_META[kind]
  const rows = meta.fields.filter((f) => rev.data[f.key] !== undefined && f.type !== 'image')
  return (
    <div className="max-w-2xl space-y-4">
      {meta.fields.map((f) => f.type === 'image' && typeof rev.data[f.key] === 'string'
        ? <img key={f.key} src={rev.data[f.key] as string} alt="" className="max-h-64 rounded-md border border-line" /> : null)}
      <dl className="space-y-3">
        {rows.map((f) => (
          <div key={f.key} className="border-t border-line pt-3">
            <dt className="text-xs tracking-wide text-muted uppercase">{f.label}</dt>
            <dd className="mt-1 text-sm whitespace-pre-line text-navy">{toInput(f.type, rev.data[f.key]).replace('T', ' ')}</dd>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted">No further details yet.</p>}
      </dl>
    </div>
  )
}

function JoinRequest({ d, reload }: { d: Detail; reload: () => void }) {
  const [msg, setMsg] = useState('')
  const a = useAction()
  if (d.myJoinRequest?.status === 'PENDING') return <Notice kind="success">Your request to join has been sent to the creator.</Notice>
  return (
    <section className="max-w-xl space-y-3 border-t border-line pt-6">
      <h3 className="font-medium text-navy">Want to contribute?</h3>
      <TextArea id="join-msg" label="Message to the creator (optional)" rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={500} />
      {a.error && <Notice kind="error">{a.error}</Notice>}
      <Button disabled={a.busy} onClick={() => a.run(async () => { await api(`/content/${d.id}/join-requests`, { method: 'POST', json: { message: msg || undefined } }); reload() })}>Request to join</Button>
    </section>
  )
}

function Collaboration({ d, reload }: { d: Detail; reload: () => void }) {
  const [q, setQ] = useState('')
  const [found, setFound] = useState<{ id: string; name: string }[]>([])
  const a = useAction()
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries(d.members.map((m) => [m.id, m.contribution ?? ''])))
  const { user } = useAuth()
  const canInvite = d.isOwner && d.canEdit

  useEffect(() => {
    if (!canInvite || q.trim().length < 2) { setFound([]); return }
    const t = setTimeout(() => {
      api<{ id: string; name: string }[]>(`/members/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => setFound(r.filter((p) => !d.members.some((m) => m.id === p.id) && !d.invitations.some((i) => i.personId === p.id))))
        .catch(() => setFound([]))
    }, 250)
    return () => clearTimeout(t)
  }, [q, canInvite, d.members, d.invitations])

  return (
    <section aria-labelledby="collab-h" className="space-y-6 border-t border-line pt-6">
      <h3 id="collab-h" className="font-medium text-navy">Contributors</h3>
      <ul className="space-y-3">
        {d.members.map((m) => {
          const mine = d.isOwner || m.id === user?.personId
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="min-w-40"><ContributorName person={m} /> <span className="text-xs text-muted">{m.role === 'OWNER' ? '(creator)' : ''}</span></span>
              {mine && d.mode === 'member' ? (
                <>
                  <input aria-label={`Contribution of ${m.name}`} placeholder="What they contributed (optional)" maxLength={1000}
                    value={notes[m.id] ?? ''} onChange={(e) => setNotes({ ...notes, [m.id]: e.target.value })}
                    className="min-h-10 flex-1 rounded-md border border-line bg-white px-3 text-sm" />
                  <Button variant="secondary" disabled={a.busy} onClick={() => a.run(async () => { await api(`/content/${d.id}/members/${m.id}`, { method: 'PUT', json: { contribution: notes[m.id] ?? '' } }); reload() })}>Save</Button>
                </>
              ) : <span className="text-muted">{m.contribution}</span>}
            </li>
          )
        })}
      </ul>

      {canInvite && (
        <div className="max-w-md">
          <Field id="invite-q" label="Invite a member" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
          {found.length > 0 && (
            <ul className="mt-2 divide-y divide-line rounded-md border border-line bg-white">
              {found.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  {p.name}
                  <Button variant="ghost" disabled={a.busy} onClick={() => a.run(async () => { await api(`/content/${d.id}/invitations`, { method: 'POST', json: { personIds: [p.id] } }); setQ(''); reload() })}>Invite</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {d.invitations.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-navy">Pending invitations</h4>
          <ul className="mt-2 text-sm text-muted">{d.invitations.map((i) => <li key={i.id}>{i.name} (awaiting response)</li>)}</ul>
        </div>
      )}

      {d.joinRequests.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-navy">Requests to join</h4>
          <ul className="mt-2 space-y-3">
            {d.joinRequests.map((j) => (
              <li key={j.id} className="text-sm">
                <p className="text-navy">{j.name}</p>
                {j.message && <p className="text-muted">{j.message}</p>}
                <div className="mt-2 flex gap-2">
                  <Button disabled={a.busy} onClick={() => a.run(async () => { await api(`/join-requests/${j.id}/respond`, { method: 'POST', json: { accept: true } }); reload() })}>Accept</Button>
                  <Button variant="secondary" disabled={a.busy} onClick={() => a.run(async () => { await api(`/join-requests/${j.id}/respond`, { method: 'POST', json: { accept: false } }); reload() })}>Decline</Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.error && <Notice kind="error">{a.error}</Notice>}
    </section>
  )
}

function ReviewBox({ d, reload }: { d: Detail; reload: () => void }) {
  const [note, setNote] = useState('')
  const a = useAction()
  const decide = (decision: 'approve' | 'reject' | 'changes') =>
    a.run(async () => { await api(`/content/${d.id}/review`, { method: 'POST', json: { decision, note: note || undefined } }); reload() })
  return (
    <section aria-labelledby="review-h" className="max-w-xl space-y-3 rounded-lg border border-violet/30 bg-lavender/40 p-5">
      <h3 id="review-h" className="font-medium text-navy">Core review</h3>
      <TextArea id="review-note" label="Note to contributors (required for reject / request changes)" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      {a.error && <Notice kind="error">{a.error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={a.busy} onClick={() => confirmed('Approve and publish this?') && decide('approve')}>Approve</Button>
        <Button variant="secondary" disabled={a.busy || !note.trim()} onClick={() => decide('changes')}>Request changes</Button>
        <Button variant="secondary" disabled={a.busy || !note.trim()} onClick={() => confirmed('Reject this submission?') && decide('reject')}>Reject</Button>
      </div>
    </section>
  )
}

function CoreControls({ d, reload, onDeleted }: { d: Detail; reload: () => void; onDeleted: () => void }) {
  const a = useAction()
  const set = (action: string) => a.run(async () => { await api(`/content/${d.id}/status`, { method: 'POST', json: { action } }); reload() })
  const can = {
    unpublish: d.status === 'PUBLISHED', publish: d.status === 'UNPUBLISHED',
    archive: d.status !== 'ARCHIVED', restore: d.status === 'ARCHIVED',
  }
  return (
    <section aria-label="Core controls" className="space-y-3 border-t border-line pt-6">
      <h3 className="text-sm font-medium text-navy">Core controls</h3>
      <div className="flex flex-wrap gap-2">
        {can.unpublish && <Button variant="secondary" disabled={a.busy} onClick={() => confirmed('Unpublish? It will disappear from the public site.') && set('unpublish')}>Unpublish</Button>}
        {can.publish && <Button variant="secondary" disabled={a.busy} onClick={() => set('publish')}>Publish again</Button>}
        {can.archive && <Button variant="secondary" disabled={a.busy} onClick={() => confirmed('Archive this item?') && set('archive')}>Archive</Button>}
        {can.restore && <Button variant="secondary" disabled={a.busy} onClick={() => set('restore')}>Restore</Button>}
        {d.kind === 'EVENT' && d.status !== 'ARCHIVED' && (
          <Button variant="secondary" disabled={a.busy} onClick={() => confirmed('Delete this event? It is archived and removed from the public site.') &&
            a.run(async () => { await api(`/content/${d.id}`, { method: 'DELETE' }); onDeleted() })}>Delete event</Button>
        )}
      </div>
      {a.error && <Notice kind="error">{a.error}</Notice>}
    </section>
  )
}
