import { useEffect, useState } from 'react'
import { api, ApiError } from './api'

export type Remote<T> =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'ready'; data: T }

export function useApiReload<T>(path: string): [Remote<T>, () => void] {
  const [state, setState] = useState<Remote<T>>({ status: 'loading' })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const ctrl = new AbortController()
    if (tick === 0) setState({ status: 'loading' })
    api<T>(path, { signal: ctrl.signal })
      .then((data) => setState({ status: 'ready', data }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return
        setState({ status: 'error', error: e instanceof ApiError ? e : new ApiError(0, 'Unexpected error') })
      })
    return () => ctrl.abort()
  }, [path, tick])
  return [state, () => setTick((t) => t + 1)]
}

export function useApi<T>(path: string): Remote<T> {
  return useApiReload<T>(path)[0]
}
