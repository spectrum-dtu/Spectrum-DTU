// Starts a local, throwaway PostgreSQL (embedded binaries) for development.
// Usage: npm run db:dev   -> postgres://postgres:postgres@localhost:54329/spectrum_dev
import { existsSync } from 'node:fs'
import EmbeddedPostgres from 'embedded-postgres'

const databaseDir = new URL('../.pgdata', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const pg = new EmbeddedPostgres({ databaseDir, user: 'postgres', password: 'postgres', port: 54329, persistent: true })
const fresh = !existsSync(`${databaseDir}/PG_VERSION`)
if (fresh) await pg.initialise()
await pg.start()
if (fresh) await pg.createDatabase('spectrum_dev')
console.log('Dev Postgres ready: postgres://postgres:postgres@localhost:54329/spectrum_dev')
const stop = async () => { await pg.stop(); process.exit(0) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
setInterval(() => {}, 1 << 30)
