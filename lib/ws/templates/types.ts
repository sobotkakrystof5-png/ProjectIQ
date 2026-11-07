// Šablona oboru: s čím byznys začne po registraci („začátek do 3 minut“, B9).
// Všechno je jen výchozí nastavení, byznys si ho v Nastavení změní.
//
// Hodnoty výčtů musí sedět na CHECK omezení v migracích 064–070 — hlídá to
// test lib/ws/__tests__/ws-templates.test.ts (vloží každou šablonu do DB).

export const WS_MODULES = [
  'requests',
  'customers',
  'calendar',
  'jobs',
  'loyalty',
  'invoices',
  'finance',
  'taxes',
  'portal',
  'reviews',
  'reminders',
] as const
export type WsModule = (typeof WS_MODULES)[number]

/** Poptávky a Zákazníci jdou vypnout jen v šabloně — v aplikaci jsou vždy zapnuté. */
export const ALWAYS_ON_MODULES: readonly WsModule[] = ['requests', 'customers']

export type FieldType = 'text' | 'choice' | 'select' | 'number' | 'date' | 'slot' | 'contact' | 'address' | 'file'
export type StageType = 'new' | 'in_progress' | 'done' | 'paid' | 'cancelled'

export type IndustryKey =
  | 'kadernictvi-kosmetika'
  | 'kavarna-restaurace'
  | 'fitness-lekce'
  | 'ucetni-poradci'
  | 'ordinace-pece'
  | 'zamecnictvi'
  | 'studnarstvi'
  | 'azbest'
  | 'autoservis'
  | 'uklid'
  | 'stavba'
  | 'vlastni'

export type TemplateService = {
  name: string
  durationMin: number
  /** Cenu si zadá byznys sám, šablona žádnou nevymýšlí (B10). */
  price: null
}

export type TemplateField = {
  key: string
  label: string
  type: FieldType
  required: boolean
  options?: string[]
  showOnWeb: boolean
}

export type TemplateStage = { name: string; type: StageType }

export type TemplateSegments = {
  newDays: number
  regularMinVisits: number
  regularWindowDays: number
  dormantFactor: number
  dormantMinDays: number
}

export type TemplateLoyalty = {
  stampsNeeded: number
  counts: 'visit_paid' | 'job_done' | 'amount'
}

export type IndustryTemplate = {
  key: IndustryKey
  /** Název oboru v průvodci Nový byznys. */
  label: string
  /** Jedna až dvě věty pro náhled v průvodci — jen tam, kde šablona sama nenapoví, jak s ní pracovat. */
  note?: string
  /** Zapnuté funkce navíc k Poptávkám a Zákazníkům. */
  modules: WsModule[]
  services: TemplateService[]
  fields: TemplateField[]
  stages: TemplateStage[]
  segments: TemplateSegments
  /** Věrnost je po registraci vypnutá, šablona jen předvyplní nastavení. */
  loyalty: TemplateLoyalty
}
