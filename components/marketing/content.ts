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

/** Kotvy v hlavičce (scrollspy). */
export const NAV = [
  { id: 'pro-koho', label: 'Pro koho' },
  { id: 'funkce', label: 'Funkce' },
  { id: 'jak-to-funguje', label: 'Jak to funguje' },
  { id: 'cenik', label: 'Ceník' },
] as const

/** Pás oborů: pro koho rezervace a poptávky dávají smysl. Služby si každý nastaví podle sebe. */
export const OBORY = [
  'Kadeřnictví',
  'Kosmetika a nehty',
  'Barbershop',
  'Masáže a wellness',
  'Kavárny',
  'Restaurace',
  'Fitness a lekce',
  'Účetní',
  'Poradci a lektoři',
  'Ordinace a fyzio',
  'Veterina',
  'Fotografové',
  'Autoservis',
  'Zámečnictví',
  'Úklid',
  'Stavba a řemesla',
  'Studnařství',
  'Likvidace azbestu',
] as const

// --- Pro koho ---------------------------------------------------------------
// Každý obor používá tytéž funkce (služby, volné časy, vlastní kolonky, lekce
// s kapacitou, pracovníci, zakázky, faktury). Ukázky jsou vymyšlené a označené.

export type SegmentMode = 'slots' | 'free' | 'sessions'

export interface SegmentExample {
  business: string
  services: { name: string; duration: string }[]
  /** Vlastní kolonka v objednávce (např. Počet osob). */
  field?: { label: string; value: string }
  /** Výběr pracovníka: „Kdokoli“ + jména. */
  staff?: string[]
  /** Vypsané lekce s počtem míst (režim `sessions`). */
  sessions?: { name: string; when: string; places: string }[]
  /** „Nevím, poradíte mi“ vedle Pokračovat. */
  advice?: boolean
  mode: SegmentMode
}

export interface Segment {
  key: string
  label: string
  title: string
  points: readonly string[]
  example: SegmentExample
}

export const SEGMENTS: readonly Segment[] = [
  {
    key: 'salon',
    label: 'Kadeřnictví a salon',
    title: 'Zákaznice se objedná, i když zrovna stříháte.',
    points: [
      'Služby mají délku a cenu, zákaznice si je skládá do jednoho termínu.',
      'Vybere si kadeřnici a volný čas. Vy jen potvrdíte.',
      'Po zaplacené návštěvě přibude razítko na věrnostní kartu.',
    ],
    example: {
      business: 'Kadeřnictví Lenka',
      services: [
        { name: 'Dámský střih', duration: '60 min' },
        { name: 'Barvení + střih', duration: '120 min' },
        { name: 'Pánský střih', duration: '30 min' },
      ],
      staff: ['Kdokoli', 'Lenka', 'Petra'],
      mode: 'slots',
    },
  },
  {
    key: 'gastro',
    label: 'Kavárna a restaurace',
    title: 'Rezervace stolu bez telefonu u ucha.',
    points: [
      'Host si vybere den a čas z vaší otevírací doby.',
      'V objednávce se zeptáte na počet osob nebo na příležitost.',
      'Víc stolů najednou? Každý má v kalendáři vlastní sloupec.',
    ],
    example: {
      business: 'Bistro U Lípy',
      services: [
        { name: 'Rezervace stolu', duration: '90 min' },
        { name: 'Oslava nebo firemní akce', duration: '180 min' },
      ],
      field: { label: 'Počet osob', value: '4' },
      mode: 'slots',
    },
  },
  {
    key: 'poradci',
    label: 'Účetní a poradci',
    title: 'Konzultace v kalendáři, zakázka s postupem.',
    points: [
      'Klient navrhne čas konzultace, vy ho potvrdíte nebo nabídnete jiný.',
      'Daňové přiznání nebo účetnictví vedete jako zakázku s kroky, které klient vidí.',
      'Faktura s QR platbou odchází rovnou z aplikace.',
    ],
    example: {
      business: 'Účetní kancelář Nováková',
      services: [
        { name: 'Úvodní konzultace', duration: '60 min' },
        { name: 'Daňové přiznání', duration: 'zakázka' },
      ],
      mode: 'free',
    },
  },
  {
    key: 'fitness',
    label: 'Fitness a lekce',
    title: 'Lekce s počtem míst. Místo se rezervuje hned.',
    points: [
      'Vypíšete lekci a kapacitu, klienti vidí, kolik míst zbývá.',
      'Osobní trénink je běžný termín s vybraným trenérem.',
      'Stálí klienti mají věrnostní kartu a připomínku e-mailem.',
    ],
    example: {
      business: 'Studio Pohyb',
      services: [{ name: 'Osobní trénink', duration: '60 min' }],
      sessions: [
        { name: 'Jóga pro začátečníky', when: 'út 18:00', places: '4 místa' },
        { name: 'Kruhový trénink', when: 'čt 7:00', places: '2 místa' },
      ],
      mode: 'sessions',
    },
  },
  {
    key: 'remeslo',
    label: 'Řemeslo a servis',
    title: 'Poptávka s adresou a fotkou, zakázka až po fakturu.',
    points: [
      'Zákazník popíše, co potřebuje, přidá adresu a fotky.',
      'Když neví, co přesně chce, klikne na „Nevím, poradíte mi“.',
      'Zakázka má vlastní stavy, termíny a na konci fakturu.',
    ],
    example: {
      business: 'Zámečnictví Dvořák',
      services: [
        { name: 'Výměna zámku', duration: '60 min' },
        { name: 'Oprava po vloupání', duration: '120 min' },
      ],
      field: { label: 'Adresa', value: 'Kamenice 64, Dobšín' },
      advice: true,
      mode: 'slots',
    },
  },
  {
    key: 'pece',
    label: 'Ordinace a péče',
    title: 'Objednání na konkrétního terapeuta a čas.',
    points: [
      'Klient vybere ošetření, délku a koho chce.',
      'Potvrzení a připomínka termínu odchází e-mailem.',
      'Historie návštěv je u každého klienta na jedné kartě.',
    ],
    example: {
      business: 'Fyzio Praha 6',
      services: [
        { name: 'Fyzioterapie', duration: '45 min' },
        { name: 'Masáž zad', duration: '30 min' },
      ],
      staff: ['Kdokoli', 'Mgr. Horák', 'Bc. Malá'],
      mode: 'slots',
    },
  },
]

// --- Diář a telefon × ZakazIQ -----------------------------------------------

export const COMPARE: readonly { what: string; before: string; after: string }[] = [
  {
    what: 'Nová objednávka',
    before: 'Telefon zazvoní, když máte plné ruce. Odpovíte večer.',
    after: 'Zákazník si vybere čas sám. Vy potvrdíte jedním klikem.',
  },
  {
    what: 'Změna termínu',
    before: 'Škrtáte v diáři a doufáte, že se nic nekryje.',
    after: 'Posunete blok. Obsazený čas kalendář nepustí, zákazník dostane e-mail.',
  },
  {
    what: 'Historie zákazníka',
    before: 'Kdo byl kdy a co si dával, nosíte v hlavě.',
    after: 'Na kartě zákazníka, i s razítky věrnostní karty.',
  },
  {
    what: 'Platby a faktury',
    before: 'Tabulka, hotovost a večer dopočítávání.',
    after: 'Platba u návštěvy, faktura s QR kódem, přehled měsíce.',
  },
  {
    what: 'Daně',
    before: 'Překvapení na konci roku.',
    after: 'Orientační odhad průběžně během roku.',
  },
]

// --- Začátek -----------------------------------------------------------------

/** Obory s připravenými službami a kolonkami (lib/ws/templates). Ostatní si služby napíšou sami. */
export const TEMPLATE_INDUSTRIES =
  'kadeřnictví a kosmetiku, zámečnictví, studnařství, likvidaci azbestu, autoservis, úklid a stavbu'

export const START_STEPS = [
  {
    n: '01',
    title: 'Zaregistrujete se e-mailem nebo přes Google.',
    text: 'Bez hesla. Kartu zadáte při registraci, prvních 14 dní se nic nestrhne.',
  },
  {
    n: '02',
    title: 'Vyberete obor a doplníte služby.',
    text: `Pro ${TEMPLATE_INDUSTRIES} jsou služby a kolonky připravené. Jinak si je napíšete sami, trvá to pár minut.`,
  },
  {
    n: '03',
    title: 'Zkopírujete odkaz na objednání.',
    text: 'Dáte ho na web, Instagram, do Google profilu nebo vytisknete QR kód na pult. První poptávka se ukáže v kalendáři.',
  },
] as const

/** Kolik to je za den: 249 Kč / 30 dní, zaokrouhleno. Jen přepočet, žádný slib úspory. */
export const PRICE_PER_DAY_LABEL = 'asi 8 Kč na den'

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
    a: 'Ne. Když zvládnete e-mail v telefonu, zvládnete i ZakazIQ. Po registraci vyberete obor; pro některé obory jsou služby a kolonky připravené, jinak si je napíšete sami.',
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
    q: 'Hodí se to i pro kavárnu nebo restauraci?',
    a: 'Ano. Rezervaci stolu nastavíte jako službu s délkou a v objednávce se host zeptá na počet osob. Víc stolů najednou vedete jako samostatné sloupce v kalendáři.',
  },
  {
    q: 'Můžu vypisovat skupinové lekce?',
    a: 'Ano. Lekce má kapacitu a klienti vidí, kolik míst zbývá. Místo se rezervuje hned po odeslání.',
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
