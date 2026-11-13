/**
 * Rámce, ve kterých chodí modelu data (AD14, rozšířeno v AD15).
 *
 * `<kontext>` data obrazovky · `<fakta>` spočítaná historie · `<pamet>`
 * poznámky. Značka musí jít **jen z našeho kódu** — kdyby ji někdo napsal
 * do poznámky nebo do názvu služby, zavřel by rámec a to, co následuje,
 * by model četl jako pokyn (R-069).
 *
 * Proto se čistí **hodnota**, ne hotový text: kdyby se stripovalo až po
 * zabalení, zmizel by i náš vlastní rámec. (Přesně to se do AD15 dělo —
 * prompt mluvil o značkách, které se k modelu nikdy nedostaly.)
 */
const MARKERS = /<\/?(?:kontext|fakta|pamet|veta|zpravy)>/gi

export function stripMarkers(text: string): string {
  return text.replace(MARKERS, '')
}
