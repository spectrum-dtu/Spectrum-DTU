import { Link } from 'react-router-dom'
import { ArrowUpRight, BookOpen, Bot, CircuitBoard, Cpu, Network, Radio, Scan, type LucideIcon } from 'lucide-react'
import { EventCard, Grid, MemberCard, ProjectCard } from '../components/cards'
import { Async, Badge, Container, EmptyState, Eyebrow, LinkButton, Reveal, Section } from '../components/ui'
import type { Project, SocietyEvent, TeamResponse } from '../lib/types'
import { useApi } from '../lib/useApi'

const pillars: { icon: LucideIcon; title: string; text: string; tag: string }[] = [
  { icon: BookOpen, title: 'Learn', text: 'Develop technical understanding through guided learning and experimentation.', tag: 'Understand the foundations' },
  { icon: Cpu, title: 'Build', text: 'Transform concepts into prototypes, systems, and research projects.', tag: 'Turn ideas into systems' },
  { icon: Network, title: 'Connect', text: 'Collaborate with peers, mentors, and the engineering community.', tag: 'Grow through collaboration' },
]

const fields: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Network, title: '5G & Networks', text: 'Explore connected infrastructure, network architectures and next-generation communication.' },
  { icon: Cpu, title: 'IoT & Embedded Systems', text: 'Explore sensors, microcontrollers and the software that connects physical systems.' },
  { icon: Radio, title: 'RF & Wireless Communication', text: 'Explore signals, antennas and the fundamentals of wireless transmission.' },
  { icon: Bot, title: 'Robotics & Drones', text: 'Explore sensing, control and the interaction between hardware and autonomous systems.' },
  { icon: CircuitBoard, title: 'FPGA & Hardware Design', text: 'Explore digital logic, programmable hardware and system-level design.' },
  { icon: Scan, title: 'Emerging Technologies', text: 'Explore evolving tools and ideas at the intersection of engineering and research.' },
]

const directory = (to: string, label: string) => (
  <Link to={to} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-violet hover:text-violet-deep">
    {label} <ArrowUpRight size={18} aria-hidden />
  </Link>
)

export default function Home() {
  const projects = useApi<Project[]>('/projects?featured=true&limit=3')
  const events = useApi<SocietyEvent[]>('/events?limit=4')
  const team = useApi<TeamResponse>('/team?preview=true')

  return (
    <>
      <section className="overflow-hidden">
        <Container className="flex flex-col gap-10 pt-10 pb-12 md:gap-14 md:pt-14 md:pb-16">
          <div className="grid items-center gap-10 xl:grid-cols-[564px_1fr] xl:gap-16">
            <div className="flex min-w-0 flex-col items-start gap-7">
              <Eyebrow>Spectrum DTU / Engineering &amp; Research</Eyebrow>
              <h1 className="text-5xl leading-[1.06] font-semibold text-navy md:text-6xl xl:text-[72px]">
                Building what connects <span className="text-violet">tomorrow.</span>
              </h1>
              <p className="leading-[1.65] text-muted">
                A student community at Delhi Technological University exploring telecommunications, 5G, embedded systems and
                emerging technologies through research, experimentation and collaborative learning.
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <LinkButton to="/about">Discover Spectrum <ArrowUpRight size={16} aria-hidden /></LinkButton>
                <LinkButton to="/register" variant="secondary">Join Spectrum</LinkButton>
              </div>
            </div>
            <figure className="flex min-w-0 flex-col gap-3.5">
              <img src="/brand/hero-hardware.jpg" alt="" width={1200} height={896}
                className="h-[280px] w-full rounded-2xl object-cover sm:h-[360px] xl:h-[490px]" />
              <figcaption className="text-[11px] leading-normal text-muted">
                Conceptual hardware illustration. 
              </figcaption>
            </figure>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-t border-line pt-6">
            <p className="text-xs text-muted">A space for engineering curiosity</p>
            <p className="font-mono text-[11px] leading-[1.6] text-violet uppercase">Telecommunications / Embedded / Emerging tech</p>
          </div>
        </Container>
      </section>

      <section id="about" className="border-t border-line bg-white py-16 md:py-20">
        <Container>
          <Reveal className="grid gap-8 lg:grid-cols-[450px_1fr] lg:gap-20">
            <div className="flex flex-col gap-3.5">
              <Eyebrow>01 / About Spectrum</Eyebrow>
              <h2 className="text-[32px] leading-[1.1] font-semibold text-navy lg:text-[40px]">Curiosity, made collective.</h2>
            </div>
            <div className="flex flex-col gap-6">
              <p className="text-[22px] leading-[1.4] font-medium text-navy lg:text-[26px]">
                Spectrum DTU is an engineering and research team at Delhi Technological University.
              </p>
              <p className="leading-[1.65] text-muted">
                We bring students together to explore telecommunications, 5G, embedded systems and emerging technology. It is a
                space to ask better questions, experiment with ideas and develop the skills to build what comes next.
              </p>
              <p className="leading-[1.65] text-muted">
                Through peer collaboration and hands-on learning, students can connect technical understanding with practical
                exploration — from circuits and networks to prototypes and research.
              </p>
              <div>{directory('/about', 'More about Spectrum')}</div>
            </div>
          </Reveal>
        </Container>
      </section>

      <Section id="approach" eyebrow="02 / Our approach" title="Learn. Build. Connect."
        intro="A shared approach to exploring engineering, from the first question to the next iteration.">
        <Reveal className="grid gap-5 md:grid-cols-3">
          {pillars.map(({ icon: Icon, title, text, tag }) => (
            <div key={title} className="flex flex-col gap-6 rounded-xl border border-line bg-white p-7">
              <span className="flex size-11 items-center justify-center rounded-lg bg-lavender text-violet"><Icon size={24} aria-hidden /></span>
              <div className="flex flex-col gap-3.5">
                <h3 className="text-[28px] font-semibold text-navy">{title}</h3>
                <p className="leading-[1.65] text-muted">{text}</p>
              </div>
              <p className="font-mono text-[10px] leading-normal text-violet uppercase">{tag}</p>
            </div>
          ))}
        </Reveal>
      </Section>

      <Section id="domains" eyebrow="03 / Technical domains" title="Find your field of exploration." tint
        intro="Six areas to explore. These categories describe technical interests, not active projects or verified team capabilities.">
        <Reveal className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {fields.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex flex-col gap-5 rounded-xl border border-line bg-white p-7">
              <Icon size={26} className="text-violet" aria-hidden />
              <h3 className="text-[21px] leading-tight font-semibold text-navy">{title}</h3>
              <p className="text-sm leading-[1.65] text-muted">{text}</p>
              <p className="font-mono text-[10px] text-muted uppercase">Area to explore</p>
            </div>
          ))}
        </Reveal>
      </Section>

      <Section id="projects" eyebrow="04 / Featured projects" title="A place for ideas to take shape." action={directory('/projects', 'Project collection')}>
        <Async remote={projects} isEmpty={(d) => d.length === 0}
          empty={<EmptyState title="No projects published yet">Approved projects will appear here.</EmptyState>}>
          {(d) => <Grid>{d.map((p) => <ProjectCard key={p.id} p={p} />)}</Grid>}
        </Async>
      </Section>

      <Section id="team" eyebrow="05 / Our people" title="Engineering is a team effort." tint action={directory('/team', 'Team directory')}
        intro="Core Team and General Members working together across domains.">
        <Async remote={team} isEmpty={(d) => d.core.length + d.members.length === 0}
          empty={<EmptyState title="Team profiles are coming soon" />}>
          {(d) => (
            <div className="flex flex-col gap-10">
              {([['Core Team', d.core], ['General Members', d.members]] as const).filter(([, list]) => list.length > 0).map(([label, list]) => (
                <div key={label} className="flex flex-col gap-5">
                  <div className="flex items-center justify-between border-b border-line pb-4">
                    <h3 className="text-[22px] font-semibold text-navy">{label}</h3>
                    <Badge>{list.length} {list.length === 1 ? 'profile' : 'profiles'}</Badge>
                  </div>
                  <Grid cols={4}>{list.slice(0, 4).map((m) => <MemberCard key={m.id} m={m} />)}</Grid>
                </div>
              ))}
            </div>
          )}
        </Async>
      </Section>

      <Section id="events" eyebrow="06 / Events & exchange" title="Make room for the next idea." action={directory('/events', 'Event collection')}>
        <Async remote={events} isEmpty={(d) => d.length === 0}
          empty={<EmptyState title="No events published">Check back soon for sessions and workshops.</EmptyState>}>
          {(d) => <Grid>{d.slice(0, 3).map((e) => <EventCard key={e.id} e={e} />)}</Grid>}
        </Async>
      </Section>

      <section className="border-t border-line bg-white py-14 md:py-[72px]">
        <Container className="flex flex-wrap items-center justify-between gap-6">
          <h2 className="max-w-3xl text-[32px] leading-[1.15] font-semibold text-navy lg:text-[44px]">Your curiosity belongs here.</h2>
          <LinkButton to="/register">Join Spectrum <ArrowUpRight size={16} aria-hidden /></LinkButton>
        </Container>
      </section>
    </>
  )
}
