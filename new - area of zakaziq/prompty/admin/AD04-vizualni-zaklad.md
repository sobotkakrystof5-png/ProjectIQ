# AD04 — Vizuální základ: tokeny, písmo, CSP, portály, `brand` → `navy`

## Cíl
Dílky jsou výchozí vzhled admin konzole a hotové komponenty `components/ui/*` v ní fungují.

## Než začneš
Rituál začátku (`zakaziq-memory`). Přečti `docs/admin/MODERNIZACE-ADMIN-PLAN.md` **sekci 4 celou**
(a–h, je to hlavní technická část), `DESIGN.md`, `.claude/security/STATE.md` a `CSP-LOG.md`.
Skilly: `zakaziq-design-dilky`, `web-security-memory`.
Soubory: `app/globals.css`, `app/ws-tokens.css`, `app/admin-tokens.css`, `app/layout.tsx`,
`components/admin/admin-shell.tsx`, `components/ws/ws-root.tsx`, `components/ui/{portal,toast}.tsx`,
`lib/ws/fonts.ts`, `lib/ws/tailwind-dilky.ts`, `lib/security/csp.ts`.

**Past, kterou musíš vyřešit první:** `brand-*` je literální hex, `navy-*` se kompiluje na
`rgb(var(--navy-700) / <alpha>)` a proměnné jsou dnes jen v `[data-app="ws"]` a `[data-app="admin"]`.
`/p/[token]`, `/h/[token]` a `/login` `data-app` nemají a portál importuje `StatusBadge`,
`FeedbackBlock`, `SurveyForm`, `BookingCTA`, `ClientRequestBlock`. Přejmenování před krokem 1
rozbije barvy klientům v portálu.

## Kroky (čtyři oddělené commity, v tomto pořadí)
1. **Paleta do `:root`.** Nový `app/tokens-dilky.css` se všemi tokeny Dílků na `:root`, importovaný
   z `app/globals.css`; `ws-tokens.css` a `admin-tokens.css` přestanou hodnoty duplikovat a nechají si
   jen přepisy (tmavý režim Workspace **beze změny**). Nový test
   `lib/__tests__/palette-equality.test.ts`: `colors.brand` z `tailwind.config.ts` === hodnoty
   `--navy-*` pro všech 11 odstínů. Commit.
2. **Písmo a CSP.** Smaž `@import` Google Fonts a `font-feature-settings` Interu z `app/globals.css`,
   `body` dostane `var(--font-instrument-sans)`, `wsFontVariables` přesuň na `<html>` v `app/layout.tsx`
   (+ test, že tam třída je). Do `[data-app="admin"]` dopiš shadcn proměnné a `--radius: 12px`
   podle `ws-tokens.css:38-66` (bez tmavého režimu). Z `lib/security/csp.ts` vyhoď
   `fonts.googleapis.com` a `fonts.gstatic.com` z profilu `admin` — je to **zúžení** politiky.
   Zápis do `CSP-LOG.md`, `STATE.md` a `AUDIT-LOG.md`, pak `node scripts/sync-agent-context.mjs --write` a `--check`.
   `* { @apply border-border }` **nech** a doplň komentář proč. Commit.
3. **Portály a toast.** Nový `components/admin/admin-root.tsx` podle `components/ws/ws-root.tsx`
   (ref → `PortalContainerProvider`), `AdminShell` ho obalí. `components/ui/toast.tsx` dostane
   `currentApp: 'ws' | 'admin'` + `setToastApp()`; pak ve 22 admin souborech `from 'sonner'`
   → `from '@/components/ui/toast'`. `cn()` **nesjednocuj** (zapiš jako záměr do `AGENTS-ADMIN.md`). Commit.
4. **Přejmenování.** Codemod s hranicí tokenu
   `(bg|text|border|ring|from|via|to|divide|placeholder|decoration|outline|accent|caret|fill|stroke|shadow)-brand-(\d{2,3})\b`
   přes `git grep`, po souborech, `git diff --stat` ke čtení. `.brand-gradient` přepiš na gradient
   z `var(--navy-*)` a označ jako dočasný alias (maže se v AD18). Nový
   `components/admin/__tests__/admin-classes.test.ts` se stropy pro `muted-foreground` (1057),
   `rounded-xl|2xl|lg` (710), `brand-` (0 mimo gradient), `border-border` (536), duhové (477),
   `bg-white` (302) — strop se bude po sezeních snižovat. Commit.
5. **Přepiš zápisy, které to zakazují:** `DESIGN.md:253`, obě výjimky `inter` v `.impeccable/config.json`,
   a ověř, že R-081 je v paměti (zapsáno 2026-11-10).

## Hotovo, když
- `git grep 'brand-' -- '*.tsx' '*.ts' '*.css'` vrací jen `brand-gradient`.
- `git grep -i inter` nenajde Inter; testy rovnosti palety a `admin-classes` procházejí.
- CSP profilu admin nemá `fonts.*` a konzole nehlásí blokaci na `/dashboard`, `/login` i `/p/[token]`.
- ⌘K, zvonek, menu a toasty fungují na 390 / 768 / 1280 / 1440 px.
- **`/w` a `/` jsou nezměněné** — porovnané screenshoty i zkompilované CSS.

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav AD04 v plánu, nové stropy do sekce 11, bezpečnostní zápisy
hotové. Commity česky `admin/vzhled: …`.
