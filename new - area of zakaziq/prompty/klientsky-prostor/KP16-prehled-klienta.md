# KP16 — Přehled klienta v rozvržení jako Slack

## Cíl
Do kostry z KP15 (zakázky jako kanály, chat uprostřed, panel O zakázce vpravo) přijde všechno ostatní. Klient po přihlášení hned ví, co je teď potřeba od něj a jak projekt stojí: etapa, termín, konzultace, peníze a poslední práce. Hodnocení po dokončení jede přes nový dotazník.

## Než začneš
Rituál začátku (`zakaziq-memory`). Přečti `docs/klientsky-prostor/PLAN.md` 4.7 (Rozvržení jako Slack a Přehled klienta, včetně náčrtu), 11, R-072, R-119, R-121, R-122, R-123 a výsledky KP12–KP15 v paměti, `app/klient/`, `components/portal/`, `components/SurveyForm.tsx`, `lib/admin/{survey-model,survey-answers}.ts`, `DESIGN.md`.
Skilly: `zakaziq-design-dilky`, `impeccable`, `mobile-native`, `zakaziq-ux-texty-cs`, `humanize-text-cs` (e-maily), `break-ui`, `web-security-review`.
**Zadání výslovně povoluje změny v:** `app/klient/`, `components/portal/`, `lib/portal/`, napojení dotazníku (`components/SurveyForm.tsx`, `lib/admin/survey-*.ts`) a odkaz na prostor na `/p/[token]`.

## Kroky
1. **Přehled** (položka v levém sloupci, výchozí po přihlášení, když nic nečeká v chatu). Nahoře jedna věc: co čeká na klienta (úkol z etapy, návrh ke schválení, faktura po splatnosti, hodnocení) a nepřečtené zprávy. Když nic, klidná věta. Pod tím karta každé zakázky: aktuální etapa s termínem, zaplaceno a zbývá, poslední zpráva o práci.
2. **Panel O zakázce** (vpravo u chatu, pod 1280 px tlačítkem, na telefonu ze záhlaví chatu): etapy jako osa s termíny a úkoly „Mám hotovo" (KP12), zaplaceno a zbývá s odkazem na faktury (KP13), nejbližší konzultace s odkazem na Meet a „Domluvit konzultaci" (KP14), „Co se dělo" a odkaz na živou verzi webu.
3. **Faktury a Konzultace** v levém sloupci: souhrn přes všechny zakázky klienta, na telefonu ve spodní liště.
4. **E-mail při změně etapy:** souhrnně nejvýš 1× za 24 h jako u aktivity (R-072), z krystof@vizeon.cz, s odkazem do prostoru.
5. **Hodnocení** přes dotazník R-119 místo staré `FeedbackCard`. Zapisuje se do stejných tabulek, aby Hodnocení v adminu fungovalo beze změny; jednou na zakázku. V Přehledu se ukáže jako „čeká na vás".
6. **`/p/[token]`:** nenápadný odkaz „Přihlásit se do vašeho prostoru" pro klienty, kteří prostor mají.
7. **Odolnost:** `break-ui` s dlouhými názvy zakázek v levém sloupci, deseti zakázkami, žádnou etapou, deseti fakturami, cizí měnou a prázdným projektem. Prázdné stavy užitečné, ne omluvné.
8. **Testy:** klient vidí jen svoje; hodnocení se zapíše jednou; e-mail o etapách neodejde dvakrát za den.
9. **Paměť.** changelog, stav KP16 v plánu, `docs/AGENTS-REFERENCE.md` (klientský prostor).

## Hotovo, když
- Klient po přihlášení do 5 vteřin ví, jestli po něm něco chcete a jak projekt stojí.
- Pravý panel u chatu ukazuje etapu, peníze a konzultace; na telefonu je všechno na dva klepnutí.
- Hodnocení po dokončení jede přes dotazník R-119 a ukáže se v adminu.
- Ověřeno na 390 / 768 / 1280 / 1440 px, plochy ≥ 44 px; `tsc`, `npm test`, build.

## Konec sezení
`zakaziq-memory` → Konec sezení. Commit na požádání, např. `feat: přehled klienta v klientském prostoru (R-121, R-123)`. Potom KP10 (audit, GDPR, pilot s jedním klientem).
