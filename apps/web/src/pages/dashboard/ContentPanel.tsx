import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Async, Button, EmptyState, Field, formatDate, Notice, StatusBadge } from '../../components/ui'
import { api } from '../../lib/api'
import { useAction } from '../../lib/useAction'
import { useApi } from '../../lib/useApi'
import { KIND_META, type Kind } from './fields'

interface Summary {
  id: string; kind: Kind; status: string; title: string; revisionState: string | null
  awaitingConfirmation: boolean; updatedAt: string; memberCount: number
}

function List({ items, base }: { items: Summary[]; base: string }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {items.map((i) => (
        <li key={i.id}>
          <Link to={`${base}/${i.id}`} className="flex flex-wrap items-center justify-between gap-3 py-4 hover:bg-white/60">
            <span>
              <span className="block font-medium text-navy">{i.title}</span>
              <span className="text-xs text-muted">Updated {formatDate(i.updatedAt)} · {i.memberCount} contributor{i.memberCount === 1 ? '' : 's'}</span>
            </span>
            <span className="flex items-center gap-2">
              {i.revisionState && i.status === 'PUBLISHED' && <span className="text-xs text-muted">Revision in progress</span>}
              <StatusBadge status={i.awaitingConfirmation && i.status !== 'AWAITING_CONFIRMATION' ? 'AWAITING_CONFIRMATION' : i.status} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export default function ContentPanel({ kind }: { kind: Kind }) {
  const meta = KIND_META[kind]
  const base = `/dashboard/${meta.path}`
  const nav = useNavigate()
  const mine = useApi<Summary[]>(`/content/mine?kind=${kind}`)
  const drafts = useApi<Summary[]>(kind === 'EVENT' ? '/content/mine?kind=EVENT' : `/content/drafts?kind=${kind}`)
  const [title, setTitle] = useState('')
  const create = useAction()

  async function onCreate(ev: FormEvent) {
    ev.preventDefault()
    let id = ''
    const ok = await create.run(async () => {
      id = (await api<{ id: string }>('/content', { method: 'POST', json: { kind, title: title.trim() } })).id
    })
    if (ok) nav(`${base}/${id}`)
  }

  return (
    <section aria-labelledby="panel-h" className="space-y-10">
      <div>
        <h2 id="panel-h" className="text-xl font-semibold text-navy">{meta.plural}</h2>
        <form onSubmit={onCreate} className="mt-5 flex max-w-xl flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <Field id="new-title" label={kind === 'EVENT' ? 'Propose an event' : `New ${meta.label}`} placeholder="Title" value={title}
              onChange={(e) => setTitle(e.target.value)} hint="Only a title is required. You can add the rest later." />
          </div>
          <Button type="submit" disabled={create.busy || !title.trim()}>{create.busy ? 'Creating…' : 'Create draft'}</Button>
        </form>
        {create.error && <div className="mt-3 max-w-xl"><Notice kind="error">{create.error}</Notice></div>}
      </div>

      <div>
        <h3 className="mb-3 font-medium text-navy">Yours</h3>
        <Async remote={mine} isEmpty={(d) => d.length === 0} empty={<EmptyState title={`No ${meta.plural.toLowerCase()} yet`}>Create a draft above to get started.</EmptyState>}>
          {(d) => <List items={d} base={base} />}
        </Async>
      </div>

      {kind !== 'EVENT' && (
        <div>
          <h3 className="mb-1 font-medium text-navy">Browse other members' drafts</h3>
          <p className="mb-3 text-sm text-muted">Open one to request to join as a contributor. These are read-only.</p>
          <Async remote={drafts} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No open drafts from other members" />}>
            {(d) => <List items={d} base={base} />}
          </Async>
        </div>
      )}
    </section>
  )
}
