# KP11 — Přihlášení naostro a pozvání jedním klikem

## Cíl
Kryštof pozve klienta do prostoru jedním tlačítkem u zakázky. Klientovi přijde e-mail z krystof@vizeon.cz, heslo si nastaví sám a po přihlášení vidí svou zakázku. Heslo nezná nikdo jiný (D-K12, R-121).

## Než začneš
Rituál začátku (`zakaziq-memory`). Přečti `docs/klientsky-prostor/PLAN.md` 4.1, 4.7, 6, 7 (D-K12), R-107, R-116, R-121 v paměti a plán přihlášení z větve: `git show auth/supabase-klient:docs/AUTH-SUPABASE-PLAN.md` (sekce F1 a „Nastavení, které musí udělat Kryštof"). Projdi `git log --oneline main..auth/supabase-klient` a `lib/portal/{invite,context}.ts`, `app/klient/`, `components/admin/portal-client-forms.tsx`, `components/admin/project-detail-view.tsx`, `lib/email.ts` (`sendVizeonMail`).
Skilly: `zakaziq-workspace-backend`, `web-security-review`, `web-security-memory`, `zakaziq-ux-texty-cs`, `humanize-text-cs` (e-mail), `zakaziq-design-dilky`.
**Zadání výslovně povoluje změny v:** detailu zakázky v adminu (tlačítko a stav pozvánky), `app/dashboard/klientsky-prostor/`, `lib/portal/`, `app/klient/`, `proxy.ts` v rozsahu F1.

## Kroky
1. **Převzít F1.** Nová větev z aktuálního `main` (např. `klient/kp11-prihlaseni`). Z `auth/supabase-klient` vezmi commit `ba226aa` (klientský prostor přes Supabase). Druhý commit `712cb66` nese R-109/R-110, které na `main` už jsou jinými commity: ověř to a nepřenášej ho podruhé. Vyřeš konflikty (`proxy.ts`, `lib/supabase/*`, `memory/*`). Testy `portal-supabase-auth` a `portal-isolation` musí projít.
2. **Seznam pro Kryštofa.** Přesně podle F1: migrace 113 na produkci, hook „Before User Created" typu HTTPS, `SUPABASE_AUTH_HOOK_SECRET`, vypnout Confirm email, SMTP přes Resend, Redirect URL a `ADMIN_USER_ID`. Nic z toho nenastavuj sám, napiš mu to jako očíslovaný seznam a počkej na potvrzení.
3. **Tlačítko „Pozvat klienta do prostoru"** v detailu zakázky. Předvyplní jméno a e-mail ze zakázky nebo kontaktu. Najde klienta podle e-mailu člena, jinak založí `portal.clients`; propojí zakázku (`portal.link_project`); vytvoří pozvánku vázanou na e-mail; odešle ji přes `sendVizeonMail` z krystof@vizeon.cz s odkazem `/klient/pozvanka/<kód>`. Před odesláním 10 s na „Zpět" (vzor R-117). Klient, který v prostoru už je, dostane jen e-mail „Nová zakázka ve vašem prostoru". Pozvánku na `ADMIN_EMAIL` server odmítne.
4. **Stav u zakázky.** Pozvánka odeslána / přijata / klient se naposledy přihlásil; „Poslat znovu" starou pozvánku zruší.
5. **E-mail.** Krátký, obyčejně česky, kdo zve, co v prostoru najde, jedno tlačítko. `zakaziq-ux-texty-cs`, pak `humanize-text-cs`. Žádné heslo v e-mailu.
6. **Asistent (jen pokud zbude čas).** Akce „pozvi Nováka do prostoru" jako „jedno klepnutí" (odchází e-mail, R-111). Jinak zapiš do Otevřených problémů.
7. **Testy.** Pozvánka platí jen pro svůj e-mail; opakované pozvání nezaloží druhého klienta; pozvánka na admin e-mail odmítnuta; „Zpět" nic neodešle; oddělení klientů prochází.
8. **Průchod v prohlížeči** (až Kryštof potvrdí nastavení; produkce jen se souhlasem): pozvánka → nastavení hesla → přehled → odhlášení → přihlášení → zapomenuté heslo, na 390 a 1280 px.
9. **Paměť.** `web-security-review`, zápis do `.claude/security/` (STATE, DECISIONS, CSP-LOG v rozsahu F1) a synchronizace do `.agents/`, changelog, stav KP11 v plánu, `docs/AUTH-SUPABASE-PLAN.md` (F1 hotovo).

## Hotovo, když
- Klient z pozvánky do 2 minut vidí svou zakázku a heslo si nastavil sám.
- Kryštof pozve klienta jedním klikem z detailu zakázky a vidí stav pozvánky.
- `npx tsc --noEmit`, `npm test`, `npm run build` (při běžícím dev `build:check`) projdou; regrese `/login`, `/dashboard`, `/dashboard/finance`, `/p/[token]`.

## Konec sezení
`zakaziq-memory` → Konec sezení. Commit na požádání, např. `feat: klientský prostor — přihlášení e-mailem a pozvání jedním klikem (R-121)`. Merge do `main` a push = produkční deploy, jen se souhlasem.
