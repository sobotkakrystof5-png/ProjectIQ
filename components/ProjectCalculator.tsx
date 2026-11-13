'use client'

import { useState } from 'react'
import { Plus, Trash2, Copy, Check, Calculator, Briefcase, Layers } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

type CalcType = 'client' | 'personal'

type Preset = {
  label: string
  items: { name: string; price: number }[]
}

// VIZEON ceník — zakázky pro klienty
const CLIENT_PRESETS: Preset[] = [
  {
    label: 'Online Vizitka',
    items: [
      { name: 'Online Vizitka (web)', price: 7499 },
    ],
  },
  {
    label: 'Promo Page',
    items: [
      { name: 'Promo Page (web)', price: 9999 },
    ],
  },
  {
    label: 'Pro Web',
    items: [
      { name: 'Pro Web (kompletní web)', price: 14999 },
    ],
  },
  {
    label: 'Slide Deck Standard',
    items: [
      { name: 'Slide Deck Standard (prezentace)', price: 1099 },
    ],
  },
  {
    label: 'Slide Deck Premium',
    items: [
      { name: 'Slide Deck Premium (prezentace)', price: 3499 },
    ],
  },
]

const CLIENT_ADDONS = [
  { name: 'Brand Logo', price: 699 },
  { name: 'Business Card (vizitka)', price: 299 },
  { name: 'Social Visual (1 ks)', price: 299 },
  { name: 'Social Visual (5 ks bundle)', price: 1299 },
  { name: 'Print Design', price: 699 },
  { name: 'Content Blueprint', price: 499 },
  { name: 'Web Care (1 měsíc)', price: 999 },
  { name: 'Social Starter (1 měsíc)', price: 4999 },
  { name: 'Social Pro (1 měsíc)', price: 7499 },
]

// Osobní projekty — aplikace, systémy, automatizace
const PERSONAL_PRESETS: Preset[] = [
  {
    label: 'Landing page',
    items: [
      { name: 'Design (vizuální styl + layout)', price: 5000 },
      { name: 'Vývoj — frontend', price: 8000 },
      { name: 'Nasazení + doména + hosting (1 rok)', price: 3000 },
    ],
  },
  {
    label: 'MVP Web App',
    items: [
      { name: 'Design (UI/UX)', price: 8000 },
      { name: 'Vývoj — frontend', price: 12000 },
      { name: 'Vývoj — backend + API', price: 15000 },
      { name: 'Databáze + migrace', price: 5000 },
      { name: 'Nasazení + infra (1 rok)', price: 5000 },
    ],
  },
  {
    label: 'Automatizace / n8n',
    items: [
      { name: 'Analýza procesu + návrh', price: 3000 },
      { name: 'n8n / Make workflow setup', price: 6000 },
      { name: 'API integrace třetích stran', price: 4000 },
      { name: 'Dokumentace + zaškolení', price: 2000 },
    ],
  },
  {
    label: 'SaaS produkt',
    items: [
      { name: 'Design (UI/UX + brand)', price: 15000 },
      { name: 'Vývoj — fullstack', price: 40000 },
      { name: 'Autentizace (OAuth, magic link)', price: 5000 },
      { name: 'Platební brána (integrace)', price: 6000 },
      { name: 'Infra + CI/CD + monitoring', price: 8000 },
    ],
  },
  {
    label: 'Interní systém',
    items: [
      { name: 'Analýza + architektura', price: 5000 },
      { name: 'Vývoj (fullstack)', price: 20000 },
      { name: 'Admin panel', price: 8000 },
      { name: 'Dokumentace', price: 2000 },
    ],
  },
]

const PERSONAL_ADDONS = [
  { name: 'Admin panel', price: 8000 },
  { name: 'API integrace třetí strany', price: 5000 },
  { name: 'Autentizace (OAuth, magic link)', price: 4000 },
  { name: 'Mobilní PWA verze', price: 6000 },
  { name: 'CI/CD pipeline', price: 3000 },
  { name: 'Monitoring + Alerting', price: 2500 },
  { name: 'Export (PDF/CSV/Excel)', price: 2000 },
  { name: 'Vícejazyčná verze', price: 4000 },
  { name: 'Databáze + migrace', price: 5000 },
]

type LineItem = {
  id: string
  name: string
  price: number
}

function fmt(n: number) {
  return n.toLocaleString('cs-CZ')
}

function CalcPanel({ presets, addons }: { presets: Preset[]; addons: { name: string; price: number }[] }) {
  const [items, setItems] = useState<LineItem[]>([])
  const [customName, setCustomName] = useState('')
  const [customPrice, setCustomPrice] = useState('')
  const [copied, setCopied] = useState(false)
  const [margin, setMargin] = useState(0)

  const total = items.reduce((s, i) => s + i.price, 0)
  const totalWithMargin = Math.round(total * (1 + margin / 100))

  const loadPreset = (preset: Preset) => {
    setItems(preset.items.map(i => ({ ...i, id: crypto.randomUUID() })))
  }

  const addAddon = (addon: { name: string; price: number }) => {
    if (items.some(i => i.name === addon.name)) return
    setItems(prev => [...prev, { ...addon, id: crypto.randomUUID() }])
  }

  const addCustom = () => {
    const name = customName.trim()
    const price = parseFloat(customPrice)
    if (!name || isNaN(price) || price <= 0) return
    setItems(prev => [...prev, { id: crypto.randomUUID(), name, price }])
    setCustomName('')
    setCustomPrice('')
  }

  const updatePrice = (id: string, value: string) => {
    const p = parseFloat(value)
    if (isNaN(p)) return
    setItems(prev => prev.map(i => i.id === id ? { ...i, price: p } : i))
  }

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const copyToClipboard = () => {
    const lines = [
      'KALKULACE PROJEKTU',
      '==================',
      ...items.map(i => `${i.name}: ${fmt(i.price)} Kč`),
      '==================',
      margin > 0
        ? `Mezisoučet: ${fmt(total)} Kč\nMarže ${margin}%: ${fmt(totalWithMargin - total)} Kč\nCelkem: ${fmt(totalWithMargin)} Kč`
        : `Celkem: ${fmt(total)} Kč`,
    ]
    navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-5">
      {/* Presets */}
      <div>
        <p className="text-xs font-semibold text-quiet uppercase tracking-wide mb-2">Rychlý start</p>
        <div className="flex flex-wrap gap-2">
          {presets.map(p => (
            <button
              key={p.label}
              onClick={() => loadPreset(p)}
              className="inline-flex min-h-11 items-center rounded-full border border-input bg-surface px-4 text-sm font-semibold transition-colors hover:border-navy-400 hover:bg-navy-50 hover:text-navy-700"
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setItems([])}
            className="inline-flex min-h-11 items-center rounded-full border border-input px-4 text-sm font-semibold text-quiet transition-colors hover:border-danger/30 hover:bg-danger/5 hover:text-danger"
          >
            Vyčistit
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: items list */}
        <div className="lg:col-span-2 space-y-4">
          <div className="border border-navy-100 rounded-chip overflow-hidden bg-surface shadow-sm">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-quiet">
                Vyber preset nebo přidej vlastní položky →
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-navy-100 bg-navy-50">
                    <th className="px-3 py-2 text-xs font-semibold text-quiet uppercase tracking-wide text-left">Položka</th>
                    <th className="px-3 py-2 text-xs font-semibold text-quiet uppercase tracking-wide text-right w-36">Cena (Kč)</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className="border-t border-navy-100 transition-colors hover:bg-navy-50/50">
                      <td className="px-3 py-2 text-sm text-ink">{item.name}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          className="w-28 text-sm text-right border border-navy-100 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-navy-500"
                          value={item.price}
                          onChange={e => updatePrice(item.id, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <button
                          onClick={() => removeItem(item.id)}
                          className="rounded-chip p-1 text-quiet/60 transition-colors hover:text-danger"
                        >
                          <Trash2 size={13} strokeWidth={1.5} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Custom item */}
          {/*
            `flex-wrap` a `min-w-0`: pole mají vlastní nejmenší šířku, takže
            se na telefonu nesmrskla a řádek přetékal stránku o 30 px.
          */}
          <div className="flex flex-wrap gap-2">
            <input
              className="min-w-0 flex-1 min-h-11 rounded-chip border border-input bg-surface px-3.5 text-[15px] text-ink transition-colors placeholder:text-quiet focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              placeholder="Vlastní položka…"
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustom()}
            />
            <input
              type="number"
              className="w-28 min-h-11 rounded-chip border border-input bg-surface px-3.5 text-[15px] text-ink transition-colors placeholder:text-quiet focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              placeholder="Cena Kč"
              value={customPrice}
              onChange={e => setCustomPrice(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustom()}
            />
            <button
              onClick={addCustom}
              disabled={!customName.trim() || !customPrice}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-navy-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={14} />
              Přidat
            </button>
          </div>

          {/* Add-ons */}
          <div>
            <p className="text-xs font-semibold text-quiet uppercase tracking-wide mb-2">Doplňkové položky</p>
            <div className="flex flex-wrap gap-2">
              {addons.map(a => {
                const added = items.some(i => i.name === a.name)
                return (
                  <button
                    key={a.name}
                    onClick={() => addAddon(a)}
                    disabled={added}
                    className={`text-xs px-2.5 py-1.5 rounded-chip border transition-colors ${
                      added
                        ? 'border-navy-200 bg-navy-50 text-navy-600 cursor-default'
                        : 'border-navy-100 bg-surface hover:border-navy-300 hover:bg-navy-50 hover:text-navy-700'
                    }`}
                  >
                    {added && <Check size={10} className="inline mr-1" />}
                    {a.name} · {fmt(a.price)} Kč
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right: summary */}
        <div>
          <div className="border border-navy-100 rounded-chip bg-surface shadow-sm p-4 space-y-3">
            <p className="text-xs font-semibold text-quiet uppercase tracking-wide">Shrnutí</p>

            <div className="space-y-1.5">
              {items.map(item => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-quiet truncate mr-2">{item.name}</span>
                  <span className="shrink-0 font-medium">{fmt(item.price)} Kč</span>
                </div>
              ))}
            </div>

            {items.length > 0 && (
              <>
                <div className="border-t border-navy-100 pt-3 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <label className="text-quiet">Marže / přirážka</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        max={200}
                        className="w-16 text-sm text-right border border-navy-100 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-navy-500"
                        value={margin}
                        onChange={e => setMargin(Number(e.target.value) || 0)}
                      />
                      <span className="text-sm text-quiet">%</span>
                    </div>
                  </div>

                  {margin > 0 && (
                    <div className="flex justify-between text-sm text-quiet">
                      <span>Mezisoučet</span>
                      <span>{fmt(total)} Kč</span>
                    </div>
                  )}

                  <div className="flex justify-between items-baseline">
                    <span className="font-semibold text-ink">Celkem</span>
                    <span className="text-xl font-bold text-navy-700">
                      {fmt(totalWithMargin)} Kč
                    </span>
                  </div>
                </div>

                <button
                  onClick={copyToClipboard}
                  className="w-full flex items-center justify-center gap-2 text-sm font-medium px-3 py-2 rounded-chip bg-navy-600 text-white hover:bg-navy-700 transition-colors"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Zkopírováno!' : 'Zkopírovat kalkulaci'}
                </button>
              </>
            )}

            {items.length === 0 && (
              <p className="text-sm text-quiet text-center py-4">
                Přidej položky pro výpočet
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ProjectCalculator() {
  const [tab, setTab] = useState<CalcType>('client')

  return (
    <div className="mt-10">
      <div className="flex items-center gap-2 mb-4">
        <Calculator size={18} strokeWidth={1.5} className="text-navy-600" />
        <h2 className="text-lg font-semibold text-ink">Kalkulačka projektu</h2>
      </div>
      <p className="text-sm text-quiet mb-5">
        Rychlý odhad ceny přímo při hovoru s klientem. Vyber typ projektu, načti preset a uprav položky.
      </p>

      {/* Tabs */}
      <div className="mb-6 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-navy-50 p-1">
        <button
          onClick={() => setTab('client')}
          className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors ${
            tab === 'client' ? 'bg-navy-700 text-white' : 'text-quiet hover:text-ink'
          }`}
        >
          <Briefcase size={14} strokeWidth={1.5} />
          Zakázky pro klienty
        </button>
        <button
          onClick={() => setTab('personal')}
          className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors ${
            tab === 'personal' ? 'bg-navy-700 text-white' : 'text-quiet hover:text-ink'
          }`}
        >
          <Layers size={14} strokeWidth={1.5} />
          Osobní projekty
        </button>
      </div>

      {tab === 'client' && (
        <div>
          <p className="text-xs text-quiet mb-4 flex items-center gap-1.5">
            <Badge>Ceník VIZEON</Badge>
            Ceny vycházejí z aktuálního ceníku vizeon.cz
          </p>
          <CalcPanel presets={CLIENT_PRESETS} addons={CLIENT_ADDONS} />
        </div>
      )}

      {tab === 'personal' && (
        <div>
          <p className="text-xs text-quiet mb-4 flex items-center gap-1.5">
            <Badge>Osobní projekty</Badge>
            Aplikace, systémy, automatizace — orientační ceny
          </p>
          <CalcPanel presets={PERSONAL_PRESETS} addons={PERSONAL_ADDONS} />
        </div>
      )}
    </div>
  )
}
