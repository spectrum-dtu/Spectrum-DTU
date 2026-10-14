import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { ContributorList, REMOVED_MESSAGE } from '../components/cards'
import { Async, Container, EmptyState, Eyebrow, formatDate, ImagePlaceholder } from '../components/ui'
import type { Achievement, Project, SocietyEvent, TeamMember } from '../lib/types'
import { useApi } from '../lib/useApi'

const Back = ({ to, label }: { to: string; label: string }) => (
  <Link to={to} className="text-sm text-violet hover:text-violet-deep">← {label}</Link>
)

const Ext = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer"
    className="inline-flex items-center gap-1.5 text-sm font-medium text-violet hover:text-violet-deep">
    {children} <ExternalLink size={14} aria-hidden />
  </a>
)

const Meta = ({ label, children }: { label: string; children: ReactNode }) =>
  children ? (
    <div className="border-t border-line py-3"><dt className="text-xs tracking-wide text-muted uppercase">{label}</dt><dd className="mt-1 text-sm text-navy">{children}</dd></div>
  ) : null

function Detail<T>({ path, back, notFound, gone, children }: {
  path: string; back: [string, string]; notFound: string; gone?: ReactNode; children: (d: T) => ReactNode
}) {
  const r = useApi<T>(path)
  return (
    <Container className="py-12 sm:py-16">
      <Back to={back[0]} label={back[1]} />
      <div className="mt-8">
        {r.status === 'error' && r.error.status === 404
          ? <EmptyState title={notFound} />
          : r.status === 'error' && r.error.status === 410 && gone
          ? gone
          : <Async remote={r} isEmpty={() => false} empty={null}>{children}</Async>}
      </div>
    </Container>
  )
}

export function ProjectDetail() {
  const { id = '' } = useParams()
  return (
    <Detail<Project> path={`/projects/${encodeURIComponent(id)}`} back={['/projects', 'All projects']} notFound="Project not found">
      {(p) => (
        <article className="grid grid-cols-1 gap-10 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <Eyebrow>{p.domain ?? 'Project'}</Eyebrow>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-navy sm:text-4xl">{p.title}</h1>
            {p.coverUrl
              ? <img src={p.coverUrl} alt="" className="mt-8 w-full rounded-md border border-line" />
              : <ImagePlaceholder label="Project cover" className="mt-8 aspect-[16/9] w-full" />}
            {p.description && <p className="mt-8 max-w-prose leading-relaxed whitespace-pre-line text-muted">{p.description}</p>}
          </div>
          <aside>
            <dl>
              <Meta label="Technologies">{p.technologies?.join(' · ')}</Meta>
              <Meta label="Started">{formatDate(p.startDate)}</Meta>
              <Meta label="Completed">{formatDate(p.completedDate)}</Meta>
              <Meta label="Contributors">{p.contributors?.length ? <ContributorList people={p.contributors} /> : null}</Meta>
            </dl>
            <div className="mt-4 flex flex-wrap gap-5">
              {p.githubUrl && <Ext href={p.githubUrl}>GitHub</Ext>}
              {p.demoUrl && <Ext href={p.demoUrl}>Live demo</Ext>}
            </div>
          </aside>
        </article>
      )}
    </Detail>
  )
}

export function EventDetail() {
  const { id = '' } = useParams()
  return (
    <Detail<SocietyEvent> path={`/events/${encodeURIComponent(id)}`} back={['/events', 'All events']} notFound="Event not found">
      {(e) => (
        <article className="max-w-3xl">
          <Eyebrow>{formatDate(e.startsAt) || 'Event'}</Eyebrow>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-navy sm:text-4xl">{e.title}</h1>
          {e.imageUrl && <img src={e.imageUrl} alt="" className="mt-8 w-full rounded-md border border-line" />}
          <dl className="mt-8"><Meta label="Location">{e.location}</Meta><Meta label="Ends">{formatDate(e.endsAt)}</Meta></dl>
          {(e.description ?? e.summary) && <p className="mt-6 leading-relaxed whitespace-pre-line text-muted">{e.description ?? e.summary}</p>}
        </article>
      )}
    </Detail>
  )
}

export function AchievementDetail() {
  const { id = '' } = useParams()
  return (
    <Detail<Achievement> path={`/achievements/${encodeURIComponent(id)}`} back={['/achievements', 'All achievements']} notFound="Achievement not found">
      {(a) => (
        <article className="max-w-3xl">
          <Eyebrow>{[formatDate(a.date), a.event].filter(Boolean).join(' · ') || 'Achievement'}</Eyebrow>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-navy sm:text-4xl">{a.title}</h1>
          {a.position && <p className="mt-2 font-medium text-violet">{a.position}</p>}
          {a.imageUrl && <img src={a.imageUrl} alt="" className="mt-8 w-full rounded-md border border-line" />}
          {a.description && <p className="mt-6 leading-relaxed whitespace-pre-line text-muted">{a.description}</p>}
          <dl className="mt-8"><Meta label="Contributors">{a.contributors?.length ? <ContributorList people={a.contributors} /> : null}</Meta></dl>
          {a.link && <div className="mt-4"><Ext href={a.link}>Related link</Ext></div>}
        </article>
      )}
    </Detail>
  )
}

export function MemberProfile() {
  const { id = '' } = useParams()
  // The API answers 410 for removed members; only the fixed message is ever shown.
  const gone = <p role="status" className="text-lg text-navy">{REMOVED_MESSAGE}</p>
  return (
    <Detail<TeamMember> path={`/team/${encodeURIComponent(id)}`} back={['/team', 'Team']} notFound="Profile not found" gone={gone}>
      {(m) => (
        <article className="grid grid-cols-1 gap-10 md:grid-cols-[16rem_1fr]">
          {m.photoUrl
            ? <img src={m.photoUrl} alt="" className="aspect-square w-full rounded-md border border-line object-cover" />
            : <ImagePlaceholder label="Photo" className="aspect-square w-full" />}
          <div>
            <Eyebrow>{m.role === 'core' ? 'Core Team' : 'Member'}</Eyebrow>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-navy">{m.name}</h1>
            <p className="mt-1 text-muted">{[m.domain, m.branch, m.year].filter(Boolean).join(' · ')}</p>
            {m.bio && <p className="mt-6 max-w-prose leading-relaxed whitespace-pre-line text-muted">{m.bio}</p>}
            <div className="mt-6 flex flex-wrap gap-5">
              {m.github && <Ext href={m.github}>GitHub</Ext>}
              {m.linkedin && <Ext href={m.linkedin}>LinkedIn</Ext>}
              {m.instagram && <Ext href={m.instagram}>Instagram</Ext>}
              {m.otherLink && <Ext href={m.otherLink}>Website</Ext>}
            </div>
            {!!m.projects?.length && (
              <section className="mt-10"><h2 className="font-semibold text-navy">Projects</h2>
                <ul className="mt-3 space-y-1.5 text-sm">{m.projects.map((p) => <li key={p.id}><Link className="text-violet hover:text-violet-deep" to={`/projects/${p.id}`}>{p.title}</Link></li>)}</ul>
              </section>
            )}
            {!!m.achievements?.length && (
              <section className="mt-8"><h2 className="font-semibold text-navy">Achievements</h2>
                <ul className="mt-3 space-y-1.5 text-sm">{m.achievements.map((a) => <li key={a.id}><Link className="text-violet hover:text-violet-deep" to={`/achievements/${a.id}`}>{a.title}</Link></li>)}</ul>
              </section>
            )}
          </div>
        </article>
      )}
    </Detail>
  )
}
