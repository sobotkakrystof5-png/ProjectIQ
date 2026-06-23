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

export type LeadStatus = 'cold' | 'warm' | 'hot' | 'converted' | 'lost' | 'waiting'

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  cold: 'Studený kontakt',
  warm: 'Slabý zájem',
  hot: 'Velký zájem',
  converted: 'Převeden na zakázku',
  lost: 'Ztracen',
  waiting: 'Čeká na odpověď',
}

export const LEAD_STATUS_STYLES: Record<LeadStatus, string> = {
  cold: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200',
  warm: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  hot: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  converted: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  lost: 'bg-red-50 text-red-600 ring-1 ring-red-200',
  waiting: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
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
  call_answered: boolean | null
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
  deposit_amount: number | null
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

// ─── Startup Projects ─────────────────────────────────────────────────────────

export type StartupPhase =
  | 'idea'
  | 'research'
  | 'mvp'
  | 'launch'
  | 'growth'
  | 'monetization'
  | 'pivot'
  | 'active'
  | 'paused'
  | 'cancelled'

export const STARTUP_PHASES: {
  value: StartupPhase
  label: string
  emoji: string
  color: string
}[] = [
  { value: 'idea', label: 'Nápad', emoji: '💡', color: 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200' },
  { value: 'research', label: 'Výzkum / Validace', emoji: '🔬', color: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200' },
  { value: 'mvp', label: 'Vývoj (MVP)', emoji: '🛠️', color: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200' },
  { value: 'launch', label: 'Spuštění', emoji: '🚀', color: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
  { value: 'growth', label: 'Růst', emoji: '📈', color: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  { value: 'monetization', label: 'Monetizace', emoji: '💰', color: 'bg-green-50 text-green-700 ring-1 ring-green-200' },
  { value: 'pivot', label: 'Pivotování', emoji: '🔄', color: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200' },
  { value: 'active', label: 'Aktivní / Stabilní', emoji: '✅', color: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200' },
  { value: 'paused', label: 'Pozastaveno', emoji: '⏸️', color: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200' },
  { value: 'cancelled', label: 'Ukončeno', emoji: '❌', color: 'bg-red-50 text-red-600 ring-1 ring-red-200' },
]

export type ImprovementStatus = 'idea' | 'in_progress' | 'done'

export const IMPROVEMENT_STATUS_LABELS: Record<ImprovementStatus, string> = {
  idea: 'Nápad',
  in_progress: 'V řešení',
  done: 'Hotovo',
}

export const IMPROVEMENT_STATUS_STYLES: Record<ImprovementStatus, string> = {
  idea: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200',
  in_progress: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  done: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
}

export type ChangeType = 'development' | 'fix' | 'content' | 'marketing' | 'pricing' | 'strategy' | 'other'

export const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  development: 'Vývoj',
  fix: 'Oprava',
  content: 'Obsah',
  marketing: 'Marketing',
  pricing: 'Cenová změna',
  strategy: 'Strategie',
  other: 'Jiné',
}

export const CHANGE_TYPE_STYLES: Record<ChangeType, string> = {
  development: 'bg-blue-50 text-blue-700',
  fix: 'bg-red-50 text-red-700',
  content: 'bg-slate-50 text-slate-600',
  marketing: 'bg-pink-50 text-pink-700',
  pricing: 'bg-green-50 text-green-700',
  strategy: 'bg-purple-50 text-purple-700',
  other: 'bg-amber-50 text-amber-700',
}

export type MonetizationModel = 'saas' | 'onetime'

export interface StartupProject {
  id: string
  name: string
  segment: string
  problem: string
  monetization: boolean
  plan: string | null
  know_how: string | null
  notes: string | null
  live_url: string | null
  phase: StartupPhase
  progress: number
  currency: string
  planned_investment: number | null
  total_users: number | null
  paying_users_pct: number | null
  monetization_model: MonetizationModel
  monthly_price: number | null
  annual_price: number | null
  annual_discount_pct: number | null
  onetime_price: number | null
  archived: boolean
  created_at: string | Date
  updated_at: string | Date | null
}

export interface StartupImprovement {
  id: string
  startup_project_id: string
  content: string
  status: ImprovementStatus
  created_at: string | Date
  updated_at: string | Date | null
}

export interface StartupChangelogEntry {
  id: string
  startup_project_id: string
  change_date: string
  change_type: ChangeType
  description: string
  progress_from: number | null
  progress_to: number | null
  created_at: string | Date
}

export const STARTUP_SEGMENTS = [
  'SaaS',
  'E-commerce',
  'B2B',
  'B2C',
  'Mobile App',
  'AI Tool',
  'Marketplace',
  'Vlastní nástroj',
  'Automatizace',
  'Jiné',
]

export const STARTUP_CURRENCIES = ['CZK', 'EUR', 'USD']

// ─── Personal Projects (sekce Projekty) ───────────────────────────────────────

export interface PersonalProject {
  id: string
  name: string
  segment: string
  problem: string
  description: string | null
  tech_stack: string | null
  github_url: string | null
  live_url: string | null
  monetization: boolean
  phase: StartupPhase
  progress: number
  currency: string
  planned_investment: number | null
  notes: string | null
  archived: boolean
  created_at: string | Date
  updated_at: string | Date | null
}

export interface PersonalProjectImprovement {
  id: string
  personal_project_id: string
  content: string
  status: ImprovementStatus
  created_at: string | Date
  updated_at: string | Date | null
}

export interface PersonalProjectChangelogEntry {
  id: string
  personal_project_id: string
  change_date: string
  change_type: ChangeType
  description: string
  progress_from: number | null
  progress_to: number | null
  created_at: string | Date
}
