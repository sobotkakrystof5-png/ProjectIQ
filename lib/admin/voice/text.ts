/**
 * ZakazIQ Voice (R-148): práce s textem diktátu — slova a porovnání.
 * Čisté funkce bez DB a sítě. Rozdíl po slovech pro učení přidá VO08.
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

/** Jedna mezera, žádná mezera před interpunkcí, velké písmeno na začátku. */
export function tidy(text: string): string {
  const t = text
    .replace(/[ \t]+/g, ' ')
    .replace(/ +([,.;:!?…])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!t) return t
  return t.charAt(0).toLocaleUpperCase('cs') + t.slice(1)
}
