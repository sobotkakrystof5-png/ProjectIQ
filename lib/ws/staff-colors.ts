// Barva pracovníka v kalendáři (RD05). Uložená barva (`ws.staff.color`, #rrggbb)
// má přednost; jinak se barvy střídají podle pořadí pracovníka z tokenů
// --staff-1…5 v app/ws-tokens.css (světlá i tmavá varianta). Bez závislostí.

export const STAFF_TONES = 5

const HEX = /^#[0-9a-fA-F]{6}$/

/** CSS barva pracovníka: uložená, nebo token podle pořadí (0 = první). */
export function staffAccent(color: string | null | undefined, index: number): string {
  if (color && HEX.test(color)) return color
  return `rgb(var(--staff-${(((index % STAFF_TONES) + STAFF_TONES) % STAFF_TONES) + 1}))`
}

/** Plocha bloku v barvě pracovníka: jemný nádech barvy na ploše karty. */
export function staffTint(accent: string): string {
  return `color-mix(in srgb, ${accent} var(--staff-tint), rgb(var(--surface)))`
}
