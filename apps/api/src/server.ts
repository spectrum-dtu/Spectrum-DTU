import { createApp } from './app.js'
import { env } from './config/env.js'
import { startOutboxWorker } from './services/mail.js'

createApp().listen(env.PORT, () => {
  console.log(`API listening on :${env.PORT} (${env.NODE_ENV})`)
})
startOutboxWorker()
