import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { app, Client, emailsTo, lastCode, loggedIn, ORIGIN, PASSWORD, prisma, resetDb, seedUser } from './helpers.js'

beforeEach(resetDb)

const post = (path: string, body: object) => request(app).post(`/api${path}`).set('Origin', ORIGIN).send(body)

describe('registration and OTP', () => {
  it('runs the full flow: register, verify, apply, Core approves, welcome email', async () => {
    const core = await loggedIn('core1@dtu.ac.in', 'Core One', { role: 'CORE' })
    await post('/auth/register', { email: 'new@dtu.ac.in', password: PASSWORD }).expect(202)

    const applicant = new Client()
    const v = await applicant.post('/auth/register/verify', { email: 'new@dtu.ac.in', otp: await lastCode('new@dtu.ac.in') })
    expect(v.status).toBe(200)
    applicant.csrf = v.body.csrfToken
    expect(v.body.user.status).toBe('VERIFIED')

    const app1 = await applicant.post('/membership/applications', { name: 'New Person', branch: 'CSE', year: '2' })
    expect(app1.status).toBe(201)

    // Application reaches every Core member in-app and by email.
    expect(await prisma.notification.count({ where: { userId: core.u.userId, type: 'application.new' } })).toBe(1)
    expect((await emailsTo('core1@dtu.ac.in')).some((m) => m.subject.includes('New membership application'))).toBe(true)

    // Pending applicants cannot log in yet.
    expect((await new Client().login('new@dtu.ac.in')).status).toBe(403)

    const list = await core.get('/membership/applications')
    expect(list.body).toHaveLength(1)
    await core.post(`/membership/applications/${list.body[0].id}/approve`).expect(200)

    const member = new Client()
    expect((await member.login('new@dtu.ac.in')).status).toBe(200)
    expect((await emailsTo('new@dtu.ac.in')).some((m) => m.subject.includes('Welcome'))).toBe(true)
    // No email ever contains the password.
    for (const m of await prisma.emailOutbox.findMany()) expect(m.text).not.toContain(PASSWORD)
  })

  it('rejects emails outside the configured domains', async () => {
    const r = await post('/auth/register', { email: 'someone@gmail.com', password: PASSWORD })
    expect(r.status).toBe(400)
  })

  it('does not reveal whether an account exists', async () => {
    await seedUser('real@dtu.ac.in', 'Real')
    const a = await post('/auth/register', { email: 'real@dtu.ac.in', password: PASSWORD })
    const b = await post('/auth/register', { email: 'ghost@dtu.ac.in', password: PASSWORD })
    expect(a.status).toBe(b.status)
    expect(a.body).toEqual(b.body)
    const f1 = await post('/auth/forgot', { email: 'real@dtu.ac.in' })
    const f2 = await post('/auth/forgot', { email: 'ghost@dtu.ac.in' })
    expect(f1.status).toBe(f2.status)
    expect(f1.body).toEqual(f2.body)
    // Registering over an ACTIVE account must not alter its password.
    expect((await new Client().login('real@dtu.ac.in')).status).toBe(200)
  })

  it('expires OTPs and limits attempts', async () => {
    await post('/auth/register', { email: 'o@dtu.ac.in', password: PASSWORD })
    const code = await lastCode('o@dtu.ac.in')
    await prisma.emailOtp.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await post('/auth/register/verify', { email: 'o@dtu.ac.in', otp: code })).status).toBe(400)

    await resetDb()
    await post('/auth/register', { email: 'o@dtu.ac.in', password: PASSWORD })
    const good = await lastCode('o@dtu.ac.in')
    const wrong = good === '000000' ? '111111' : '000000'
    for (let i = 0; i < 6; i++) await post('/auth/register/verify', { email: 'o@dtu.ac.in', otp: wrong })
    // After too many wrong guesses even the right code is dead.
    expect((await post('/auth/register/verify', { email: 'o@dtu.ac.in', otp: good })).status).toBe(400)
  })

  it('an OTP cannot be used twice', async () => {
    await post('/auth/register', { email: 'twice@dtu.ac.in', password: PASSWORD })
    const code = await lastCode('twice@dtu.ac.in')
    expect((await post('/auth/register/verify', { email: 'twice@dtu.ac.in', otp: code })).status).toBe(200)
    expect((await post('/auth/register/verify', { email: 'twice@dtu.ac.in', otp: code })).status).toBe(400)
  })
})

describe('login, sessions, logout', () => {
  it('logs in, serves /me, and logout revokes the session', async () => {
    const c = await loggedIn('m@dtu.ac.in', 'Mem')
    expect((await c.get('/auth/me')).body.user.email).toBe('m@dtu.ac.in')
    await c.post('/auth/logout').expect(200)
    expect((await c.get('/auth/me')).status).toBe(401)
  })

  it('uses a generic error for wrong password and unknown email', async () => {
    await seedUser('m@dtu.ac.in', 'Mem')
    const a = await new Client().login('m@dtu.ac.in', 'wrong-password-123')
    const b = await new Client().login('nobody@dtu.ac.in', 'wrong-password-123')
    expect(a.status).toBe(401)
    expect(a.body.error).toBe(b.body.error)
  })

  it('remember-me sets a 7 day cookie; otherwise a browser-session cookie', async () => {
    await seedUser('m@dtu.ac.in', 'Mem')
    const rem = await new Client().login('m@dtu.ac.in', PASSWORD, true)
    const cookie = String(rem.headers['set-cookie']?.[0])
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toMatch(/Max-Age=604800/)
    const sess = await new Client().login('m@dtu.ac.in', PASSWORD, false)
    expect(String(sess.headers['set-cookie']?.[0])).not.toMatch(/Max-Age/)
  })

  it('treats an expired session as logged out', async () => {
    const c = await loggedIn('m@dtu.ac.in', 'Mem')
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await c.get('/auth/me')).status).toBe(401)
  })

  it('rejects state-changing requests without the CSRF token or from a foreign origin', async () => {
    const c = await loggedIn('m@dtu.ac.in', 'Mem')
    c.csrf = null
    expect((await c.patch('/me/profile', { bio: 'x' })).status).toBe(403)
    const evil = await c.agent.post('/api/auth/logout').set('Origin', 'https://evil.example').send({})
    expect(evil.status).toBe(403)
  })
})

describe('password reset', () => {
  async function resetToken(email: string) {
    await post('/auth/forgot', { email })
    const r = await post('/auth/forgot/verify', { email, otp: await lastCode(email) })
    return r.body.resetToken as string
  }

  it('resets once, revokes sessions, and refuses reuse', async () => {
    const c = await loggedIn('m@dtu.ac.in', 'Mem')
    const token = await resetToken('m@dtu.ac.in')
    expect((await post('/auth/reset', { token, password: 'a-brand-new-password' })).status).toBe(200)
    expect((await c.get('/auth/me')).status).toBe(401) // old session revoked
    expect((await new Client().login('m@dtu.ac.in', 'a-brand-new-password')).status).toBe(200)
    expect((await post('/auth/reset', { token, password: 'another-new-password' })).status).toBe(400)
  })

  it('refuses an expired token', async () => {
    await seedUser('m@dtu.ac.in', 'Mem')
    const token = await resetToken('m@dtu.ac.in')
    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await post('/auth/reset', { token, password: 'a-brand-new-password' })).status).toBe(400)
  })

  it('does not issue a token for a wrong OTP', async () => {
    await seedUser('m@dtu.ac.in', 'Mem')
    await post('/auth/forgot', { email: 'm@dtu.ac.in' })
    expect((await post('/auth/forgot/verify', { email: 'm@dtu.ac.in', otp: '000000' })).body.resetToken).toBeUndefined()
  })

  it('change-password needs a valid OTP and signs out other devices', async () => {
    const a = await loggedIn('m@dtu.ac.in', 'Mem')
    const b = new Client()
    await b.login('m@dtu.ac.in')
    await a.post('/auth/change-password/request').expect(202)
    expect((await a.post('/auth/change-password', { otp: '000000', password: 'a-brand-new-password' })).status).toBe(400)
    await a.post('/auth/change-password', { otp: await lastCode('m@dtu.ac.in'), password: 'a-brand-new-password' }).expect(200)
    expect((await a.get('/auth/me')).status).toBe(200) // this device stays signed in
    expect((await b.get('/auth/me')).status).toBe(401) // the other device does not
  })
})

describe('one-time admin bootstrap', () => {
  it('creates exactly one admin, then answers 404', async () => {
    const body = { token: 'bootstrap-token-bootstrap-token-123456', name: 'Founder', password: PASSWORD }
    expect((await post('/setup/admin', { ...body, token: 'wrong-token-wrong-token-wrong-token-1' })).status).toBe(403)
    expect((await post('/setup/admin', body)).status).toBe(201)
    expect((await post('/setup/admin', body)).status).toBe(404)
    const admin = await new Client().login('founder@dtu.ac.in')
    expect(admin.body.user).toMatchObject({ role: 'core', isAdmin: true })
  })
})
