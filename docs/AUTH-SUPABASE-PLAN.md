# Přihlášení přes Supabase Auth — plán přechodu z Clerku (R-107)

> Zadání Kryštofa 2026-11-15: veškeré přihlašování přes Supabase — admin, klientský
> prostor i Workspace. Klienti se přihlašují **e-mailem a heslem**. Data zůstávají
> v Neonu (R-002), Supabase je jen poskytovatel identity. Admin přešel už v R-105.

## Stav

| Fáze | Co | Stav |
|---|---|---|
| F0 | Admin `/dashboard` (R-105, R-106) | na produkci od 2026-11-15 |
| **F1** | Klientský prostor `/klient` | **v kódu** na větvi `klient/kp11-prihlaseni` (převzato z `auth/supabase-klient` v KP11, 2026-11-18), migrace 113 připravená, neaplikovaná |
| F2 | Workspace `/w`, `/api/ws`, pozvání klientů z adminu (S17) | nezačato |
| F3 | Odstranění Clerku z repa (`@clerk/*`, webhook, CSP, env) | nezačato, až po F2 |

## Omezení, se kterými plán počítá

- **Jeden projekt Supabase pro všechny.** Free plán dovolí dva aktivní projekty
  a oba jsou obsazené (`zakaziq`, `estatiq`). Admin, klienti i firmy z Workspace
  jsou proto v projektu `zakaziq`. Do adminu se nikdo jiný nedostane — rozhoduje
  `ADMIN_EMAIL` a zapsaný druhý faktor, ne to, že má někdo účet v Supabase.
  Pozvánku na e-mail adminu nejde vytvořit.
- **Registrace jen přes náš server.** Hook „Before User Created" je HTTP endpoint
  `POST /api/auth/supabase-hook` (`lib/supabase/signup-hook.ts`). Pustí účet jen
  s otiskem platné pozvánky v `user_metadata` a se shodným e-mailem. Otisk zná jen
  server (HMAC s `PORTAL_INVITE_PEPPER`), takže registrace přímo přes API Supabase
  s veřejným klíčem neprojde. Účet adminu tudy nevznikne (při obnově se hook na
  chvíli vypne).
- **E-maily ze Supabase na Free plánu chodí jen členům týmu v Supabase.** Klientům
  by nedošel odkaz na nové heslo. Proto vlastní SMTP (Resend, doména `zakaziq.cz`
  už je ověřená).
- **Free projekt se po týdnu bez provozu uspí.** S denním provozem adminu to
  nehrozí, ale pro placený Workspace (F2) je to riziko — viz F2.

## F1 — klientský prostor (hotovo v kódu)

- Přihlášení `/klient/prihlaseni`: e-mail a heslo, server action `signInClient`.
- Pozvánka `/klient/pozvanka/<kód>`: ukáže e-mail, na který zní, a formulář
  „Vaše jméno + heslo". Server založí účet (`signUp`) s otiskem pozvánky, hook
  ho pustí, pozvánka se hned uplatní (`portal.redeem_invite`). Přihlášený se
  shodným e-mailem jen klikne „Přijmout pozvánku".
- Pozvánka **musí** být vázaná na e-mail (admin formulář, `createInvite`,
  constraint `invites_email_required` z migrace 113). Staré nevázané se zruší.
- Zapomenuté heslo `/klient/zapomenute-heslo` → e-mail ze Supabase →
  `/klient/auth/potvrzeni` (výměna kódu za session) → `/klient/nove-heslo`.
  Pro e-mail adminu se odkaz neposílá.
- `proxy.ts` obnovuje session Supabase i pro `/klient` a nepřihlášeného pošle na
  přihlášení s `?next=` (jen cesta uvnitř `/klient`, `safePortalNext`).
- CSP na `/klient` už nepovoluje hosty Clerku (CSP-LOG v9).
- `portal.members.clerk_user_id` nese od migrace 113 id uživatele v Supabase.
  Název zůstal, protože přejmenování by rozbilo opakovaný běh migrace 095.

### Nastavení, které musí udělat Kryštof (pořadí)

> **Stav 2026-11-18:** hotové 1, 4, 6, 6b, navíc Site URL na `https://www.zakaziq.cz`, druhá
> Redirect URL `…/klient/auth/potvrzeni?**` (odkaz nese `?next=`) a `NEXT_PUBLIC_APP_URL` v Production
> na www. Zbývá 5 (heslo SMTP), 2 a 3 (tajemství hooku), česká šablona a 7. Podrobně
> `memory/memory.md` → Otevřené problémy.

1. **Migrace 113** na produkční Neon (`node scripts/apply-migration.js
   migrations/113_portal_supabase_auth.sql --env .env.production.local`). Je
   kompatibilní se starým buildem: ten jen přestane nacházet členy z Clerku, a ti
   naostro neexistují.
2. **Hook v Supabase** (Authentication → Hooks → Before User Created): typ
   **HTTPS**, adresa `https://www.zakaziq.cz/api/auth/supabase-hook`, nechat
   vygenerovat tajemství. Tím se nahradí Postgres hook
   `before_user_created_jen_admin` (R-106) — zapnutý smí být jen jeden.
3. **Tajemství do Vercelu:** `SUPABASE_AUTH_HOOK_SECRET` = hodnota z kroku 2
   (celá, i s `v1,whsec_`), Production. Bez ní endpoint odmítne každou registraci.
4. **Confirm email vypnout** (Authentication → Sign In / Providers → Email).
   Důkaz vlastnictví e-mailu je tu pozvánka: odkaz dostane klient na svůj e-mail
   a platí jen pro něj (stejná logika jako magický odkaz). Se zapnutým potvrzením
   by klient musel čekat na e-mail, který bez SMTP nedojde.
5. **Vlastní SMTP** (Authentication → Emails → SMTP Settings): Resend,
   `smtp.resend.com`, port 465, uživatel `resend`, heslo = API klíč Resendu jen pro
   odesílání, odesílatel z domény `zakaziq.cz`. Česká šablona „Reset Password".
6. **Redirect URLs** (Authentication → URL Configuration): přidat
   `https://www.zakaziq.cz/klient/auth/potvrzeni`.
6b. **`ADMIN_USER_ID`** do Vercelu (Production): id účtu adminu z Authentication →
   Users. S vypnutým potvrzením e-mailu Supabase mění e-mail účtu bez potvrzení;
   s připnutým id do adminu nepustí ani účet, který by si e-mail přepsal na
   `ADMIN_EMAIL`.
7. Deploy větve, pak průchod: pozvánka z adminu → založení přístupu → přehled →
   odhlášení → přihlášení → zapomenuté heslo. Na 390 a 1280 px.

## F2 — Workspace `/w` (nezačato)

Clerk tu drží víc než přihlášení: **organizace** (účet = organizace,
`ws.accounts.clerk_org_id`), členy (`ws.members.clerk_user_id`), pozvánky členů
týmu a klientů z adminu (S17, `lib/ws/admin/invite.ts`), webhook
`/api/clerk/webhook`, průvodce `/w/novy` a mazání organizace po zrušení účtu
(`ws-gdpr`). Návrh:

1. Účet a členství jen v Neonu: `ws.members` dostane id ze Supabase, aktivní účet
   = členství (jeden byznys na účet, R-026). `requireWorkspace()` čte identitu ze
   Supabase místo `auth()` Clerku — rozhraní `WsAuthProvider` už existuje.
2. Registrace z landing page: server action s rate limitem a honeypotem založí
   „povolení k registraci" (nová tabulka, krátká platnost), hook ho pustí stejně
   jako pozvánku. Ověření e-mailu před Checkoutem Stripe je nutné (spam, cizí
   adresy) → potřebuje SMTP z F1 a zapnuté potvrzení jen pro Workspace, nebo
   vlastní ověřovací kód přes Resend.
3. Pozvánky do týmu a pozvání klienta z adminu: vlastní kódy jako v portálu.
4. Stripe se nemění (váže se na `account_id`).
5. Migrace stávajících účtů: dnes jsou jen testovací (dev instance Clerku), takže
   bez převodu — jen zápis do changelogu.
6. **Rozhodnout před F2:** placený Workspace na Free projektu Supabase (uspání,
   limity e-mailů, jeden projekt s adminem) — buď Pro, nebo uvolnit druhý projekt.

## F3 — úklid (nezačato)

Odebrat `@clerk/nextjs`, `@clerk/localizations`, `lib/security/clerk.ts`,
`components/ws/auth/clerk-appearance.ts`, webhook, Clerk zdroje v CSP, env
`CLERK_*`/`NEXT_PUBLIC_CLERK_*` z `.env.example` i Vercelu, DNS záznamy Clerku
u WEDOS. Ověřit, že `grep -r @clerk` je prázdný.
