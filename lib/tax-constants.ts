/**
 * Daňové a odvodové parametry pro OSVČ — vedlejší činnost (student),
 * neplátce DPH, 60% výdajový paušál.
 *
 * Jediný zdroj pravdy pro sazby. Nikdy nezadrátovat číslo do komponenty
 * ani do server action — sazby se mění každý rok a rozsypané konstanty
 * se nedají spolehlivě aktualizovat.
 *
 * Odkazy na zdroj jsou u každé hodnoty záměrně — v UI se u kalkulačky
 * uvádí, z jakých sazeb a kterého roku počítá.
 */

/** Rok, ke kterému platí sazby níže. Při aktualizaci na 2027 zvednout spolu se sazbami. */
export const TAX_YEAR = 2026

// ─── Daň z příjmů ─────────────────────────────────────────────────────────────

/** Výdajový paušál pro živnost volnou — zákon o daních z příjmů, § 7 odst. 7 písm. b). */
export const EXPENSE_LUMP_SUM_RATE = 0.6

/** Strop příjmů pro uplatnění paušálu. Nad tuto hranici končí paušál a vzniká povinná registrace k DPH. */
export const INCOME_CAP_FOR_LUMP_SUM = 2_000_000

/** Maximální částka uplatnitelná paušálem = 60 % ze stropu 2 mil. Kč. */
export const EXPENSE_LUMP_SUM_CAP = 1_200_000

/** Sazba daně v 1. pásmu. */
export const TAX_RATE_BASE = 0.15

/** Sazba daně ve 2. pásmu — jen z části daňového základu nad hranicí níže. */
export const TAX_RATE_UPPER = 0.23

/** Daňový základ, nad kterým se uplatní 2. pásmo (36násobek průměrné mzdy). */
export const TAX_UPPER_BRACKET_THRESHOLD = 1_762_812

/** Základní sleva na poplatníka za rok. */
export const TAXPAYER_CREDIT = 30_840

// ─── Sociální pojištění (ČSSZ) ────────────────────────────────────────────────
// https://www.cssz.gov.cz/-/prehled-nejdulezitejsich-udaju-pro-socialni-zabezpeceni-v-roce-2026

/** Sazba pojistného na důchodové pojištění. */
export const SOCIAL_RATE = 0.292

/** Vyměřovací základ pro sociální = 55 % daňového základu. */
export const SOCIAL_ASSESSMENT_SHARE = 0.55

/**
 * Rozhodná částka pro vedlejší činnost. Do tohoto daňového základu včetně
 * nevzniká povinnost platit sociální pojištění.
 */
export const SOCIAL_SECONDARY_THRESHOLD = 117_521

/** Minimální měsíční záloha pro vedlejší činnost (student ji v prvním roce neplatí). */
export const SOCIAL_SECONDARY_MIN_ADVANCE_MONTHLY = 1_574

// ─── Zdravotní pojištění (VZP) ────────────────────────────────────────────────
// https://www.vzp.cz/platci/informace/stat/vymerovaci-zaklad-a-vypocet-pojistneho

/** Sazba pojistného na veřejné zdravotní pojištění. */
export const HEALTH_RATE = 0.135

/**
 * Vyměřovací základ pro zdravotní = 50 % daňového základu.
 *
 * Pozor na rozpor ve zdrojích: některé blogy (SuperFaktura) uvádějí 55 %
 * pro sociální i zdravotní. VZP jako plátce uvádí u zdravotního 50 %.
 * Držíme se oficiálního čtení VZP. Kdyby se ukázalo jinak, mění se
 * jediné číslo tady.
 */
export const HEALTH_ASSESSMENT_SHARE = 0.5

// ─── Ostatní ──────────────────────────────────────────────────────────────────

/** Průměrná mzda 2026 — ČSSZ. */
export const AVERAGE_WAGE = 48_967

/** Obrat za 12 po sobě jdoucích měsíců, po jehož překročení vzniká povinná registrace k DPH. */
export const VAT_REGISTRATION_LIMIT = 2_000_000

// ─── Odvozené hranice ─────────────────────────────────────────────────────────
// Počítané ze sazeb výše, ne opsané — po změně sazby se dopočítají samy.
// Platí pro vedlejší činnost s 60% paušálem, kde daňový základ = 40 % příjmů.

/** Podíl daňového základu na příjmech při uplatnění paušálu (pod stropem). */
export const TAX_BASE_SHARE = 1 - EXPENSE_LUMP_SUM_RATE

/**
 * Nejvyšší roční příjem, při kterém ještě nevzniká povinnost platit
 * sociální pojištění (daňový základ zůstane do rozhodné částky).
 */
export const INCOME_THRESHOLD_SOCIAL = Math.floor(SOCIAL_SECONDARY_THRESHOLD / TAX_BASE_SHARE)

/**
 * Nejvyšší roční příjem, u kterého sleva na poplatníka ještě pokryje
 * celou daň. Nad ním se začíná reálně platit daň z příjmu.
 */
export const INCOME_THRESHOLD_TAX = Math.floor(
  TAXPAYER_CREDIT / TAX_RATE_BASE / TAX_BASE_SHARE
)

/** Příjem, nad kterým končí paušál a vzniká povinná registrace k DPH. */
export const INCOME_THRESHOLD_LUMP_SUM = INCOME_CAP_FOR_LUMP_SUM

/** Hranice pro hlídač limitů ve Financích — pořadí odpovídá pořadí v UI. */
export const INCOME_THRESHOLDS = [
  {
    key: 'social' as const,
    label: 'Sociální pojištění',
    limit: INCOME_THRESHOLD_SOCIAL,
    consequence: 'Vzniká povinnost platit sociální pojištění',
  },
  {
    key: 'tax' as const,
    label: 'Daň z příjmu',
    limit: INCOME_THRESHOLD_TAX,
    consequence: 'Sleva na poplatníka přestane pokrývat daň, začínáš reálně platit',
  },
  {
    key: 'lump_sum' as const,
    label: 'Paušál a DPH',
    limit: INCOME_THRESHOLD_LUMP_SUM,
    consequence: 'Konec 60% paušálu, povinná registrace k DPH',
  },
]

export type IncomeThresholdKey = (typeof INCOME_THRESHOLDS)[number]['key']

/** Popis sazeb pro zobrazení pod kalkulačkou — ať je vidět, z čeho se počítá. */
export const TAX_BASIS_NOTE =
  `Počítáno podle sazeb pro rok ${TAX_YEAR}: 60% výdajový paušál, daň 15 % ` +
  `(23 % nad ${TAX_UPPER_BRACKET_THRESHOLD.toLocaleString('cs-CZ')} Kč základu), ` +
  `sleva na poplatníka ${TAXPAYER_CREDIT.toLocaleString('cs-CZ')} Kč, ` +
  `sociální 29,2 % z 55 % základu (vedlejší činnost), zdravotní 13,5 % z 50 % základu. ` +
  `Orientační výpočet, ne daňové poradenství.`
