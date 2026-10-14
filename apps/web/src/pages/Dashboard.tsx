import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { Button, Container } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import ContentEditor from './dashboard/ContentEditor'
import ContentPanel from './dashboard/ContentPanel'
import { InvitationsPanel, NotificationsPanel } from './dashboard/Inbox'
import LearningPanel from './dashboard/LearningPanel'
import ManagementPanel from './dashboard/ManagementPanel'
import ProfilePanel from './dashboard/ProfilePanel'

export default function Dashboard() {
  const { user } = useAuth()
  const isCore = user?.role === 'core'
  const tabs = [
    { to: '/dashboard/profile', label: 'Profile' },
    { to: '/dashboard/projects', label: 'Projects' },
    { to: '/dashboard/achievements', label: 'Achievements' },
    { to: '/dashboard/events', label: 'Events' },
    { to: '/dashboard/learning', label: 'Learning Materials' },
    { to: '/dashboard/invitations', label: 'Invitations' },
    { to: '/dashboard/notifications', label: 'Notifications' },
    ...(isCore ? [{ to: '/dashboard/management', label: 'Approvals and Management' }] : []),
  ]

  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }) } finally { window.location.assign('/') }
  }

  return (
    <Container className="py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{isCore ? 'Core team' : 'Member'} dashboard</p>
          <h1 className="text-2xl font-semibold text-navy">{user?.name}</h1>
        </div>
        <Button variant="secondary" onClick={logout}>Log out</Button>
      </div>
      <div className="mt-10 grid grid-cols-1 gap-10 md:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto md:flex-col">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to}
              className={({ isActive }) => `rounded px-3 py-2.5 text-sm whitespace-nowrap ${isActive ? 'bg-lavender font-medium text-navy' : 'text-muted hover:text-navy'}`}>
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0">
          <Routes>
            <Route index element={<Navigate to="/dashboard/profile" replace />} />
            <Route path="profile" element={<ProfilePanel />} />
            <Route path="projects" element={<ContentPanel kind="PROJECT" />} />
            <Route path="projects/:id" element={<ContentEditor kind="PROJECT" />} />
            <Route path="achievements" element={<ContentPanel kind="ACHIEVEMENT" />} />
            <Route path="achievements/:id" element={<ContentEditor kind="ACHIEVEMENT" />} />
            <Route path="events" element={<ContentPanel kind="EVENT" />} />
            <Route path="events/:id" element={<ContentEditor kind="EVENT" />} />
            <Route path="learning" element={<LearningPanel />} />
            <Route path="invitations" element={<InvitationsPanel />} />
            <Route path="notifications" element={<NotificationsPanel />} />
            {isCore && <Route path="management" element={<ManagementPanel />} />}
            <Route path="*" element={<Navigate to="/dashboard/profile" replace />} />
          </Routes>
        </div>
      </div>
    </Container>
  )
}
