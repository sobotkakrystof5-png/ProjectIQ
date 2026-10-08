# S05 — Landing page: SEO a texty

## Cíl
Landing page je dohledatelná a texty zní lidsky. Kompletní SEO podle mého SEO skillu,
texty projité `humanize-text-cs`.

## Než začneš
Rituál začátku. Načti **`seo`** + **`seo-quality-principles`** (klíčová slova případně přes `seo-collabim-keyword-loop`, R-022), `humanize-text-cs`
(+ `references/patterns.md`) a `zakaziq-ux-texty-cs`.

## Kroky
1. **SEO podle skillu** pro Next.js App Router: `metadata` a `generateMetadata`, kanonické URL,
   `robots.ts`, `sitemap.ts` (jen veřejné stránky; `/w`, `/r`, `/z`, `/embed`, `/api`, admin
   cesty vyloučit a dát `noindex`), Open Graph + Twitter, OG obrázek přes `opengraph-image.tsx`
   ve stylu Dílků (logo, nadpis, dílky), favicony z loga.
2. **Strukturovaná data** (JSON-LD): `SoftwareApplication` (cena 249 CZK měsíčně, kategorie
   BusinessApplication), `Organization`, `FAQPage` z FAQ sekce. Bez vymyšlených hodnocení.
3. **Klíčová slova a obsah:** podle skillu navrhni cílová slova (např. rezervační systém pro
   kadeřnictví, evidence poptávek, věrnostní karta online…) a zapracuj je přirozeně do nadpisů
   a textů. Žádné nacpané odstavce. Zvaž oborové podstránky (`/pro/kadernictvi` …) — **navrhni,
   nestav**; rozhodnutí do `memory/memory.md` → Otevřené problémy.
4. **Texty:** projdi všechny texty landing page `humanize-text-cs` (pomlčky jako spojky,
   trojice, fráze, rytmus). Fakta, čísla a ceny neměň. Shrň mi hlavní změny.
5. **Technické SEO:** `lang="cs"`, nadpisová hierarchie (jeden H1), alt texty, výkon (obrázky
   `next/image`, žádný layout shift z animací), přístupné odkazy.
6. Výsledek ověř nástroji skillu (nebo Lighthouse SEO = 100) a zapiš do changelogu v `memory/memory.md`.

## Hotovo, když
- Metadata, sitemap, robots, OG obrázek a JSON-LD fungují (ověřeno).
- Texty prošly humanize, žádné vymyšlené údaje.
- Neveřejné cesty mají `noindex` a nejsou v sitemapě.

## Konec sezení
`zakaziq-memory` → Konec sezení. Commit `marketing: seo a texty`.
