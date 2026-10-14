import { useState } from 'react'
import { ApiError } from './api'

// Runs a mutation with busy/error state so every button gives real feedback.
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  async function run(fn: () => Promise<unknown>, success?: string): Promise<boolean> {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      await fn()
      if (success) setDone(success)
      return true
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.')
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, done, run, fail: (m: string) => { setDone(null); setError(m) }, clear: () => { setError(null); setDone(null) } }
}
