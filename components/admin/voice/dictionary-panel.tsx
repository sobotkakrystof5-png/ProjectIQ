'use client'

import { useState, useTransition } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import { Card, CardHead } from '@/components/admin/card'
import {
  addVoiceRule,
  deleteVoiceRule,
  deleteVoiceTerm,
  restoreVoiceRule,
  restoreVoiceTerm,
  saveVoiceSnippet,
  saveVoiceTerm,
  setVoiceRuleActive,
} from '@/app/voice-actions'
import type { DictionarySnippet, DictionaryTerm, VoiceDictionary, VoiceRuleItem } from '@/lib/admin/voice/queries'

/**
 * Slovník ZakazIQ Voice (VO10): slova (správný tvar a jak ho přepis slyší),
 * zkratky, pravidla stylu pro čištění a blokované fráze. Vestavěnou frázi jde
 * jen vypnout. Smazání má Zpět v toastu.
 */

const splitHeard = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

const fieldLabel = 'mb-1 block text-sm font-medium text-ink'

function useAction() {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) =>
    start(async () => {
      setError(null)
      const res = await fn()
      if (!res.ok) setError(res.error ?? 'Něco se nepovedlo.')
      else done?.()
    })
  return { pending, error, run, start }
}

function TermForm({ term, onDone }: { term?: DictionaryTerm; onDone: () => void }) {
  const [value, setValue] = useState(term?.term ?? '')
  const [heard, setHeard] = useState(term?.heardAs.join(', ') ?? '')
  const { pending, error, run } = useAction()
  return (
    <form
      className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => saveVoiceTerm({ id: term?.id ?? null, term: value, heardAs: splitHeard(heard) }), () => {
          toast.success(term ? 'Slovo upraveno.' : 'Slovo přidáno.')
          onDone()
        })
      }}
    >
      <label className="text-sm">
        <span className={fieldLabel}>Slovo</span>
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="ZakazIQ" maxLength={80} className="h-11" />
      </label>
      <label className="text-sm">
        <span className={fieldLabel}>Jak to přepis slyší (oddělte čárkou)</span>
        <Input value={heard} onChange={(e) => setHeard(e.target.value)} placeholder="zakaz iq, zakáz ajkjů" maxLength={1300} className="h-11" />
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {term ? 'Uložit' : 'Přidat'}
        </Button>
        {term && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Zrušit
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-danger sm:col-span-3">{error}</p>}
    </form>
  )
}

function SnippetForm({ snippet, onDone }: { snippet?: DictionarySnippet; onDone: () => void }) {
  const [trigger, setTrigger] = useState(snippet?.trigger ?? '')
  const [expansion, setExpansion] = useState(snippet?.expansion ?? '')
  const { pending, error, run } = useAction()
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => saveVoiceSnippet({ id: snippet?.id ?? null, trigger, expansion }), () => {
          toast.success(snippet ? 'Zkratka upravena.' : 'Zkratka přidána.')
          onDone()
        })
      }}
    >
      <label className="text-sm">
        <span className={fieldLabel}>Když řeknete</span>
        <Input value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="můj podpis" maxLength={80} className="h-11" />
      </label>
      <label className="text-sm">
        <span className={fieldLabel}>Vloží se</span>
        <textarea
          value={expansion}
          onChange={(e) => setExpansion(e.target.value)}
          maxLength={2000}
          rows={3}
          className="w-full rounded-chip border border-input bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {snippet ? 'Uložit' : 'Přidat zkratku'}
        </Button>
        {snippet && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Zrušit
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  )
}

function Terms({ terms }: { terms: DictionaryTerm[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  const { pending, start } = useAction()
  const remove = (t: DictionaryTerm) =>
    start(async () => {
      const res = await deleteVoiceTerm(t.id)
      if (!res.ok) return void toast.error(res.error)
      toast.success(`${t.term} je pryč ze slovníku.`, {
        undo: () =>
          start(async () => {
            const back = await restoreVoiceTerm(res.snapshot)
            if (!back.ok) toast.error(back.error)
          }),
      })
    })
  return (
    <Card>
      <CardHead title="Slova" hint="Jak se píšou jména a pojmy. Přepis dostane nápovědu, čištění je opraví." />
      <TermForm onDone={() => undefined} key={terms.length} />
      {terms.length === 0 ? (
        <p className="mt-4 text-sm text-quiet">Zatím žádné slovo. Přidejte třeba jméno firmy nebo klienta.</p>
      ) : (
        <ul className="mt-4 divide-y divide-navy-100">
          {terms.map((t) =>
            editing === t.id ? (
              <li key={t.id} className="py-3">
                <TermForm term={t} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={t.id} className="flex min-h-[44px] flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="break-words font-medium text-ink">{t.term}</span>
                    {t.source === 'learned' && <Badge variant="neutral">Z oprav</Badge>}
                  </span>
                  <span className="block text-xs text-quiet">
                    {t.heardAs.length ? `Přepis píše: ${t.heardAs.join(', ')} · ` : ''}použito <span className="font-num">{t.uses}×</span>
                  </span>
                </span>
                <span className="flex shrink-0">
                  <Button type="button" variant="ghost" size="icon" aria-label={`Upravit ${t.term}`} onClick={() => setEditing(t.id)}>
                    <Pencil size={16} strokeWidth={1.5} aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Smazat ${t.term}`} onClick={() => remove(t)} disabled={pending}>
                    <Trash2 size={16} strokeWidth={1.5} aria-hidden="true" />
                  </Button>
                </span>
              </li>
            ),
          )}
        </ul>
      )}
    </Card>
  )
}

function Snippets({ snippets }: { snippets: DictionarySnippet[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const { pending, start } = useAction()
  const remove = (s: DictionarySnippet) =>
    start(async () => {
      const res = await deleteVoiceTerm(s.id)
      if (!res.ok) return void toast.error(res.error)
      toast.success(`Zkratka ${s.trigger} je pryč.`, {
        undo: () =>
          start(async () => {
            const back = await restoreVoiceTerm(res.snapshot)
            if (!back.ok) toast.error(back.error)
          }),
      })
    })
  return (
    <Card>
      <CardHead
        title="Zkratky"
        hint="Řeknete krátkou frázi a vloží se celý text, třeba podpis nebo adresa."
        action={
          !adding && (
            <Button type="button" variant="outline" onClick={() => setAdding(true)}>
              <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
              Přidat zkratku
            </Button>
          )
        }
      />
      {adding && (
        <div className="mb-4">
          <SnippetForm onDone={() => setAdding(false)} />
        </div>
      )}
      {snippets.length === 0 && !adding ? (
        <p className="text-sm text-quiet">Zatím žádná zkratka.</p>
      ) : (
        <ul className="divide-y divide-navy-100">
          {snippets.map((s) =>
            editing === s.id ? (
              <li key={s.id} className="py-3">
                <SnippetForm snippet={s} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={s.id} className="flex min-h-[44px] flex-wrap items-start justify-between gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{s.trigger}</span>
                  <span className="line-clamp-2 block whitespace-pre-wrap break-words text-xs text-quiet">{s.expansion}</span>
                </span>
                <span className="flex shrink-0">
                  <Button type="button" variant="ghost" size="icon" aria-label={`Upravit ${s.trigger}`} onClick={() => setEditing(s.id)}>
                    <Pencil size={16} strokeWidth={1.5} aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Smazat ${s.trigger}`} onClick={() => remove(s)} disabled={pending}>
                    <Trash2 size={16} strokeWidth={1.5} aria-hidden="true" />
                  </Button>
                </span>
              </li>
            ),
          )}
        </ul>
      )}
    </Card>
  )
}

const SOURCE_LABEL: Record<VoiceRuleItem['source'], string> = { builtin: 'Vestavěná', manual: 'Vaše', learned: 'Z oprav' }

function Rules({ kind, items }: { kind: 'rule' | 'blocklist'; items: VoiceRuleItem[] }) {
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'always' | 'alone'>('alone')
  const { pending, error, run, start } = useAction()
  const rule = kind === 'rule'

  const toggle = (r: VoiceRuleItem, active: boolean) =>
    start(async () => {
      const res = await setVoiceRuleActive(r.id, active)
      if (!res.ok) toast.error(res.error)
    })

  const remove = (r: VoiceRuleItem) =>
    start(async () => {
      const res = await deleteVoiceRule(r.id)
      if (!res.ok) return void toast.error(res.error)
      toast.success(rule ? 'Pravidlo je pryč.' : 'Fráze je pryč.', {
        undo: () =>
          start(async () => {
            const back = await restoreVoiceRule(res.snapshot)
            if (!back.ok) toast.error(back.error)
          }),
      })
    })

  return (
    <Card>
      <CardHead
        title={rule ? 'Pravidla stylu' : 'Blokované fráze'}
        hint={
          rule
            ? 'Jak má čištění upravit text, třeba „Čísla do deseti pište slovy“. Platí pro všechny diktáty.'
            : 'Věty, které si přepis vymýšlí na tichu. Vestavěné jde vypnout, ne smazat.'
        }
      />
      <form
        className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault()
          run(() => addVoiceRule({ kind, text, mode }), () => {
            setText('')
            toast.success(rule ? 'Pravidlo přidáno.' : 'Fráze přidána.')
          })
        }}
      >
        <label className="text-sm">
          <span className={fieldLabel}>{rule ? 'Nové pravidlo' : 'Nová fráze'}</span>
          <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} className="h-11" />
        </label>
        {!rule && (
          <label className="text-sm">
            <span className={fieldLabel}>Kdy vyhodit</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value === 'always' ? 'always' : 'alone')}
              className="h-11 w-full rounded-full border border-input bg-surface px-4 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="alone">Jen když je to celý diktát</option>
              <option value="always">Vždy</option>
            </select>
          </label>
        )}
        <Button type="submit" disabled={pending}>
          Přidat
        </Button>
        {error && <p className="text-sm text-danger sm:col-span-3">{error}</p>}
      </form>
      {items.length === 0 ? (
        <p className="text-sm text-quiet">{rule ? 'Zatím žádné pravidlo.' : 'Žádná fráze.'}</p>
      ) : (
        <ul className="divide-y divide-navy-100">
          {items.map((r) => (
            <li key={r.id} className="flex min-h-[44px] items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block break-words text-sm text-ink">{r.text}</span>
                <span className="block text-xs text-quiet">
                  {SOURCE_LABEL[r.source]}
                  {!rule && ` · ${r.mode === 'always' ? 'vždy' : 'jen jako celý diktát'}`}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <Switch
                  checked={r.active}
                  onCheckedChange={(v) => toggle(r, v)}
                  disabled={pending}
                  aria-label={`${r.active ? 'Vypnout' : 'Zapnout'}: ${r.text}`}
                  className="mx-3"
                />
                {r.source !== 'builtin' && (
                  <Button type="button" variant="ghost" size="icon" aria-label={`Smazat: ${r.text}`} onClick={() => remove(r)} disabled={pending}>
                    <Trash2 size={16} strokeWidth={1.5} aria-hidden="true" />
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function VoiceDictionaryPanel({ data }: { data: VoiceDictionary }) {
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-2 xl:items-start">
      <Terms terms={data.terms} />
      <Snippets snippets={data.snippets} />
      <Rules kind="rule" items={data.rules} />
      <Rules kind="blocklist" items={data.blocklist} />
    </div>
  )
}
