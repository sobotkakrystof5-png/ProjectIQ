# RD09 — Kapacita a skupinové termíny (volitelné)

## Cíl
Jeden termín může mít víc zákazníků (kurz, lekce) nebo jeden pracovník zvládá víc zákazníků naráz. Co přesně, rozhodne D-4. **Nejdřív návrh, potom kód.**

## Než začneš
Rituál začátku (`zakaziq-memory`): `git status`, větev `ws/redesign-app`, `memory/index.md`, `memory/memory.md`, `memory/pravidla.md`.
Přečti `docs/workspace/REDESIGN-APP-PLAN.md` (F5, D-4), R-005, R-035, R-044 a `AGENTS.md` B3, B6. Skilly: `zakaziq-workspace-backend`, `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`.
Společná pravidla: `new - area of zakaziq/prompty/redesign/00-README.md`. Soubory: `migrations/068_*`, `lib/ws/bookings.ts`, `lib/ws/intake/slots.ts`, `components/ws/order/order-flow.tsx`, `components/ws/app/calendar/*`.
**Spouštěj jen po RD08 a po rozhodnutí D-4.** Není-li D-4 rozhodnuté, zeptej se, co si Kryštof pod kapacitou představuje, a zapiš to.

## Kroky
1. **Zeptej se** (D-4): (a) skupinové termíny s N místy (kurz, lekce, workshop), nebo (b) více zákazníků naráz u jednoho pracovníka, nebo obojí? Kolik míst, kdo je vypisuje, je potřeba čekací listina?
2. **Návrh modelu** do plánu (nový oddíl 10), bez kódu: u (a) `ws.sessions (service_id, staff_id, starts_at, ends_at, capacity)` + `ws.session_attendees`, vztah k `EXCLUDE` na pracovníka (termín skupiny zabírá pracovníka jednou), co se stane při zrušení a přesunu, platby a věrnost (razítko za účast); u (b) `services.parallel` nebo kapacita pracovníka a dopad na výpočet volných časů. Nejdřív schválení Kryštofem.
3. **Po schválení** migrace (jen připravit), logika s atomickou kontrolou kapacity v DB (omezení nebo uzamčení, žádné „zkontroluj a pak vlož“), testy v PGlite včetně souběhu dvou zákazníků o poslední místo.
4. **UI.** Objednávka: u skupinové služby výpis termínů s volnými místy místo výběru času. Kalendář: blok termínu s „4 / 8“ a seznamem účastníků v panelu. Vypisování termínů z kalendáře.
5. **E-maily, portál, GDPR** (výmaz účastníka, export), `web-security-review`.

## Hotovo, když
- Návrh je schválen a zapsán v plánu; implementace odpovídá návrhu.
- Poslední místo nejde obsadit dvakrát (test souběhu).
- Migrace připravená (aplikována: ne), testy, `tsc`, `build:check` procházejí.

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav RD09 v plánu, rozhodnutí jako R-xxx. Commit `ws/rezervace: kapacita a skupinové termíny`.
