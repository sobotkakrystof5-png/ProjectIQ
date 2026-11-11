'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/ui/toast'
import { ImagePlus, Sparkles, Trash2 } from 'lucide-react'
import { NewsEntry } from '@/components/ws/app/news-entry'
import { renderNewsEmail } from '@/lib/ws/email/news-email'
import { NEWS_LIMITS, NEWS_STYLE_GUIDE, NEWS_TAG_LABELS, NEWS_TAGS, newsTextHints, type NewsTag } from '@/lib/ws/news-format'
import { cn } from '@/lib/utils'
import { saveNewsAction } from './actions'
import '@/app/ws-tokens.css'

const INPUT = 'w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500'
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
// V náhledu e-mailu se obrázek ještě nemusí dát stáhnout z webu — adresu pak
// nahradí data: z prohlížeče (jen v iframe náhledu, nikdy v odeslaném e-mailu).
const PREVIEW_IMAGE = 'https://nahled.invalid/obrazek'

export type EditorNews = {
  id: string
  title: string
  body: string
  link: string | null
  tag: NewsTag
  imageDataUrl: string | null
}

type ImageState = { action: 'keep' | 'remove'; preview: string | null } | { action: 'set'; preview: string; base64: string }

/**
 * Editor novinky (S17): nadpis, text, obrázek, odkaz, štítek a náhled tak, jak
 * ji uvidí klient ve zvonku „Co je nového“ i v e-mailu. „Učesat text“ je jen
 * návod a tipy podle pravidel humanize-text-cs (R-052), žádné AI.
 */
export function NewsEditor({ news, fontClassName }: { news: EditorNews | null; fontClassName: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [title, setTitle] = useState(news?.title ?? '')
  const [body, setBody] = useState(news?.body ?? '')
  const [link, setLink] = useState(news?.link ?? '')
  const [tag, setTag] = useState<NewsTag>(news?.tag ?? 'new')
  const [image, setImage] = useState<ImageState>({ action: 'keep', preview: news?.imageDataUrl ?? null })
  const [tab, setTab] = useState<'app' | 'email'>('app')
  const [guide, setGuide] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hints = useMemo(() => newsTextHints(title, body), [title, body])
  const safeLink = /^https:\/\/\S+$/.test(link.trim()) ? link.trim() : null

  const emailHtml = useMemo(() => {
    const html = renderNewsEmail(
      { title: title || 'Nadpis novinky', body: body || 'Krátký text novinky.', tag, link: safeLink, imageUrl: image.preview ? PREVIEW_IMAGE : null },
      'https://www.zakaziq.cz/z/odhlasit/nahled',
    ).html
    return image.preview ? html.split(PREVIEW_IMAGE).join(image.preview) : html
  }, [title, body, tag, safeLink, image.preview])

  const onFile = (file: File | undefined) => {
    if (!file) return
    if (!IMAGE_TYPES.includes(file.type)) return toast.error('Obrázek musí být PNG, JPEG nebo WebP.')
    if (file.size > NEWS_LIMITS.imageBytes) return toast.error('Obrázek je větší než 600 kB. Zmenši ho prosím.')
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      setImage({ action: 'set', preview: url, base64: url.replace(/^data:[^;]+;base64,/, '') })
    }
    reader.readAsDataURL(file)
  }

  const save = () => {
    setError(null)
    start(async () => {
      const res = await saveNewsAction({
        id: news?.id ?? null,
        title,
        body,
        link,
        tag,
        image: image.action === 'set' ? { action: 'set', base64: image.base64 } : { action: image.action },
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      toast.success(news ? 'Novinka uložená.' : 'Koncept uložený. Teď ji můžeš zveřejnit.')
      router.push('/dashboard/novinky')
      router.refresh()
    })
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6 items-start">
      <div className="bg-white border border-border rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Štítek">
          {NEWS_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tag === t}
              onClick={() => setTag(t)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-full border transition-colors',
                tag === t ? 'bg-navy-800 text-white border-navy-800' : 'bg-white text-muted-foreground border-border hover:bg-muted',
              )}
            >
              {NEWS_TAG_LABELS[t]}
            </button>
          ))}
        </div>

        <label className="block space-y-1">
          <span className="flex justify-between text-[12px] font-medium text-muted-foreground">
            Nadpis <span className="tabular-nums">{title.length} / {NEWS_LIMITS.title}</span>
          </span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={NEWS_LIMITS.title} className={INPUT} />
        </label>

        <label className="block space-y-1">
          <span className="flex justify-between text-[12px] font-medium text-muted-foreground">
            Krátký text <span className="tabular-nums">{body.length} / {NEWS_LIMITS.body}</span>
          </span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={NEWS_LIMITS.body} rows={6} className={INPUT} />
        </label>

        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-muted-foreground">Odkaz (nepovinný, https://)</span>
          <input value={link} onChange={(e) => setLink(e.target.value)} maxLength={NEWS_LIMITS.link} placeholder="https://www.zakaziq.cz/…" className={INPUT} />
        </label>

        <div className="space-y-1">
          <span className="text-[12px] font-medium text-muted-foreground">Obrázek (nepovinný, PNG/JPEG/WebP do 600 kB)</span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-border rounded-lg bg-white hover:bg-muted cursor-pointer">
              <ImagePlus size={14} strokeWidth={1.5} />
              {image.preview ? 'Vyměnit obrázek' : 'Nahrát obrázek'}
              <input type="file" accept={IMAGE_TYPES.join(',')} className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {image.preview && (
              <button
                type="button"
                onClick={() => setImage({ action: 'remove', preview: null })}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-red-700"
              >
                <Trash2 size={14} strokeWidth={1.5} />
                Odebrat
              </button>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
          <button type="button" onClick={() => setGuide((g) => !g)} className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-800">
            <Sparkles size={14} strokeWidth={1.5} />
            Učesat text
            {hints.length > 0 && (
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200">{hints.length}</span>
            )}
          </button>
          {(guide || hints.length > 0) && (
            <ul className="space-y-1 text-[13px] text-foreground">
              {hints.map((h) => (
                <li key={h.id} className="text-amber-800">• {h.message}</li>
              ))}
              {guide && NEWS_STYLE_GUIDE.map((g) => <li key={g} className="text-muted-foreground">• {g}</li>)}
            </ul>
          )}
        </div>

        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          {news && (
            <button type="button" onClick={() => router.push('/dashboard/novinky')} className="px-3 py-2 text-sm text-muted-foreground hover:underline">
              Zrušit úpravy
            </button>
          )}
          <button type="button" onClick={save} disabled={pending} className="px-4 py-2 text-sm font-medium brand-gradient text-white rounded-lg hover:opacity-90 disabled:opacity-60">
            {pending ? 'Ukládám…' : news ? 'Uložit změny' : 'Uložit koncept'}
          </button>
        </div>
      </div>

      <div className="space-y-3 lg:sticky lg:top-20">
        <div className="flex gap-1.5" role="tablist" aria-label="Náhled">
          {(['app', 'email'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn('px-3 py-1.5 text-sm rounded-lg', tab === t ? 'bg-white border border-border font-medium' : 'text-muted-foreground hover:bg-muted')}
            >
              {t === 'app' ? 'V aplikaci' : 'V e-mailu'}
            </button>
          ))}
        </div>
        {tab === 'app' ? (
          <div data-app="ws" data-theme="light" className={cn(fontClassName, 'rounded-2xl bg-ground p-6 flex justify-center')}>
            <div className="w-[min(360px,100%)] rounded-box border border-navy-100 bg-surface p-2 shadow-sm">
              <p className="px-2 pb-1 pt-1.5 font-num text-[11px] uppercase tracking-[0.08em] text-quiet">Co je nového</p>
              <NewsEntry
                item={{ title: title || 'Nadpis novinky', body: body || 'Krátký text novinky.', link: safeLink, tag, image: image.preview, at: 'dnes' }}
              />
            </div>
          </div>
        ) : (
          <iframe title="Náhled e-mailu s novinkou" sandbox="" srcDoc={emailHtml} className="h-[620px] w-full rounded-2xl border border-border bg-white" />
        )}
      </div>
    </div>
  )
}
