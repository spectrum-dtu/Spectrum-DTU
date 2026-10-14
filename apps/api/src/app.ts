import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { env } from './config/env.js'
import { errorHandler, notFoundHandler } from './middleware/errors.js'
import { loadSession } from './middleware/auth.js'
import { csrfProtect, globalLimiter } from './middleware/security.js'
import { authRouter } from './routes/auth.js'
import { communityRouter } from './routes/community.js'
import { contentRouter } from './routes/content.js'
import { healthRouter } from './routes/health.js'
import { membershipRouter } from './routes/membership.js'
import { teamRouter } from './routes/team.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', env.TRUST_PROXY)
  app.use(helmet())
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true, allowedHeaders: ['Content-Type', 'X-CSRF-Token'] }))
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())
  app.use('/api', globalLimiter, loadSession, csrfProtect)
  app.use('/api', healthRouter, authRouter, membershipRouter, teamRouter, contentRouter, communityRouter)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
