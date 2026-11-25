/**
 * Doslovný přepis schůzky (R-144). Text se jen rozdělí na řádky a jméno
 * mluvčího před dvojtečkou se zvýrazní — slova zůstávají přesně, jak přišla.
 * Vykresluje se jako text (React escapuje), nikdy jako HTML.
 */

const SPEAKER_LINE = /^([^:\n]{1,60}):\s?(.*)$/

export type TranscriptLine = { speaker: string | null; text: string }

export function splitTranscript(transcript: string): TranscriptLine[] {
  return transcript.split(/\r?\n/).map((line) => {
    const m = SPEAKER_LINE.exec(line)
    // „https://…" nebo čas „10:30" nejsou mluvčí.
    if (m && !/^\s*(https?|\d{1,2})\s*$/i.test(m[1])) return { speaker: m[1].trim(), text: m[2] }
    return { speaker: null, text: line }
  })
}

export function TranscriptView({
  transcript,
  speakers,
}: {
  transcript: string
  speakers: { label: string; name: string }[]
}) {
  const names = new Map(speakers.map((s) => [s.label, s.name]))
  const lines = splitTranscript(transcript)
  return (
    <div className="flex flex-col gap-1.5 text-[15px] leading-relaxed text-ink">
      {lines.map((line, i) =>
        line.speaker !== null ? (
          <p key={i} className="break-words">
            <span className="font-semibold">{line.speaker}</span>
            {names.has(line.speaker) && names.get(line.speaker) !== line.speaker ? (
              <span className="text-quiet"> ({names.get(line.speaker)})</span>
            ) : null}
            <span className="text-quiet">: </span>
            {line.text}
          </p>
        ) : line.text.trim() === '' ? (
          <div key={i} aria-hidden className="h-2" />
        ) : (
          <p key={i} className="whitespace-pre-wrap break-words">
            {line.text}
          </p>
        ),
      )}
    </div>
  )
}
