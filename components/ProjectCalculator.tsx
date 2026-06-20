'use client'

import { useState } from 'react'
import { Plus, Trash2, Copy, Check, Calculator, Briefcase, Layers } from 'lucide-react'

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
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Rychlý start</p>
        <div className="flex flex-wrap gap-2">
          {presets.map(p => (
            <button
              key={p.label}
              onClick={() => loadPreset(p)}
              className="text-sm px-3 py-1.5 rounded-lg border border-border bg-white hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 transition-colors font-medium"
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setItems([])}
            className="text-sm px-3 py-1.5 rounded-lg border border-border bg-white text-muted-foreground hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
          >
            Vyčistit
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: items list */}
        <div className="lg:col-span-2 space-y-4">
          <div className="border border-border rounded-xl overflow-hidden bg-white shadow-sm">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Vyber preset nebo přidej vlastní položky →
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-border">
                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">Položka</th>
                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right w-36">Cena (Kč)</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className="border-t border-border hover:bg-slate-50/60 transition-colors">
                      <td className="px-3 py-2 text-sm text-foreground">{item.name}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          className="w-28 text-sm text-right border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500"
                          value={item.price}
                          onChange={e => updatePrice(item.id, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-1 rounded text-muted-foreground/50 hover:text-red-500 transition-colors"
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
          <div className="flex gap-2">
            <input
              className="flex-1 text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Vlastní položka…"
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustom()}
            />
            <input
              type="number"
              className="w-28 text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Cena Kč"
              value={customPrice}
              onChange={e => setCustomPrice(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustom()}
            />
            <button
              onClick={addCustom}
              disabled={!customName.trim() || !customPrice}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Plus size={14} />
              Přidat
            </button>
          </div>

          {/* Add-ons */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Doplňkové položky</p>
            <div className="flex flex-wrap gap-2">
              {addons.map(a => {
                const added = items.some(i => i.name === a.name)
                return (
                  <button
                    key={a.name}
                    onClick={() => addAddon(a)}
                    disabled={added}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                      added
                        ? 'border-brand-200 bg-brand-50 text-brand-600 cursor-default'
                        : 'border-border bg-white hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700'
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
          <div className="border border-border rounded-xl bg-white shadow-sm p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Shrnutí</p>

            <div className="space-y-1.5">
              {items.map(item => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground truncate mr-2">{item.name}</span>
                  <span className="shrink-0 font-medium">{fmt(item.price)} Kč</span>
                </div>
              ))}
            </div>

            {items.length > 0 && (
              <>
                <div className="border-t border-border pt-3 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <label className="text-muted-foreground">Marže / přirážka</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        max={200}
                        className="w-16 text-sm text-right border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500"
                        value={margin}
                        onChange={e => setMargin(Number(e.target.value) || 0)}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>

                  {margin > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Mezisoučet</span>
                      <span>{fmt(total)} Kč</span>
                    </div>
                  )}

                  <div className="flex justify-between items-baseline">
                    <span className="font-semibold text-foreground">Celkem</span>
                    <span className="text-xl font-bold text-brand-700">
                      {fmt(totalWithMargin)} Kč
                    </span>
                  </div>
                </div>

                <button
                  onClick={copyToClipboard}
                  className="w-full flex items-center justify-center gap-2 text-sm font-medium px-3 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Zkopírováno!' : 'Zkopírovat kalkulaci'}
                </button>
              </>
            )}

            {items.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
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
        <Calculator size={18} strokeWidth={1.5} className="text-brand-600" />
        <h2 className="text-lg font-semibold text-foreground">Kalkulačka projektu</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Rychlý odhad ceny přímo při hovoru s klientem. Vyber typ projektu, načti preset a uprav položky.
      </p>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit mb-6">
        <button
          onClick={() => setTab('client')}
          className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-all ${
            tab === 'client'
              ? 'bg-white text-brand-800 shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Briefcase size={14} strokeWidth={1.5} />
          Zakázky pro klienty
        </button>
        <button
          onClick={() => setTab('personal')}
          className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-all ${
            tab === 'personal'
              ? 'bg-white text-brand-800 shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Layers size={14} strokeWidth={1.5} />
          Osobní projekty
        </button>
      </div>

      {tab === 'client' && (
        <div>
          <p className="text-xs text-muted-foreground mb-4 flex items-center gap-1.5">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700 ring-1 ring-sky-200">Ceník VIZEON</span>
            Ceny vycházejí z aktuálního ceníku vizeon.cz
          </p>
          <CalcPanel presets={CLIENT_PRESETS} addons={CLIENT_ADDONS} />
        </div>
      )}

      {tab === 'personal' && (
        <div>
          <p className="text-xs text-muted-foreground mb-4 flex items-center gap-1.5">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700 ring-1 ring-violet-200">Osobní projekty</span>
            Aplikace, systémy, automatizace — orientační ceny
          </p>
          <CalcPanel presets={PERSONAL_PRESETS} addons={PERSONAL_ADDONS} />
        </div>
      )}
    </div>
  )
}
