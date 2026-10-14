import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { AchievementCard, EventCard, Grid, MemberCard, ProjectCard } from '../components/cards'
import HeroVisual from '../components/HeroVisual'
import { Async, Container, EmptyState, Eyebrow, ImagePlaceholder, LinkButton, Reveal, Section } from '../components/ui'
import type { Achievement, Project, SocietyEvent, TeamResponse } from '../lib/types'
import { useApi } from '../lib/useApi'
import { domains, equipment } from './content'

const seeAll = (to: string, label: string) => (
  <Link to={to} className="inline-flex items-center gap-1.5 text-sm font-medium text-violet hover:text-violet-deep">
    {label} <ArrowRight size={16} aria-hidden />
  </Link>
)

export default function Home() {
  const projects = useApi<Project[]>('/projects?featured=true&limit=3')
  const events = useApi<SocietyEvent[]>('/events?limit=3')
  const achievements = useApi<Achievement[]>('/achievements?limit=4')
  const team = useApi<TeamResponse>('/team?preview=true')

  return (
    <>
      <section className="relative overflow-hidden">
        <Container className="grid grid-cols-1 items-center gap-10 py-16 sm:py-24 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="min-w-0">
            <Eyebrow>Delhi Technological University</Eyebrow>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-navy sm:text-5xl lg:text-[3.4rem] lg:leading-[1.08]">
              Engineering the Connected Future.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              A multidisciplinary technology society at DTU exploring telecommunications, intelligent systems, and real-world
              engineering through research, experimentation, and innovation.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <LinkButton to="/projects">Explore projects</LinkButton>
              <LinkButton to="/about" variant="secondary">About the society</LinkButton>
            </div>
          </div>
          <div className="mx-auto w-full max-w-md lg:max-w-none"><HeroVisual /></div>
        </Container>
      </section>

      <Section id="about" eyebrow="About" tint
        title="Where telecommunications meets everything else"
        intro="Spectrum is built around hands-on experimentation. Connectivity is the common thread; the work spans hardware, software, and the systems that join them.">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <Reveal>
            <ul className="divide-y divide-line border-y border-line">
              {domains.map((d) => (
                <li key={d.title} className="py-4">
                  <p className="font-medium text-navy">{d.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{d.text}</p>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal><ImagePlaceholder label="Laboratory photograph" className="h-full min-h-64 w-full" /></Reveal>
        </div>
        <div className="mt-8">{seeAll('/about', 'Read more about Spectrum')}</div>
      </Section>

      <Section id="infrastructure" eyebrow="Infrastructure" title="A working laboratory, not just ideas"
        intro="Projects run on physical systems. These are the kinds of equipment the society works with.">
        <Reveal>
          <dl className="grid gap-x-10 gap-y-0 sm:grid-cols-2">
            {equipment.map((e) => (
              <div key={e.name} className="border-t border-line py-5">
                <dt className="font-medium text-navy">{e.name}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-muted">{e.use}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </Section>

      <Section id="projects" eyebrow="Projects" title="Selected work" tint action={seeAll('/projects', 'All projects')}>
        <Async remote={projects} isEmpty={(d) => d.length === 0}
          empty={<EmptyState title="No projects published yet">Approved projects will appear here.</EmptyState>}>
          {(d) => <Grid>{d.map((p) => <ProjectCard key={p.id} p={p} />)}</Grid>}
        </Async>
      </Section>

      <Section id="events" eyebrow="Events" title="Upcoming and recent" action={seeAll('/events', 'All events')}>
        <Async remote={events} isEmpty={(d) => d.length === 0}
          empty={<EmptyState title="No events published">Check back soon for sessions and workshops.</EmptyState>}>
          {(d) => <div className="border-b border-line">{d.map((e) => <EventCard key={e.id} e={e} />)}</div>}
        </Async>
      </Section>

      <Section id="achievements" eyebrow="Achievements" title="Recognised outcomes" tint action={seeAll('/achievements', 'All achievements')}>
        <Async remote={achievements} isEmpty={(d) => d.length === 0}
          empty={<EmptyState title="No achievements published yet">Approved achievements will appear here.</EmptyState>}>
          {(d) => <div className="grid gap-x-10 md:grid-cols-2">{d.map((a) => <AchievementCard key={a.id} a={a} />)}</div>}
        </Async>
      </Section>

      <Section id="team" eyebrow="Team" title="The people behind Spectrum" action={seeAll('/team', 'Full team')}>
        <Async remote={team} isEmpty={(d) => d.core.length + d.members.length === 0}
          empty={<EmptyState title="Team profiles are coming soon" />}>
          {(d) => <Grid cols={4}>{[...d.core, ...d.members].slice(0, 8).map((m) => <MemberCard key={m.id} m={m} />)}</Grid>}
        </Async>
      </Section>

      <Section id="join" eyebrow="Join" title="Interested in building with us?" tint>
        <Reveal>
          <p className="max-w-2xl leading-relaxed text-muted">
            DTU students can apply to join Spectrum. Every application is reviewed by the core team, and registering
            does not guarantee membership.
          </p>
          <div className="mt-6"><LinkButton to="/register">Apply to join</LinkButton></div>
        </Reveal>
      </Section>
    </>
  )
}
