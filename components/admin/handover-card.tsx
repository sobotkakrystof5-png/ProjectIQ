'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { saveProjectHandover } from '@/app/handover-actions'
import { cleanHandover, handoverIsEmpty, handoverSchema, type HandoverDoc } from '@/lib/admin/handover-schema'
import { formatDate } from '@/lib/utils'

/**
 * Předávací dokument „co bylo dodané" (AD16).
 *
 * Čtyři části, protože po předání se lidé nejčastěji neshodnou právě na
 * nich: co klient dostal, kde to má, co platí v ceně údržby a co ne.
 *
 * Do přístupů se píše **kde** přístup je, ne heslo — server text kontroluje
 * a doklad, ve kterém by heslo bylo, neuloží.
 */
export function HandoverCard({
  projectId,
  initial,
  issuedAt,
  available,
  saved,
  className,
}: {
  projectId: string
  initial: HandoverDoc
  issuedAt: string | null
  available: boolean
  saved: boolean
  className?: string
}) {
  const router = useRouter()
  const [doc, setDoc] = useState<HandoverDoc>(initial)
  const [ulozeno, setUlozeno] = useState(saved)
  const [pending, start] = useTransition()

  const set = (patch: Partial<HandoverDoc>) => setDoc((prev) => ({ ...prev, ...patch }))

  // Nedopsané řádky se zahodí už tady, ať se tlačítko chová stejně jako server.
  const cleaned = handoverSchema.safeParse(cleanHandover(doc))
  const prazdny = !cleaned.success || handoverIsEmpty(cleaned.data)

  const uloz = () =>
    start(async () => {
      const result = await saveProjectHandover(projectId, doc)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setUlozeno(true)
      toast.success('Předávací dokument uložený.')
      router.refresh()
    })

  return (
    <div className={className}>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Předávací dokument
      </h2>
      <p className="mb-5 text-xs text-muted-foreground">
        Co klient dostal, kde to má a co je v ceně údržby. Vyrobí se z toho PDF, které můžete
        poslat spolu s fakturou. Hesla sem nepište — pošlete je zvlášť.
      </p>

      {!available && (
        <p className="mb-4 rounded-box border border-navy-100 bg-navy-50 px-3 py-2 text-xs text-muted-foreground">
          Uložit ho zatím nejde — na databázi chybí migrace 112.
        </p>
      )}

      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Shrnutí</span>
          <textarea
            value={doc.summary}
            onChange={(e) => set({ summary: e.target.value })}
            rows={3}
            maxLength={2000}
            placeholder="Co se dělalo a co z toho vzešlo."
            className="w-full rounded-box border border-input bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-quiet focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </label>

        <PairList
          title="Co jste dodali"
          hint="Stránky, funkce, podklady."
          rows={doc.items.map((i) => ({ first: i.label, second: i.note }))}
          placeholders={['Například: Úvodní stránka', 'Doplnění (nepovinné)']}
          onChange={(rows) => set({ items: rows.map((r) => ({ label: r.first, note: r.second })) })}
          addLabel="Přidat položku"
        />

        <PairList
          title="Kde má klient přístupy"
          hint="Adresa, ne přihlašovací údaje."
          rows={doc.access.map((a) => ({ first: a.label, second: a.where }))}
          placeholders={['Například: Administrace webu', 'Kde to najde']}
          onChange={(rows) => set({ access: rows.map((r) => ({ label: r.first, where: r.second })) })}
          addLabel="Přidat přístup"
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <TextList
            title="V ceně údržby"
            rows={doc.maintenance.included}
            placeholder="Například: Aktualizace a zálohy"
            onChange={(included) => set({ maintenance: { ...doc.maintenance, included } })}
          />
          <TextList
            title="Mimo údržbu"
            rows={doc.maintenance.excluded}
            placeholder="Například: Nové stránky navíc"
            onChange={(excluded) => set({ maintenance: { ...doc.maintenance, excluded } })}
          />
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Poznámka na závěr</span>
          <textarea
            value={doc.note}
            onChange={(e) => set({ note: e.target.value })}
            rows={2}
            maxLength={2000}
            placeholder="Nepovinné."
            className="w-full rounded-box border border-input bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-quiet focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-navy-100 pt-4">
        <Button type="button" onClick={uloz} disabled={pending || !available || prazdny}>
          {pending ? 'Ukládám…' : 'Uložit'}
        </Button>
        {/*
          Formulář, ne odkaz: vystavení zapisuje datum předání, a zápis nepatří
          na GET (AD08). `target="_blank"` otevře PDF v nové záložce stejně jako
          odkaz a prohlížeč to nebere jako vyskočné okno.
        */}
        {ulozeno && (
          <form method="post" action={`/api/projects/${projectId}/predani`} target="_blank">
            <Button type="submit" variant="outline">
              <FileText size={16} strokeWidth={1.75} aria-hidden="true" />
              Otevřít PDF
            </Button>
          </form>
        )}
        <p className="text-xs text-muted-foreground">
          {issuedAt ? `Naposledy vystaveno ${formatDate(issuedAt)}.` : 'Zatím nevystaveno.'}
        </p>
      </div>
    </div>
  )
}

type Pair = { first: string; second: string }

function PairList({
  title,
  hint,
  rows,
  placeholders,
  onChange,
  addLabel,
}: {
  title: string
  hint: string
  rows: Pair[]
  placeholders: [string, string] | string[]
  onChange: (rows: Pair[]) => void
  addLabel: string
}) {
  const update = (index: number, patch: Partial<Pair>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {rows.map((row, index) => (
        <div key={index} className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={row.first}
            onChange={(e) => update(index, { first: e.target.value })}
            placeholder={placeholders[0]}
            maxLength={160}
            aria-label={`${title} — název`}
            className="sm:flex-1"
          />
          <Input
            value={row.second}
            onChange={(e) => update(index, { second: e.target.value })}
            placeholder={placeholders[1]}
            maxLength={400}
            aria-label={`${title} — doplnění`}
            className="sm:flex-1"
          />
          {/*
            Na telefonu stojí řádek pod sebou a sám křížek pod dvěma poli neprozradí,
            co vlastně odebere — proto tam má popisek a drží se u pravého okraje.
          */}
          <Button
            type="button"
            variant="ghost"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
            aria-label={`Odebrat řádek ${index + 1}`}
            className="self-end sm:w-11 sm:self-auto sm:px-0"
          >
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
            <span className="sm:hidden">Odebrat</span>
          </Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="ghost" onClick={() => onChange([...rows, { first: '', second: '' }])}>
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          {addLabel}
        </Button>
      </div>
    </section>
  )
}

function TextList({
  title,
  rows,
  placeholder,
  onChange,
}: {
  title: string
  rows: string[]
  placeholder: string
  onChange: (rows: string[]) => void
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      {rows.map((row, index) => (
        <div key={index} className="flex gap-2">
          <Input
            value={row}
            onChange={(e) => onChange(rows.map((r, i) => (i === index ? e.target.value : r)))}
            placeholder={placeholder}
            maxLength={200}
            aria-label={`${title} — řádek ${index + 1}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
            aria-label={`Odebrat řádek ${index + 1}`}
          >
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="ghost" onClick={() => onChange([...rows, ''])}>
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          Přidat
        </Button>
      </div>
    </section>
  )
}
