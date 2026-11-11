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
  /** Fakturováno na IČO — příjem ze zakázky patří do přiznané linie (migrace 054) */
  invoiced_on_ico: boolean
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

export const STATUS_ORDER: ProjectStatus[] = ['new', 'in_progress', 'review', 'done', 'paid']

export interface ClientMessage {
  id: string
  project_id: string
  content: string
  created_at: string | Date
}

export interface ProjectNote {
  id: string
  project_id: string
  author: string
  content: string
  progress_snapshot: number | null
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
  channel_other_text: string | null
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

export type LeadActionType = 'call' | 'meeting' | 'email' | 'whatsapp' | 'online' | 'other'

export const LEAD_ACTION_TYPE_LABELS: Record<LeadActionType, string> = {
  call: 'Telefonní hovor',
  meeting: 'Osobní setkání',
  email: 'Email',
  whatsapp: 'WhatsApp',
  online: 'Online schůzka',
  other: 'Jiné',
}

export interface LeadNote {
  id: string
  lead_id: string
  content: string
  created_at: string | Date
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
  portfolio_sent_at: string | Date | null
  calendar_event_id: string | null
  created_at: string | Date
  updated_at: string | Date | null
}

export type ProjectType = 'client' | 'personal'
export type CostType = 'fixed_monthly' | 'fixed_annual' | 'one_time'

// 'client' | 'personal' | 'all' come from the business-costs UI (CostsManager,
// /dashboard/naklady); the rest come from the personal-finance UI
// (FixedCostsSection, /dashboard/finance) — both write into the same `costs` table
// (migrations/012_costs_category.sql), so this union has to cover every value
// either UI can store or category badges looking up a narrower type render undefined.
export type CostCategory = 'client' | 'personal' | 'all' | 'domény' | 'hosting' | 'software' | 'nástroje' | 'ostatní'

export const COST_TYPE_LABELS: Record<CostType, string> = {
  fixed_monthly: 'Fixní měsíční',
  fixed_annual: 'Fixní roční',
  one_time: 'Jednorázový',
}

export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  client: 'Zakázky pro klienty',
  personal: 'Osobní projekty',
  all: 'Obecné',
  domény: 'Domény',
  hosting: 'Hosting',
  software: 'Software',
  nástroje: 'Nástroje',
  ostatní: 'Ostatní',
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
  // Odhad v hodinách, jak se čekalo při zadání zakázky — volitelný, historická
  // data ho nemají (migrace 057). Slouží jen k metrice „odhad vs. realita".
  estimated_hours: number | null
  notes: string | null
  project_type: ProjectType
  survey_token: string
  client_email: string | null
  source_project_id: string | null
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
  // Vazba na zakázku (migrace 060) — null pro obecné/osobní náklady mimo
  // konkrétní zakázku. `ON DELETE SET NULL`, aby smazání zakázky nesmazalo
  // historii nákladů.
  project_id: string | null
  // Zpětný odkaz na finance_transactions, když náklad vznikl automaticky
  // z byznys výdaje (viz app/dashboard/finance/finance-actions.ts createTransaction).
  source_finance_transaction_id: string | null
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
  lead_id: string | null
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

// Barvu fáze nese `STARTUP_PHASE_TONE` v `lib/admin-status.ts`; emoji v UI nejsou (AD05).
export const STARTUP_PHASES: {
  value: StartupPhase
  label: string
}[] = [
  { value: 'idea', label: 'Nápad' },
  { value: 'research', label: 'Výzkum a ověření' },
  { value: 'mvp', label: 'Vývoj (MVP)' },
  { value: 'launch', label: 'Spuštění' },
  { value: 'growth', label: 'Růst' },
  { value: 'monetization', label: 'Monetizace' },
  { value: 'pivot', label: 'Pivotování' },
  { value: 'active', label: 'Aktivní' },
  { value: 'paused', label: 'Pozastaveno' },
  { value: 'cancelled', label: 'Ukončeno' },
]

export type ImprovementStatus = 'idea' | 'in_progress' | 'done'

export const IMPROVEMENT_STATUS_LABELS: Record<ImprovementStatus, string> = {
  idea: 'Nápad',
  in_progress: 'V řešení',
  done: 'Hotovo',
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

export type MonetizationModel = 'saas' | 'onetime'

export interface PricingTier {
  id: string
  name: string
  monthlyPrice: number
  annualPrice: number
  users: number
  benefits: string[]
}

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
  pricing_tiers: PricingTier[]
  archived: boolean
  waitlist_db_url: string | null
  created_at: string | Date
  updated_at: string | Date | null
}

export interface WaitlistEntry {
  id: number
  email: string
  name: string | null
  locale: string
  created_at: string
  launch_notified: boolean
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

// ─── Fakturace a daně (migrace 053–055) ───────────────────────────────────────

/**
 * Faktura z archivu. `pdf_data` (bytea) tu schválně není — binárka se
 * nikdy netahá do seznamu ani na klienta, servíruje ji chráněná routa
 * /api/invoices/[id]/pdf. Přítomnost PDF poznáš z `pdf_filename`.
 *
 * `paid_on` rozhoduje o daních: NULL = pohledávka mimo daňový základ,
 * vyplněné datum = zdanitelný příjem toho dne (hotovostní princip).
 */
export interface Invoice {
  id: string
  invoice_number: string
  project_id: string | null
  client_name: string | null
  client_ico: string | null
  client_dic: string | null
  issued_on: string
  due_on: string | null
  paid_on: string | null
  amount: number
  currency: string
  note: string | null
  pdf_filename: string | null
  pdf_size: number | null
  /** Surový výstup AI přepisu PDF — pro dohledatelnost, ne pro výpočty */
  ai_extracted: InvoiceAiExtract | null
  /** Transakce, kterou faktura založila v ledgeru. Pojistka proti dvojímu započtení příjmu. */
  finance_transaction_id: string | null
  created_at: string | Date
  updated_at: string | Date | null
}

/** Co z PDF vytáhla AI. Všechno volitelné — model se může splést nebo pole nenajít. */
export interface InvoiceAiExtract {
  invoice_number?: string | null
  issued_on?: string | null
  due_on?: string | null
  amount?: number | null
  currency?: string | null
  client_name?: string | null
  client_ico?: string | null
  client_dic?: string | null
}

export type InvoiceInsert = Omit<
  Invoice,
  'id' | 'created_at' | 'updated_at' | 'finance_transaction_id'
>
export type InvoiceUpdate = Partial<InvoiceInsert>

export type TaxNewsSource = 'financni_sprava' | 'cssz'

export const TAX_NEWS_SOURCE_LABELS: Record<TaxNewsSource, string> = {
  financni_sprava: 'Finanční správa',
  cssz: 'ČSSZ',
}

/** Novinka z oficiálního RSS. Zdroj a datum se v UI zobrazují vždy — je to informace, ne daňové poradenství. */
export interface TaxNews {
  id: string
  source: TaxNewsSource
  /** Identifikátor položky z RSS — nese idempotenci opakovaného běhu cronu */
  guid: string
  title: string
  link: string
  published_at: string | Date | null
  summary: string | null
  read: boolean
  created_at: string | Date
}
