import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import EmbeddedPostgres from 'embedded-postgres'

// Boots a throwaway PostgreSQL, applies the real migrations, and points the test
// workers at it. Production/dev databases (including Neon) are never touched:
// the variables below are set explicitly, and dotenv never overrides existing vars.
const PORT = 54331
let pg: EmbeddedPostgres
let dir: string

export async function setup() {
  dir = mkdtempSync(join(tmpdir(), 'spectrum-pg-'))
  pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port: PORT, persistent: false })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('spectrum_test')
  const url = `postgres://postgres:postgres@localhost:${PORT}/spectrum_test`

  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: url,
    DIRECT_DATABASE_URL: url,
    CORS_ORIGINS: 'http://localhost:5173',
    WEB_ORIGIN: 'http://localhost:5173',
    ALLOWED_EMAIL_DOMAINS: 'dtu.ac.in',
    SESSION_SECRET: 'test-secret-test-secret-test-secret-123456',
    BOOTSTRAP_ADMIN_EMAIL: 'founder@dtu.ac.in',
    BOOTSTRAP_TOKEN: 'bootstrap-token-bootstrap-token-123456',
    SMTP_HOST: '', SMTP_PORT: '', SMTP_USER: '', SMTP_PASS: '',
    CLOUDINARY_CLOUD_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '',
    COOKIE_SAMESITE: 'lax',
  })
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    env: process.env,
    stdio: 'pipe',
  })
}

export async function teardown() {
  await pg?.stop()
  rmSync(dir, { recursive: true, force: true })
}
