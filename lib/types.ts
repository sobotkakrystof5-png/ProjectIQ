export type ProjectStatus = 'new' | 'in_progress' | 'review' | 'done' | 'paid'

export interface Project {
  id: string
  client_name: string
  description: string | null
  focus: string | null
  status: ProjectStatus
  progress: number
  price: number | null
  paid: boolean
  public_token: string
  deadline: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

export type ProjectInsert = Omit<Project, 'id' | 'public_token' | 'created_at' | 'updated_at'>
export type ProjectUpdate = Partial<ProjectInsert>

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  new: 'Nová',
  in_progress: 'V řešení',
  review: 'Čeká na schválení',
  done: 'Hotovo',
  paid: 'Zaplaceno',
}

export const STATUS_STYLES: Record<ProjectStatus, string> = {
  new: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  in_progress: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  review: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  done: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  paid: 'bg-brand-800 text-white',
}

export const STATUS_ORDER: ProjectStatus[] = ['new', 'in_progress', 'review', 'done', 'paid']

export interface ClientMessage {
  id: string
  project_id: string
  content: string
  created_at: string
}

export interface ProgressUpdate {
  id: string
  project_id: string
  progress_from: number
  progress_to: number
  description: string
  created_at: string
}
