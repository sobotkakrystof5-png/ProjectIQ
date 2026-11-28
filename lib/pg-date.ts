/**
 * Hodnota sloupce `date` z Postgresu jako `'YYYY-MM-DD'`.
 *
 * Ovladač Neonu (pg-types) dělá ze sloupce `date` objekt `Date` s půlnocí
 * v **místní zóně procesu**. `toISOString()` ho převede do UTC, takže při
 * `TZ=Europe/Prague` vrátí předchozí den (31. 12. → „2026-12-30"). Na Vercelu
 * běží proces v UTC a chyba se neprojeví, lokálně a v testech ano. Proto se
 * datum skládá z místních složek, které ovladač nastavil.
 *
 * Jen pro sloupce `date`. Okamžik (`timestamptz`) patří do `pragueDayOf`
 * z `lib/prague-time.ts`.
 */
export function pgDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${value.getFullYear()}-${m}-${d}`
  }
  const text = String(value)
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null
}
