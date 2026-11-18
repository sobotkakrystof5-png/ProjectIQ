# KP12 — Služby a etapy

## Cíl
Kryštof u nové zakázky vybere druh služby a zakázka dostane předvyplněné etapy s termíny a úkoly pro klienta. Klient v prostoru vidí, v jaké etapě projekt je, kdy má která skončit a co čeká na něj.

## Než začneš
Rituál začátku (`zakaziq-memory`). Přečti `docs/klientsky-prostor/PLAN.md` 4.1, 4.7, 7 (D-K14), R-121, R-085 (předvyplnění jen z dat, ne z modelu), migraci 095 (`portal.sync_project` jako vzor projekce), `components/ProjectForm.tsx` (`service_type` je volný text), `lib/admin/projects.ts`, `components/admin/project-detail-view.tsx`, `components/ws/settings/sortable-list.tsx` (přetažení pořadí), `app/klient/projekt/[id]/page.tsx`, `lib/portal/projects.ts`.
Skilly: `zakaziq-workspace-backend`, `zakaziq-design-dilky`, `impeccable`, `zakaziq-ux-texty-cs`, `web-security-review`.
**Zadání výslovně povoluje změny v:** `components/ProjectForm.tsx`, `app/actions.ts` (založení a úprava zakázky), detailu zakázky, nové stránce Nastavení › Služby v adminu, `lib/admin/`, `lib/portal/`, `app/klient/`.

## Kroky
0. **Zeptej se Kryštofa na D-K14:** má se postup v % počítat z hotových etap (doporučení ano, ruční % zmizí), nebo zůstane ruční?
1. **Migrace** (první volné číslo, jen připravit, idempotentní): číselník služeb (název, pořadí, aktivní), šablony etap (služba, pořadí, název, popis pro klienta, typická délka ve dnech), šablony úkolů pro klienta, etapy zakázky (zakázka, pořadí, název, popis, termín, stav čeká / běží / hotovo, kdy hotovo), úkoly zakázky (text, kdy je klient označil). Projekce `portal.*` triggerem a funkce `portal.submit_*` pro „Mám hotovo" (členství, limit, zvonek Kryštofovi). Stávající texty `service_type` migrace nepřevádí, formulář je dál zobrazí.
2. **Nastavení › Služby.** Seznam služeb, u každé etapy s přetažením pořadí, popis pro klienta, typická délka, úkoly pro klienta. **Obsah píše Kryštof**, ty nic nevymýšlej. Prázdný stav vysvětlí, k čemu to je. Návrh prázdných služeb Web, E-shop, Design, Automatizace jen nabídni k potvrzení.
3. **Nová zakázka.** Výběr služby → náhled etap s termíny od data zahájení podle typické délky → upravit, smazat, přidat → uložit. Etapy se **kopírují**, úprava šablony běžící zakázky nemění.
4. **Detail zakázky.** Etapy jako osa: přepnout stav jedním klikem se „Zpět", změnit termín, vidět úkoly klienta a kdy je označil.
5. **Klient** (`/klient/projekt/[id]`): osa etap s termíny, aktuální etapa zvýrazněná, úkoly s tlačítkem „Mám hotovo". U úkolu věta, že hesla a přístupy sem nepatří.
6. **Testy:** změna šablony nezmění běžící zakázku; klient vidí jen etapy svých zakázek a nic interního; „Mám hotovo" jen u vlastního úkolu; migrace projde dvakrát po sobě; oddělení klientů prochází.
7. **Paměť.** `web-security-review`, DECISIONS (nový tok dat do `portal` a nová funkce zápisu), changelog, `docs/admin/AGENTS-ADMIN.md`, stav KP12 v plánu.

## Hotovo, když
- Nová zakázka s vybranou službou má etapy s termíny bez ručního opisování.
- Klient v prostoru vidí etapy a svoje úkoly a umí je označit jako hotové; Kryštofovi přijde zvonek.
- Ověřeno na 390 / 768 / 1280 / 1440 px; `tsc`, `npm test`, build.

## Konec sezení
`zakaziq-memory` → Konec sezení (migrace: aplikována ne). Commit na požádání, např. `feat: služby a etapy zakázky v adminu i v klientském prostoru (R-121)`.
