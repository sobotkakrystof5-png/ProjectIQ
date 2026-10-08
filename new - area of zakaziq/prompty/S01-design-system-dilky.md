# S01 — Design systém Dílky v kódu

## Cíl
Tokeny, písma, základní komponenty a pohyb systému **Dílky** jsou v kódu, oddělené od admin
konzole, a dají se ukázat na jedné interní stránce `/w/_design`.

## Než začneš
Rituál začátku ze skillu `zakaziq-memory`. Načti skill `zakaziq-design-dilky` celý včetně
`references/` a skill `frontend-design`.

## Kroky
1. **Písma** přes `next/font/google`: Instrument Sans (400–700), Instrument Serif (italic),
   JetBrains Mono (400, 500) s proměnnými `--font-instrument-sans`, `--font-instrument-serif`,
   `--font-jetbrains-mono`. Načíst jen v layoutech Workspace a landing page, ne v kořenovém
   `app/layout.tsx` (admin má Inter).
2. **Tokeny**: `references/tokens.css` → `app/ws-tokens.css`, importovat jen v layoutech
   `app/(marketing)/layout.tsx` a `app/w/layout.tsx`. Kořen layoutu dostane `data-app="ws"`.
3. **Tailwind**: sloučit `references/tailwind-extend.ts` do `tailwind.config.ts`. Stávající
   `brand`, `card`, `muted`, rádiusy a `font-sans` se **nesmí změnit**. Ověř, že admin stránky
   vypadají stejně (porovnej screenshot `/dashboard` a `/login` před a po).
4. **shadcn/ui** do `components/ui/`: button, input, label, select, checkbox, switch, dialog,
   sheet, popover, dropdown-menu, tabs, tooltip, toast (sonner už je v repu), command (⌘K),
   calendar, badge, separator, skeleton. Upravit varianty podle Dílků: tlačítko jako pilulka,
   výška 44 px, primary `navy-700`, ghost, outline s okrajem `navy-100`.
5. **Komponenty Dílků** v `components/ws/brand/`:
   `Logo` (2×2 dílky, dva dýchají, prop `animated`), `TileField` (pole dílků do pozadí, čisté CSS),
   `TileGlyph` (malý znak 2×2), `SectionLabel` („01 — CO TO UMÍ"), `AccentHeading`
   (nadpis + serif kurzíva), `Money`, `TimeRange` (mono), `NewRequestBlock` (čárkovaný signal),
   `ConfirmedBlock`, `LoyaltyCard` (razítka, animace razítka), `EmptyState`, `LiveDot`.
6. **Pohyb**: keyframes z `references/motion.md`, Framer Motion preset `zqIn`
   (`lib/ws/motion.ts`), respektování `prefers-reduced-motion` (ověř v DevTools).
7. **Stránka `/w/_design`** (jen pro vývoj, v produkci 404): barvy, typografie, tlačítka,
   formuláře, všechny komponenty z bodu 5 ve světlém i tmavém režimu.
8. Rozhodnutí (např. jak je řešené oddělení tokenů) zapiš do `memory/memory.md` → Rozhodnutí.

## Hotovo, když
- `/w/_design` ukazuje celý systém a odpovídá mockupu LP-D (barvy, písmo, rádiusy, pohyb).
- Admin konzole vypadá na pixel stejně (`/login`, `/dashboard`, `/hub`).
- `npm run build` a `npm test` prochází, checklist `references/checklist.md` splněný.

## Konec sezení
`zakaziq-memory` → Konec sezení. Commit `ws/design: systém Dílky`.
