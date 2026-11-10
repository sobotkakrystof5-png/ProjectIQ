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

/** Kde běží databáze: Supabase eu-central-1 (Dotazy, ochrana údajů). */
export const DATA_LOCATION = 'Databáze běží v Evropské unii, ve Frankfurtu v Německu.'

/** Cesty do aplikace (přihlášení Supabase Auth, R-080). */
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

/** Kotvy v hlavičce (scrollspy). */
export const NAV = [
  { id: 'funkce', label: 'Funkce' },
  { id: 'jak-to-funguje', label: 'Jak to funguje' },
  { id: 'napojeni', label: 'Napojení webu' },
  { id: 'cenik', label: 'Ceník' },
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

export const STEPS = [
  { n: '01', title: 'Zákazník se objedná', text: 'Na webu, přes odkaz nebo QR kód na pultu.' },
  { n: '02', title: 'Zařadí se do kalendáře', text: 'Jako čárkovaný blok. Hned vidíte, kam padne.' },
  { n: '03', title: 'Potvrdíte jedním klikem', text: 'V aplikaci nebo přímo z e-mailu.' },
  { n: '04', title: 'Zbytek se počítá sám', text: 'Razítko, příjem do přehledu, připomínka.' },
] as const

export const MODULES = [
  { n: '01', title: 'Poptávky', text: 'z webu, e-shopu, ručně' },
  { n: '02', title: 'Kalendář a rezervace', text: 'služby, směny, blokace' },
  { n: '03', title: 'Zákazníci', text: 'historie, poznámky, skupiny' },
  { n: '04', title: 'Věrnostní karty', text: 'razítka a odměny' },
  { n: '05', title: 'Zakázky', text: 'vlastní stavy a kolonky' },
  { n: '06', title: 'Faktury', text: 'PDF a hlídání splatnosti' },
  { n: '07', title: 'Příjmy a výdaje', text: 'graf a přehled měsíce' },
  { n: '08', title: 'Daně', text: 'odhad a termíny' },
  { n: '09', title: 'E-maily zákazníkům', text: 'potvrzení, připomínky' },
] as const

export const PRICE_INCLUDES = [
  'Neomezené poptávky a zákazníci',
  'Kalendář a rezervace',
  'Věrnostní karty',
  'Faktury, příjmy, odhad daní',
  'E-maily zákazníkům',
  'Napojení na web',
  'Měsíční přehled',
  'Jeden byznys a neomezeně pracovníků',
] as const

/** Ukázkový název byznysu v sekci Napojení. Cesty podle R-016, doména R-030. */
export const CONNECT_SLUG = 'kadernictvi-lenka'

export const FAQ: readonly { q: string; a: string }[] = [
  {
    q: 'Musím umět s počítačem?',
    a: 'Ne. Když zvládnete e-mail v telefonu, zvládnete i ZakazIQ. Po registraci vyberete obor a aplikace má hned připravené služby a kolonky.',
  },
  {
    q: 'Jak napojím svůj web?',
    a: 'Třemi způsoby. Pošlete zákazníkům odkaz na objednání, vložíte na web jeden řádek kódu, nebo vám web postavím a napojím sám. Napojení si pak ověříte jedním klikem.',
  },
  {
    q: 'Co když nemám web?',
    a: 'Nevadí. Dostanete vlastní stránku pro objednání a QR kód. Odkaz dáte na Instagram, do Google profilu nebo na pult.',
  },
  {
    q: 'Kde jsou moje data a kdo je vidí?',
    a: `Vidíte je jen vy a lidé, které do účtu pozvete. Data každé firmy jsou oddělená od ostatních. ${DATA_LOCATION} Podrobnosti najdete v Ochraně údajů.`,
  },
  {
    q: 'Co se stane po 14 dnech?',
    a: 'Pokud předplatné do té doby nezrušíte, strhneme z karty 249 Kč a dál každý měsíc. Týden předem vám přijde připomínka e-mailem. Když ho zrušíte, nic nezaplatíte a k datům se dostanete dál, jen je nepůjde měnit.',
  },
  {
    q: 'Můžu předplatné kdykoli zrušit?',
    a: 'Ano, sami v nastavení účtu. Data se nemažou, zůstanou vám k nahlédnutí.',
  },
  {
    q: 'Funguje to na telefonu?',
    a: 'Ano. Aplikace je dělaná tak, aby šla ovládat jednou rukou mezi dvěma zákazníky.',
  },
  {
    q: 'Kde najdu pomoc, když se něco nedaří?',
    a: `Napište mi na ${SUPPORT_LABEL}.`,
  },
]
