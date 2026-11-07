// Obsah landing page na jednom místě (docs/landing/PROJECT-BRIEF.md § 4).
// Nevymýšlet údaje (AGENTS.md → B10). Fakta o ceně a zkušební době: R-018, R-026,
// R-038. Provozovatel a zpracovatelé pro právní texty: legal.ts (R-079).

/** E-mail podpory pro „Napište nám". Potvrdil Kryštof 2026-10-31. */
export const SUPPORT_EMAIL = 'info@vizeon.cz'
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`
export const SUPPORT_LABEL = SUPPORT_EMAIL
export const SUPPORT_FORM_HREF = '/#kontakt'

/** IČO provozovatele (ARES, potvrdil Kryštof 2026-10-31). */
export const COMPANY_ID = '29977231'

/** Kde běží databáze: Neon eu-central-1 (Dotazy, ochrana údajů). */
export const DATA_LOCATION = 'Databáze běží v Evropské unii, ve Frankfurtu v Německu.'

/** Cesty do aplikace — přesné cesty Clerku potvrdí S07. */
export const ROUTES = {
  signUp: '/w/registrace',
  signIn: '/w/prihlaseni',
  admin: '/login',
  adminHome: '/hub',
  terms: '/podminky',
  privacy: '/ochrana-udaju',
  dpa: '/zpracovatelska-smlouva',
} as const

export const PRICE_LABEL = '249 Kč'
export const CTA_LABEL = 'Vyzkoušet 14 dní zdarma'

/** Kotvy v hlavičce (scrollspy): čtyři bloky stránky v pořadí (R-081). */
export const NAV = [
  { id: 'chaos', label: 'Čísla' },
  { id: 'funkce', label: 'Funkce' },
  { id: 'cenik', label: 'Ceník' },
  { id: 'kontakt', label: 'Kontakt' },
] as const

export const OBORY = [
  'Kadeřnictví',
  'Kosmetika',
  'Zámečnictví',
  'Studnařství',
  'Likvidace azbestu',
  'Autoservis',
  'Úklid',
  'Stavba a řemesla',
] as const

// --- Živá ukázka v hero ---------------------------------------------------
// Vymyšlená jména, na stránce jasně označená jako ukázka. Den 0 = po 5. 10., řádek = index v DEMO_TIMES.

export const DEMO_DAYS = ['PO 5', 'ÚT 6', 'ST 7', 'ČT 8', 'PÁ 9'] as const
export const DEMO_TIMES = ['9:00', '10:30', '13:00', '16:00'] as const

/** Obsazené termíny v týdnu (den × řádek). Prázdný řetězec = volno. */
export const DEMO_BOOKED: readonly (readonly string[])[] = [
  ['Nová', '', 'Hájek', ''],
  ['Zelená', '', 'Šťastná', 'Musil'],
  ['', 'Králová', '', 'Pokorný'],
  ['Králová', 'Benešová', '', ''],
  ['', 'Černá', 'Vlková', ''],
]

export interface DemoRequest {
  name: string
  service: string
  when: string
  source: string
  day: number
  row: number
}

/** Poptávky v cyklu. Každá míří na volné místo v DEMO_BOOKED. */
export const DEMO_REQUESTS: readonly DemoRequest[] = [
  { name: 'Tereza Malá', service: 'Barvení + střih', when: 'pá 9:00', source: 'web', day: 4, row: 0 },
  { name: 'Marek Dušek', service: 'Pánský střih', when: 'čt 16:00', source: 'e-shop', day: 3, row: 3 },
  { name: 'Jana Horáková', service: 'Dámský střih', when: 'út 10:30', source: 'web', day: 1, row: 1 },
  { name: 'Eva Krausová', service: 'Melír', when: 'po 10:30', source: 'QR kód', day: 0, row: 1 },
  { name: 'Petr Novák', service: 'Výměna zámku', when: 'st 9:00', source: 'web', day: 2, row: 0 },
  { name: 'SVJ Lípa', service: 'Prohlídka střechy', when: 'pá 16:00', source: 'web', day: 4, row: 3 },
]

// --- Sekce -----------------------------------------------------------------

export const PRICE_INCLUDES = [
  'Neomezené poptávky a zákazníci',
  'Kalendář a rezervace',
  'Věrnostní karty',
  'Zakázky s vlastními stavy a kolonkami',
  'Faktury, příjmy, odhad daní',
  'E-maily zákazníkům',
  'Napojení na web',
  'Měsíční přehled',
  'Jeden byznys a neomezeně pracovníků',
] as const

/** Ukázkový název byznysu v ukázce napojení (blok Představení). Cesty podle R-016, doména R-030. */
export const CONNECT_SLUG = 'kadernictvi-lenka'

/**
 * Dotazy vedle formuláře v bloku Poptávka (R-081). Jen to, co stránka jinde neříká:
 * napojení webu je v Představení, telefon i počítač v úvodu, kontakt je formulář hned vedle.
 */
export const FAQ: readonly { q: string; a: string }[] = [
  {
    q: 'Musím umět s počítačem?',
    a: 'Ne. Když zvládnete e-mail v telefonu, zvládnete i ZakazIQ. Po registraci vyberete obor a aplikace má hned připravené služby a kolonky.',
  },
  {
    q: 'Co se stane po 14 dnech?',
    a: 'Pokud předplatné do té doby nezrušíte, strhneme z karty 249 Kč a dál každý měsíc. Týden předem vám přijde připomínka e-mailem. Když ho během zkušební doby zrušíte, nic nezaplatíte. Zrušit ho můžete kdykoli sami v nastavení účtu a data se nemažou, zůstanou vám k nahlédnutí.',
  },
  {
    q: 'Kde jsou moje data a kdo je vidí?',
    a: `Vidíte je jen vy a lidé, které do účtu pozvete. Data každé firmy jsou oddělená od ostatních. ${DATA_LOCATION} Podrobnosti najdete v Ochraně údajů.`,
  },
]

// --- Kolik vás stojí chaos (R-080) ----------------------------------------
// Jen zveřejněná čísla s pojmenovaným zdrojem a odkazem. Bez zdroje se číslo nesmí použít.
// Hodnoty jsou celá čísla, formát (minuty → „6 h 20 min“) řeší komponenta.

export type ChaosUnit = 'minutes' | 'hours' | 'percent' | 'days'

export interface ChaosStat {
  id: string
  /** Cílová hodnota v jednotce `unit` (minuty, hodiny, procenta, dny). */
  target: number
  unit: ChaosUnit
  /** Co číslo znamená, jedna věta bez tečky na začátku. */
  label: string
  source: { name: string; href: string }
}

export const CHAOS_STATS: readonly ChaosStat[] = [
  {
    id: 'admin-tydne',
    target: 380,
    unit: 'minutes',
    label: 'týdně ztratí živnostník papírováním a administrativou',
    source: {
      name: 'Raiffeisenbank a Mastercard',
      href: 'https://cc.cz/podnikatele-administrativou-ztrati-az-petinu-tydne-raiffeisenbank-reaguje-specialnim-uctem/',
    },
  },
  {
    id: 'admin-rocne',
    target: 204,
    unit: 'hours',
    label: 'ročně stráví freelancer administrativou. I s umělou inteligencí.',
    source: { name: 'Smallpdf, 2026', href: 'https://contentgrip.com/freelancer-admin-ai-gap' },
  },
  {
    id: 'neplati-vcas',
    target: 40,
    unit: 'percent',
    label: 'zákazníků neplatí faktury včas',
    source: {
      name: 'Hospodářská komora ČR',
      href: 'https://www.businessinfo.cz/clanky/hospodarska-komora-pres-40-procent-zakazniku-neplati-faktury-vcas/',
    },
  },
  {
    id: 'po-splatnosti',
    target: 21,
    unit: 'days',
    label: 'po splatnosti čekají české firmy na své peníze',
    source: {
      name: 'EOS Payment Practices, 2025',
      href: 'https://www.businessinfo.cz/clanky/evropskym-spolecnostem-hradi-pozde-nebo-vubec-ctvrtina-firem-se-spatnou-platebni-moralkou-se-potykaji-i-ceske-firmy/',
    },
  },
  {
    id: 'nezaplaceno',
    target: 45,
    unit: 'percent',
    label: 'firem zažilo za půl roku fakturu, kterou nikdo nezaplatil',
    source: {
      name: 'Atradius',
      href: 'https://www.e15.cz/finexpert/vydelavame/pruzkum-temer-kazda-firma-v-cesku-ma-nyni-zkusenost-s-opozdenymi-platbami-1391710',
    },
  },
] as const
