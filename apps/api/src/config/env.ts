import 'dotenv/config'
import { z } from 'zod'

const csv = z
  .string()
  .transform((s) => s.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean))

// Empty strings in .env mean "not set".
const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)
const optional = <T extends z.ZodType>(s: T) => z.preprocess(emptyToUndefined, s.optional())

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    // Origins allowed by CORS and accepted by the CSRF origin check.
    CORS_ORIGINS: csv.pipe(z.array(z.url()).min(1)),
    // Public URL of the web app, used in email links.
    WEB_ORIGIN: optional(z.url()),
    DATABASE_URL: z.string().min(1),
    DIRECT_DATABASE_URL: optional(z.string()),
    ALLOWED_EMAIL_DOMAINS: csv.pipe(z.array(z.string()).min(1)),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    // Reverse proxies in front of the API (Render = 1; Vercel rewrite + Render = 2) so req.ip is the real client.
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
    // 'none' is only for web and API on different sites (needs https; blocked by Safari, so prefer the /api rewrite).
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    BOOTSTRAP_ADMIN_EMAIL: optional(z.email()),
    BOOTSTRAP_TOKEN: optional(z.string().min(32)),
    SMTP_HOST: optional(z.string()),
    SMTP_PORT: optional(z.coerce.number().int().positive()),
    SMTP_SECURE: z.preprocess(emptyToUndefined, z.stringbool().default(false)),
    SMTP_USER: optional(z.string()),
    SMTP_PASS: optional(z.string()),
    MAIL_FROM: z.string().default('Spectrum DTU <no-reply@localhost>'),
    CLOUDINARY_CLOUD_NAME: optional(z.string()),
    CLOUDINARY_API_KEY: optional(z.string()),
    CLOUDINARY_API_SECRET: optional(z.string()),
  })
  .superRefine((e, ctx) => {
    if (e.NODE_ENV !== 'production') return
    for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'WEB_ORIGIN'] as const) {
      if (e[k] === undefined) ctx.addIssue({ code: 'custom', path: [k], message: 'required in production' })
    }
    if (e.COOKIE_SAMESITE === 'none' && !e.CORS_ORIGINS.every((o) => o.startsWith('https://'))) {
      ctx.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'must be https when COOKIE_SAMESITE=none' })
    }
  })

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  // Log variable names and reasons only, never values.
  const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`)
  console.error(`Invalid environment configuration:\n${problems.join('\n')}`)
  process.exit(1)
}

export const env = parsed.data
export type Env = typeof env
export const isProd = env.NODE_ENV === 'production'
export const smtpConfigured = Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS)
export const cloudinaryConfigured = Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET)
export const webOrigin = env.WEB_ORIGIN ?? env.CORS_ORIGINS[0]!
