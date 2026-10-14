import { useState, type FormEvent } from 'react'
import { Async, Button, EmptyState, Field, formatDate, Notice } from '../../components/ui'
import { api, apiBase } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAction } from '../../lib/useAction'
import { useApiReload } from '../../lib/useApi'

interface Material { id: string; title: string; description?: string; category?: string; fileType: string; uploadedAt: string; downloadPath: string }

// Shared by the public /learning page and the dashboard tab. Files have no public URL;
// each download goes through the API, which checks the session and signs a short-lived link.
export function MaterialList() {
  const { user } = useAuth()
  const [remote, reload] = useApiReload<Material[]>('/learning')
  const a = useAction()
  return (
    <div className="space-y-8">
      {user?.role === 'core' && <Upload onDone={reload} />}
      {a.error && <Notice kind="error">{a.error}</Notice>}
      <Async remote={remote} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No materials uploaded yet" />}>
        {(d) => (
          <ul className="divide-y divide-line border-y border-line">
            {d.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <p className="font-medium text-navy">{m.title}</p>
                  <p className="text-xs text-muted">{[m.category, m.fileType.toUpperCase(), formatDate(m.uploadedAt)].filter(Boolean).join(' · ')}</p>
                  {m.description && <p className="mt-1 text-sm text-muted">{m.description}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <a className="text-sm font-medium text-violet hover:text-violet-deep" href={`${apiBase}${m.downloadPath}`} target="_blank" rel="noopener noreferrer">Download</a>
                  {user?.role === 'core' && (
                    <button type="button" className="text-sm text-red-700" onClick={() => window.confirm(`Delete "${m.title}"?`) && a.run(async () => { await api(`/learning/${m.id}`, { method: 'DELETE' }); reload() })}>Delete</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Async>
    </div>
  )
}

function Upload({ onDone }: { onDone: () => void }) {
  const a = useAction()
  const [key, setKey] = useState(0)
  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const body = new FormData(ev.currentTarget)
    if (await a.run(() => api('/learning', { method: 'POST', body }), 'Uploaded')) { setKey((k) => k + 1); onDone() }
  }
  return (
    <form key={key} onSubmit={onSubmit} className="max-w-xl space-y-4 rounded-lg border border-line bg-white p-5">
      <h3 className="font-medium text-navy">Upload material (Core only)</h3>
      <Field id="lm-title" name="title" label="Title" required maxLength={200} />
      <Field id="lm-cat" name="category" label="Category (optional)" maxLength={100} />
      <Field id="lm-desc" name="description" label="Description (optional)" maxLength={1000} />
      <div>
        <label htmlFor="lm-file" className="mb-1.5 block text-sm font-medium text-navy">File</label>
        <input id="lm-file" name="file" type="file" required accept=".pdf,.docx,.pptx,.xlsx,.zip" className="text-sm text-muted" />
        <p className="mt-1 text-xs text-muted">PDF, DOCX, PPTX, XLSX or ZIP, up to 10 MB. Stored privately.</p>
      </div>
      {a.error && <Notice kind="error">{a.error}</Notice>}
      {a.done && <Notice kind="success">{a.done}</Notice>}
      <Button type="submit" disabled={a.busy}>{a.busy ? 'Uploading…' : 'Upload'}</Button>
    </form>
  )
}

export default function LearningPanel() {
  return (
    <section aria-labelledby="panel-h">
      <h2 id="panel-h" className="mb-6 text-xl font-semibold text-navy">Learning Materials</h2>
      <MaterialList />
    </section>
  )
}
