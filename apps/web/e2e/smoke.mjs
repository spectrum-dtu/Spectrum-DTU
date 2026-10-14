// End-to-end smoke test through the real UI (Chrome via playwright-core).
// Needs: API on :4000 (dev DB, SMTP unset so OTPs are logged), web on :5173.
// Usage: API_LOG=/path/to/api.log node e2e/smoke.mjs
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const WEB = process.env.WEB ?? 'http://localhost:5173'
const LOG = process.env.API_LOG
const PW = 'correct-horse-battery'
const stamp = Date.now()
const applicant = `e2e${stamp}@dtu.ac.in`
const results = []
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }

const lastOtp = async (email) => {
  for (let i = 0; i < 20; i++) {
    const log = readFileSync(LOG, 'utf8')
    const blocks = log.split('[mail:dev]').filter((b) => b.includes(`to=${email}`) && /code .*is (\d{6})/.test(b))
    if (blocks.length) return /is (\d{6})/.exec(blocks.at(-1))[1]
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('OTP not found in log')
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const mk = async () => (await browser.newContext({ baseURL: WEB })).newPage()
const errors = []
const watch = (p, tag) => {
  p.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`))
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|401|403|404|410/.test(m.text()) && errors.push(`${tag}: ${m.text()}`))
}

try {
  // 0. Public pages render with empty states
  const anon = await mk(); watch(anon, 'anon')
  await anon.goto('/')
  await anon.getByRole('heading', { name: /Engineering the Connected Future/ }).waitFor()
  check('home renders', true)
  await anon.goto('/projects')
  await anon.getByText('No projects published yet').waitFor()
  check('projects empty state', true)
  await anon.goto('/dashboard')
  await anon.waitForURL('**/login')
  check('dashboard redirects anonymous users to login', true)

  // 1. Registration through the UI
  await anon.goto('/register')
  await anon.getByLabel('DTU email').fill(applicant)
  await anon.getByLabel('Password', { exact: true }).fill(PW)
  await anon.getByLabel('Confirm password').fill(PW)
  await anon.getByRole('button', { name: 'Continue' }).click()
  await anon.getByLabel('Verification code').waitFor()
  await anon.getByLabel('Verification code').fill(await lastOtp(applicant))
  await anon.getByRole('button', { name: 'Verify' }).click()
  await anon.waitForURL('**/apply')
  check('OTP verified and redirected to application', true)
  await anon.getByLabel('Full name').fill('E2E Tester')
  await anon.getByLabel('Branch').fill('ECE')
  await anon.getByLabel('Academic year').fill('3')
  await anon.getByRole('button', { name: 'Submit application' }).click()
  await anon.getByText('Application submitted').waitFor()
  check('application submitted', true)

  // 2. Admin signs in and approves
  const admin = await mk(); watch(admin, 'admin')
  await admin.goto('/login')
  await admin.getByLabel('DTU email').fill('founder@dtu.ac.in')
  await admin.getByLabel('Password').fill(PW)
  await admin.getByRole('button', { name: 'Log in' }).click()
  await admin.waitForURL('**/dashboard/profile')
  check('admin login lands on dashboard', true)
  await admin.getByRole('link', { name: 'Approvals and Management' }).click()
  await admin.getByText(applicant).waitFor()
  const row = admin.getByRole('listitem').filter({ hasText: applicant })
  await row.getByRole('button', { name: 'Approve' }).click()
  await admin.getByText(applicant).waitFor({ state: 'detached' })
  check('Core approved the application in the UI', true)

  // 3. New member logs in, creates and submits a project
  const member = await mk(); watch(member, 'member')
  await member.goto('/login')
  await member.getByLabel('DTU email').fill(applicant)
  await member.getByLabel('Password').fill(PW)
  await member.getByLabel('Remember me for 7 days').check()
  await member.getByRole('button', { name: 'Log in' }).click()
  await member.waitForURL('**/dashboard/profile')
  await member.getByLabel('Short biography').fill('Built in the E2E test.')
  await member.getByRole('button', { name: 'Save profile' }).click()
  await member.getByText('Profile saved').waitFor()
  check('member saved profile (CSRF-protected PATCH works)', true)

  await member.getByRole('navigation', { name: 'Dashboard' }).getByRole('link', { name: 'Projects' }).click()
  await member.getByLabel('New project').fill('E2E Rover')
  await member.getByRole('button', { name: 'Create draft' }).click()
  await member.getByLabel('Short summary').waitFor()
  await member.getByLabel('Short summary').fill('A rover built during tests')
  await member.getByLabel('Technologies').fill('ESP32, 5G')
  await member.getByRole('button', { name: 'Save changes' }).click()
  await member.getByText('Saved', { exact: true }).waitFor()
  check('project draft created and saved', true)
  await anon.goto('/projects')
  check('draft is NOT public', (await anon.getByText('E2E Rover').count()) === 0)
  member.once('dialog', (d) => d.accept())
  await member.getByRole('button', { name: 'Submit for review' }).click()
  await member.getByText('Awaiting Core decision.').waitFor()
  check('project submitted for review', true)

  // 4. Core reviews and approves it
  await admin.reload()
  await admin.getByRole('navigation', { name: 'Dashboard' }).getByRole('link', { name: 'Notifications' }).click()
  await admin.getByText(/Submitted for review: E2E Rover/).waitFor()
  check('Core received an in-app notification', true)
  await admin.getByRole('navigation', { name: 'Dashboard' }).getByRole('link', { name: 'Approvals and Management' }).click()
  await admin.getByRole('listitem').filter({ hasText: 'E2E Rover' }).getByRole('link', { name: 'Review' }).click()
  await admin.getByRole('heading', { name: 'Core review' }).waitFor()
  admin.once('dialog', (d) => d.accept())
  await admin.getByRole('button', { name: 'Approve' }).click()
  await admin.getByText('Published', { exact: true }).first().waitFor()
  check('Core approved and published the project', true)

  // 5. Public site now shows it; member profile lists it
  await anon.goto('/projects')
  await anon.getByText('E2E Rover').waitFor()
  await anon.getByText('E2E Rover').click()
  await anon.getByRole('heading', { name: 'E2E Rover' }).waitFor()
  await anon.getByText('E2E Tester').waitFor()
  check('published project visible publicly with contributor', true)
  await anon.getByRole('link', { name: 'E2E Tester' }).click()
  await anon.getByText('Built in the E2E test.').waitFor()
  await anon.getByRole('link', { name: 'E2E Rover' }).waitFor()
  check('public member profile shows bio and project', true)

  // 6. Mobile viewport: nav menu works
  const phone = await (await browser.newContext({ baseURL: WEB, viewport: { width: 390, height: 800 } })).newPage()
  await phone.goto('/')
  await phone.getByRole('button', { name: 'Open menu' }).click()
  await phone.getByRole('link', { name: 'Projects' }).first().click()
  await phone.waitForURL('**/projects')
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  check('mobile: menu navigates and no horizontal overflow', !overflow)

  check('no unexpected browser console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (e) {
  if (process.env.SHOTS) for (const [i, c] of browser.contexts().entries()) for (const [j, pg] of c.pages().entries()) await pg.screenshot({ path: `${process.env.SHOTS}/fail-${i}-${j}.png` }).catch(() => {})
  check(`unexpected failure: ${e.message.split('\n')[0]}`, false)
} finally {
  await browser.close()
}
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
