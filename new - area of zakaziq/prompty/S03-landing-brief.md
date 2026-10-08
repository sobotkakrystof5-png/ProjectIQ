# S03 — Brief landing page (web-project-brief)

## Cíl
Pomocí skillu **`web-project-brief`** vznikne `docs/landing/PROJECT-BRIEF.md` pro landing page
ZakazIQ. Žádný kód. Brief je zadání pro S04 a S05.

## Než začneš
Rituál začátku (`zakaziq-memory`). Načti `web-project-brief` (včetně šablon v `assets/`),
`zakaziq-design-dilky` a `zakaziq-ux-texty-cs`. Přečti `docs/workspace/PLAN.md` sekce
Landing page, Jednoduchost a napojení webu, E-maily, Design systém Dílky.

## Vstupy pro brief (nevymýšlej nic navíc)
- **Klient:** vlastní produkt ZakazIQ (Kryštof Sobotka, VIZEON, ALTENO). Tón: přímý, první
  osoba zakladatele, bez superlativů. Fakta, která chybí (IČO, počty, citace), = `[DOPLNIT]`.
- **Struktura:** landing page (scroll + kotvy) v `app/(marketing)/page.tsx`, žádný vícestránkový web.
  Navíc samostatné stránky: `/cenik` (může být kotva), `/podminky`, `/ochrana-udaju`,
  `/zpracovatelska-smlouva` (texty `[DOPLNIT]`).
- **Stack:** stejné repo, Next.js 14 App Router, Tailwind + tokeny Dílky, Framer Motion.
  Statické generování, žádné API klíče v klientu.
- **Vizuál:** závazný mockup **LP-D** (skill `zakaziq-design-dilky`). Sekce 0 briefu
  (anti-AI-šablona) vyplň konkrétně: motiv dílků z loga, pole pulzujících dílků, živá ukázka
  aplikace, věrnostní karta, žádná modrobílá šablona, žádné ikonové trojice.
  `{{DOMAIN_VISUAL_INSPIRATION}}` = dílky 2×2 z loga jako skládání byznysu „po dílcích".
- **Sekce (pořadí z LP-D):** hlavička s logem a pilulkovou navigací · hero „Každá poptávka
  *na svém místě.*" s polem dílků a živou ukázkou (poptávky přicházejí, kalendář, věrnostní karta)
  · běžící pás oborů · 01 Co to umí (3 karty s animovanými ilustracemi) · 02 Jak to funguje
  (4 kroky s postupem) · 03 Moduly „Skládejte si to *po dílcích*" · 04 Napojení na web
  (3 cesty, terminálová karta) · 05 Ceník 249 Kč · 06 Dotazy · footer s výzvou a odkazem **Admin**
  → `/login`. Sekce „Kdo za tím stojí" se vynechává (R-023).
- **CTA:** „Začít za 249 Kč měsíčně" → `/w/registrace`; „Domluvit hovor" → kontaktní formulář,
  který založí poptávku v admin konzoli přes existující `/api/public/leads` (ověř tvar v kódu).
- **Animace:** podle `references/motion.md`; živá ukázka se zastaví mimo viewport a při
  `prefers-reduced-motion`.
- **SEO, metadata, OG obrázek, strukturovaná data:** jen zadání, provedení v S05.
- **Ceník:** DPH a zkušební doba podle `memory/memory.md` → Otevřené problémy; když nejsou rozhodnuté, zeptej se.

## Kroky
1. Zeptej se na to, co chybí a mění strukturu (DPH, zkušební doba, limity a sekce „Kdo za tím stojí" jsou rozhodnuté v R-018–R-020, R-023).
2. Vyplň šablonu skillu do `docs/landing/PROJECT-BRIEF.md`. CLAUDE.md šablonu skillu
   **nevytvářej jako nový soubor** — relevantní pravidla (sekce 5 „stav projektu") přidej
   do `memory/memory.md` → Aktuální stav a případně do `AGENTS.md`, kořenový `CLAUDE.md` nepřepisuj.
3. Texty sekcí napiš podle `zakaziq-ux-texty-cs` a nakonec je projdi `humanize-text-cs`.

## Hotovo, když
- `docs/landing/PROJECT-BRIEF.md` existuje, sekce 0 je konkrétní, struktura odpovídá LP-D,
  žádné vymyšlené údaje.
- Otevřené body jsou v `memory/memory.md` → Otevřené problémy.

## Konec sezení
`zakaziq-memory` → Konec sezení. Commit `docs/landing: brief`.
