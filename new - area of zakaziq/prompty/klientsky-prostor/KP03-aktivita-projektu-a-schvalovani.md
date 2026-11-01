# KP03 — Aktivita projektu a schvalování

## Cíl
Zakázka má časovou osu „co se udělalo“. Zprávy vznikají jako koncept (ručně nebo později z Claude Code), Kryštof je jedním klikem schválí a klient je uvidí. Zatím přes stávající `/p/[token]`; přihlášený prostor přijde v KP05–KP06.

## Než začneš
Rituál začátku (`zakaziq-memory`). Přečti `docs/klientsky-prostor/PLAN.md` 3, 4.1, 4.3, 5, výsledky KP01–KP02 v paměti, R-069, `lib/types.ts` (`ProgressUpdate`), `app/actions.ts` (jak se dnes zapisují `progress_updates` a posílá `notifyClientOfProjectChange`), `lib/email.ts`, `app/p/[token]/page.tsx`.
Skilly: `zakaziq-workspace-backend`, `zakaziq-ux-texty-cs`, `humanize-text-cs` (šablona e-mailu), `web-security-review`.
**Zadání výslovně povoluje změny v:** `app/p/[token]/page.tsx`, záložce Aktivita v detailu zakázky (KP02), `lib/email.ts` (jen nová šablona), `lib/notifications.ts` (nový typ). Stávající `progress_updates` nemaž ani nepřepisuj.
Potřebuje D-K5 (schvalování vs. automatické publikování).

## Kroky
1. **Model (migrace, první volné číslo po 092).** `project_activity`: `id`, `project_id` (FK, CASCADE), `status` (`draft` · `published` · `rejected`), `source` (`manual` · `claude_code` · `system`), `title`, `body`, `contains_sensitive` boolean, `created_at`, `published_at`, `published_by`. CHECK na stavy a délky (title ≤ 160, body ≤ 4000). Indexy `(project_id, created_at DESC)` a částečný pro `draft`. Idempotentní. **Jen připravit.**
2. **Čisté funkce** v `lib/project-activity.ts`: Zod schéma, `redactSensitive(text)` (zakryje `sk-…`, `Bearer …`, connection stringy, `KEY=hodnota` řádky z `.env`, absolutní cesty v domovské složce; vrací text a příznak), řazení časové osy. Testy včetně falešných poplachů (běžná česká věta nesmí být zakrytá).
3. **Server actions** (`app/project-activity-actions.ts`, `requireAuth`): vytvořit koncept ručně, upravit, schválit, zamítnout, hromadně schválit. Schválit lze jen koncept bez `contains_sensitive`, jinak nejdřív úprava. Schválení nastaví `published_at` a **jednou za den** (ne za každé hlášení) pošle klientovi souhrnný e-mail; zvonek pro admina při novém konceptu.
4. **Admin UI.** V detailu zakázky záložka Aktivita: koncepty nahoře s tlačítky Schválit · Upravit · Zamítnout (Zpět 8 s), pod nimi publikovaná osa. Na Dnes (KP02) sekce „Hlášení ke schválení“. Texty podle `zakaziq-ux-texty-cs`.
5. **Portál `/p/[token]`.** Přidá publikovanou aktivitu do časové osy vedle stávající historie postupu (jedna sjednocená osa podle data, bez duplicit). Klient nikdy nevidí koncepty ani `source`.
6. **Souhrnný e-mail** klientovi: krátký, česky, co je nového a odkaz na portál; jen když má zakázka `client_email`; selhání e-mailu nesmí zrušit publikaci.
7. **Testy:** koncept se nezobrazí na `/p`, publikovaná zpráva ano; citlivý koncept nejde schválit; zakrývání; oprávnění (bez session akce selže); hranice délek.
8. **Bezpečnost.** `web-security-review`. Zápis do `.claude/security/STATE.md` (nová data viditelná klientovi). Paměť: changelog, katalog tabulek v `docs/admin/AGENTS-ADMIN.md`, stav v plánu.

## Hotovo, když
- Ručně vytvořené hlášení projde Koncept → Schválit a objeví se na `/p/[token]`.
- Koncept s citlivým řetězcem nejde schválit bez úpravy.
- Migrace je připravená (aplikace: Kryštof), testy a `tsc` procházejí, regrese `/p/[token]` a detailu zakázky ověřena.

## Konec sezení
`zakaziq-memory` → Konec sezení (migrace: aplikována ne). Commit na požádání, např. `ws/aktivita: koncepty a schvalování`.
