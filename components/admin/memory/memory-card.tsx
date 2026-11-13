import { Badge } from '@/components/ui/badge'
import { AddMemoryForm, DraftBadge, DraftControls, ForgetButton } from '@/components/admin/memory/memory-controls'
import { contactOfProject, factLines, loadFacts } from '@/lib/admin/memory/facts'
import { listMemory, memoryAvailable, type MemoryRow } from '@/lib/admin/memory/store'
import { MEMORY_KIND_LABELS, MEMORY_SOURCE_LABELS, type MemoryScope } from '@/lib/admin/memory/types'
import { formatDate } from '@/lib/utils'

/**
 * Paměť (AD15) v detailu zakázky a na kartě kontaktu.
 *
 * Dvě vrstvy pod sebou a je vidět, která je která (R-085):
 *   **Co víme z historie** — spočítané, bez AI, tohle plní formuláře.
 *   **Paměť** — věty. U nepotvrzených je odznak „Návrh paměti" a dvě tlačítka.
 *
 * Bez migrace 111 zůstanou jen fakta; nic se nerozbije.
 */

function Row({ row, scope, refId }: { row: MemoryRow; scope: MemoryScope; refId: string | null }) {
  const draft = row.confirmedBy === null
  return (
    <li className="flex flex-col gap-2 border-t border-navy-100 px-4 py-3 first:border-t-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm text-ink">{row.text}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-quiet">
          <Badge variant="outline">{MEMORY_KIND_LABELS[row.kind]}</Badge>
          <span>{MEMORY_SOURCE_LABELS[row.source]}</span>
          <span aria-hidden>·</span>
          <span className="font-num">{formatDate(row.createdAt)}</span>
          <span aria-hidden>·</span>
          <span className="font-num">platí do {formatDate(row.validUntil)}</span>
          {draft && <DraftBadge />}
        </p>
      </div>
      {draft ? (
        <DraftControls id={row.id} scope={scope} refId={refId} />
      ) : (
        <ForgetButton id={row.id} scope={scope} refId={refId} />
      )}
    </li>
  )
}

export async function MemoryCard({
  scope,
  refId,
  className,
}: {
  scope: Extract<MemoryScope, 'project' | 'contact'>
  refId: string
  className?: string
}) {
  // Fakta se u zakázky počítají za jejího klienta — zakázka sama žádnou
  // historii nemá, tu má člověk.
  const contactId = scope === 'contact' ? refId : await contactOfProject(refId)
  const [facts, rows, aboutContact, available] = await Promise.all([
    loadFacts(contactId),
    listMemory(scope, refId),
    scope === 'project' && contactId !== null ? listMemory('contact', contactId) : Promise.resolve([]),
    memoryAvailable(),
  ])
  const lines = factLines(facts)

  return (
    <section className={className}>
      <div className="mb-4 flex flex-col gap-0.5">
        <h2 className="text-base font-semibold text-ink">Paměť</h2>
        <p className="text-sm text-quiet">
          Co se o téhle spolupráci ví. Čísla se počítají z historie, věty si zapisujete sami.
        </p>
      </div>

      {lines.length > 0 && (
        <div className="mb-4 rounded-box border border-navy-100 bg-navy-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-quiet">Co víme z historie</p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {available ? (
        <div className="flex flex-col gap-4">
          {rows.length === 0 && aboutContact.length === 0 ? (
            <p className="rounded-box border border-dashed border-navy-200 px-4 py-6 text-sm text-quiet">
              Zatím nic. Co si sem zapíšete, bude mít asistent po ruce — a nebudete to vysvětlovat znovu.
            </p>
          ) : (
            <ul className="overflow-hidden rounded-box border border-navy-100 bg-surface">
              {rows.map((row) => (
                <Row key={row.id} row={row} scope={scope} refId={refId} />
              ))}
            </ul>
          )}

          {aboutContact.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-quiet">O klientovi</p>
              <ul className="overflow-hidden rounded-box border border-navy-100 bg-surface">
                {aboutContact.map((row) => (
                  <Row key={row.id} row={row} scope="contact" refId={contactId} />
                ))}
              </ul>
            </div>
          )}

          <AddMemoryForm scope={scope} refId={refId} />
        </div>
      ) : (
        <p className="rounded-box border border-dashed border-navy-200 px-4 py-6 text-sm text-quiet">
          Zapisování do paměti se zapne po migraci 111. Čísla z historie fungují už teď.
        </p>
      )}
    </section>
  )
}
