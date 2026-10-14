import type { z } from 'zod'
import { HttpError } from './errors.js'

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data)
  if (!r.success) {
    const first = r.error.issues[0]
    const where = first?.path.length ? `${first.path.join('.')}: ` : ''
    throw new HttpError(400, `${where}${first?.message ?? 'Invalid input'}`, 'validation')
  }
  return r.data
}
