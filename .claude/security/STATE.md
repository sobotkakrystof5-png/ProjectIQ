# Bezpečnostní stav

> Současný stav. Přepisuje se — historie je v ostatních souborech.
> Čti na začátku každého sezení, které sahá na hlavičky, CSP, proxy, API nebo vstupy.

**Poslední aktualizace:** 2026-11-07, přechod na Supabase (R-080, DECISIONS #022) a přísnější přihlášení (R-081, DECISIONS #023): databáze i přihlášení admin/Workspace/klientský prostor v Supabase, Clerk a NextAuth pryč, povinné 2FA adminu, volitelné 2FA a kontrola zrušené relace ve Workspace a klientském prostoru, Turnstile na přihlašovacích formulářích, CSP v8, migrace 102 zavírá Data API. Schéma 000–104 a role `ws_app`/`portal_app` v Supabase (projekt `zakaziq`, hesla rolí nastavená jako SCRAM otisk, kontroly RLS prošly), data z Neonu zatím ne; v prohlížeči neověřeno

## Projekt

- Weby: admin konzole (produkce, Vercel, deploy z `main`), ZakazIQ Workspace + landing page (větev `workspace`, zatím nenasazeno, cílová doména `zakaziq.cz`)
- Hosting: Vercel (Hobby, crony ve `vercel.json`)
- Framework: Next.js 16.4 App Router (Turbopack, React 19); `proxy.ts` běží na Node runtime (dřív edge middleware)
- Repo: github.com/sobotkakrystof5-png/ProjectIQ, soukromé: ověřit
- Kde jsou hlavičky:
  - `next.config.mjs` → statické hlavičky pro všechny odpovědi (HSTS, nosniff, X-Frame-Options, CORP, COOP…)
  - `proxy.ts` + `lib/security/csp.ts` → CSP s nonce per request, obnova session Supabase Auth (`lib/supabase/proxy.ts`) a ochrana `/w`, `/klient` a adminu
  - `lib/security/embed.ts` → `frame-ancestors` pro `/r/[slug]` a CORS pro `/api/public/v1/*`; domény z `web_integrations.allowed_origins` (`/r` přes `lib/ws/intake/embed-origins.ts` v proxy, API přes `lib/ws/intake/http.ts`)

- Workspace PDF S14: /api/ws/[business]/faktury/[id]/pdf kontroluje účet/byznys/modul a vrací přílohu; generátor bez sítě/JavaScriptu, logo se stahuje s připnutou veřejnou IPv4 a limitem. Puppeteer/Chromium externalizované, binárky trasované pro PDF. CSP/hlavičky beze změny. Review v AUDIT-LOG.

## Threat model

Co aplikace drží, a proto na čem záleží:

- [x] **Osobní údaje zákazníků firem** (jména, telefony, e-maily, historie návštěv) → GDPR, únik mezi účty je nejhorší možná chyba (izolace `account_id`, AGENTS.md B3)
- [x] **Přihlášení** — Supabase Auth pro všechny (R-080): admin = účet s `ADMIN_EMAIL` (+ `ADMIN_USER_ID`) a ověřeným e-mailem, firmy a klienti e-mail + heslo nebo Google; rate limit Supabase → krádež session, převzetí admin e-mailu
- [x] **Platby** — Stripe Checkout (přesměrování, karty nikdy u nás) → ověření podpisu webhooku, idempotence (`ws.stripe_events`)
- [x] **Faktury** (IČO, DIČ, adresy, PDF v DB) → jen za přihlášením, PDF route kontroluje session sama
- [x] **Veřejné vstupy** — poptávky z webů klientů (`/api/public/v1/*`, widget, objednávací stránka), booking API vizeon/alteno, portálové formuláře a kontaktní formulář landing (`app/(marketing)/actions.ts`) → spam, zahlcení, XSS přes uložená data; kontaktní formulář má Zod limity, honeypot, časovou kontrolu a rate limit
- [x] **Vkládání na cizí weby** — `/r/[slug]` v iframe, `/embed/[slug].js` → clickjacking, únik přes špatné CORS
- [x] **E-maily** z domény ZakazIQ přes Resend → podvržení odesílatele bez SPF/DKIM/DMARC
- [x] **Secrets** — DB (3 role), `SUPABASE_SECRET_KEY`, Stripe, Resend, Anthropic, Gmail app password → jen v env Vercelu; `NEXT_PUBLIC_SUPABASE_*` jsou veřejné záměrně

Realistický útočník: automatické skenery a boti na formuláře; u SaaS zvědavý zákazník, který zkouší cizí `account_id`/slug. Nejhorší případ: data jedné firmy vidí jiná firma; doména zneužitá k phishingu jménem byznysů klientů.

## Hlavičky

| Hlavička | Stav | Poznámka |
|---|---|---|
| Strict-Transport-Security | ✅ `max-age=63072000; includeSubDomains; preload` | `preload` zděděný, DECISIONS #005 |
| Content-Security-Policy | ✅ vynucená pro všechny cesty; profily `admin` a `workspace` | DECISIONS #003, #007, #015; živé ověření čeká na Preview |
| X-Content-Type-Options | ✅ nosniff | |
| X-Frame-Options | ✅ DENY | mimo `/r/*`, `/embed/*`, `/api/public/v1/*`; PDF faktury `SAMEORIGIN` (DECISIONS #004) |
| Referrer-Policy | ✅ strict-origin-when-cross-origin | |
| Permissions-Policy | ✅ vše zakázané (kamera, mikrofon, poloha, platby, USB…); výjimka `microphone=(self)` jen na `/p/*` a `/klient/*` | #018 |
| Cross-Origin-Opener-Policy | ✅ same-origin | Google přihlášení přes Supabase je přesměrování celé stránky, ne popup |
| Cross-Origin-Resource-Policy | ✅ same-origin | `cross-origin` pro `/embed/*`, `/api/public/v1/*` a obrázek novinky `/z/novinky/[id]/obrazek` (DECISIONS #013) |
| X-XSS-Protection | ✅ 0 | |
| X-DNS-Prefetch-Control | ✅ off | |
| X-Powered-By | ✅ odstraněno (`poweredByHeader: false`) | |
| X-Robots-Tag | ✅ `noindex, nofollow` | jen `/w`, `/r`, `/z`, `/embed`, `/api`, admin (`/dashboard`, `/alteno`, `/hub`, `/login`, `/p`, `/h`); landing indexovaná (S05). Nejde o ochranu — odkazy s tokenem se tím jen nedostanou do vyhledávačů |

## CSP

Verze: **v7** (CSP-LOG.md)
Režim: **vynucená pro všechny cesty**. Admin používá profil `admin`, Workspace a přesné cesty landing page profil `workspace`.
Výběr profilu: `cspProfileFor()` v `lib/security/csp.ts`

Společný základ: `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'nonce-…' 'strict-dynamic' https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self'; frame-src 'none'; worker-src 'self' blob:; manifest-src 'self'` (+ `upgrade-insecure-requests` jen vynucená). Dev navíc `'unsafe-eval'` a `ws:`/`wss:`.

Třetí strany:
- admin: Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`), TradingView (`frame-src www.tradingview-widget.com`), na `/dashboard/faktury/*` `object-src 'self'` + `frame-src 'self'` (náhled PDF)
- `/w/*`, `/klient/*`, `/login`: Supabase Auth — jen `connect-src` origin projektu (`NEXT_PUBLIC_SUPABASE_URL`). Žádný skript ani rámeček třetí strany. S08 případně Stripe (`form-action`)
- `/r/<slug>`: `frame-ancestors 'self'` + povolené domény byznysu z DB (S11, v4; chyba = jen `'self'`)

Známé výjimky: `style-src 'unsafe-inline'` (DECISIONS #002).

`/login` je nově dynamický (`app/(auth)/login/layout.tsx`) a dostává nonce. Výchozí 404 zůstává statická; její skripty se nemohou hydratovat, ale stránka neobsahuje citlivá ani uživatelská data (DECISIONS #015). Ruční průchod adminu, Chrome/Safari a produkční build čekají na Preview.

## DNS a pošta (`zakaziq.cz`)

Doménu spravuje Kryštof (registrátor: doplnit). Vercel API potvrzuje `zakaziq.cz` a `www.zakaziq.cz` jako ověřené domény projektu `project-iq`; produkční nasazení je stále starší `main` (SHA `d9484001`). Živý audit `www.zakaziq.cz` 2026-10-17: HTTPS 308/200, TLS 1.3 a platný certifikát ověřeny; produkce postrádá CSP, COOP a CORP, posílá `x-powered-by: next.js`, SPF a DMARC chybí. Audit hlásil nedostupný `security.txt`, ale soubor je v repu i Preview deploymentu; HTTP odpověď vyžaduje ověření po odblokování Vercel challenge. Přímé DNS dotazy pro apex nevrátily DS/CAA/TXT. Po skenu Vercel dočasně vracel challenge 403; neopakovat hromadné požadavky. Detail v `AUDIT-LOG.md`.

| Položka | Stav | Cíl |
|---|---|---|
| DNSSEC | ⚠️ apex dotaz DS bez záznamu; Vercel domény jsou ověřené | ověřit správu DNS a zapnout DNSSEC |
| CAA | ⚠️ apex dotaz CAA bez záznamu; audit `www` ukázal CAA odpověď | potvrdit CAA pro apex a potřebné CA |
| SPF | ❓ | Resend posílá ze subdomény (`send.zakaziq.cz`): MX `send` → `feedback-smtp.eu-west-1.amazonses.com` (10) a TXT `send` = `v=spf1 include:amazonses.com ~all` podle hodnot z Resend dashboardu; kořen domény bez pošty `v=spf1 -all`. Postup `docs/workspace/SETUP.md` → E-maily (S15) |
| DKIM | ❓ | záznam `resend._domainkey` z Resend dashboardu |
| DMARC | ❓ | TXT `_dmarc`: začít `v=DMARC1; p=none; rua=mailto:info@vizeon.cz` → po 2–4 týdnech čistých reportů `p=quarantine` → `p=reject` |
| MX | ❓ | jen pokud bude doména přijímat poštu (Reply-To jde na e-mail klienta, takže nemusí) |

Hodnoty SPF/DKIM vždy z Resend dashboardu, ne odsud — tady je jen tvar. Odesílací adresa Workspace `rezervace@zakaziq.cz` (`WS_EMAIL_FROM`); dokud není nastavená, e-maily čekají ve frontě a nic neodchází (S15).

## Aplikace

- Validace na serveru: Zod ve veřejných admin API a portálových akcích ✅; Workspace povinně (AGENTS.md B11, B13)
- Izolace účtů: `requireWorkspace()` + `account_id` v každém dotazu (`lib/ws/context.ts`, `lib/ws/db.ts`) + RLS na všech tabulkách `ws` s daty účtu, role `ws_app` bez BYPASSRLS, složené cizí klíče (S06, DECISIONS #008). Testy `lib/ws/__tests__/ws-schema.test.ts` ✅. Identita ze Supabase Auth, účet a role z `ws.members` přes `ws.membership_for_user()` (SECURITY DEFINER, migrace 100, R-080); účet zakládá jen průvodce `/w/novy` (server action, `account_id` generuje server), jeden vlastněný účet na člověka (unikátní index). Pozvánky vlastníků z adminu: `ws.account_invites` (HMAC kódu s `WS_KEY_PEPPER`, `ws_app` tabulku nevidí, uplatní jen `ws.redeem_account_invite` s ověřeným e-mailem)
- Platby (S08): Stripe jen na serveru (`lib/ws/stripe.ts` se `server-only`, omezený klíč `rk_…`), Checkout a Customer Portal jako přesměrování, takže CSP se nemění. Webhook `/api/stripe/webhook`: podpis přes `constructEvent` ze syrového těla (tolerance 5 min), bez `STRIPE_WEBHOOK_SECRET` 503, limit těla 512 kB, idempotence `ws.stripe_events`, payload se neukládá a předplatné se vždy znovu načte ze Stripe. Účet z metadat podepsané události, návrat z Checkoutu ověří `client_reference_id` proti přihlášenému účtu. Spravovat předplatné smí jen vlastník
- Rate limit: admin API a portál DB-backed (`lib/api-rate-limit.ts`, `isRateLimited`) ✅; Workspace veřejné vstupy `lib/ws/intake/rate-limit.ts` nad `ws.rate_limits` (IP jen jako HMAC) ✅ S11
- Veřejné API `/api/public/v1/*` (S11): tajný klíč `sk_live_…` jen ze serveru (s `Origin` = 401), v DB prefix + HMAC-SHA256 s `WS_KEY_PEPPER`, `timingSafeEqual`; veřejný klíč `pk_live_…` jen z `allowed_origins`; Zod + délky, tělo 64 kB, `Idempotency-Key`, záznam `ws.intake_log` bez IP. Widget jen `textContent`. DECISIONS #010
- E-maily (S15): jen přes frontu `ws.outbound_messages` a Resend na serveru (`lib/ws/email/transport.ts`, `server-only`). Veškerý text v HTML escapovaný, odkazy jen http/https, předmět bez konců řádků, jméno odesílatele očištěné. Odkazy z e-mailů podepsané HMAC (klíč odvozený z `WS_KEY_PEPPER`), akce majitele jednorázové 72 h (`ws.action_tokens`), GET nic nemění, `Referrer-Policy: no-referrer`. Hromadné zprávy jen se souhlasem (ověří se i těsně před odesláním), odkaz na odhlášení + `List-Unsubscribe` jedním klikem. Webhook `/api/resend/webhook`: podpis Svix, tolerance 5 min, idempotence `ws.webhook_events`, bez `RESEND_WEBHOOK_SECRET` 503. Novinky `ws.product_news` ws_app jen čte. DECISIONS #011
- Klientský portál (S16): `/z/[token]` bez přihlášení, token je DB UUID. `ws.portal_lookup` (SECURITY DEFINER) vrací jen účet/byznys/druh/ID; další čtení a zápisy jdou přes RLS s oběma filtry. Neplatný, cizí, archivovaný i vypnutý odkaz = stejná 404. Akce mají Zod, honeypot hodnocení, limity na IP i záznam; PDF kontroluje vazbu faktury na zakázku a vrací `private, no-store`. Interní poznámky, kontakty a vlastní kolonky se nenačítají. DECISIONS #012
- Kontext obrazovky (RD02): `ws.business_scope(user, account, slug)` (SECURITY DEFINER, migrace 085, od 100 podle uživatele) vrací účet, byznys, předplatné, funkce a byznysy jen pro účet přihlášeného; výsledek žije jen v paměti jednoho požadavku (klíč `accountId:slug`). Chybí-li funkce (42883), běží starý postup. DECISIONS #016
- Admin nad Workspace (S17, zpřesněno RD11): `/dashboard/klienti`, `/dashboard/novinky` čtou `ws` vlastníkem tabulek (`lib/ws/admin/db.ts`, `server-only`), každá akce `getAdmin()` (admin účet Supabase Auth). Admin zapisuje novinky a audit; poznámky `ws.account_admin_notes` už konzole nečte ani neupravuje. Klientský přehled nečte osobní/finanční obsah zákazníků, poptávek, termínů a faktur ani volné podrobnosti auditu; zůstávají agregované počty a údaje účtu, byznysů a členů týmu. Vlastník tabulek má technicky širší DB přístup (DECISIONS #017). Obrázek novinky z DB, jen PNG/JPEG/WebP podle bajtů, veřejný jen po zveřejnění. DECISIONS #013, #017
- Aktivita zakázky a hlášení z Claude Code (KP03/KP04): `project_activity` (migrace 093) drží koncepty a schválené zprávy; klient vidí jen `published` (`/p/[token]` i `/klient`), nikdy koncepty, zdroj ani příznak citlivosti. Schválení jen z adminu (`requireAuth`), citlivý koncept nejde schválit (CHECK v DB + server). Klíč projektu zapisuje jen koncepty, DECISIONS #019
- Klientský prostor (KP05–KP07): `/klient` (Supabase Auth, členství `portal.members.user_id`, migrace 101), schéma `portal` + role `portal_app` bez práv do `public`, RLS, pozvánky s HMAC hashem, zápisy jen funkcemi `portal.submit_*`, DECISIONS #020. Test oddělení `lib/__tests__/portal-isolation.test.ts` ✅ (PGlite). Požadavek, zpráva a hodnocení mají limity v DB funkcích. Přepis hlasu `POST /api/klient/transcribe` jen pro přihlášeného člena, limity po IP a členovi
- Předání zadání do Claude Code (KP09, úroveň 2): příkaz pro terminál s textem klienta v dočasném souboru přes heredoc s náhodným oddělovačem, bez `$(…)`; test ve skutečném shellu (bash 3.2) potvrdil, že text nic nespustí. Claude Code se spouští s `--permission-mode plan` (od 2026-11-03), takže pokyny vložené do zadání nic nezmění bez schválení plánu člověkem. Plně automatické spuštění z textu klienta se nedělá
- Captcha: přihlášení, registrace a obnova hesla (admin, Workspace, klientský prostor) přes Cloudflare Turnstile, token ověřuje Supabase Auth (DECISIONS #023, aktivní až s `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + CAPTCHA v Supabase). Veřejné formuláře poptávek dál honeypot `website` + rate limit (DECISIONS #010)
- Secrets: jen env Vercelu, `.env*` v `.gitignore` (kromě vzorů), gitleaks v CI. Historie gitu 2026-10-08 čistá (90 commitů)
- Objednávací stránka `/r/[slug]` a widget podle slugu jen pro účet, který dokončil Checkout (aspoň jeden řádek `ws.subscriptions`, migrace 099, R-077); po skončeném předplatném poptávky přijímá dál (B5)
- Session: Supabase Auth v cookies (`@supabase/ssr`), proxy obnovuje token jen na `/w`, `/klient`, adminu, `/login` a `/auth`; běžné stránky ověřují JWT podpisem (`getClaims`), admin, pozvánky a profil dotazem na Auth server (`getUser`). Admin povinně s 2FA (TOTP, úroveň `aal2` v proxy i `getAdminSession`); Workspace a klientský prostor 2FA volitelně, vynucuje ho server přes `ws/portal.auth_state` (migrace 103/104), tatáž funkce odmítne relaci zrušenou „Odhlásit všechna zařízení“ (DECISIONS #023). Heslo min. 10 znaků s malým, velkým písmenem a číslicí; změna hesla jen s kódem z e-mailu. Zámek na IP (`login_attempts`) nahradil rate limit Supabase. Přesměrování po přihlášení jen na vlastní cesty (`lib/auth/redirect.ts`). Na `/login` se ne-admin účet hned odhlásí. Cookies `sb-…-auth-token` nejsou HttpOnly (čte je prohlížečový klient Supabase) — XSS by znamenalo krádež session, hlavní pojistkou je vynucená CSP s nonce (stejné riziko jako dřív `__session` Clerku, DECISIONS #009)
- Zálohy: Supabase (denní zálohy až na Pro plánu; Free žádné) — test obnovy nikdy neproběhl

## Otevřené položky

| Položka | Proč | Kdo | Kdy |
|---|---|---|---|
| Supabase projekt (Frankfurt, Pro), přenos dat `scripts/neon-to-supabase.sh`, migrace 097–102, role `ws_app` a `portal_app` přes skripty, `DATABASE_URL*` do Vercelu | bez toho kód z R-080 nemá DB; role nikdy v dashboardu (skript ověří, že neobchází RLS); postup `docs/supabase/SETUP.md` | Kryštof + Claude | před nasazením |
| Supabase Auth: potvrzování e-mailu zapnuté, admin účet založený jako první + `ADMIN_USER_ID`, Redirect URLs jen naše domény, Google provider, SMTP přes Resend, šablony `docs/supabase/emaily/`, Data API vypnuté | jinak hrozí převzetí admin e-mailu, přesměrování mimo web nebo nedoručené e-maily | Kryštof | před nasazením |
| Google přihlášení v prohlížeči | Supabase přesměrovává celou stránkou (COOP `same-origin` nevadí) — ověřit ručně | Kryštof | při prvním přihlášení Googlem |
| Stripe: sandbox ZakazIQ, omezený klíč `rk_…`, `STRIPE_WEBHOOK_SECRET` (lokálně `stripe listen`, produkce endpoint v dashboardu) | bez klíčů Checkout nejde otevřít a webhook vrací 503; `sk_…` nepoužívat (SETUP.md → Stripe) | Kryštof | před ručním testem S08 / nasazením `/w` |
| Stripe live mód (produkt, cena, Portal, e-maily, šablona faktury s IČO, webhook) | sandbox nesmí do produkce | Kryštof + Claude | S19 |
| `WS_KEY_PEPPER` do Vercelu (Production + Preview, jiná hodnota než lokálně) | bez něj tajné klíče webů nejde vytvořit ani ověřit (API 503). Po nastavení už neměnit — změna zneplatní všechny tajné klíče | Kryštof | před nasazením `/w` |
| Zod 4 sonda `new Function` | hlásí `unsafe-eval` na portálu; Workspace zatím Zod jen na serveru (S07) — `z.config({ jitless: true })` až s prvním formulářem validovaným v prohlížeči | — | S10+ |
| `security.txt` | Canonical od 2026-11-01 na `https://www.zakaziq.cz/` (hlavní host D1, R-075). Audit neobdržel 200; soubor existuje v `public/.well-known/security.txt` a v Preview balíčku, produkce běží ze staršího commitu; kontakt a HTTP cestu ověřit | po přístupu k doméně |
| DNS `zakaziq.cz` (DNSSEC, CAA, SPF, DKIM, DMARC) + doména v Resendu | bez nich lze posílat poštu jménem domény a e-maily padají do spamu; postup `docs/workspace/SETUP.md` → E-maily (S15) | Kryštof | před nastavením `WS_EMAIL_FROM` |
| `WS_EMAIL_FROM` a `RESEND_WEBHOOK_SECRET` do Vercelu (+ endpoint webhooku v Resendu) | 2026-11-01: doména Verified, obě proměnné jen ve Vercel Production (Preview záměrně bez odesílání), webhook v Resendu založený a **vypnutý do nasazení** (platí pro celý účet, dnešní produkce cestu nemá). Zbývá: zapnout webhook při nasazení, DMARC `_dmarc`, klíč s právem jen Sending access pro `zakaziq.cz` | Kryštof + Claude | při nasazení |
| CI proměnná `SITE_URL` | job `headers` se jinak neprovede | Kryštof | po prvním nasazení Workspace |
| Neon po přechodu: nejvýš 30 dní jen pro čtení, pak smazat i se snímky (R-079); do té doby platí výměna hesla `neondb_owner` (vloženo do chatu 2026-11-01) | role obchází RLS | Kryštof | po přechodu |
| Zapnout TOTP v Supabase (Authentication → Multi-Factor), hned po založení admin účtu nastavit 2FA na `/login/overeni` a přidat záložní zařízení | kód je hotový (R-081), bez zapnutého TOTP se admin nepřihlásí; do nastavení 2FA by si ho s heslem nastavil kdokoli | Kryštof | při přechodu |
| Turnstile: widget v Cloudflare, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` do Vercelu a nasadit, pak CAPTCHA v Supabase (v tomhle pořadí) | bez toho přihlašovací formuláře boti zkoušejí bez omezení kromě rate limitu Supabase | Kryštof | při přechodu |
| `NEXT_PUBLIC_APP_URL` v Production = `https://www.zakaziq.cz` | odkazy v pozvánkách a e-mailech; `NEXTAUTH_URL` už ji nezastupuje | Kryštof | při nasazení |
| Monitoring chyb (Sentry nebo Vercel Observability) | o chybě po spuštění se jinak nikdo nedozví; Sentry potřebuje záznam v CSP-LOG (`connect-src`) | Kryštof (rozhodnutí) | před spuštěním |
| Samostatná DB role pro běh adminu (bez DDL), `postgres` jen na migrace | dnes admin běží rolí vlastníka s BYPASSRLS | Kryštof + Claude | po spuštění |
| Živý audit produkce | `www.zakaziq.cz`: chybí CSP, COOP, CORP, `security.txt`, SPF a DMARC; `x-powered-by` zůstává. Produkce je starší `main`; opravy jsou v Preview/kódu | před spuštěním |
| Chrome/Safari průchod vynucené CSP | Preview build READY; přihlášení (admin, Workspace, klient) po přechodu na Supabase zatím nikdo neprošel | po doplnění Preview env |
| Migrace 092–096 na produkci a role `portal_app` (`scripts/portal-create-role.js`), `DATABASE_URL_PORTAL`, `PORTAL_INVITE_PEPPER`, `AGENT_KEY_PEPPER` do Vercelu | bez nich nejde vytvořit klíč projektu ani pozvánku a `/klient` nemá DB; roli jen skriptem, nikdy v konzoli (konzolové role obcházejí RLS) | Kryštof | před nasazením klientského prostoru |
| Přihlášení přes Supabase na `/klient` v prohlížeči | proxy, CSP a pozvánka jsou ověřené jen testy; skutečný průchod (registrace z pozvánky, přihlášení, odhlášení) nikdo neprošel | Kryštof + Claude | před prvním klientem |
| HSTS preload | zděděné `preload` — ověřit stav na hstspreload.org pro produkční doménu adminu | Kryštof | S19 |
| Test obnovy zálohy Supabase | zálohu, kterou nikdo neobnovil, nelze brát jako zálohu | Kryštof | před spuštěním |

## Neměnit bez zeptání

- `X-Frame-Options: SAMEORIGIN` na `/api/invoices/:id/pdf` — jinak přestane fungovat náhled PDF faktury.
- Výjimky `/r/*`, `/embed/*`, `/api/public/v1/*` z `X-Frame-Options`/CORP — jinak nepůjde vložit objednávka ani widget na weby klientů.
- `object-src`/`frame-src 'self'` jen na `/dashboard/faktury/*` — nerozšiřovat na celý admin.
- Pořadí v `proxy.ts`: session Supabase (jen cesty s přihlášením) → ochrana `/klient`, `/w`, adminu → CSP. Admin = jen `ADMIN_EMAIL` (+ `ADMIN_USER_ID`), nikdy jakýkoli přihlášený účet.
- Workspace nikdy přes `DATABASE_URL` (admin role obchází RLS) — jen `DATABASE_URL_WS` / `lib/ws/db.ts`. RLS na `ws` se nevypíná a politika nikdy `USING (true)`.
