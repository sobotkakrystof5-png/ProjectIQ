# RD07 — Zákaznická objednávka `/r`, widget a pracovníci

## Cíl
Objednání z pohledu zákazníka je rychlé a funguje pro každý obor: nejvýš tři obrazovky, nabídka nejbližšího volného času, výběr pracovníka, žádná slepá ulička při obsazeném termínu.

## Než začneš
Rituál začátku (`zakaziq-memory`): `git status`, větev `ws/redesign-app`, `memory/index.md`, `memory/memory.md`, `memory/pravidla.md`.
Přečti `docs/workspace/REDESIGN-APP-PLAN.md` (F5), R-045, `docs/workspace/API.md` a `AGENTS.md` B6 (S11) a B13. Skilly: `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`, `zakaziq-workspace-backend`.
Společná pravidla: `new - area of zakaziq/prompty/redesign/00-README.md`. Soubory: `components/ws/order/order-flow.tsx`, `app/r/[slug]/{page,actions}.ts(x)`,
`lib/ws/intake/{intake,slots,schema}.ts`, widget `lib/ws/intake/widget-script.ts`, `app/embed/`, `lib/ws/portal.ts`.

## Kroky
1. **Projdi dnešní tok** na 390 px a zapiš, kde se zákazník zdrží nebo uvízne.
2. **Tok.** Nejvýš tři obrazovky: Co (služba; krok se přeskočí, je-li služba jediná) → Kdy → Vaše údaje a hotovo. Mobil napřed, jedna hlavní akce na krok, viditelné shrnutí (služba, čas, cena).
3. **Kdy.** Nahoře „Nejbližší volný termín“ jedním klikem, pod tím dny s dostupností (dny bez volna šedé), časy po dnech. Režimy času podle byznysu zůstávají (R-045: volné časy / zákazník navrhne sám / bez času).
4. **Pracovník.** Je-li víc pracovníků u služby, volba „Kdokoli“ (výchozí, spojí volné časy všech) nebo konkrétní. Pracovník vyplyne z `service_staff`.
5. **Obsazeno.** Chyba `SLOT_TAKEN` nikdy nekončí chybou: ukaž nejbližší jiné časy a nech zákazníka vybrat.
6. **Hotovo.** Potvrzení s „Přidat do kalendáře“ (.ics) a odkazem do portálu, pokud je zapnutý. Text jasně říká, zda je termín potvrzený, nebo čeká na schválení.
7. **Widget a `/r` jsou jedna věc.** Stejná komponenta, modal i inline režim. Lehčí bundle (animace jen u změny kroku, `framer-motion` načítat dynamicky).
8. **Kontrakt API v1 se nelámá**, změny jen přidávají. Honeypot, rate limit, CSP a validace beze změny (B13); `web-security-review` před commitem.
9. Přístupnost: klávesnice, popisky, kontrast akcentové barvy byznysu, `prefers-reduced-motion`.
10. Testy v `ws-intake.test.ts` (výběr „kdokoli“, nejbližší termín, alternativa při obsazení).

## Hotovo, když
- Zákazník s jednou službou a bez nutnosti zadávat termín dokončí objednávku na dvou obrazovkách.
- Obsazený termín nabídne alternativy, žádná chyba bez dalšího kroku.
- Widget i `/r` ověřené na 390 px, testy, `tsc`, `build:check` procházejí.

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav RD07 v plánu, případná změna API do `docs/workspace/API.md`. Commit `ws/objednavka: rychlý tok, nejbližší termín, pracovník`.
