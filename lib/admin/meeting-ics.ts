/**
 * Soubor do kalendáře (.ics) k pozvánce na schůzku (R-137). Klient si schůzku
 * jedním klikem uloží do svého kalendáře i s vlastní připomínkou — nejsilnější
 * pojistka proti zapomenutí, protože ji má tam, kam se dívá.
 *
 * Stejné `UID` a vyšší `SEQUENCE` při změně termínu: kalendář klienta pozná,
 * že jde o tutéž schůzku, a přepíše ji místo založení druhé.
 */

function icsTime(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Řádky ICS nesmí být delší než 75 bajtů; delší se zalomí s mezerou. */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= 75) return line
  const parts: string[] = []
  let current = ''
  for (const ch of line) {
    if (Buffer.byteLength(current + ch, 'utf8') > (parts.length === 0 ? 75 : 74)) {
      parts.push(current)
      current = ''
    }
    current += ch
  }
  parts.push(current)
  return parts.join('\r\n ')
}

export type MeetingIcsInput = {
  eventId: string
  startsAt: string
  endsAt: string
  title: string
  meetUrl: string
  description: string
  /** Pořadí verze; při změně termínu musí růst. */
  sequence: number
  now?: Date
}

export function buildMeetingIcs(input: MeetingIcsInput): string {
  const now = input.now ?? new Date()
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VIZEON//Schuzka//CS',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:schuzka-${input.eventId}@vizeon.cz`,
    `SEQUENCE:${Math.max(0, Math.floor(input.sequence))}`,
    `DTSTAMP:${icsTime(now)}`,
    `DTSTART:${icsTime(new Date(input.startsAt))}`,
    `DTEND:${icsTime(new Date(input.endsAt))}`,
    `SUMMARY:${escapeIcs(input.title.slice(0, 200))}`,
    `LOCATION:${escapeIcs(input.meetUrl)}`,
    `URL:${input.meetUrl}`,
    `DESCRIPTION:${escapeIcs(input.description.slice(0, 1000))}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:-PT15M',
    `DESCRIPTION:${escapeIcs(input.title.slice(0, 200))}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ]
  return lines.map(fold).join('\r\n')
}
