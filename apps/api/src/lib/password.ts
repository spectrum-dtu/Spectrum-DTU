import { hash, verify } from '@node-rs/argon2'

// argon2id with library defaults (memory-hard, per-hash salt).
export const hashPassword = (p: string) => hash(p)

export async function verifyPassword(stored: string, p: string): Promise<boolean> {
  try {
    return await verify(stored, p)
  } catch {
    return false
  }
}

// Hash of a random value nobody knows, verified against for unknown accounts so
// login timing does not reveal whether an email is registered.
export const DUMMY_HASH_PROMISE = hashPassword('not-a-real-password-' + Math.random())
