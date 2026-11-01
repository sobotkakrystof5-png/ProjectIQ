# KP05 — Klientský prostor I: schéma `portal`, pozvánky a přihlášení

## Cíl
Klient se po pozvánce zaregistruje, dál se jen přihlašuje a vidí výhradně svoje. Oddělení dat drží databáze, ne jen kód. V tomhle sezení je hotový základ (přihlášení, členové, izolace); co klient uvidí, přijde v KP06.

## Než začneš
Rituál začátku (`zakaziq-memory`). Přečti `docs/klientsky-prostor/PLAN.md` 4.1, 4.2, 5, R-035, R-036, R-037, R-052, `docs/workspace/SETUP.md` (role `ws_app`, skript, testy v PGlite), `docs/AGENTS-REFERENCE.md` B3, B4, B13, `.claude/security/STATE.md`, `DECISIONS.md` #008, #009, #012, #017, `CSP-LOG.md`, `proxy.ts`, `lib/ws/db.ts`, `lib/ws/context.ts`, `lib/ws/admin/invite.ts`.
Skilly: `zakaziq-workspace-backend`, `web-security-review`, `web-security-memory`, `clerk-nextjs-patterns`, `clerk-setup`.
**Zadání výslovně povoluje změny v:** `proxy.ts` (cesta `/klient`), CSP (jen to nutné pro Clerk na `/klient`), detailu zakázky v adminu (tlačítko Pozvat klienta, seznam členů). Do `public.projects` přidej jen jeden nepovinný sloupec pro vazbu na firmu klienta, nic dalšího.
Potřebuje D-K1, D-K3, D-K11; pokud nejsou rozhodnuté, zeptej se hned.

## Kroky
1. **Schéma `portal` (migrace, první volné číslo, jen připravit).** Tabulky: `clients` (firma), `members` (Clerk user id, e-mail, role `owner`/`member`, `removed_at`), `invites` (hash kódu, vazba na firmu a projekt, platnost 14 dní, `used_at`, `revoked_at`), `projects` (**projekce**: `id`, `client_id`, jméno, stav, fáze, termín, `project_url`, `updated_at`). RLS na `portal.current_client()` (`set_config('app.client_id')` v transakci, `NULLIF` jako u `ws.current_account()`), složené cizí klíče `(client_id, id)`.
2. **Hranice dat.** Role `portal_app` bez jakýchkoli práv do `public`. Trigger `SECURITY DEFINER` na `public.projects` (insert/update) zkopíruje do `portal.projects` **jen** jméno, stav, fázi, termín a `project_url` a jen pro zakázky s `portal_client_id`. `notes`, `price`, `client_email` a `public_token` se nekopírují nikdy. Skript role vzorem `scripts/ws-create-role.js` (`scripts/portal-grants.sql`), nikdy v konzoli Neonu.
3. **Přístup z kódu.** `lib/portal/db.ts` (vlastní tag nad rolí `portal_app`, `cache: 'no-store'`), `lib/portal/context.ts` s `requirePortalMember()` (Clerk uživatel → člen → firma; odebraný člen nemá přístup) obalené `React.cache`. Žádný dotaz bez `client_id`.
4. **Pozvánky.** Server action v adminu: vytvoř firmu (nebo vyber existující) a pozvánku; kód jednorázový, v DB jen hash, platnost 14 dní, zneplatnění; odkaz `/klient/pozvanka/<kód>`. E-mail s pozvánkou přes `lib/email.ts` (text podle `zakaziq-ux-texty-cs`).
5. **Přihlášení.** Rozšíření Clerku na `/klient/*` (e-mailový kód nebo passkey; žádné heslo od nás). Strana `/klient/pozvanka/<kód>`: ověří kód, nechá klienta zaregistrovat, spotřebuje kód, zapíše člena **ve stejné transakci** (vzor `ensureMember`). Opakované otevření spotřebovaného kódu → srozumitelná hláška, ne chyba. Rate limit pokusů o kód.
6. **Správa členů v adminu:** seznam, poslední přihlášení, odebrat člena, nová pozvánka. Klient sám vidí své členy a může pozvat kolegu (jen vlastník).
7. **Kostra `/klient`.** Layout v Dílcích (`WsRoot`-podobný kořen, jednoduchá hlavička s názvem firmy a odhlášením), zatím jen uvítací stránka s názvem projektu. Obsah KP06.
8. **CSP a hlavičky.** Změna `proxy.ts` a CSP jen pro `/klient`, bez `unsafe-inline`/`unsafe-eval` ve skriptech, zapsaná do `CSP-LOG.md`. `noindex` pro `/klient`. R-037 (Clerk jen pod `/w`) upřesni novým rozhodnutím.
9. **Testy v PGlite (povinné):** klient A nikdy nevidí řádek klienta B (SELECT i INSERT/UPDATE podle `client_id`); `portal_app` nemá přístup do `public` (pokus o SELECT selže); trigger kopíruje jen povolené sloupce a nic z `notes`/`price`; pozvánka: jednorázová, vyprší, zneplatněná nejde, hash není kód; odebraný člen nemá přístup; migrace dvakrát po sobě.
10. **Bezpečnost.** `web-security-review`; zápis do `DECISIONS.md` (nový záznam), `STATE.md`, `CSP-LOG.md`; `sync-agent-context --write` a `--check`. Paměť: changelog, `docs/AGENTS-REFERENCE.md` (nová část o klientském prostoru, env), `memory/index.md`, stav v plánu.

## Hotovo, když
- Testovací pozvánka projde od kódu přes registraci k prázdné stránce firmy; druhé otevření kódu je odmítnuto.
- Test oddělení klientů v PGlite prochází a dokazuje, že `portal_app` nedosáhne do `public`.
- Migrace jsou připravené (aplikace a vytvoření role: Kryštof), `tsc` a `npm test` procházejí; Clerk produkční instance zůstává otevřený problém (zapsat).

## Konec sezení
`zakaziq-memory` → Konec sezení (migrace: aplikována ne). Commit na požádání, např. `ws/klient: schéma portal, pozvánky a přihlášení`.
