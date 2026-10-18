'use client'

import { useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { m } from 'framer-motion'
import { Check, Copy, Download, ExternalLink, KeyRound, Mail, Plus, Sparkles, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { SectionLabel } from '@/components/ws/brand'
import { useWsAction } from '@/components/ws/app/booking/use-ws-action'
import { rotatePublic, rotateSecret, saveOrigins, verifyIntegration } from '@/app/w/[business]/nastaveni/web/actions'
import { zqStamp } from '@/lib/ws/motion'
import { formatClock, formatDayShort, pragueParts } from '@/lib/ws/time'
import { cn } from '@/lib/ws/utils'

// Nastavení › Napojený web (S11). Tři cesty od nejjednodušší (plán):
// Claude Code s tajným klíčem, odkaz + QR, widget pro cizí weby.

export type LogItem = {
  id: string
  at: string
  channel: 'secret' | 'widget' | 'page' | 'check'
  origin: string | null
  status: number
  code: string | null
  isTest: boolean
}

const CHANNEL: Record<LogItem['channel'], string> = {
  secret: 'Váš web',
  widget: 'Widget',
  page: 'Objednávací stránka',
  check: 'Ověření z aplikace',
}

const RESULT: Record<string, string> = {
  VALIDATION_ERROR: 'Chybné údaje',
  SLOT_TAKEN: 'Obsazený čas',
  FORBIDDEN_ORIGIN: 'Nepovolená doména',
  IDEMPOTENCY_MISMATCH: 'Opakovaný klíč',
  IN_PROGRESS: 'Opakování',
  RATE_LIMITED: 'Moc poptávek',
  INVALID_BODY: 'Chybný formát',
  SERVER_ERROR: 'Chyba u nás',
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${what} zkopírovaný`)
  } catch {
    toast.error(`${what} se nepodařilo zkopírovat`, { description: 'Označte ho prosím a zkopírujte ručně.' })
  }
}

const when = (iso: string) => {
  const d = new Date(iso)
  return `${formatDayShort(pragueParts(d).date)} ${formatClock(d)}`
}

function Panel({ number, title, children, id }: { number: string; title: string; id: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5 rounded-panel border border-navy-100 bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-1.5">
        <SectionLabel number={number}>{title}</SectionLabel>
        <h2 id={id} className="sr-only">
          {title}
        </h2>
      </div>
      {children}
    </section>
  )
}

function CodeBox({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-chip bg-navy-50 px-3.5 py-3 font-num text-[13px] text-navy-900">
        {value}
      </code>
      <Button variant="outline" onClick={() => void copy(value, label)}>
        <Copy aria-hidden size={18} strokeWidth={1.5} />
        Zkopírovat
      </Button>
    </div>
  )
}

export function WebIntegration({
  slug,
  businessName,
  prompt,
  orderUrl,
  widgetCode,
  secretMask,
  keyConfigured,
  origins: initialOrigins,
  bookingMode,
  guideMailto,
  log,
  readOnly,
}: {
  slug: string
  businessName: string
  prompt: string
  orderUrl: string
  widgetCode: string
  secretMask: string | null
  keyConfigured: boolean
  origins: string[]
  bookingMode: 'slots' | 'free' | 'none'
  guideMailto: string
  log: LogItem[]
  readOnly: boolean
}) {
  const { run, pending } = useWsAction()
  const [secret, setSecret] = useState<string | null>(null)
  const [confirmRotate, setConfirmRotate] = useState(false)
  const [verified, setVerified] = useState<{ lastWeb: string | null } | null>(null)
  const [origins, setOrigins] = useState(initialOrigins)
  const [newOrigin, setNewOrigin] = useState('')
  const qrRef = useRef<HTMLDivElement>(null)

  const createSecret = () =>
    void run(() => rotateSecret({ slug }), (d) => {
      setSecret(d.key)
      setConfirmRotate(false)
    })

  const verify = () => void run(() => verifyIntegration({ slug }), (d) => setVerified(d))

  const save = (next: string[]) =>
    void run(() => saveOrigins({ slug, origins: next }), (d) => {
      setOrigins(d.origins)
      setNewOrigin('')
      toast.success('Uloženo')
    })

  function downloadQr(format: 'svg' | 'png') {
    const svg = qrRef.current?.querySelector('svg')
    if (!svg) return
    const source = new XMLSerializer().serializeToString(svg)
    const file = `objednavka-${slug}.${format}`
    const save = (blob: Blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    const svgBlob = new Blob([source], { type: 'image/svg+xml' })
    if (format === 'svg') return save(svgBlob)
    // PNG pro tisk: SVG nakreslené do plátna 1200 × 1200.
    const img = new Image()
    const url = URL.createObjectURL(svgBlob)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1200
      const c = canvas.getContext('2d')
      if (!c) return
      c.fillStyle = '#ffffff'
      c.fillRect(0, 0, 1200, 1200)
      c.drawImage(img, 0, 0, 1200, 1200)
      URL.revokeObjectURL(url)
      canvas.toBlob((b) => b && save(b), 'image/png')
    }
    img.src = url
  }

  return (
    <div className="flex flex-col gap-6">
      {readOnly && (
        <p className="rounded-box bg-navy-50 px-4 py-3 text-[15px] text-navy-900">
          Předplatné neběží, takže klíče a domény teď nejde měnit. Poptávky z webu se ukládají dál.
        </p>
      )}

      <Panel number="01" title="Web postavený v Claude Code" id="napojeni-claude">
        <p className="max-w-prose text-[15px] text-quiet">
          Zkopírujte prompt a vložte ho do Claude Code v projektu webu. Formulář pak posílá poptávky rovnou sem. Klíč
          vložte do Vercelu jako <span className="font-num text-ink">ZAKAZIQ_KEY</span>.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" onClick={() => void copy(prompt, 'Prompt')}>
            <Sparkles aria-hidden size={18} strokeWidth={1.5} />
            Zkopírovat prompt pro Claude Code
          </Button>
          <Button variant="outline" size="lg" onClick={verify} disabled={pending}>
            Ověřit napojení
          </Button>
        </div>

        {verified && (
          <m.div {...zqStamp} role="status" className="flex items-start gap-3 rounded-box bg-navy-50 px-4 py-3">
            <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-700 text-white">
              <Check aria-hidden size={16} strokeWidth={2} />
            </span>
            <p className="text-[15px] text-navy-900">
              Zkušební poptávka prošla.{' '}
              {verified.lastWeb
                ? `Z vašeho webu naposledy dorazila poptávka ${when(verified.lastWeb)}.`
                : 'Z vašeho webu zatím nic nedorazilo — pošlete zkušební formulář na webu a zkuste to znovu.'}
            </p>
          </m.div>
        )}

        <div className="flex flex-col gap-3 border-t border-navy-100 pt-5">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            <KeyRound aria-hidden size={18} strokeWidth={1.5} />
            Tajný klíč
          </p>
          {secret ? (
            <div className="flex flex-col gap-2 rounded-box border border-signal-line bg-signal-bg p-4">
              <p className="text-[15px] font-semibold text-signal-ink">Klíč uvidíte jen teď. Zkopírujte ho a vložte do Vercelu.</p>
              <CodeBox value={secret} label="Klíč" />
              <Button variant="ghost" className="self-start" onClick={() => setSecret(null)}>
                Mám ho uložený
              </Button>
            </div>
          ) : !keyConfigured ? (
            <p className="text-[15px] text-quiet">Tajné klíče teď nejde vytvořit. Napište nám prosím.</p>
          ) : secretMask ? (
            confirmRotate ? (
              <div className="flex flex-col gap-3 rounded-box bg-navy-50 p-4">
                <p className="text-[15px] text-navy-900">
                  Starý klíč přestane fungovat hned. Web s ním přestane posílat poptávky, dokud nevložíte nový.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="danger" onClick={createSecret} disabled={pending || readOnly}>
                    Vyměnit klíč
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmRotate(false)}>
                    Nechat
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-num text-[14px] text-ink">{secretMask}</span>
                <span className="text-[14px] text-quiet">je nastavený</span>
                <Button variant="outline" onClick={() => setConfirmRotate(true)} disabled={readOnly}>
                  Vyměnit klíč
                </Button>
              </div>
            )
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[15px] text-quiet">Tajný klíč zatím nemáte.</span>
              <Button variant="outline" onClick={createSecret} disabled={pending || readOnly}>
                Vytvořit tajný klíč
              </Button>
            </div>
          )}
        </div>
      </Panel>

      <Panel number="02" title="Odkaz a QR kód" id="napojeni-odkaz">
        <p className="max-w-prose text-[15px] text-quiet">
          Hotová stránka pro objednání. Dejte odkaz na web, do Instagramu nebo do Google profilu, QR kód na pult.
          {bookingMode === 'free' && ' Otevírací dobu zatím nemáte nastavenou, takže si zákazníci čas navrhnou sami.'}
        </p>
        <CodeBox value={orderUrl} label="Odkaz" />
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div ref={qrRef} className="rounded-box border border-navy-100 bg-white p-3">
            <QRCodeSVG value={orderUrl} size={152} level="M" includeMargin role="img" aria-label={`QR kód: objednávka ${businessName}`} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => downloadQr('png')}>
              <Download aria-hidden size={18} strokeWidth={1.5} />
              Stáhnout PNG
            </Button>
            <Button variant="outline" onClick={() => downloadQr('svg')}>
              <Download aria-hidden size={18} strokeWidth={1.5} />
              SVG pro tisk
            </Button>
            <a href={orderUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'ghost' })}>
              <ExternalLink aria-hidden size={18} strokeWidth={1.5} />
              Otevřít stránku
            </a>
          </div>
        </div>
      </Panel>

      <Panel number="03" title="Widget pro jiný web" id="napojeni-widget">
        <p className="max-w-prose text-[15px] text-quiet">
          Pro weby na WordPressu, Wixu nebo Shoptetu: vložte tenhle řádek tam, kde má být tlačítko. Pro formulář přímo ve
          stránce přidejte <span className="font-num text-ink">data-mode=&quot;inline&quot;</span>.
        </p>
        <CodeBox value={widgetCode} label="Kód" />

        <div className="flex flex-col gap-3">
          <p className="text-[15px] font-semibold">Povolené weby</p>
          <p className="-mt-2 text-[14px] text-quiet">Widget a vložená objednávací stránka fungují jen na těchto adresách.</p>
          {origins.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {origins.map((o) => (
                <li key={o} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-navy-50 pl-3.5 pr-1 font-num text-[13px] text-navy-900">
                  {o}
                  <button
                    type="button"
                    aria-label={`Odebrat ${o}`}
                    disabled={pending || readOnly}
                    onClick={() => save(origins.filter((x) => x !== o))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-navy-100"
                  >
                    <X aria-hidden size={16} strokeWidth={1.5} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-quiet">Zatím žádný. Bez povoleného webu widget poptávky neodešle.</p>
          )}
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault()
              if (newOrigin.trim()) save([...origins, newOrigin])
            }}
          >
            <Input
              value={newOrigin}
              onChange={(e) => setNewOrigin(e.target.value)}
              placeholder="https://vasweb.cz"
              aria-label="Adresa webu"
              inputMode="url"
              maxLength={200}
              disabled={readOnly}
            />
            <Button type="submit" variant="outline" disabled={pending || readOnly || !newOrigin.trim()}>
              <Plus aria-hidden size={18} strokeWidth={1.5} />
              Přidat web
            </Button>
          </form>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-navy-100 pt-5">
          <a href={guideMailto} className={buttonVariants({ variant: 'outline' })}>
            <Mail aria-hidden size={18} strokeWidth={1.5} />
            Poslat návod webáři
          </a>
          <Button
            variant="ghost"
            disabled={pending || readOnly}
            onClick={() =>
              void run(() => rotatePublic({ slug }), () =>
                toast.success('Klíč widgetu je nový', { description: 'Starý kód přestal fungovat, vložte na web nový.' }),
              )
            }
          >
            Vyměnit klíč widgetu
          </Button>
        </div>
      </Panel>

      <section aria-labelledby="napojeni-zaznam" className="flex flex-col gap-4 rounded-panel border border-navy-100 bg-surface p-5 sm:p-6">
        <SectionLabel>Poslední požadavky</SectionLabel>
        <h2 id="napojeni-zaznam" className="sr-only">
          Poslední požadavky
        </h2>
        {log.length === 0 ? (
          <p className="text-[15px] text-quiet">Zatím nic nepřišlo. Klikněte na Ověřit napojení nebo pošlete formulář na webu.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-navy-100">
            {log.map((r) => {
              const okRow = r.status < 300
              return (
                <li key={r.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[15px] text-ink">{CHANNEL[r.channel]}</span>
                    <span className="truncate font-num text-[12px] text-quiet">
                      {when(r.at)}
                      {r.origin && ` · ${r.origin}`}
                    </span>
                  </div>
                  <span
                    className={cn(
                      'inline-flex min-h-7 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold',
                      okRow ? 'bg-navy-100 text-navy-900' : 'bg-danger/10 text-danger',
                    )}
                  >
                    {okRow ? (r.isTest ? 'Zkouška prošla' : 'Přijato') : (RESULT[r.code ?? ''] ?? 'Odmítnuto')}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
