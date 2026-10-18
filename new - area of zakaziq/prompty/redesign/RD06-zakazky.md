# RD06 — Zakázky

## Cíl
Zakázky jdou přehledně prohlížet jako seznam i tabule, na telefonu pohodlně a s rychlou akcí na hotové zakázce.

## Než začneš
Rituál začátku (`zakaziq-memory`): `git status`, větev `ws/redesign-app`, `memory/index.md`, `memory/memory.md`, `memory/pravidla.md`.
Přečti `docs/workspace/REDESIGN-APP-PLAN.md` (F4 Zakázky), R-044 a `AGENTS.md` B9. Skilly: `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`.
Společná pravidla: `new - area of zakaziq/prompty/redesign/00-README.md`. Soubory: `app/w/[business]/zakazky/page.tsx`, `components/ws/app/jobs/{job-board,job-portal}.tsx`,
`lib/ws/calendar.ts` (`getJobBoard`), `lib/ws/jobs.ts`, `components/ws/app/detail-slot.tsx`, `app/w/[business]/poptavky/actions.ts` (`moveJobStage`).

## Kroky
1. **Seznam a tabule.** Přepínač Tabule / Seznam v liště (`?pohled=`). Na telefonu výchozí seznam (zjištění z User-Agentu stejně jako u kalendáře), na počítači tabule. Stejná data, dvě podoby.
2. **Karta.** Kompaktní: zákazník, název, cena, příští termín, stav jako štítek. Počty ve sloupcích/skupinách.
3. **Filtry.** „Čeká na mě“ (nová, nepřiřazená), „Po termínu“, „Bez termínu“. Stav v URL.
4. **Rychlé akce.** Přesun stavu (existuje, zůstane se „Zpět“), na hotové zakázce **Vystavit fakturu** (existuje) a po RD10 i Zaplaceno. Nevytvářej nové akce, které nefungují (nehotové se skrývají).
5. **Detail** v pravém panelu: stručné shrnutí nahoře, historie stavů, zprávy pro zákazníka, odkaz do portálu. Beze změny datového modelu.
6. **Přístupnost.** Klávesnicová alternativa k tažení (výběr stavu), ≥ 44 px, tmavý režim, bez vodorovného posunu v seznamu.
7. Testy: filtrování, přepínání pohledu, přesun se „Zpět“.

## Hotovo, když
- Na telefonu se zakázky čtou a posouvají bez vodorovného posunu.
- Filtry fungují a jsou sdílitelným odkazem.
- Testy, `tsc`, `build:check` procházejí, ověřeno na 390 / 768 / 1280 / 1440 px.

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav RD06 v plánu. Commit `ws/zakazky: seznam a tabule, filtry`.
