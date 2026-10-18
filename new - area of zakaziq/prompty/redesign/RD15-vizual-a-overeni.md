# RD15 — Vizuální sjednocení a závěrečné ověření

## Cíl
Celá aplikace působí jako jeden celek. Redesign je ověřený na skutečných datech s přihlášením, porovnaný s výchozí rychlostí a zdokumentovaný.

## Než začneš
Rituál začátku (`zakaziq-memory`): `git status`, větev `ws/redesign-app`, `memory/index.md`, `memory/memory.md`, `memory/pravidla.md`.
Přečti `docs/workspace/REDESIGN-APP-PLAN.md` celý (hlavně tabulku stavu a oddíl 9 „Naměřeno“), `docs/AGENTS-REFERENCE.md` B8–B13 a `.claude/security/STATE.md`.
Skilly: `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`, `web-security-review`, `frontend-design`. Společná pravidla: `new - area of zakaziq/prompty/redesign/00-README.md`.

## Kroky
1. **Vizuální průchod.** Všechny obrazovky z menu a Účtu, objednávka `/r`, portál `/z`: hustota a rytmus, jednotná hlavička a lišta (RD04), prázdné stavy, ikony, velikosti písma, ≥ 44 px, žádné barvy natvrdo. Opravuj odchylky od Dílků, nové vzory nevymýšlej.
2. **Tmavý režim.** Nové třídy bez přemapování doplň do `app/ws-tokens.css`; projdi všechny obrazovky v tmavém režimu (Otevřené problémy „Tmavý režim — nové třídy“).
3. **Přístupnost.** Průchod jen klávesnicí (menu, Účet, kalendář, panel, návody), viditelný focus, popisky, kontrast, `prefers-reduced-motion` (vypnutý pohyb nesmí skrýt obsah), Lighthouse přístupnost na hlavních obrazovkách.
4. **Šířky.** 390, 768, 1280, 1440 px, bez vodorovného posunu mimo záměrné (tabule zakázek).
5. **Průchod s přihlášením na testovací větvi** s ukázkovými daty, ne na produkci: poptávka → potvrzení → termín → zákazník → zakázka → faktura → zaplaceno → razítko, objednávka z `/r`, Účet › Nastavení, Návody. Co nejde, zapiš do Otevřených problémů.
6. **Test „člověk, který aplikaci neviděl“.** Připrav úkoly (přidat službu, potvrdit poptávku, vystavit fakturu) a požádej Kryštofa, aby je dal někomu, kdo aplikaci nezná. Výsledek zapiš.
7. **Rychlost.** Změř stejně jako v RD00, tabulka před/po do plánu (oddíl 9) a do paměti. Nepiš čísla, která jsi nenaměřil.
8. **Dokumentace.** `docs/AGENTS-REFERENCE.md` B8–B11 „Jak je to v kódu (redesign)“, `memory/index.md`, uzavři splněné Otevřené problémy, aktualizuj `docs/REDESIGN-HANDOFF.md` (stav).
9. **Bezpečnost.** `web-security-review` nad celým rozdílem větve; změny CSP nebyly potřeba, pokud ano, `.claude/security/CSP-LOG.md`.
10. **Co dál.** Napiš seznam toho, co zbylo (neověřeno, odloženo), a navrhni sloučení `ws/redesign-app` do `workspace`. **Sloučení a deploy jen se souhlasem.**

## Hotovo, když
- Všechna sezení RD01–RD14 jsou ve stavu „hotovo“ nebo vědomě odložená.
- Průchod s přihlášením proběhl a chyby jsou opravené nebo zapsané.
- Rychlost před a po je v plánu jako naměřená čísla; `npm test`, `tsc`, `build:check` procházejí.

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav RD15 a celého redesignu v plánu a v `memory/memory.md` (Aktuální stav). Commit `ws/redesign: sjednocení vzhledu a závěrečné ověření`.
