// Akcentová barva byznysu (design Dílky § 7): nahradí navy-700 u tlačítek
// a aktivních prvků na objednávací stránce a ve widgetu. Barva, na které by
// bílý text nebyl čitelný (kontrast pod 4.5:1), se nepoužije — zůstane navy.

const HEX_RE = /^#([0-9a-f]{6})$/i

function rgb(hex: string): [number, number, number] | null {
  const m = HEX_RE.exec(hex)
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Kontrast s bílou (WCAG). */
export function contrastWithWhite(hex: string): number {
  const c = rgb(hex)
  return c ? 1.05 / (luminance(c) + 0.05) : 0
}

const darken = ([r, g, b]: [number, number, number], f: number): [number, number, number] => [
  Math.round(r * f),
  Math.round(g * f),
  Math.round(b * f),
]

function hexColor([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** Barva tlačítka jako hex, nebo null (výchozí navy). */
export function usableAccent(hex: string | null | undefined): string | null {
  return hex && contrastWithWhite(hex) >= 4.5 ? hex.toLowerCase() : null
}

/** Gradient věrnostní karty podle barvy byznysu, jen pokud má text dostatečný kontrast. */
export function accentGradient(hex: string | null | undefined): string | null {
  const usable = usableAccent(hex)
  const c = usable ? rgb(usable) : null
  return usable && c ? `linear-gradient(135deg, ${usable}, ${hexColor(darken(c, 0.82))})` : null
}

/** CSS proměnné, které přebijí navy-700/800/900 uvnitř kořene stránky. */
export function accentVars(hex: string | null | undefined): Record<string, string> | undefined {
  const usable = usableAccent(hex)
  const c = usable ? rgb(usable) : null
  if (!c) return undefined
  const t = (x: [number, number, number]) => x.join(' ')
  return { '--navy-700': t(c), '--navy-800': t(darken(c, 0.82)), '--navy-900': t(darken(c, 0.68)) }
}
