import { useState } from 'react'
import { Button, Notice } from '../../components/ui'
import { api } from '../../lib/api'
import { useAction } from '../../lib/useAction'

// Uploads through the API (type/size checked server-side) and reports the hosted URL.
export default function ImageUpload({ id, label, value, onChange, disabled }: {
  id: string; label: string; value: string; onChange: (url: string) => void; disabled?: boolean
}) {
  const up = useAction()
  const [name, setName] = useState('')

  async function onFile(file: File | undefined) {
    if (!file) return
    setName(file.name)
    if (file.size > 5 * 1024 * 1024) {
      up.fail('Images must be 5 MB or smaller.')
      return
    }
    const body = new FormData()
    body.append('file', file)
    await up.run(async () => {
      const r = await api<{ url: string }>('/uploads/image', { method: 'POST', body })
      onChange(r.url)
    })
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-navy">{label}</label>
      {value && <img src={value} alt="" className="mb-3 max-h-40 rounded-md border border-line" />}
      <div className="flex flex-wrap items-center gap-3">
        <input id={id} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || up.busy}
          onChange={(e) => onFile(e.target.files?.[0])} className="text-sm text-muted file:mr-3 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-2" />
        {value && !disabled && <Button type="button" variant="ghost" onClick={() => onChange('')}>Remove</Button>}
      </div>
      <p className="mt-1 text-xs text-muted">JPEG, PNG or WebP, up to 5 MB.{up.busy && ` Uploading ${name}…`}</p>
      {up.error && <div className="mt-2"><Notice kind="error">{up.error}</Notice></div>}
    </div>
  )
}
