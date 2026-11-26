/**
 * ZakazIQ Voice (R-148): práce s textem diktátu — slova a porovnání.
 * Čisté funkce bez DB a sítě. Rozdíl po slovech pro učení (dvojice oprav) přidá VO08.
 */

/** Slovo = písmena a číslice včetně diakritiky, uvnitř smí být apostrof nebo spojovník. */
const WORD_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu

export function words(text: string): string[] {
  return text.match(WORD_RE) ?? []
}

export function countWords(text: string | null | undefined): number {
  return text ? words(text).length : 0
}

/** Malá písmena bez diakritiky — na porovnání „je to totéž slovo?". */
export function fold(word: string): string {
  return word.toLocaleLowerCase('cs').normalize('NFD').replace(/\p{M}+/gu, '')
}

/** Celý text na porovnání: bez interpunkce, malými písmeny bez diakritiky, jedna mezera. */
export function foldText(text: string): string {
  return words(text).map(fold).join(' ')
}

export const isNumberToken = (w: string): boolean => /^\p{N}+$/u.test(w)

/** Jedna mezera, žádná mezera před interpunkcí ani kolem zalomení, velké písmeno na začátku. */
export function tidy(text: string): string {
  const t = text
    .replace(/[ \t]+/g, ' ')
    .replace(/ +([,.;:!?…])/g, '$1')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!t) return t
  return t.charAt(0).toLocaleUpperCase('cs') + t.slice(1)
}

/**
 * Výplňová slova, která v psaném textu nikdy nemají co dělat (VO07). Jen
 * zvuky, ne slova s významem: „no", „prostě" nebo „jakoby" smí odstranit
 * jen čištění modelem, protože někdy něco znamenají. „mhm" znamená „ano".
 */
const FILLERS = new Set(['ehm', 'ehmm', 'ehh', 'eh', 'ee', 'eee', 'eeee', 'hm', 'hmm', 'hmmm', 'emm', 'uhm', 'ahm'])

export const isFiller = (word: string): boolean => FILLERS.has(fold(word))

/** Odstraní výplňová slova i s čárkou za nimi. Vrací text a počet odstraněných. */
export function stripFillers(text: string): { text: string; removed: number } {
  let removed = 0
  const out = text.replace(/(?<![\p{L}\p{N}])[\p{L}]+(?![\p{L}\p{N}])[,…]*\s*/gu, (match) => {
    const word = /^[\p{L}]+/u.exec(match)?.[0] ?? ''
    if (!isFiller(word)) return match
    removed++
    return ''
  })
  return { text: removed ? out.replace(/\s+([,.;:!?])/g, '$1').replace(/[ \t]+/g, ' ').trim() : text, removed }
}

/** „nový řádek" a „nový odstavec" vyslovené v diktátu → zalomení (bez modelu, vždy). */
export function applyLineCommands(text: string): { text: string; commands: number } {
  let commands = 0
  const out = text.replace(
    /[,.;:]?\s*(?<![\p{L}\p{N}])nov(?:ý|y|ej)\s+(řádek|radek|odstavec)(?![\p{L}\p{N}])[,.;:]?\s*/giu,
    (_m, what: string) => {
      commands++
      return fold(what) === 'odstavec' ? '\n\n' : '\n'
    },
  )
  return { text: commands ? out.trim() : text, commands }
}

/**
 * Kolik slov změnilo čištění (`voice_dictations.words_corrected`, jako „Fixes
 * made by Flow"). Rozdíl po slovech přes nejdelší společnou posloupnost;
 * velikost písmen se nepočítá, diakritika ano („nevim" → „nevím" je oprava).
 * Náhrada jednoho slova = 1, odstranění = 1, přidání = 1.
 */
export function changedWords(before: string, after: string): number {
  const a = words(before).map((w) => w.toLocaleLowerCase('cs'))
  const b = words(after).map((w) => w.toLocaleLowerCase('cs'))
  if (!a.length || !b.length) return Math.max(a.length, b.length)
  let prev = new Uint32Array(b.length + 1)
  let cur = new Uint32Array(b.length + 1)
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1])
    }
    ;[prev, cur] = [cur, prev]
  }
  const lcs = prev[b.length]
  return Math.max(a.length - lcs, b.length - lcs)
}
