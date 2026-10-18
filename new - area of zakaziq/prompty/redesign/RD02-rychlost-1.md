# RD02 — Rychlost I: region, kola do databáze, streaming

## Cíl
Navigace v aplikaci je znatelně rychlejší. Kostra obrazovky se ukáže hned a data přijdou ve dvou kolech do DB místo čtyř až šesti.

## Než začneš
Rituál začátku (`zakaziq-memory`): `git status`, větev `ws/redesign-app`, `memory/index.md`, `memory/memory.md`, `memory/pravidla.md`.
Přečti `docs/workspace/REDESIGN-APP-PLAN.md` (sekce 2, F2, oddíl 9 „Naměřeno“ z RD00) a `AGENTS.md` B3. Skilly: `zakaziq-workspace-backend`.
Společná pravidla: `new - area of zakaziq/prompty/redesign/00-README.md`. Soubory: `lib/ws/db.ts`, `lib/ws/context.ts`, `app/w/[business]/layout.tsx`,
`app/w/layout.tsx`, `app/w/[business]/loading.tsx`, `lib/ws/today.ts`, `vercel.json`.
Potřebuje rozhodnutí D-6 (region). Bez něj se zeptej hned.

## Kroky
1. **Region.** Ověř skutečné nastavení projektu ve Vercelu (nástroje Vercel MCP přes `ToolSearch`, nebo se zeptej Kryštofa). Do `vercel.json` přidej `"regions": ["fra1"]` (Neon je v `eu-central-1`). **Nenasazuj**, projeví se až po deployi; napiš to do paměti.
2. **Méně kol do DB.** Dnes: Clerk `auth()` → `ws.account_by_clerk_org` → `requireBusiness` → layout (byznysy, funkce, upozornění, služby, novinky, billing) → stránka. Cíl nejvýš 2 kola na navigaci. Naplánuj: úzká `SECURITY DEFINER` funkce, která pro organizaci Clerku a slug vrátí účet + byznys (stejný vzor jako `account_by_clerk_org`, R-035; **migrace od 085, jen připravit**, na testovací větvi ji aplikuje Kryštof), a jeden `wsDb.batch` pro data layoutu. `requireWorkspace`/`requireBusiness` zůstanou veřejné rozhraní a dál `React.cache`.
3. **Bezpečnost.** Nová funkce nesmí vracet nic mimo účet dané organizace. Projdi `web-security-review`, přidej test oddělení účtů do `lib/ws/__tests__/` (cizí slug = 404, cizí organizace nic nevidí).
4. **Streaming.** `loading.tsx` pro každou hlavní obrazovku (Poptávky, Kalendář, Zákazníci, Zakázky, Peníze, Nastavení), `Suspense` kolem `DetailSlot`, karty zákazníka a těžkých bloků, aby panel nikdy neblokoval stránku. Skeletony ve tvaru skutečné obrazovky (komponenta `Skeleton`).
5. **Měření znovu** stejným postupem jako v RD00, výsledek vedle výchozích čísel v plánu (oddíl 9) a v paměti. Nepiš čísla, která jsi nenaměřil.

## Hotovo, když
- Navigace dělá nejvýš 2 kola do DB (ověřeno čítačem, který nezůstal v kódu).
- Každá hlavní obrazovka má `loading.tsx`, detail v panelu neblokuje stránku.
- Testy, `tsc`, `build:check` procházejí; číslo před a po je v plánu.

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav RD02 v plánu, migrace (aplikována: ne) v changelogu. Commit `ws/rychlost: méně kol do databáze, streaming`.
