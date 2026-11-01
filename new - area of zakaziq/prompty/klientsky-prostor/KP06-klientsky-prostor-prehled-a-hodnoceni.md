# KP06 — Klientský prostor II: přehled, aktivita a automatické hodnocení

## Cíl
Přihlášený klient vidí dashboard svého projektu: stav, fázi, co se udělalo a co čeká na něj. Hodnocení se mu nabídne samo ve chvíli, kdy je projekt hotový. Kryštof už nikomu neposílá odkaz ani QR kód.

## Než začneš
Rituál začátku (`zakaziq-memory`). Přečti `docs/klientsky-prostor/PLAN.md` 3, 4.1, 6, 11, výsledky KP03 a KP05 v paměti, `app/p/[token]/page.tsx` (co klient vidí dnes), `app/h/[token]/page.tsx`, `components/{FeedbackBlock,NpsRating,SurveyForm}.tsx`, `app/completed-actions.ts`, `lib/feedback-schema.ts`, `DESIGN.md`.
Skilly: `zakaziq-design-dilky`, `impeccable`, `zakaziq-ux-texty-cs`, `humanize-text-cs` (e-maily), `zakaziq-workspace-backend`, `web-security-review`.
**Zadání výslovně povoluje změny v:** `app/h/[token]/page.tsx` a `app/completed-actions.ts` (jen napojení na nový tok hodnocení), cronu pro připomínky hodnocení, detailu zakázky (stav hodnocení). Ostatní admin neměň.

## Kroky
1. **Projekce aktivity do `portal`.** Migrace (první volné číslo, jen připravit): `portal.activity` (jen publikované zprávy: titul, text, datum) a trigger `SECURITY DEFINER`, který zprávu zkopíruje při `published` a smaže při zamítnutí nebo zpětvzetí. `portal_app` ji jen čte.
2. **Přehled `/klient`.** Seznam projektů firmy (karta: název, stav, fáze v procentech i slovy, termín, odkaz na živou verzi). Jedna hlavní věc nahoře: „Čeká na vás“ (schválení, odpověď, hodnocení), jinak klidná věta, že nic nečeká.
3. **Detail projektu `/klient/p/<id>`.** Fáze jako vizuální osa, časová osa aktivity (nejnovější nahoře, datum, srozumitelný text), odkaz na živou verzi, termín. Žádná cena, poznámky ani interní údaje. Prázdné stavy užitečné, ne omluvné. Telefon na prvním místě, plochy ≥ 44 px.
4. **Změna stavu = e-mail.** Při přechodu zakázky do „Čeká na schválení“ a „Hotovo“ odejde klientovi krátký automatický e-mail s odkazem do prostoru. Stav se do `portal.projects` dostává triggerem z KP05.
5. **Automatické hodnocení.** Při „Hotovo“ se klientovi v prostoru ukáže karta hodnocení (NPS + komentář, případně rozšířený dotazník jako dnes na `/h`). Denní cron (Hobby = 1× denně) pošle jedno připomenutí po několika dnech, pokud hodnocení chybí; nikdy víc než jedno. Výsledek se zapisuje do stejných tabulek jako dnes (`client_feedback`, `project_surveys`), aby `/dashboard/hodnoceni` fungovalo beze změny. Přenos z `portal` do `public` jen úzkou `SECURITY DEFINER` funkcí s kontrolou členství a limitem. Starý odkaz `/h/[token]` zůstává funkční.
6. **`/p/[token]`.** Zůstává (D-K2). Přidej pro klienty s prostorem nenápadný odkaz „Přihlásit se do vašeho prostoru“ a v adminu přepínač „Vypnout odkaz /p pro tuto zakázku“ (vypnutý odkaz vrací stránku s vysvětlením, ne 404).
7. **Administrace.** V detailu zakázky vidí Kryštof, jestli klient hodnocení dostal a odeslal, a poslední přihlášení člena.
8. **Testy:** klient vidí jen publikovanou aktivitu své firmy; koncept ani interní pole ne; hodnocení se zapíše jednou za zakázku; cron neposílá druhé připomenutí; vypnutý `/p` se chová podle zadání; texty bez technického žargonu.
9. **Paměť.** `web-security-review`, `DECISIONS.md`/`STATE.md` při změně toku dat, changelog, `docs/AGENTS-REFERENCE.md`, stav v plánu.

## Hotovo, když
- Po schválení hlášení klient po přihlášení vidí novou zprávu a dostane jeden souhrnný e-mail.
- Zakázka přepnutá do „Hotovo“ nabídne klientovi hodnocení v prostoru; odpověď se objeví v `/dashboard/hodnoceni`.
- Test oddělení klientů nadále prochází; vzhled ověřen na 390 / 768 / 1280 / 1440 px.

## Konec sezení
`zakaziq-memory` → Konec sezení (migrace: aplikována ne). Commit na požádání, např. `ws/klient: přehled, aktivita a automatické hodnocení`.
