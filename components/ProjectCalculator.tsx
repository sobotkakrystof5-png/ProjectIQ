'use client'

import { useState } from 'react'
import { Plus, Trash2, Copy, Check, Calculator } from 'lucide-react'

type Preset = {
  label: string
  items: { name: string; price: number }[]
}

const PRESETS: Preset[] = [
  {
    label: 'Landing page',
    items: [
      { name: 'Design (vizuální styl + layout)', price: 5000 },
      { name: 'Vývoj – frontend', price: 8000 },
      { name: 'Nasazení + doména + hosting (1 rok)', price: 2000 },
    ],
  },
  {
    label: 'Firemní web',
    items: [
      { name: 'Design (vizuální styl + více sekcí)', price: 10000 },
      { name: 'Vývoj – frontend', price: 15000 },
      { name: 'CMS (správa obsahu)', price: 5000 },
      { name: 'SEO základní optimalizace', price: 3000 },
      { name: 'Nasazení + doména + hosting (1 rok)', price: 3000 },
    ],
  },
  {
    label: 'E-shop',
    items: [
      { name: 'Design (e-commerce UI)', price: 15000 },
      { name: 'Vývoj – frontend + backend', price: 35000 },
      { name: 'Platební brána (integrace)', price: 5000 },
      { name: 'Správa produktů / CMS', price: 5000 },
      { name: 'SEO základní optimalizace', price: 4000 },
      { name: 'Nasazení + hosting (1 rok)', price: 4000 },
    ],
  },
]

const ADDONS = [
  { name: 'Copywriting (texty na web)', price: 5000 },
  { name: 'Fotografování produktů / firmy', price: 4000 },
  { name: 'Google Analytics + Měření konverzí', price: 2000 },
  { name: 'SEO pokročilá optimalizace', price: 6000 },
  { name: 'Měsíční správa / maintenance', price: 2000 },
  { name: 'Propojení s ERP / API', price: 8000 },
  { name: 'Vícejazyčná verze (1 jazyk navíc)', price: 5000 },
]

type LineItem = {
  id: string
  name: string
  price: number
}

export default function ProjectCalculator() {
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
      ...items.map(i => `${i.name}: ${i.price.toLocaleString('cs-CZ')} Kč`),
      '==================',
      margin > 0
        ? `Mezisoučet: ${total.toLocaleString('cs-CZ')} Kč\nMarže ${margin}%: ${(totalWithMargin - total).toLocaleString('cs-CZ')} Kč\nCelkem: ${totalWithMargin.toLocaleString('cs-CZ')} Kč`
        : `Celkem: ${total.toLocaleString('cs-CZ')} Kč`,
    ]
    navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-10">
      <div className="flex items-center gap-2 mb-4">
        <Calculator size={18} strokeWidth={1.5} className="text-brand-600" />
        <h2 className="text-lg font-semibold text-foreground">Kalkulačka projektu</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Rychlý odhad ceny pro klienta přímo při hovoru. Vyber preset, uprav položky a zkopíruj výsledek.
      </p>

      {/* Presets */}
      <div className="mb-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Rychlý start</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
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
          {/* Line items */}
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

          {/* Add custom item */}
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
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Doplňkové služby</p>
            <div className="flex flex-wrap gap-2">
              {ADDONS.map(a => {
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
                    {a.name} · {a.price.toLocaleString('cs-CZ')} Kč
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right: summary */}
        <div className="space-y-4">
          <div className="border border-border rounded-xl bg-white shadow-sm p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Shrnutí</p>

            <div className="space-y-1.5">
              {items.map(item => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground truncate mr-2">{item.name}</span>
                  <span className="shrink-0 font-medium">{item.price.toLocaleString('cs-CZ')} Kč</span>
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
                      <span>{total.toLocaleString('cs-CZ')} Kč</span>
                    </div>
                  )}

                  <div className="flex justify-between items-baseline">
                    <span className="font-semibold text-foreground">Celkem</span>
                    <span className="text-xl font-bold text-brand-700">
                      {totalWithMargin.toLocaleString('cs-CZ')} Kč
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
