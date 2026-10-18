# RD00 — Příprava, testovací databáze a měření

## Cíl
Čistý start redesignu: rozpracované změny vědomě uložené, nová větev, bezpečná testovací databáze,
odsouhlasená rozhodnutí v paměti a **naměřená výchozí rychlost**, se kterou se pak porovnává.

## Než začneš
Rituál začátku (`zakaziq-memory`): `git status`, větev, `memory/index.md`, `memory/memory.md`, `memory/pravidla.md`.
Přečti `docs/workspace/REDESIGN-APP-PLAN.md` celý a `docs/REDESIGN-HANDOFF.md`. Společná pravidla jsou v `new - area of zakaziq/prompty/redesign/00-README.md`.
Dnes je větev `ws/s18` a pracovní strom má kolem 64 cizích neuložených souborů (S19, migrace 080, landing, paměť). Nic z toho nepřepisuj.

## Kroky
1. **Rozhodnutí.** Projdi s Kryštofem D-1–D-10 (plán, sekce 6). Odsouhlasená zapiš do `memory/memory.md` jako **R-058** (rozsah, pořadí sezení, jednotlivá rozhodnutí); neodsouhlasená nech jako otevřená a v plánu je označ „čeká“.
2. **Uložení rozpracovaných změn.** Ukaž `git status` a navrhni rozdělení: (a) bezpečnost S19 + migrace 080 + balíčky, (b) landing a redesign R-057, (c) paměť a dokumenty. Commituj jen se souhlasem a jen konkrétní soubory (`git add <soubory>`), zprávy česky `ws/oblast: …`. Chce-li to Kryštof udělat sám, přeskoč.
3. **Větev.** `ws/redesign-app` z aktuální `ws/s18`. Ověř, že není pozadu za větví, kterou S19 dál používá.
4. **Testovací databáze.** Produkční Neon se nesmí používat k vývoji redesignu. Navrhni Neon branch (Kryštof ji založí), přepnutí `DATABASE_URL_WS` v `.env.local` jen s jeho souhlasem a **bez vypsání hodnot** (ověř jen host a region). Migrace 064+ na branch, pak `node scripts/ws-seed.mjs <slug> --ano` (R-041), jen na branch.
5. **Měření.** Spusť dev, Kryštof se přihlásí v Chromu. Změř Dnes, Kalendář, Zákazníci, Peníze: čas po kliknutí do první kostry, do obsahu, počet kol do DB (dočasný čítač v `lib/ws/db.ts`, **nesmí zůstat v kódu**), z toho kolik zabere Clerk. Výsledky tabulkou do plánu, nový oddíl 9 „Naměřeno“, a do paměti.
6. **První průchod s přihlášením.** Projdi Dnes, Poptávky, Kalendář, Zakázky, Zákazníci, Peníze, Nastavení a Účet na ukázkových datech. Nálezy zapiš do Otevřených problémů, **neopravuj je**.

## Hotovo, když
- Pracovní strom je čistý, nebo je rozdělení záměrné a Kryštofem schválené.
- Existuje větev `ws/redesign-app` a testovací databáze, `npm test` na ní prochází.
- V plánu jsou naměřená čísla a R-058 je v paměti.

## Konec sezení
`zakaziq-memory` → Konec sezení. Aktualizuj stav RD00 v plánu (sekce 5).
