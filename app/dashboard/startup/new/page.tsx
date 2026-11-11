'use client'

import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { createStartupProject } from '../startup-actions'
import { STARTUP_SEGMENTS } from '@/lib/types'

export default function NewStartupPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [segment, setSegment] = useState('')
  const [customSegment, setCustomSegment] = useState('')
  const [problem, setProblem] = useState('')
  const [monetization, setMonetization] = useState(false)
  const [pending, setPending] = useState(false)

  const isCustomSegment = segment === '__custom__'
  const effectiveSegment = isCustomSegment ? customSegment : segment

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { toast.error('Název projektu je povinný'); return }
    if (!effectiveSegment.trim()) { toast.error('Vyber nebo zadej segment'); return }
    if (!problem.trim()) { toast.error('Popiš problém, který projekt řeší'); return }

    setPending(true)
    const result = await createStartupProject({
      name: name.trim(),
      segment: effectiveSegment.trim(),
      problem: problem.trim(),
      monetization,
    })
    setPending(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      router.push(`/dashboard/startup/${result.id}`)
    }
  }

  return (
    <PageShell width="narrow">
      <div>
        <Link
          href="/dashboard/startup"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-quiet transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
          Zpět na projekty
        </Link>
        <PageHeader title="Nový startup projekt" subtitle="Vyplňte základní informace. Zbytek doplníte v editoru." subtitleFont="sans" className="mt-4" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-panel border border-navy-100 bg-surface p-6">
        {/* Název */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Název projektu <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="např. TaskFlow AI"
            className="w-full px-3.5 py-2.5 text-sm border border-border rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-navy-500/30 focus:border-navy-500 transition-colors"
            autoFocus
          />
        </div>

        {/* Segment */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Segment / Kategorie <span className="text-red-500">*</span>
          </label>
          <select
            value={segment}
            onChange={e => setSegment(e.target.value)}
            className="w-full px-3.5 py-2.5 text-sm border border-border rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-navy-500/30 focus:border-navy-500 transition-colors"
          >
            <option value="">— Vyber kategorii —</option>
            {STARTUP_SEGMENTS.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
            <option value="__custom__">Vlastní...</option>
          </select>
          {isCustomSegment && (
            <input
              type="text"
              value={customSegment}
              onChange={e => setCustomSegment(e.target.value)}
              placeholder="Zadej vlastní kategorii"
              className="mt-2 w-full px-3.5 py-2.5 text-sm border border-border rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-navy-500/30 focus:border-navy-500 transition-colors"
              autoFocus
            />
          )}
        </div>

        {/* Problém */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Problém, který projekt řeší <span className="text-red-500">*</span>
          </label>
          <textarea
            value={problem}
            onChange={e => setProblem(e.target.value)}
            rows={4}
            placeholder="Popiš konkrétní problém nebo potřebu, na kterou projekt reaguje…"
            className="w-full px-3.5 py-2.5 text-sm border border-border rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-navy-500/30 focus:border-navy-500 transition-colors resize-none"
          />
        </div>

        {/* Monetizace */}
        <div className="flex items-center justify-between py-2 px-3.5 bg-muted/40 rounded-xl">
          <div>
            <p className="text-sm font-medium text-foreground">Monetizace</p>
            <p className="text-xs text-muted-foreground mt-0.5">Plánuješ z projektu vydělávat?</p>
          </div>
          <button
            type="button"
            onClick={() => setMonetization(v => !v)}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              monetization ? 'bg-navy-600' : 'bg-muted-foreground/20'
            }`}
          >
            <span
              className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                monetization ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/dashboard/startup"
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Zrušit
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-navy-600 text-white text-sm font-medium rounded-xl hover:bg-navy-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {pending && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />}
            {pending ? 'Vytváří se…' : 'Vytvořit projekt'}
          </button>
        </div>
      </form>
    </PageShell>
  )
}
