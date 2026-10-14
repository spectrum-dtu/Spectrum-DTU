const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

let csrfToken: string | null = null
export const setCsrfToken = (t: string | null) => { csrfToken = t }
export const apiBase = BASE

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: 'include',
      ...rest,
      headers: {
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(csrfToken && (rest.method ?? 'GET') !== 'GET' ? { 'X-CSRF-Token': csrfToken } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Please try again shortly.')
  }
  const body: unknown = await res.json().catch(() => undefined)
  if (!res.ok) {
    const msg = (body as { error?: string } | undefined)?.error
    throw new ApiError(res.status, msg ?? 'Something went wrong. Please try again.', body)
  }
  return body as T
}
