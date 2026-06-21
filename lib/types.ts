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
  client_email: string | null
  client_phone: string | null
  service_type: string | null
  project_url: string | null
  source: string | null
  estimated_costs: number | null
  deposit_amount: number | null
  deposit_paid: boolean
  created_at: string | Date | null
  updated_at: string | Date | null
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
  created_at: string | Date
}

export interface ProgressUpdate {
  id: string
  project_id: string
  progress_from: number
  progress_to: number
  description: string
  created_at: string | Date
}

export interface ClientFeedback {
  id: string
  project_id: string
  nps: number
  content: string | null
  created_at: string | Date
}

export type ConsultationChannel = 'whatsapp' | 'teams' | 'meet' | 'phone' | 'other'

export const CHANNEL_LABELS: Record<ConsultationChannel, string> = {
  whatsapp: 'WhatsApp',
  teams: 'Microsoft Teams',
  meet: 'Google Meet',
  phone: 'Klasický hovor',
  other: 'Jiné',
}

export interface ConsultationSlot {
  id: string
  project_id: string
  scheduled_at: string | Date
  channel: ConsultationChannel
  client_wish: string
  meeting_link: string | null
  client_email: string | null
  created_at: string | Date
}

export type LeadStatus = 'cold' | 'warm' | 'hot' | 'converted' | 'lost'

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  cold: 'Studený kontakt',
  warm: 'Slabý zájem',
  hot: 'Velký zájem',
  converted: 'Převeden na zakázku',
  lost: 'Ztracen',
}

export const LEAD_STATUS_STYLES: Record<LeadStatus, string> = {
  cold: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200',
  warm: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  hot: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  converted: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  lost: 'bg-red-50 text-red-600 ring-1 ring-red-200',
}

export type LeadActionType = 'call' | 'meeting' | 'email' | 'whatsapp' | 'online' | 'other'

export const LEAD_ACTION_TYPE_LABELS: Record<LeadActionType, string> = {
  call: 'Telefonní hovor',
  meeting: 'Osobní setkání',
  email: 'Email',
  whatsapp: 'WhatsApp',
  online: 'Online schůzka',
  other: 'Jiné',
}

export interface ClientLead {
  id: string
  company_name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  lead_status: LeadStatus
  next_action: string | null
  next_action_date: string | null
  next_action_time: string | null
  next_action_type: LeadActionType | null
  notes: string | null
  estimated_value: number | null
  reminder_day_before_sent: boolean
  reminder_2h_before_sent: boolean
  created_at: string | Date
  updated_at: string | Date | null
}

export type ProjectType = 'client' | 'personal'
export type CostType = 'fixed_monthly' | 'fixed_annual' | 'one_time'
export type CostCategory = 'client' | 'personal' | 'all'

export const COST_TYPE_LABELS: Record<CostType, string> = {
  fixed_monthly: 'Fixní měsíční',
  fixed_annual: 'Fixní roční',
  one_time: 'Jednorázový',
}

export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  client: 'Zakázky pro klienty',
  personal: 'Osobní projekty',
  all: 'Obecné',
}

export interface CompletedProject {
  id: string
  title: string
  client_name: string | null
  company: string | null
  completed_at: string | Date
  amount: number
  difficulty: number
  time_invested: number | null
  notes: string | null
  project_type: ProjectType
  survey_token: string
  client_email: string | null
  created_at: string | Date
}

export interface ProjectSurvey {
  id: string
  completed_project_id: string
  rating_cooperation: number
  rating_speed: number
  rating_design: number
  rating_functionality: number
  rating_reliability: number
  rating_flexibility: number
  reference_text: string | null
  consent: boolean
  created_at: string | Date
}

export type SurveyRatingKey =
  | 'rating_cooperation'
  | 'rating_speed'
  | 'rating_design'
  | 'rating_functionality'
  | 'rating_reliability'
  | 'rating_flexibility'

export const SURVEY_CATEGORIES: { key: SurveyRatingKey; label: string }[] = [
  { key: 'rating_cooperation', label: 'Spolupráce' },
  { key: 'rating_speed', label: 'Rychlost' },
  { key: 'rating_design', label: 'Design' },
  { key: 'rating_functionality', label: 'Funkčnost stránky' },
  { key: 'rating_reliability', label: 'Spolehlivost' },
  { key: 'rating_flexibility', label: 'Flexibilita' },
]

export interface Cost {
  id: string
  name: string
  amount: number
  cost_type: CostType
  category: CostCategory
  description: string | null
  created_at: string | Date
}

export type CalendarEventType = 'manual' | 'block'

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  starts_at: string | Date
  ends_at: string | Date
  event_type: CalendarEventType
  project_id: string | null
  created_at: string | Date
}
