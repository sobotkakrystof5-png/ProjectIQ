export type GuideTopicKey =
  | 'zacinate'
  | 'poptavky-a-kalendar'
  | 'zakaznici-a-vernost'
  | 'faktury-a-penize'
  | 'dane'
  | 'napojeni-webu'
  | 'zkratky-a-hledani'

export type GuideStep = { title: string; text: string; href?: string; hrefLabel?: string }
export type Guide = {
  id: string
  topic: GuideTopicKey
  title: string
  minutes: number
  description: string
  module?: string
  preview: string
  steps: readonly GuideStep[]
}

export type GuideTopic = { id: GuideTopicKey; title: string; module?: string }

export const GUIDE_TOPICS: readonly GuideTopic[] = [
  { id: 'zacinate', title: 'Začínáme' },
  { id: 'poptavky-a-kalendar', title: 'Poptávky a kalendář', module: 'requests' },
  { id: 'zakaznici-a-vernost', title: 'Zákazníci a věrnost' },
  { id: 'faktury-a-penize', title: 'Faktury a peníze', module: 'finance' },
  { id: 'dane', title: 'Daně', module: 'taxes' },
  { id: 'napojeni-webu', title: 'Napojení webu' },
  { id: 'zkratky-a-hledani', title: 'Zkratky a hledání' },
]

/** Popisuje jen obrazovky a kroky, které jsou v aktuálním Workspace dostupné. */
export const GUIDES: readonly Guide[] = [
  {
    id: 'prvni-nastaveni', topic: 'zacinate', title: 'Připravte si aplikaci', minutes: 3,
    description: 'Doplňte nabídku a zkontrolujte, jak se zákazník objedná.', preview: 'Nastavení · Nabídka',
    steps: [
      { title: 'Doplňte služby', text: 'V Nastavení otevřete Nabídka a přidejte služby, které nabízíte.', href: 'nastaveni/nabidka' },
      { title: 'Zkontrolujte pracovní dobu', text: 'Vyplňte otevírací dobu a směny pracovníků, pokud je používáte.', href: 'nastaveni/nabidka' },
      { title: 'Otevřete objednávací stránku', text: 'V Nastavení › Objednávky zkopírujte odkaz a vyzkoušejte ho.', href: 'nastaveni/objednavky' },
    ],
  },
  {
    id: 'potvrdit-poptavku', topic: 'poptavky-a-kalendar', title: 'Vyřiďte novou poptávku', minutes: 2, module: 'requests',
    description: 'Zkontrolujte požadavek a potvrďte domluvený termín.', preview: 'Poptávky · Nové',
    steps: [
      { title: 'Otevřete nové poptávky', text: 'V seznamu uvidíte požadavek, kontakt i přání zákazníka.', href: 'poptavky' },
      { title: 'Zkontrolujte čas a službu', text: 'Pokud navržený čas nevyhovuje, vyberte s klientem jiný volný termín.', href: 'poptavky' },
      { title: 'Potvrďte termín', text: 'Termín se uloží do kalendáře; oznámení zákazníkovi se řídí nastavením komunikace.', href: 'poptavky' },
    ],
  },
  {
    id: 'rezervace-v-kalendari', topic: 'poptavky-a-kalendar', title: 'Zapište rezervaci do kalendáře', minutes: 2, module: 'calendar',
    description: 'Založte termín z volného místa v kalendáři.', preview: 'Kalendář · Nová rezervace',
    steps: [
      { title: 'Otevřete Kalendář', text: 'Vyberte den a pracovníka, ke kterému termín patří.', href: 'kalendar' },
      { title: 'Zvolte volný čas', text: 'Klikněte do volného místa nebo použijte tlačítko Nová rezervace.', href: 'kalendar' },
      { title: 'Doplňte údaje', text: 'Vyberte službu, čas a zákazníka a rezervaci uložte.', href: 'kalendar' },
    ],
  },
  {
    id: 'sledovat-zakazku', topic: 'poptavky-a-kalendar', title: 'Sledujte průběh zakázky', minutes: 2, module: 'jobs',
    description: 'Přesuňte zakázku do dalšího stavu a doplňte, co se udělalo.', preview: 'Zakázky · Stav zakázky',
    steps: [
      { title: 'Otevřete Zakázky', text: 'Zakázka se vytvoří při potvrzení poptávky, pokud máte Zakázky zapnuté.', href: 'zakazky' },
      { title: 'Vyberte zakázku', text: 'Otevřete její detail a zkontrolujte zákazníka, termín a domluvený rozsah.', href: 'zakazky' },
      { title: 'Posuňte ji dál', text: 'Změňte stav nebo přidejte zprávu o průběhu.', href: 'zakazky' },
    ],
  },
  {
    id: 'kontakt-zakaznika', topic: 'zakaznici-a-vernost', title: 'Doplňte kontakt zákazníka', minutes: 2,
    description: 'Upravte telefon nebo e-mail přímo na kartě zákazníka.', preview: 'Zákazníci · Karta zákazníka',
    steps: [
      { title: 'Najděte zákazníka', text: 'V seznamu můžete hledat podle jména, telefonu nebo e-mailu.', href: 'zakaznici' },
      { title: 'Otevřete jeho kartu', text: 'Kliknutím na řádek zobrazíte podrobnosti v bočním panelu.', href: 'zakaznici' },
      { title: 'Doplňte chybějící údaj', text: 'Zvolte Přidat telefon nebo Přidat e-mail a změnu uložte.', href: 'zakaznici' },
    ],
  },
  {
    id: 'vernostni-karta', topic: 'zakaznici-a-vernost', title: 'Nastavte věrnostní kartu', minutes: 3, module: 'loyalty',
    description: 'Určete odměnu a přidejte zákazníkovi razítko za návštěvu.', preview: 'Nastavení · Zákazníci · Věrnost',
    steps: [
      { title: 'Nastavte program', text: 'V Nastavení › Zákazníci otevřete část Věrnost a zadejte počet razítek i odměnu.', href: 'nastaveni/zakaznici' },
      { title: 'Otevřete zákazníka', text: 'V jeho kartě uvidíte stav věrnostní karty.', href: 'zakaznici' },
      { title: 'Přidejte razítko nebo odměnu', text: 'Po návštěvě použijte odpovídající akci na kartě.', href: 'zakaznici' },
    ],
  },
  {
    id: 'vystavit-fakturu', topic: 'faktury-a-penize', title: 'Vystavte fakturu', minutes: 3, module: 'invoices',
    description: 'Předvyplňte zákazníka a připravte fakturu z jednoho místa.', preview: 'Peníze · Faktury · Vystavit fakturu',
    steps: [
      { title: 'Otevřete Faktury', text: 'V části Peníze zvolte Faktury a potom Vystavit fakturu.', href: 'faktury' },
      { title: 'Doplňte odběratele a položky', text: 'Vyberte zákazníka, přidejte služby nebo vlastní položky a zkontrolujte součet.', href: 'faktury' },
      { title: 'Uložte a stáhněte PDF', text: 'Po uložení otevřete fakturu a stáhněte její PDF.', href: 'faktury' },
    ],
  },
  {
    id: 'zapsat-platbu', topic: 'faktury-a-penize', title: 'Zapište příjem nebo výdaj', minutes: 2, module: 'finance',
    description: 'Zaznamenejte platbu a zařaďte ji do přehledu.', preview: 'Peníze · Rozbory',
    steps: [
      { title: 'Otevřete Rozbory', text: 'V části Peníze vyberte správný měsíc.', href: 'prijmy' },
      { title: 'Zvolte Zapsat platbu', text: 'Vyberte příjem nebo výdaj, částku, měnu a datum.', href: 'prijmy' },
      { title: 'Uložte záznam', text: 'Nová položka se promítne do přehledu pro zvolenou měnu.', href: 'prijmy' },
    ],
  },
  {
    id: 'nastavit-dane', topic: 'dane', title: 'Nastavte daňový přehled', minutes: 3, module: 'taxes',
    description: 'Vyplňte základní údaje a zobrazte dostupný odhad.', preview: 'Peníze · Daně · Nastavení',
    steps: [
      { title: 'Otevřete Daně', text: 'V části Peníze zvolte záložku Daně.', href: 'dane' },
      { title: 'Odpovězte na základní otázky', text: 'Vyberte hlavní nebo vedlejší činnost, způsob výdajů a plátcovství DPH.', href: 'dane' },
      { title: 'Doplňte podrobnosti podle potřeby', text: 'Pokročilé údaje upravte jen tehdy, pokud odpovídají vaší situaci.', href: 'dane' },
    ],
  },
  {
    id: 'napojit-web', topic: 'napojeni-webu', title: 'Propojte web s objednávkami', minutes: 3,
    description: 'Zkopírujte objednávací odkaz nebo připravte formulář pro web.', preview: 'Nastavení · Objednávky · Napojený web',
    steps: [
      { title: 'Otevřete Napojený web', text: 'Najdete ho v Nastavení › Objednávky.', href: 'nastaveni/objednavky' },
      { title: 'Vyberte způsob propojení', text: 'Použijte odkaz na objednávací stránku nebo kód widgetu podle možností svého webu.', href: 'nastaveni/objednavky' },
      { title: 'Ověřte propojení', text: 'Po vložení formuláře na web použijte Ověřit napojení.', href: 'nastaveni/objednavky' },
    ],
  },
  {
    id: 'hledani-a-zkratky', topic: 'zkratky-a-hledani', title: 'Najděte obrazovku nebo záznam', minutes: 1,
    description: 'Přes hledání otevřete zákazníka, poptávku nebo dostupnou akci.', preview: '⌘K · Hledat',
    steps: [
      { title: 'Otevřete hledání', text: 'Stiskněte ⌘K na Macu nebo Ctrl+K na ostatních počítačích.', href: '' },
      { title: 'Zadejte, co hledáte', text: 'Napište jméno zákazníka, poptávky nebo faktury.', href: '' },
      { title: 'Vyberte výsledek', text: 'Pomocí šipek a Enteru můžete výsledek otevřít i bez myši.', href: '' },
    ],
  },
]

export function visibleGuides(enabled: ReadonlySet<string>): Guide[] {
  return GUIDES.filter((guide) => !guide.module || enabled.has(guide.module))
}

export function visibleGuideTopics(enabled: ReadonlySet<string>): (GuideTopic & { guides: Guide[] })[] {
  const guides = visibleGuides(enabled)
  return GUIDE_TOPICS.map((topic) => ({ ...topic, guides: guides.filter((guide) => guide.topic === topic.id) }))
    .filter((topic) => topic.guides.length > 0)
}

export function findGuideForScreen(screen: string, enabled: ReadonlySet<string>): Guide | null {
  return visibleGuides(enabled).find((guide) => guide.steps.some((step) => step.href === screen)) ?? null
}

export function searchGuides(query: string, guides: readonly Guide[]): Guide[] {
  const normalized = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('cs').trim()
  if (!normalized) return []
  return guides.filter((guide) =>
    [guide.title, guide.description, ...guide.steps.flatMap((step) => [step.title, step.text])]
      .join(' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('cs')
      .includes(normalized),
  )
}
