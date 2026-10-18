# RD03 — Rychlost II: dotazy, indexy, klient

## Cíl
Těžké obrazovky (Dnes, Kalendář, Peníze, Zákazníci) se načítají rychle i s tisíci záznamy a klient nedělá zbytečnou práci.

## Než začneš
Rituál začátku (`zakaziq-memory`): `git status`, větev `ws/redesign-app`, `memory/index.md`, `memory/memory.md`, `memory/pravidla.md`.
Přečti `docs/workspace/REDESIGN-APP-PLAN.md` (F2, oddíl 9 „Naměřeno“) a `AGENTS.md` B3, B9. Skilly: `zakaziq-workspace-backend`.
Společná pravidla: `new - area of zakaziq/prompty/redesign/00-README.md`. Soubory: `lib/ws/today.ts`, `lib/ws/calendar.ts`, `lib/ws/customers.ts`,
`lib/ws/money/data.ts`, `lib/ws/money/calculations.ts`, `components/ws/money/page.tsx`, `components/ws/app/booking/live-refresh.tsx`,
`app/api/ws/[business]/zmeny`, `components/ws/app/app-frame.tsx`.

## Kroky
1. **Dotazy.** Na testovací větvi s ukázkovými daty (a pro zátěž s větším množstvím, jen na větvi) proveď `EXPLAIN (ANALYZE)` pro `getTodayData`, `getCalendarData`, `getFinance`, `listInvoices`, seznam zákazníků. Chybějící indexy do nové migrace (od 085, jen připravit).
2. **Peníze.** Součty po měsících, měnách, skupinách, službách a zdrojích (`monthSeries`, `currencyTotals`, `group` v `components/ws/money/page.tsx`) přesuň do SQL. Výstup musí zůstat shodný, porovnej testem se stávajícími výpočty. Neslučuj měny.
3. **Živé obnovení.** Zjisti, jak drahý je dotaz ETagu a co dělá `router.refresh()`. Obnovuj jen při skutečné změně, jen na viditelném panelu prohlížeče, zastav při skrytém panelu.
4. **Klient.** Ověř prefetch odkazů v postranním panelu a spodní liště. Optimistické akce tam, kde ještě nejsou (potvrzení poptávky, zaplacení faktury, razítko), s „Zpět“ podle stávajícího vzoru `use-ws-action`.
5. **Bundle.** Z výstupu `next build` zjisti velké trasy. Graf, `@dnd-kit`, `cmdk` a `framer-motion` na `/r` načítej dynamicky. Žádná nová závislost bez rozhodnutí (AGENTS.md).
6. **Cache dat účtu** jen pokud to měření ukáže jako nutné a po dohodě s Kryštofem. Klíč vždy obsahuje účet; oddělení účtů má přednost před rychlostí.
7. **Měření znovu**, výsledky do plánu (oddíl 9) a paměti.

## Hotovo, když
- Peníze, Dnes a Kalendář mají naměřené zlepšení oproti RD02, výsledky sedí na stejná čísla jako dřív.
- Žádné nové zbytečné `router.refresh()`; testy, `tsc`, `build:check` procházejí.

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav RD03 v plánu, případná migrace (aplikována: ne). Commit `ws/rychlost: dotazy, indexy, klient`.
