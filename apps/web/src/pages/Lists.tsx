import { AchievementCard, EventCard, Grid, MemberCard, ProjectCard } from '../components/cards'
import { Async, Container, EmptyState, PageHeader } from '../components/ui'
import type { Achievement, Project, SocietyEvent, TeamResponse } from '../lib/types'
import { useApi } from '../lib/useApi'

export function Projects() {
  const r = useApi<Project[]>('/projects')
  return (
    <>
      <PageHeader eyebrow="Projects" title="What we build" intro="Published projects from society members." />
      <Container className="py-14">
        <Async remote={r} isEmpty={(d) => d.length === 0}
          empty={<EmptyState title="No projects published yet">Approved projects will appear here.</EmptyState>}>
          {(d) => <Grid>{d.map((p) => <ProjectCard key={p.id} p={p} />)}</Grid>}
        </Async>
      </Container>
    </>
  )
}

export function Events() {
  const r = useApi<SocietyEvent[]>('/events')
  return (
    <>
      <PageHeader eyebrow="Events" title="Sessions, workshops and more" />
      <Container className="py-14">
        <Async remote={r} isEmpty={(d) => d.length === 0}
          empty={<EmptyState title="No events published">Upcoming events will be listed here once approved.</EmptyState>}>
          {(d) => <div className="border-b border-line">{d.map((e) => <EventCard key={e.id} e={e} />)}</div>}
        </Async>
      </Container>
    </>
  )
}

export function Achievements() {
  const r = useApi<Achievement[]>('/achievements')
  return (
    <>
      <PageHeader eyebrow="Achievements" title="Recognised outcomes" intro="Approved achievements, competition results and research outcomes." />
      <Container className="py-14">
        <Async remote={r} isEmpty={(d) => d.length === 0}
          empty={<EmptyState title="No achievements published yet" />}>
          {(d) => <div className="grid gap-x-10 md:grid-cols-2">{d.map((a) => <AchievementCard key={a.id} a={a} />)}</div>}
        </Async>
      </Container>
    </>
  )
}

export function Team() {
  const r = useApi<TeamResponse>('/team')
  return (
    <>
      <PageHeader eyebrow="Team" title="The people behind Spectrum" />
      <Container className="space-y-16 py-14">
        <Async remote={r} isEmpty={(d) => d.core.length + d.members.length === 0}
          empty={<EmptyState title="Team profiles are coming soon" />}>
          {(d) => (
            <>
              <section aria-labelledby="core-h">
                <h2 id="core-h" className="mb-6 text-xl font-semibold text-navy">Core Team</h2>
                {d.core.length ? <Grid cols={4}>{d.core.map((m) => <MemberCard key={m.id} m={m} />)}</Grid>
                  : <EmptyState title="No core team profiles to show" />}
              </section>
              <section aria-labelledby="members-h">
                <h2 id="members-h" className="mb-6 text-xl font-semibold text-navy">Members</h2>
                {d.members.length ? <Grid cols={4}>{d.members.map((m) => <MemberCard key={m.id} m={m} />)}</Grid>
                  : <EmptyState title="No member profiles to show" />}
              </section>
            </>
          )}
        </Async>
      </Container>
    </>
  )
}
