# Supabase — databáze a přihlášení (R-080)

> Od R-080 běží celé ZakazIQ na Supabase: Postgres (admin `public`, Workspace `ws`, klientský prostor `portal`) i přihlášení (Supabase Auth pro admin, Workspace i klientský prostor). Neon, Clerk a NextAuth v kódu nejsou. Proč a s jakými důsledky: `memory/memory.md` → R-080.

## Jak to v kódu funguje

| Co | Kde | Poznámka |
|---|---|---|
| Spojení s DB | `lib/pg.ts` | node-postgres, pool na URL, transakce. Typy a parametry stejné jako dřív u `@neondatabase/serverless`, dotazy se neměnily. |
| Admin `sql\`…\`` | `lib/db.ts` | `DATABASE_URL`, role `postgres` (vlastník, RLS neplatí) |
| Workspace | `lib/ws/db.ts` | `DATABASE_URL_WS`, role `ws_app` pod RLS + `app.account_id` |
| Klientský prostor | `lib/portal/db.ts` | `DATABASE_URL_PORTAL`, role `portal_app` pod RLS + `app.client_id` |
| Session | `proxy.ts` → `lib/supabase/proxy.ts` | ověří JWT z cookie a prošlý token obnoví; jen na `/w`, `/klient`, adminu, `/login`, `/auth` |
| Kdo je přihlášený | `lib/supabase/server.ts` | `getAuthIdentity()` (JWT, rychlé), `getAuthUser()` (Auth server, ověřený e-mail) |
| Admin | `lib/auth.ts`, `lib/auth/admin-identity.ts` | účet s `ADMIN_EMAIL` (a `ADMIN_USER_ID`), ověřený e-mail |
| Účet a role ve Workspace | `ws.members` → `ws.membership_for_user()` | místo Clerk organizací (migrace 100) |
| Člen klientského prostoru | `portal.members.user_id` → `portal.memberships_for_user()` | migrace 101 |
| Formuláře přihlášení | `components/ws/auth/auth-form.tsx` | heslo, Google, registrace, obnova hesla — volají Supabase z prohlížeče |
| Návrat z e-mailu / Googlu | `app/auth/callback/route.ts` | `?code=` (PKCE) i `?token_hash=&type=` |
| Pozvánka vlastníka z adminu | `lib/ws/admin/invite.ts`, `/w/pozvanka/[kod]` | `ws.account_invites`, odkaz přes `auth.admin.generateLink`, e-mail přes Resend |
| Data API Supabase | — | aplikace ho nepoužívá; migrace 102 ho nad `public` zavírá |

## 1. Projekt

1. **Hotovo 2026-11-07:** projekt `zakaziq`, ref `awcgvgkeuwgspybwvvpn`, `https://awcgvgkeuwgspybwvvpn.supabase.co`, Postgres 17.11 (kvůli limitu Free plánu uspán projekt „osobní portfolio“). Při zakládání znovu: Supabase → New project, název `zakaziq`, region **Central EU (Frankfurt) `eu-central-1`** (stejně jako Vercel `fra1`; právní texty říkají Frankfurt).
2. Heslo databáze: Project Settings → Database → **Reset database password**, uložit do správce hesel. Do repa ani do chatu ne.
3. Před spuštěním přepnout na **Pro** (denní zálohy, bez uspávání po týdnu nečinnosti). Free plán dovolí jen 2 aktivní projekty na člověka.

## 2. Databáze

### Connection stringy

Supabase → **Connect**:

| Proměnná | Který řetězec | Uživatel |
|---|---|---|
| `DATABASE_URL` | **Transaction pooler** (port 6543) | `postgres.<project_ref>` |
| `DATABASE_URL_WS` | zapíše `node scripts/ws-create-role.js` | `ws_app.<project_ref>` |
| `DATABASE_URL_PORTAL` | zapíše `node scripts/portal-create-role.js` | `portal_app.<project_ref>` |
| `SUPABASE_DB_URL` (jen přenos dat) | **Session pooler** (5432) nebo přímé spojení | `postgres.<project_ref>` |

SSL je zapnuté vždy. S `DATABASE_CA_CERT` (PEM z Database Settings → SSL Configuration) se navíc ověřuje certifikát serveru.

### Schéma a přenos dat z Neonu (jednou)

Schéma se v Supabase staví **z migrací**, ne kopií Neonu — tak je jisté, že odpovídá kódu. Data se pak přenesou zvlášť.

> **Stav 7. 11. 2026:** v projektu `zakaziq` jsou všechny migrace `000`–`104` (přes Supabase MCP, otisk katalogu = čistý běh v PGlite) a role `ws_app` / `portal_app` mají přihlášení a práva ze `scripts/*-grants.sql` (heslo nastavené jako SCRAM otisk, hesla jen v `.env.local` worktree; kontroly ze skriptů prošly). Pooler: `aws-1-eu-central-1.pooler.supabase.com`. Data z Neonu (projekt `projectiq`) zatím nejsou — přenos jde kdykoli dodatečně, výchozí jen schémata `public` a `portal` (krok 4). Kroky 5 a 6 jsou hotové; zbývá vlastník `DATABASE_URL` (heslo `postgres` jen z dashboardu nebo z integrace Vercel).

1. **Schéma (hotovo 7. 11. 2026 přes Supabase MCP):** příprava (`btree_gist` do schématu `extensions`, role `ws_app` a `portal_app` bez přihlášení, aby granty v migracích proběhly jako na Neonu) a migrace `000`–`096` — stav Neonu před přechodem. `000_zaklad.sql` zakládá tabulky `projects`, `client_messages` a `progress_updates`, které na Neonu vznikly ručně. Otisk katalogu (sloupce, constrainty, indexy, funkce, RLS, triggery, práva rolí) se shoduje s čistým během migrací v PGlite.
2. `brew install libpq && brew link --force libpq` (pg_dump a psql 18+ — Neon běží na Postgresu 18).
3. Zkouška bez zápisu — porovná sloupce Neonu a Supabase, ověří, že jsou tabulky v Supabase prázdné, a udělá dump:
   ```bash
   NEON_DATABASE_URL='…' SUPABASE_DB_URL='…' bash scripts/neon-to-supabase.sh
   ```
4. Nahrání dat (jedna transakce se `session_replication_role = replica` — cizí klíče ani triggery nehlídají pořadí tabulek a sync triggery portálu nic nezdvojí; na konci porovná počty řádků všech tabulek). Výchozí schémata `public` a `portal` (`PRENOS_SCHEMATA`); `ws` z doby Clerku po migraci 100 nesedí (`clerk_user_id` → `user_id`) a účty z ní se stejně nikdo nepřihlásí:
   ```bash
   NEON_DATABASE_URL='…' SUPABASE_DB_URL='…' bash scripts/neon-to-supabase.sh --ano
   ```
   Hlásí-li sloupec, který má Neon a Supabase ne, na Neonu proběhla změna mimo migrace — doplň ji migrací a pusť znovu (nic se mezitím nenahrálo).
5. **Až po datech** migrace `097`–`101`, `103`, `104` (`100` přejmenovává `ws.members.clerk_user_id` → `user_id`, data z Neonu musí přijít ve starém tvaru). `102` (zámek Data API) běží už od 7. 11. 2026 před daty — je idempotentní, v seznamu nevadí. Přes Supabase MCP `apply_migration`, nebo s `DATABASE_URL` = Supabase:
   ```bash
   node scripts/apply-migration.js 097_ws_zruseni_ke_konci_obdobi.sql 098_client_retention.sql \
     099_ws_verejna_stranka_po_checkoutu.sql 100_ws_supabase_auth.sql 101_portal_supabase_auth.sql \
     102_supabase_api_lockdown.sql 103_auth_mfa.sql
   ```
6. Role (už existují bez přihlášení; skripty jim nastaví LOGIN a heslo, doplní práva ze `scripts/*-grants.sql`, zapíšou `DATABASE_URL_WS` a `DATABASE_URL_PORTAL` do `.env.local`, hesla nevypisují a ověří, že role neobchází RLS):
   ```bash
   node scripts/ws-create-role.js
   node scripts/portal-create-role.js
   ```
7. Supabase → Project Settings → **Data API** → vypnout. Aplikace ho nepoužívá; migrace 102 je pojistka, kdyby zůstalo zapnuté.
8. Supabase → Advisors → Security: nesmí hlásit tabulku v `public` bez RLS. „RLS Enabled No Policy“ u tabulek v `public` je záměr (Data API nesmí nic). „Function Search Path Mutable“ (14 funkcí bez SECURITY DEFINER, stav 7. 11. 2026) je otevřená drobnost v `memory/memory.md`.

Workspace účty a členové z doby Clerku v datech zůstanou, ale nikdo se do nich nepřihlásí (id uživatelů Clerku ≠ Supabase). Workspace naostro neběžel; testovací účty stačí založit znovu.

## 3. Přihlášení (Authentication)

### URL Configuration

- **Site URL:** `https://www.zakaziq.cz`
- **Redirect URLs:**
  - `https://www.zakaziq.cz/auth/callback**`
  - `http://localhost:3000/auth/callback**`
  - Preview: `https://*-sobotkakrystof5-pngs-projects.vercel.app/auth/callback**`

Odkaz z e-mailu vede na adresu z `redirectTo` jen tehdy, když je v tomhle seznamu; jinak Supabase pošle na Site URL a přihlášení se nedokončí.

### Sign In / Providers

- **Email:** zapnuto, **Confirm email zapnuto** (admin účet stojí na ověřeném e-mailu), **Secure email change zapnuto** (změnu e-mailu potvrzují obě adresy), **Secure password change zapnuto**, **Minimum password length 10**, **Password requirements: Lowercase, uppercase letters and digits** — stejná pravidla hlídá formulář (`passwordProblem` v `lib/auth/messages.ts`, R-081). Na Pro zapnout i **Prevent use of leaked passwords**.
- **Google:** Client ID a secret z Google Cloud Console (OAuth consent screen „In production“, typ Web application). Authorized redirect URI: `https://<project_ref>.supabase.co/auth/v1/callback`.
- **Allow new users to sign up:** zapnuto (registrace Workspace a klientského prostoru).

### Dvoufázové ověření (MFA, R-081)

Authentication → **Multi-Factor** → **TOTP (App Authenticator)**: *Enabled*. Ostatní metody (telefon, WebAuthn) vypnuté.

- **Admin:** povinné. Po hesle přijde `/login/overeni`; kdo aplikaci na kódy ještě nemá, nastaví ji tam (QR kód). Bez úrovně `aal2` proxy i `getAdminSession` admina nepustí.
- **Workspace a klientský prostor:** volitelné, zapíná si ho každý v *Přihlášení a zabezpečení* (`/w/zabezpeceni`, `/klient/zabezpeceni`). Kdo ho má, po přihlášení opíše kód na `/w/overeni` / `/klient/overeni` — hlídá to server (`ws.auth_state` / `portal.auth_state`, migrace 103/104), ne jen prohlížeč.
- **Ztracený telefon:** v aplikaci jde přidat druhé zařízení (doporučeno). Když je pryč všechno, admin v Supabase → Authentication → Users → uživatel → **MFA factors** → smazat, a hned si nastaví nový.

### Ochrana proti botům (CAPTCHA, R-081)

Cloudflare Turnstile na přihlášení, registraci a obnově hesla (admin, Workspace, klientský prostor). Token ověřuje Supabase.

1. Cloudflare → Turnstile → **Add widget**: hostname `zakaziq.cz`, `www.zakaziq.cz`, `localhost` (a Preview doména, pokud se na ní přihlašuje), Widget Mode **Managed**.
2. **Site key** do Vercelu jako `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Production i Preview) a **nasadit**.
3. Teprve potom Supabase → Authentication → **Attack Protection** → **Enable Captcha protection** → Turnstile → **Secret key**.

Pořadí je důležité: se zapnutou CAPTCHA v Supabase a bez site key ve webu se nikdo nepřihlásí. CSP pouští rámeček `challenges.cloudflare.com` jen na přihlašovacích stránkách (CSP-LOG v8).

### Relace

- Authentication → **Sessions**: *Detect and revoke potentially compromised refresh tokens* zapnuté. Na Pro zvážit *Time-box user sessions* (např. 30 dní) a *Inactivity timeout*.
- **Odhlásit všechna zařízení** (v Přihlášení a zabezpečení) volá `signOut({ scope: 'global' })`. Workspace a klientský prostor to poznají hned (relace zmizí z `auth.sessions`), admin přes `getUser`.
- JWT expiry nechat 3600 s — platnost tokenu po zrušení relace stejně hlídá databáze.

### SMTP (bez něj e-maily nechodí zákazníkům)

Výchozí odesílání Supabase posílá jen členům týmu projektu a pár e-mailů za hodinu. Authentication → Emails → **SMTP Settings**:

| Pole | Hodnota |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | API klíč Resendu s právem odesílat z `zakaziq.cz` |
| Sender email | např. `prihlaseni@zakaziq.cz` (doména ověřená v Resendu) |
| Sender name | `ZakazIQ` |

### E-mailové šablony

Authentication → Emails → Templates. Obsah zkopírovat ze souborů v `docs/supabase/emaily/` (odkaz s `token_hash` funguje i v jiném prohlížeči než registrace):

| Šablona | Soubor | Předmět |
|---|---|---|
| Confirm signup | `potvrzeni-registrace.html` | Potvrďte svůj e-mail |
| Reset password | `obnova-hesla.html` | Nové heslo do ZakazIQ |
| Magic link | `prihlasovaci-odkaz.html` | Přihlášení do ZakazIQ |
| Change email address | `zmena-emailu.html` | Potvrďte nový e-mail |
| Reauthentication | výchozí Supabase, jen přeložit: „Kód pro změnu hesla: {{ .Token }}“ | Kód pro změnu hesla |

Pozvánku vlastníka z adminu posílá aplikace sama (Resend, `WS_EMAIL_FROM`), šablona „Invite user“ se nepoužívá.

### Admin účet

1. Authentication → Users → **Add user** → e-mail = `ADMIN_EMAIL`, heslo ze správce hesel (aspoň 10 znaků, malé i velké písmeno a číslice), **Auto Confirm User** zapnuto.
2. Zkopírovat jeho **UID** do `ADMIN_USER_ID`.
3. Admin účet založit **dřív**, než se otevře registrace — e-mail pak už nikdo jiný nezaregistruje.
4. **Hned** se přihlásit na `/login` a na `/login/overeni` nastavit aplikaci na kódy. Dokud to admin neudělá, mohl by si ji s jeho heslem nastavit kdokoli. Pak v `/dashboard/zabezpeceni` přidat i záložní zařízení.

## 4. Proměnné prostředí

### Integrace Supabase ↔ Vercel (doporučeno)

Supabase dashboard → projekt `zakaziq` → **Project Settings → Integrations → Vercel** → nainstalovat a připojit Vercel projekt `project-iq` (tým „sobotkakrystof5-png's projects“), zapnout synchronizaci proměnných pro Production, Preview i Development. Integrace sama zapíše a při změně (rotace klíče, nové heslo DB) aktualizuje:

| Proměnná z integrace | Aplikace ji čte jako |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | stejně (názvy sedí) |
| `POSTGRES_URL` (Transaction pooler 6543) | databáze vlastníka, když chybí `DATABASE_URL` (`ownerDatabaseUrl()` v `lib/pg.ts` a `scripts/lib/db.js`) |
| `POSTGRES_URL_NON_POOLING`, `POSTGRES_*`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_JWT_SECRET` | nepoužívá |

**Přednost má `DATABASE_URL`.** Ve Vercelu dnes míří na Neon (Production i Preview), takže samotné připojení integrace nic nepřepne. Přepnutí na Supabase = po přenosu dat smazat `DATABASE_URL` ve Vercelu (pak platí `POSTGRES_URL`). Produkce ze starého `main` nové proměnné nečte, připojení integrace jí neublíží.

`DATABASE_URL_WS`, `DATABASE_URL_PORTAL`, `ADMIN_EMAIL`, `ADMIN_USER_ID` integrace neumí — ty se ve Vercelu nastavují ručně (hodnoty rolí zapíšou skripty do `.env.local`).

### Přehled

Do `.env.local` a do Vercelu (Production i Preview; Preview může mít vlastní projekt):

| Proměnná | Kde se bere |
|---|---|
| `DATABASE_URL`, `DATABASE_URL_WS`, `DATABASE_URL_PORTAL` | viz Databáze |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → Publishable key (`sb_publishable_…`) |
| `SUPABASE_SECRET_KEY` | Project Settings → API Keys → Secret key (`sb_secret_…`), jen server |
| `ADMIN_EMAIL`, `ADMIN_USER_ID` | viz Admin účet |
| `DATABASE_CA_CERT`, `PG_POOL_MAX` | volitelné |

Smazat z Vercelu i `.env.local`: `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_PASSWORD_HASH`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`. `NEXT_PUBLIC_APP_URL` musí být nastavená všude (dřív ji v pár odkazech zastupoval `NEXTAUTH_URL`).

## 5. Ověření po nasazení

- [ ] `/login` → admin → `/login/overeni` (první přihlášení: QR kód) → kód → `/dashboard`, `/alteno`, `/hub` načtou data; odhlášení vede na `/login`.
- [ ] Admin přihlášený jen heslem (bez kódu) na `/dashboard` skončí na `/login/overeni`.
- [ ] `/w/zabezpeceni`: zapnout 2FA → odhlásit → přihlásit → `/w/overeni` chce kód. Odebrat zařízení → přihlášení zase bez kódu.
- [ ] Změna hesla: kód přijde e-mailem, bez něj heslo nejde změnit.
- [ ] Odhlásit všechna zařízení ve dvou prohlížečích: druhý prohlížeč při dalším kliknutí skončí na přihlášení s hláškou.
- [ ] Turnstile: přihlášení a registrace projdou; s vypnutým JavaScriptem formulář neodejde (CAPTCHA v Supabase odmítne).
- [ ] Účet bez `ADMIN_EMAIL` se na `/login` nepřihlásí („Tenhle účet nemá přístup do administrace.“) a `/dashboard` ho pošle na `/login`.
- [ ] `/w/registrace` → e-mail s odkazem → `/w/novy` → založení byznysu → krok 2 předplatné.
- [ ] Google přihlášení na `/w/prihlaseni` a `/klient/prihlaseni`.
- [ ] Zapomenuté heslo → e-mail → `/w/nove-heslo` → nové heslo funguje.
- [ ] Pozvánka z `/dashboard/klienti` → e-mail → `/w/pozvanka/…` → „Převzít účet“ → vlastník.
- [ ] Pozvánka do klientského prostoru → `/klient/pozvanka/…` → přístup.
- [ ] `/p/[token]`, `/h/[token]`, `/r/[slug]` bez přihlášení fungují.
- [ ] Crony (`vercel.json`) doběhnou bez chyby připojení k DB.
- [ ] `web-security-audit` na Preview: CSP bez Clerku, `connect-src` jen `'self'` + Supabase na přihlašovacích stránkách.

## 6. Úklid po přechodu

- Clerk: smazat aplikaci, z DNS u WEDOS 5 CNAME záznamů Clerku (podle `clerk-zakaziq.cz.zone`), pak ten soubor z repa.
- Neon: nechat nejvýš 30 dní jen pro čtení jako zálohu (R-079: data ze záloh zmizí do 30 dní), potom projekt smazat i se snímky a větvemi.
- Rotovat heslo `neondb_owner` už není potřeba, pokud se Neon smaže.
