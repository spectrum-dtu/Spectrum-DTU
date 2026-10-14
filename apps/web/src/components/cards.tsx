import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Achievement, Contributor, Project, SocietyEvent, TeamMember } from '../lib/types'
import { formatDate, ImagePlaceholder } from './ui'

export const REMOVED_MESSAGE = 'This person is no longer a member of the society team.'

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

function Cover({ url, label }: { url?: string; label: string }) {
  return url
    ? <img src={url} alt="" loading="lazy" className="aspect-[16/10] w-full rounded-md border border-line object-cover" />
    : <ImagePlaceholder label={label} className="aspect-[16/10] w-full" />
}

export function ProjectCard({ p }: { p: Project }) {
  return (
    <Link to={`/projects/${p.id}`} className="group block">
      <Cover url={p.coverUrl} label="Project cover" />
      {p.domain && <p className="mt-4 text-xs font-medium tracking-[0.14em] text-violet uppercase">{p.domain}</p>}
      <h3 className="mt-1.5 text-lg font-semibold text-navy group-hover:text-violet-deep">{p.title}</h3>
      {p.summary && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{p.summary}</p>}
      {!!p.technologies?.length && <p className="mt-3 text-xs text-muted">{p.technologies.join(' · ')}</p>}
    </Link>
  )
}

export function EventCard({ e }: { e: SocietyEvent }) {
  return (
    <Link to={`/events/${e.id}`} className="group grid gap-4 border-t border-line py-6 sm:grid-cols-[9rem_1fr]">
      <p className="text-sm font-medium text-violet">{formatDate(e.startsAt) || 'Date to be announced'}</p>
      <div>
        <h3 className="text-lg font-semibold text-navy group-hover:text-violet-deep">{e.title}</h3>
        {e.summary && <p className="mt-1.5 text-sm leading-relaxed text-muted">{e.summary}</p>}
        {e.location && <p className="mt-2 text-xs text-muted">{e.location}</p>}
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
    <Link to={`/team/${m.id}`} className="group block">
      {m.photoUrl
        ? <img src={m.photoUrl} alt="" loading="lazy" className="aspect-square w-full rounded-md border border-line object-cover" />
        : <ImagePlaceholder label="Photo" className="aspect-square w-full" />}
      <h3 className="mt-3 font-medium text-navy group-hover:text-violet-deep">{m.name}</h3>
      {m.domain && <p className="text-sm text-muted">{m.domain}</p>}
    </Link>
  )
}

export const Grid = ({ children, cols = 3 }: { children: React.ReactNode; cols?: 3 | 4 }) => (
  <div className={`grid gap-x-6 gap-y-10 sm:grid-cols-2 ${cols === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>{children}</div>
)
