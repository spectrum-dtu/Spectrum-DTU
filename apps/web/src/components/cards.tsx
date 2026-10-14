import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Achievement, Contributor, Project, SocietyEvent, TeamMember } from '../lib/types'
import { UserRound } from 'lucide-react'
import { Badge, formatDate, ImagePlaceholder } from './ui'

export const REMOVED_MESSAGE = 'This person is no longer a member of the team.'

// Active members link to their profile. Removed members stay clickable but only
// ever reveal the fixed message, never old profile data.
export function ContributorName({ person }: { person: Contributor }) {
  const [shown, setShown] = useState(false)
  if (!person.removed) {
    return <Link to={`/team/${person.id}`} className="text-navy underline decoration-line underline-offset-4 hover:decoration-violet">{person.name}</Link>
  }
  return (
    <span>
      <button type="button" onClick={() => setShown((s) => !s)} aria-expanded={shown}
        className="text-navy underline decoration-line underline-offset-4 hover:decoration-violet">
        {person.name}
      </button>
      {shown && <span role="status" className="mt-1 block text-xs text-muted">{REMOVED_MESSAGE}</span>}
    </span>
  )
}

export function ContributorList({ people }: { people?: Contributor[] }) {
  if (!people?.length) return null
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
      {people.map((p) => <li key={p.id}><ContributorName person={p} /></li>)}
    </ul>
  )
}

function Cover({ url, label, h = 'h-[184px]' }: { url?: string; label: string; h?: string }) {
  return url
    ? <img src={url} alt="" loading="lazy" className={`${h} w-full object-cover`} />
    : <ImagePlaceholder label={label} className={`${h} w-full`} />
}

const cardLink = 'group flex h-full flex-col overflow-hidden rounded-xl border border-line bg-white transition-shadow hover:shadow-(--shadow-float)'
const cardTitle = 'text-[22px] leading-tight font-semibold text-navy group-hover:text-violet-deep'

export function ProjectCard({ p }: { p: Project }) {
  return (
    <Link to={`/projects/${p.id}`} className={cardLink}>
      <Cover url={p.coverUrl} label="Image pending" />
      <div className="flex flex-1 flex-col gap-4 p-6">
        {p.domain && <div><Badge>{p.domain}</Badge></div>}
        <h3 className={cardTitle}>{p.title}</h3>
        {p.summary && <p className="line-clamp-3 text-sm leading-[1.65] text-muted">{p.summary}</p>}
        {!!p.technologies?.length && (
          <>
            <div className="mt-auto h-px bg-line" />
            <p className="text-[13px] text-muted">{p.technologies.join(' · ')}</p>
          </>
        )}
      </div>
    </Link>
  )
}

export function EventCard({ e }: { e: SocietyEvent }) {
  return (
    <Link to={`/events/${e.id}`} className={cardLink}>
      <Cover url={e.imageUrl} label="Image pending" h="h-[168px]" />
      <div className="flex flex-1 flex-col gap-4 p-6">
        <p className="font-mono text-xs text-muted">{formatDate(e.startsAt) || 'Date to be announced'}</p>
        <h3 className={cardTitle}>{e.title}</h3>
        {e.summary && <p className="line-clamp-3 text-sm leading-[1.65] text-muted">{e.summary}</p>}
        {e.location && (
          <>
            <div className="mt-auto h-px bg-line" />
            <p className="text-[13px] text-faint">{e.location}</p>
          </>
        )}
      </div>
    </Link>
  )
}

export function AchievementCard({ a }: { a: Achievement }) {
  return (
    <Link to={`/achievements/${a.id}`} className="group block border-t border-line py-6">
      <p className="text-xs text-muted">{[formatDate(a.date), a.event].filter(Boolean).join(' · ')}</p>
      <h3 className="mt-1.5 text-lg font-semibold text-navy group-hover:text-violet-deep">{a.title}</h3>
      {a.position && <p className="mt-1 text-sm font-medium text-violet">{a.position}</p>}
      {a.description && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">{a.description}</p>}
    </Link>
  )
}

export function MemberCard({ m }: { m: TeamMember }) {
  return (
    <Link to={`/team/${m.id}`} className={cardLink}>
      {m.photoUrl
        ? <img src={m.photoUrl} alt="" loading="lazy" className="h-[180px] w-full object-cover" />
        : <div role="img" aria-label="Photo pending" className="flex h-[180px] w-full flex-col items-center justify-center gap-3 bg-placeholder text-xs text-muted">
            <UserRound size={36} aria-hidden />Photo pending
          </div>}
      <div className="flex flex-col gap-3 p-6">
        <h3 className={cardTitle}>{m.name}</h3>
        {m.domain && <p className="text-sm text-muted">{m.domain}</p>}
        {(m.branch || m.year) && (
          <>
            <div className="h-px bg-line" />
            {m.branch && <p className="text-[13px] text-muted">{m.branch}</p>}
            {m.year && <p className="text-[13px] text-muted">{m.year}</p>}
          </>
        )}
      </div>
    </Link>
  )
}

export const Grid = ({ children, cols = 3 }: { children: React.ReactNode; cols?: 3 | 4 }) => (
  <div className={`grid gap-5 md:grid-cols-2 ${cols === 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>{children}</div>
)
