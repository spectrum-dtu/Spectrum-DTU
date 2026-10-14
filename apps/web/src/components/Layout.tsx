import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Bell, Menu, X } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Container } from './ui'

// Swap /brand/logo-placeholder.svg for the real artwork (keep aspect ratio) when supplied.
const LOGO_SRC = '/brand/logo-placeholder.svg'

export function Logo({ className = 'h-8' }: { className?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <img src={LOGO_SRC} alt="" className={`${className} w-auto`} />
      <span className="text-sm font-semibold tracking-[0.14em] text-navy uppercase">Spectrum <span className="text-violet">DTU</span></span>
    </span>
  )
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
      className="relative inline-flex size-10 items-center justify-center rounded-md text-muted hover:text-navy">
      <Bell size={18} aria-hidden />
      {unread > 0 && <span className="absolute top-1 right-1 min-w-4 rounded-full bg-violet px-1 text-center text-[10px] leading-4 text-white">{unread > 9 ? '9+' : unread}</span>}
    </Link>
  )
}

function Nav() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    setOpen(false)
  }, [pathname])
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `rounded px-3 py-2 text-sm transition-colors ${isActive ? 'text-navy font-medium' : 'text-muted hover:text-navy'}`

  return (
    <header className={`sticky top-0 z-40 border-b backdrop-blur transition-colors ${scrolled ? 'border-line bg-paper/90' : 'border-transparent bg-paper/60'}`}>
      <Container className="flex h-16 items-center justify-between">
        <Link to="/" aria-label="Spectrum DTU home"><Logo /></Link>
        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {links.map((l) => <NavLink key={l.to} to={l.to} end={l.end} className={linkCls}>{l.label}</NavLink>)}
          <NotificationBell />
          <Link to={user ? (user.status === 'ACTIVE' ? '/dashboard' : '/apply') : '/login'}
            className="ml-3 inline-flex min-h-10 items-center rounded-md border border-navy/25 px-4 text-sm font-medium text-navy hover:border-navy">
            {user ? 'Dashboard' : 'Login'}
          </Link>
        </nav>
        <button type="button" className="inline-flex size-11 items-center justify-center rounded-md lg:hidden"
          aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((o) => !o)}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </Container>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-line bg-paper lg:hidden">
          <Container className="flex flex-col py-3">
            {links.map((l) => <NavLink key={l.to} to={l.to} end={l.end} className={(s) => `${linkCls(s)} py-3`}>{l.label}</NavLink>)}
            <Link to={user ? '/dashboard' : '/login'} className="py-3 pl-3 text-sm font-medium text-violet">
              {user ? 'Dashboard' : 'Login'}
            </Link>
          </Container>
        </nav>
      )}
    </header>
  )
}

function Footer() {
  return (
    <footer className="border-t border-line bg-white">
      <Container className="grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
            A multidisciplinary technology society at Delhi Technological University, working across telecommunications and emerging engineering.
          </p>
        </div>
        <nav aria-label="Footer">
          <p className="text-xs font-medium tracking-[0.18em] text-navy uppercase">Explore</p>
          <ul className="mt-4 space-y-2 text-sm">
            {links.slice(1).map((l) => <li key={l.to}><Link className="text-muted hover:text-navy" to={l.to}>{l.label}</Link></li>)}
          </ul>
        </nav>
        <div>
          <p className="text-xs font-medium tracking-[0.18em] text-navy uppercase">Society</p>
          <ul className="mt-4 space-y-2 text-sm">
            <li><Link className="text-muted hover:text-navy" to="/register">Join Spectrum</Link></li>
            <li><Link className="text-muted hover:text-navy" to="/learning">Learning materials</Link></li>
            <li><Link className="text-muted hover:text-navy" to="/contact">Get in touch</Link></li>
          </ul>
        </div>
      </Container>
      <div className="border-t border-line">
        <Container className="py-5 text-xs text-muted">
          © {new Date().getFullYear()} Spectrum DTU · Delhi Technological University
        </Container>
      </div>
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
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-navy focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <Nav />
      <main id="main" tabIndex={-1} className="min-h-[70vh] outline-none"><Outlet /></main>
      <Footer />
    </>
  )
}
