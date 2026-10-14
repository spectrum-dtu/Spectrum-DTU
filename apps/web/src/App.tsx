import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { RequireAuth } from './lib/auth'
import Apply from './pages/Apply'
import { ForgotPassword, Login, Register, ResetPassword } from './pages/Auth'
import Dashboard from './pages/Dashboard'
import { AchievementDetail, EventDetail, MemberProfile, ProjectDetail } from './pages/Details'
import Home from './pages/Home'
import { Achievements, Events, Projects, Team } from './pages/Lists'
import { About, Contact, Learning, NotFound } from './pages/Static'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="about" element={<About />} />
        <Route path="team" element={<Team />} />
        <Route path="team/:id" element={<MemberProfile />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="events" element={<Events />} />
        <Route path="events/:id" element={<EventDetail />} />
        <Route path="achievements" element={<Achievements />} />
        <Route path="achievements/:id" element={<AchievementDetail />} />
        <Route path="learning" element={<Learning />} />
        <Route path="contact" element={<Contact />} />
        <Route path="register" element={<Register />} />
        <Route path="apply" element={<RequireAuth active={false}><Apply /></RequireAuth>} />
        <Route path="login" element={<Login />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="dashboard/*" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
