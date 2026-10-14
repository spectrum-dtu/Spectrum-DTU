export type Kind = 'PROJECT' | 'ACHIEVEMENT' | 'EVENT'

export interface FieldDef {
  key: string
  label: string
  type: 'text' | 'textarea' | 'url' | 'date' | 'datetime' | 'tags' | 'image'
  hint?: string
}

export const KIND_META: Record<Kind, { label: string; plural: string; path: string; fields: FieldDef[] }> = {
  PROJECT: {
    label: 'project', plural: 'Projects', path: 'projects',
    fields: [
      { key: 'summary', label: 'Short summary', type: 'text', hint: 'One or two sentences shown on cards.' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'coverUrl', label: 'Cover image', type: 'image' },
      { key: 'domain', label: 'Domain or category', type: 'text' },
      { key: 'technologies', label: 'Technologies', type: 'tags', hint: 'Comma separated.' },
      { key: 'githubUrl', label: 'GitHub link', type: 'url' },
      { key: 'demoUrl', label: 'Live demo link', type: 'url' },
      { key: 'startDate', label: 'Start date', type: 'date' },
      { key: 'completedDate', label: 'Completion date', type: 'date' },
    ],
  },
  ACHIEVEMENT: {
    label: 'achievement', plural: 'Achievements', path: 'achievements',
    fields: [
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'imageUrl', label: 'Image or certificate', type: 'image' },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'event', label: 'Event or competition', type: 'text' },
      { key: 'position', label: 'Position or rank', type: 'text' },
      { key: 'link', label: 'Link', type: 'url' },
    ],
  },
  EVENT: {
    label: 'event', plural: 'Events', path: 'events',
    fields: [
      { key: 'summary', label: 'Short summary', type: 'text' },
      { key: 'description', label: 'Details', type: 'textarea' },
      { key: 'imageUrl', label: 'Event image', type: 'image' },
      { key: 'startsAt', label: 'Starts', type: 'datetime' },
      { key: 'endsAt', label: 'Ends', type: 'datetime' },
      { key: 'location', label: 'Location', type: 'text' },
    ],
  },
}

const pad = (n: number) => String(n).padStart(2, '0')

// Stored ISO value -> value for the matching <input>.
export function toInput(type: FieldDef['type'], v: unknown): string {
  if (v === undefined || v === null || v === '') return ''
  if (type === 'tags') return Array.isArray(v) ? v.join(', ') : ''
  if (type === 'date') return String(v).slice(0, 10)
  if (type === 'datetime') {
    const d = new Date(String(v))
    if (Number.isNaN(d.getTime())) return ''
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  return String(v)
}

// <input> value -> API value (undefined clears the field).
export function fromInput(type: FieldDef['type'], v: string): unknown {
  const t = v.trim()
  if (!t) return undefined
  if (type === 'tags') return t.split(',').map((x) => x.trim()).filter(Boolean)
  if (type === 'datetime') return new Date(t).toISOString()
  return t
}
