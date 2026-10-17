// CSV pro export dat (S18). Středník a BOM, aby soubor rovnou otevřel český
// Excel i Numbers; Google Tabulky a LibreOffice středník poznají samy.
// Buňky začínající =, +, -, @ dostanou apostrof (ochrana před vzorci v Excelu).

export type CsvValue = string | number | boolean | Date | null | undefined | Record<string, unknown> | unknown[]

function cell(v: CsvValue): string {
  if (v === null || v === undefined) return ''
  let s: string
  if (v instanceof Date) s = v.toISOString()
  else if (typeof v === 'object') s = JSON.stringify(v)
  else if (typeof v === 'boolean') s = v ? 'ano' : 'ne'
  else s = String(v)
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: string[], rows: CsvValue[][]): string {
  const lines = [header, ...rows].map((r) => r.map(cell).join(';'))
  return '﻿' + lines.join('\r\n') + '\r\n'
}
