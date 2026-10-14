import { Link } from 'react-router-dom'
import { Async, Button, EmptyState, formatDate, Notice } from '../../components/ui'
import { api } from '../../lib/api'
import { useAction } from '../../lib/useAction'
import { useApiReload } from '../../lib/useApi'
import { KIND_META, type Kind } from './fields'

interface Invitation { id: string; itemId: string; kind: Kind; title: string; from: string; createdAt: string }

export function InvitationsPanel() {
  const [remote, reload] = useApiReload<Invitation[]>('/invitations')
  const a = useAction()
  const respond = (id: string, accept: boolean) =>
    a.run(async () => { await api(`/invitations/${id}/respond`, { method: 'POST', json: { accept } }); reload() })
  return (
    <section aria-labelledby="panel-h">
      <h2 id="panel-h" className="text-xl font-semibold text-navy">Invitations</h2>
      <p className="mt-1 text-sm text-muted">Accept to become a contributor with edit rights.</p>
      {a.error && <div className="mt-4"><Notice kind="error">{a.error}</Notice></div>}
      <div className="mt-6">
        <Async remote={remote} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No pending invitations" />}>
          {(d) => (
            <ul className="divide-y divide-line border-y border-line">
              {d.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <p className="font-medium text-navy">{i.title}</p>
                    <p className="text-xs text-muted">{i.from} invited you to this {KIND_META[i.kind].label} · {formatDate(i.createdAt)}</p>
                    <Link className="text-xs text-violet" to={`/dashboard/${KIND_META[i.kind].path}/${i.itemId}`}>View draft</Link>
                  </div>
                  <div className="flex gap-2">
                    <Button disabled={a.busy} onClick={() => respond(i.id, true)}>Accept</Button>
                    <Button variant="secondary" disabled={a.busy} onClick={() => respond(i.id, false)}>Decline</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Async>
      </div>
    </section>
  )
}

interface Note { id: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string }

export function NotificationsPanel() {
  const [remote, reload] = useApiReload<{ unread: number; items: Note[] }>('/notifications')
  const a = useAction()
  return (
    <section aria-labelledby="panel-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="panel-h" className="text-xl font-semibold text-navy">Notifications</h2>
        <Button variant="secondary" disabled={a.busy} onClick={() => a.run(async () => { await api('/notifications/read-all', { method: 'POST' }); reload() })}>Mark all as read</Button>
      </div>
      <div className="mt-6">
        <Async remote={remote} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="You're all caught up" />}>
          {(d) => (
            <ul className="divide-y divide-line border-y border-line">
              {d.items.map((n) => (
                <li key={n.id} className={`py-4 ${n.readAt ? 'opacity-70' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-navy">{!n.readAt && <span aria-label="Unread" className="mr-2 inline-block size-2 rounded-full bg-violet" />}{n.title}</p>
                      {n.body && <p className="mt-1 text-sm whitespace-pre-line text-muted">{n.body}</p>}
                      <p className="mt-1 text-xs text-muted">{formatDate(n.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-sm">
                      {n.link && <Link to={n.link} className="text-violet" onClick={() => { void api(`/notifications/${n.id}/read`, { method: 'POST' }).then(reload) }}>Open</Link>}
                      {!n.readAt && <button type="button" className="text-muted hover:text-navy" onClick={() => a.run(async () => { await api(`/notifications/${n.id}/read`, { method: 'POST' }); reload() })}>Mark read</button>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Async>
      </div>
    </section>
  )
}
