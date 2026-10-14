import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ArrowUpRight, Bell, Menu, X } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Container, LinkButton } from './ui'

const LOGO_SRC = '/brand/spectrum-dtu-logo.png'

export function Logo({ className = 'h-[60px] w-[80px]' }: { className?: string }) {
  return <img src={LOGO_SRC} alt="Spectrum DTU" className={`${className} object-contain`} />
}

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/about', label: 'About' },
  { to: '/team', label: 'Team' },
  { to: '/projects', label: 'Projects' },
  { to: '/events', label: 'Events' },
  { to: '/achievements', label: 'Achievements' },
  { to: '/contact', label: 'Contact' },
]

function NotificationBell() {
  const { user } = useAuth()
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    if (!user || user.status !== 'ACTIVE') return
    let stop = false
    const load = () => api<{ unread: number }>('/notifications').then((r) => { if (!stop) setUnread(r.unread) }).catch(() => undefined)
    void load()
    const t = setInterval(load, 60_000)
    return () => { stop = true; clearInterval(t) }
  }, [user])
  if (!user || user.status !== 'ACTIVE') return null
  return (
    <Link to="/dashboard/notifications" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      className="relative inline-flex size-11 items-center justify-center rounded-full text-muted hover:text-violet">
      <Bell size={18} aria-hidden />
      {unread > 0 && <span className="absolute top-1 right-1 min-w-4 rounded-full bg-violet px-1 text-center text-[10px] leading-4 text-white">{unread > 9 ? '9+' : unread}</span>}
    </Link>
  )
}

function Nav() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const menuRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const account = user
    ? { to: user.status === 'ACTIVE' ? '/dashboard' : '/apply', label: 'Dashboard' }
    : { to: '/login', label: 'Login' }

  useEffect(() => {
    setOpen(false)
  }, [pathname])
  // Menu overlay: lock scroll, move focus in, contain Tab, close on Escape, return focus to the opener.
  useEffect(() => {
    if (!open) return
    const opener = openerRef.current
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); return }
      if (e.key !== 'Tab' || !menuRef.current) return
      const items = menuRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      opener?.focus()
    }
  }, [open])

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap rounded-lg px-1 py-2.5 text-[13px] transition-colors duration-150 ${isActive ? 'font-semibold text-violet' : 'font-medium text-muted hover:text-violet'}`

  return (
    <header className="sticky top-0 z-40 px-6 pt-6 pb-4 md:px-10 lg:px-20">
      <div className="mx-auto flex h-20 max-w-[1280px] items-center justify-between rounded-full border border-line bg-white pr-4 pl-5 shadow-(--shadow-float) lg:px-5">
        <Link to="/" aria-label="Spectrum DTU home" className="shrink-0 rounded-lg"><Logo /></Link>
        <nav aria-label="Primary" className="hidden items-center gap-5 lg:flex xl:gap-[26px]">
          {links.map((l) => <NavLink key={l.to} to={l.to} end={l.end} className={linkCls}>{l.label}</NavLink>)}
        </nav>
        <div className="hidden items-center gap-6 lg:flex">
          <NotificationBell />
          <Link to={account.to} className="rounded-lg text-[13px] font-semibold text-navy hover:text-violet">{account.label}</Link>
          {!user && <LinkButton to="/register" pill>Join Spectrum</LinkButton>}
        </div>
        <button ref={openerRef} type="button" className="inline-flex size-11 items-center justify-center rounded-full bg-lavender text-navy lg:hidden"
          aria-expanded={open} aria-controls="mobile-nav" aria-label="Open menu"
          onClick={() => setOpen(true)}>
          <Menu size={20} aria-hidden />
        </button>
      </div>
      {open && (
        <div ref={menuRef} id="mobile-nav" role="dialog" aria-modal="true" aria-label="Site menu"
          className="fixed inset-0 z-50 overflow-y-auto bg-paper px-6 pt-6 pb-10 md:px-10 lg:hidden">
          <div className="flex h-20 items-center justify-between rounded-full border border-line bg-white pr-4 pl-4">
            <Link to="/" aria-label="Spectrum DTU home" className="rounded-lg"><Logo /></Link>
            <button ref={closeRef} type="button" onClick={() => setOpen(false)}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-lavender px-3 text-[13px] font-semibold text-navy">
              Close <X size={20} aria-hidden />
            </button>
          </div>
          <p className="mt-8 font-mono text-[11px] text-violet uppercase">Public navigation / open state</p>
          <nav aria-label="Mobile" className="mt-6">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end}
                className={({ isActive }) => `flex items-center justify-between border-b border-line py-[15px] text-[28px] font-medium ${isActive ? 'text-violet' : 'text-navy'}`}>
                {l.label} <ArrowUpRight size={20} className="text-muted" aria-hidden />
              </NavLink>
            ))}
          </nav>
          <div className="mt-8 flex flex-wrap gap-3">
            {!user && <LinkButton to="/register">Join Spectrum <ArrowUpRight size={16} aria-hidden /></LinkButton>}
            <LinkButton to={account.to} variant="secondary">{account.label}</LinkButton>
          </div>
          <p className="mt-8 text-sm leading-[1.65] text-muted">Explore, experiment and build together at Delhi Technological University.</p>
        </div>
      )}
    </header>
  )
}

function FooterGroup({ title, items }: { title: string; items: { to: string; label: string }[] }) {
  return (
    <div className="w-40 sm:w-[164px]">
      <p className="text-[13px] font-semibold text-navy">{title}</p>
      <ul className="mt-4 space-y-4 text-[13px] leading-normal">
        {items.map((i) => <li key={i.to}><Link className="text-muted hover:text-violet" to={i.to}>{i.label}</Link></li>)}
      </ul>
    </div>
  )
}

function Footer() {
  return (
    <footer className="border-t border-line bg-white">
      <Container className="flex flex-col gap-10 pt-14 pb-8 md:pt-[72px]">
        <div className="grid gap-10 lg:grid-cols-[300px_1fr]">
          <div>
            <Logo className="h-[90px] w-[120px]" />
            <p className="mt-5 text-sm leading-[1.65] text-muted">
              Spectrum DTU is a telecommunications, 5G, embedded systems and emerging-technology engineering team at Delhi Technological University.
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-8">
            <FooterGroup title="Public navigation" items={[{ to: '/', label: 'Home' }, { to: '/about', label: 'About' }, { to: '/team', label: 'Team' }]} />
            <FooterGroup title="Explore" items={[{ to: '/projects', label: 'Projects' }, { to: '/events', label: 'Events' }, { to: '/achievements', label: 'Achievements' }]} />
            <FooterGroup title="Learning resources" items={[{ to: '/learning', label: 'Learning materials' }]} />
            <FooterGroup title="Team" items={[{ to: '/register', label: 'Join Spectrum' }, { to: '/contact', label: 'Contact' }]} />
          </nav>
        </div>
        <div className="h-px bg-line" />
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 leading-[1.6]">
          <p className="text-sm font-medium text-navy">Explore deeply. Build together. Connect tomorrow.</p>
          <p className="text-xs text-muted">© {new Date().getFullYear()} Spectrum DTU · Delhi Technological University</p>
        </div>
      </Container>
    </footer>
  )
}

export default function Layout() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-violet focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <Nav />
      <main id="main" tabIndex={-1} className="min-h-[70vh] outline-none"><Outlet /></main>
      <Footer />
    </>
  )
}
