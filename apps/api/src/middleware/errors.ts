import type { ErrorRequestHandler, RequestHandler } from 'express'
import multer from 'multer'
import { ZodError } from 'zod'
import { isProd } from '../config/env.js'
import { Prisma } from '../generated/prisma/client.js'
import { HttpError } from '../lib/errors.js'

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found' })
}

// Centralised handler: never leak internals to clients.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code, ...err.extra })
    return
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid input', code: 'validation' })
    return
  }
  if (err instanceof multer.MulterError) {
    res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : 'Invalid upload' })
    return
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    res.status(409).json({ error: 'That already exists' })
    return
  }
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Malformed JSON body' })
    return
  }
  if ((err as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body too large' })
    return
  }
  console.error(isProd ? String((err as Error)?.message ?? err) : err)
  res.status(500).json({ error: 'Internal server error' })
}
