import { neutralizeTags, stripHidden } from '@/lib/ai/untrusted'

/**
 * Rámce, ve kterých chodí modelu data (AD14, rozšířeno v AD15).
 *
 * `<kontext>` data obrazovky · `<fakta>` spočítaná historie · `<pamet>`
 * poznámky · `<data>` výsledky dotazů asistenta (R-111) · `<prehled>` přehled
 * firmy · `<cas>` čas · `<veta>` věta uživatele. Značka musí jít **jen z našeho
 * kódu** — kdyby ji někdo napsal do poznámky nebo do názvu služby, zavřel by
 * rámec a to, co následuje, by model četl jako pokyn (R-069).
 *
 * Proto se čistí **hodnota**, ne hotový text: kdyby se čistilo až po
 * zabalení, zmizel by i náš vlastní rámec. (Přesně to se do AD15 dělo —
 * prompt mluvil o značkách, které se k modelu nikdy nedostaly.)
 *
 * Od DECISIONS #062 se nemaže seznam známých značek (chyběly v něm `<prehled>`
 * a `<cas>`, takže jméno z webového formuláře uměl zavřít přehled firmy), ale
 * zneškodní se **každá** značka (`<x>` → `‹x›`) a zmizí neviditelné znaky.
 * Podrobnosti v `lib/ai/untrusted.ts`.
 */
export function stripMarkers(text: string): string {
  return neutralizeTags(stripHidden(text))
}
