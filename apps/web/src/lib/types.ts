// Public-facing shapes. The API (Milestones 3-5) must return only published, approved data.
export interface Contributor { id: string; name: string; removed?: boolean }
export interface Project {
  id: string; title: string; summary?: string; coverUrl?: string; domain?: string
  technologies?: string[]; contributors?: Contributor[]; githubUrl?: string; demoUrl?: string
  description?: string; startDate?: string; completedDate?: string
}
export interface Achievement {
  id: string; title: string; description?: string; imageUrl?: string; date?: string
  event?: string; position?: string; link?: string; contributors?: Contributor[]
}
export interface SocietyEvent {
  id: string; title: string; summary?: string; description?: string; imageUrl?: string
  startsAt?: string; endsAt?: string; location?: string
}
export interface TeamMember {
  id: string; name: string; photoUrl?: string; domain?: string; branch?: string; year?: string
  bio?: string; github?: string; linkedin?: string; instagram?: string; otherLink?: string
  role: 'member' | 'core'
  projects?: Pick<Project, 'id' | 'title'>[]
  achievements?: Pick<Achievement, 'id' | 'title'>[]
}
export interface TeamResponse { core: TeamMember[]; members: TeamMember[] }
export type AccountStatus = 'UNVERIFIED' | 'VERIFIED' | 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'REMOVED'
export interface SessionUser {
  id: string; personId: string; name: string; email: string
  role: 'member' | 'core'; isAdmin: boolean; status: AccountStatus
}
