# KP02 — Admin: Dnes a detail zakázky jako centrum

## Cíl
Úvodní stránka řekne, co je teď potřeba udělat. Detail zakázky je jedno místo se záložkami, kam patří všechno k projektu (aktivita, požadavky, zprávy, fakturace). Cesta „z úvodní stránky k věci“ má nejvýš dva kliky.

## Než začneš
Rituál začátku (`zakaziq-memory`). Přečti `docs/klientsky-prostor/PLAN.md` 4.6, 6, 11, `docs/admin/AGENTS-ADMIN.md` (stránky `/dashboard`, `/dashboard/[id]`, `/alteno/[id]`, Stavy zakázky) a výsledek KP01 v paměti.
Skilly: `zakaziq-design-dilky`, `impeccable`, `zakaziq-ux-texty-cs`.
**Zadání výslovně povoluje změny v:** `app/dashboard/page.tsx`, `app/dashboard/[id]/`, `app/alteno/page.tsx`, `app/alteno/[id]/`, `components/{ProjectCard,ProjectForm,SummaryBar,ConsultationCalendar,FeedbackFeed,ClientMessagesEditor,ProjectNotesPanel}.tsx` a nových souborech. Logiku server actions (`app/actions.ts`) neměň, jen ji volej.

## Kroky
1. **Dnes.** Nová úvodní stránka adminu: (a) požadavky klientů čekající na vás (`client_requests` se stavem `new`), (b) hlášení ke schválení (zatím prázdná sekce, naplní KP03; neukazuj, dokud tabulka neexistuje), (c) faktury po splatnosti, (d) nejbližší konzultace a hovory s dalším krokem, (e) zakázky bez pohybu delší dobu (`updated_at`). Jedna hlavní věc nahoře (stejná myšlenka jako `pickFocus` ve Workspace), zbytek pod ní. Prázdný stav pochvalný a krátký, ne omáčka.
2. **Detail zakázky.** Záložky Přehled · Aktivita · Požadavky · Zprávy · Fakturace. Přehled: stav, fáze, termín, cena (jen admin), odkaz na živou verzi, sdílení (odkaz a QR) a poznámky; úprava na místě bez přechodu na jinou stránku. Požadavky: stejná karta jako v `/dashboard/pozadavky`, filtrovaná na zakázku. Zprávy: stávající `client_messages` a `progress_updates` (aktivita přibude v KP03). Fakturace: faktury zakázky.
3. **Seznam zakázek.** VIZEON a ALTENO v jednom pohledu s přepínačem, filtry podle stavu, počty u položek; karta ukazuje stav, fázi, termín a počet nevyřízených požadavků.
4. **Rychlé akce.** Změna stavu a fáze jedním klikem se „Zpět“ místo potvrzovacího dialogu; zkopírovat klientský odkaz; přidat zprávu klientovi.
5. **Telefon.** Detail na telefonu jako jedna kolona se záložkami nahoře, ovládání palcem.
6. **Regrese.** Zakázky VIZEON i ALTENO se otevírají a ukládají jako dřív (včetně `projects.business`, přesměrování mezi `/dashboard/[id]` a `/alteno/[id]`). Testy pro skládání obsahu Dnes (čisté funkce) a pro nejvyšší prioritu.
7. **Paměť.** Changelog, aktualizace `docs/admin/AGENTS-ADMIN.md` (stránky), stav v plánu.

## Hotovo, když
- Z Dnes se jedním klikem dostaneš k požadavku, schválení nebo faktuře po splatnosti.
- Detail zakázky má všechny dosavadní funkce, nic nezmizelo; uložení, smazání, přesun do dokončených a sdílení fungují.
- Regrese ověřena; vzhled na 390 / 768 / 1280 / 1440 px.
- `tsc`, `npm test`, `build:check` procházejí.

## Konec sezení
`zakaziq-memory` → Konec sezení. Commit na požádání, např. `ws/admin: Dnes a detail zakázky`.
