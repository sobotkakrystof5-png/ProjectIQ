export type PragueMinute = { date: string; minutes: number }

/** Pozice čáry „teď“ v procentech výšky dnešního sloupce; null = mimo zobrazený čas. */
export function nowLinePosition(
  now: PragueMinute | null,
  day: string,
  hours: { from: number; to: number },
): number | null {
  if (!now || now.date !== day || hours.to <= hours.from) return null
  const from = hours.from * 60
  const to = hours.to * 60
  if (now.minutes < from || now.minutes >= to) return null
  return ((now.minutes - from) / (to - from)) * 100
}

/** Stejný práh pohybu používá myš, pero i dotykový režim. */
export function pointerDragStarted(startX: number, startY: number, x: number, y: number, threshold = 8): boolean {
  return Math.hypot(x - startX, y - startY) >= threshold
}
