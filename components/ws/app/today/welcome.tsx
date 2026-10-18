'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Circle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ws/brand'
import { WS_FEATURES } from '@/lib/ws/features'
import { CopyOrderLinkButton } from '../copy-order-link'

/** První kroky nového byznysu; průběh se odvozuje od služeb, otevírací doby a objednávek. */
export function TodayWelcome({
  welcome,
  orderUrl,
  businessSlug,
  hasService,
  hasHours,
}: {
  welcome: boolean
  orderUrl: string
  businessSlug: string
  hasService: boolean
  hasHours: boolean
}) {
  const [dismissed, setDismissed] = useState(false)
  const [copied, setCopied] = useState(false)
  const key = `ws-start:${businessSlug}`

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(`${key}:dismissed`) === '1')
      setCopied(localStorage.getItem(`${key}:copied`) === '1')
    } catch {
      // Když prohlížeč úložiště zakáže, checklist zůstane dostupný jen do zavření stránky.
    }
  }, [key])

  if (!WS_FEATURES.orderLink) {
    return <EmptyState
      size="large"
      title={welcome ? 'Vítejte, všechno je připravené' : 'Zatím tu nic není'}
      description="Až přijde první poptávka nebo domluvíte termín, uvidíte ho tady. Odkaz na objednání pro zákazníky přidáme spolu s napojením webu."
    />
  }

  if (dismissed) return <EmptyState
    size="large"
    title={welcome ? 'Vítejte, všechno je připravené' : 'Zatím tu nic není'}
    description="Pošlete zákazníkům odkaz na objednání. Každá poptávka se pak objeví tady."
    action={<CopyOrderLinkButton url={orderUrl} variant="inverse" size="lg" />}
  />

  const dismiss = () => {
    setDismissed(true)
    try { localStorage.setItem(`${key}:dismissed`, '1') } catch { /* úložiště není dostupné */ }
  }
  const markCopied = () => {
    setCopied(true)
    try { localStorage.setItem(`${key}:copied`, '1') } catch { /* úložiště není dostupné */ }
  }
  const step = (done: boolean, title: string, content: React.ReactNode) => <li className="flex min-h-12 items-start gap-3 rounded-chip border border-navy-100 px-3 py-3" key={title}>
    <span className={done ? 'mt-0.5 text-navy-700' : 'mt-0.5 text-quiet'} aria-hidden>{done ? <Check size={18} /> : <Circle size={18} />}</span>
    <div className="min-w-0 flex-1"><p className="font-medium text-ink">{title}</p><div className="mt-1 text-sm text-quiet">{content}</div></div>
  </li>

  return <section aria-labelledby="zacnete" className="rounded-panel border border-navy-100 bg-surface p-5 sm:p-6">
    <div className="flex items-start justify-between gap-4">
      <div><h2 id="zacnete" className="text-[20px] font-semibold text-ink">{welcome ? 'Začněte' : 'První kroky'}</h2><p className="mt-1 max-w-2xl text-sm text-quiet">Připravte nabídku a pošlete zákazníkům odkaz. Po první poptávce tento seznam zmizí.</p></div>
      <Button variant="ghost" size="icon" aria-label="Skrýt první kroky" title="Skrýt první kroky" onClick={dismiss}><X aria-hidden size={18} /></Button>
    </div>
    <ol className="mt-4 flex flex-col gap-2">
      {step(hasService, 'Přidejte službu', hasService
        ? 'Nabídka je připravená.'
        : <Link className="font-semibold text-navy-700 underline-offset-4 hover:underline" href={`/w/${businessSlug}/nastaveni/nabidka#sluzby`}>Doplnit službu</Link>)}
      {step(hasHours, 'Nastavte otevírací dobu', hasHours
        ? 'Zákazníci uvidí dostupné časy.'
        : <Link className="font-semibold text-navy-700 underline-offset-4 hover:underline" href={`/w/${businessSlug}/nastaveni/nabidka#oteviraci-doba`}>Nastavit dobu</Link>)}
      {step(copied, 'Pošlete odkaz zákazníkům', <CopyOrderLinkButton url={orderUrl} size="md" variant="outline" label={copied ? 'Zkopírovat odkaz znovu' : 'Zkopírovat odkaz na objednání'} onCopied={markCopied} />)}
      {step(false, 'Počkejte na první poptávku', 'Jakmile zákazník odešle objednávku, objeví se tady.')}
    </ol>
  </section>
}
