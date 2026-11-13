# Bezpečnostní stav

> Současný stav. Přepisuje se — historie je v ostatních souborech.
> Čti na začátku každého sezení, které sahá na hlavičky, CSP, proxy, API nebo vstupy.

**Poslední aktualizace:** 2026-11-13, nasazení AD00–AD13 na produkci (`7a15ad2`): vynucená CSP, COOP/CORP, HSTS, `security.txt` a chybějící `x-powered-by` jsou poprvé ověřené na živém `www.zakaziq.cz`; s adminem se na produkci dostal i Workspace, landing page a klientský prostor. Předchozí: 2026-11-03, review před spuštěním (AUDIT-LOG): Clerk `authorizedParties`, session adminu 12 h, `/r` jen po Checkoutu, předání do Claude Code v režimu plánu, CI s testy

## Projekt

- Weby: jedna aplikace na `https://www.zakaziq.cz` (apex přesměrovává 308 na www), Vercel, deploy z `main`. Od 2026-11-13 je na produkci všechno najednou: admin konzole, landing page, Workspace `/w` i klientský prostor `/klient` (do té doby jen admin)
- Hosting: Vercel (Hobby, crony ve `vercel.json`)
- Framework: Next.js 16.4 App Router (Turbopack, React 19); `proxy.ts` běží na Node runtime (dřív edge middleware)
- Repo: github.com/sobotkakrystof5-png/ProjectIQ, soukromé: ověřit
- Kde jsou hlavičky:
  - `next.config.mjs` → statické hlavičky pro všechny odpovědi (HSTS, nosniff, X-Frame-Options, CORP, COOP…)
  - `proxy.ts` + `lib/security/csp.ts` → CSP s nonce per request, admin přihlášení (NextAuth), místo pro Clerk (S07)
  - `lib/security/embed.ts` → `frame-ancestors` pro `/r/[slug]` a CORS pro `/api/public/v1/*`; domény z `web_integrations.allowed_origins` (`/r` přes `lib/ws/intake/embed-origins.ts` v proxy, API přes `lib/ws/intake/http.ts`)

- Workspace PDF S14: /api/ws/[business]/faktury/[id]/pdf kontroluje účet/byznys/modul a vrací přílohu; generátor bez sítě/JavaScriptu, logo se stahuje s připnutou veřejnou IPv4 a limitem. Puppeteer/Chromium externalizované, binárky trasované pro PDF. CSP/hlavičky beze změny. Review v AUDIT-LOG.

## Threat model

Co aplikace drží, a proto na čem záleží:

- [x] **Osobní údaje zákazníků firem** (jména, telefony, e-maily, historie návštěv) → GDPR, únik mezi účty je nejhorší možná chyba (izolace `account_id`, AGENTS.md B3)
- [x] **Přihlášení** — admin (NextAuth, jeden účet, brute-force lockout), firmy (Clerk od S07) → krádež session
- [x] **Platby** — Stripe Checkout (přesměrování, karty nikdy u nás) → ověření podpisu webhooku, idempotence (`ws.stripe_events`)
- [x] **Faktury** (IČO, DIČ, adresy, PDF v DB) → jen za přihlášením, PDF route kontroluje session sama
- [x] **Veřejné vstupy** — poptávky z webů klientů (`/api/public/v1/*`, widget, objednávací stránka), booking API vizeon/alteno, portálové formuláře a kontaktní formulář landing (`app/(marketing)/actions.ts`) → spam, zahlcení, XSS přes uložená data; kontaktní formulář má Zod limity, honeypot, časovou kontrolu a rate limit
- [x] **Vkládání na cizí weby** — `/r/[slug]` v iframe, `/embed/[slug].js` → clickjacking, únik přes špatné CORS
- [x] **E-maily** z domény ZakazIQ přes Resend → podvržení odesílatele bez SPF/DKIM/DMARC
- [x] **Secrets** — DB, NextAuth, Clerk, Stripe, Resend, Anthropic, Gmail app password → jen v env Vercelu

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
| Cross-Origin-Opener-Policy | ✅ same-origin | Clerk popup OAuth by ho porušil — používat přesměrování (S07) |
| Cross-Origin-Resource-Policy | ✅ same-origin | `cross-origin` pro `/embed/*`, `/api/public/v1/*` a obrázek novinky `/z/novinky/[id]/obrazek` (DECISIONS #013) |
| X-XSS-Protection | ✅ 0 | |
| X-DNS-Prefetch-Control | ✅ off | |
| X-Powered-By | ✅ odstraněno (`poweredByHeader: false`) | |
| X-Robots-Tag | ✅ `noindex, nofollow` | jen `/w`, `/r`, `/z`, `/embed`, `/api`, admin (`/dashboard`, `/alteno`, `/hub`, `/login`, `/p`, `/h`); landing indexovaná (S05). Nejde o ochranu — odkazy s tokenem se tím jen nedostanou do vyhledávačů |

## CSP

Verze: **v8** (CSP-LOG.md)
Režim: **vynucená pro všechny cesty**. Admin používá profil `admin`, Workspace a přesné cesty landing page profil `workspace`.
Výběr profilu: `cspProfileFor()` v `lib/security/csp.ts`

Společný základ: `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'nonce-…' 'strict-dynamic' https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self'; frame-src 'none'; worker-src 'self' blob:; manifest-src 'self'` (+ `upgrade-insecure-requests` jen vynucená). Dev navíc `'unsafe-eval'` a `ws:`/`wss:`.

Třetí strany:
- admin: TradingView (`frame-src www.tradingview-widget.com`), na `/dashboard/faktury/*` `object-src 'self'` + `frame-src 'self'` (náhled PDF). **Google Fonts odebrané 2026-11-11** (CSP-LOG v8) — celé repo je na Instrument Sans přes `next/font`, písma jdou z vlastní domény
- Workspace `/w/*`: Clerk — `connect-src` Frontend API (host z publishable key), `img-src img.clerk.com`, `frame-src challenges.cloudflare.com` (Turnstile). Skript clerk-js s nonce. S08 případně Stripe (`form-action`)
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
- Izolace účtů: `requireWorkspace()` + `account_id` v každém dotazu (`lib/ws/context.ts`, `lib/ws/db.ts`) + RLS na všech tabulkách `ws` s daty účtu, role `ws_app` bez BYPASSRLS, složené cizí klíče (S06, DECISIONS #008). Testy `lib/ws/__tests__/ws-schema.test.ts` ✅. Clerk napojený do `requireWorkspace` (S07); účet zakládá jen průvodce `/w/novy` (server action, `account_id` generuje server), webhook `/api/clerk/webhook` se Svix podpisem a idempotencí (`ws.webhook_events`), bez `CLERK_WEBHOOK_SECRET` vrací 503
- Platby (S08): Stripe jen na serveru (`lib/ws/stripe.ts` se `server-only`, omezený klíč `rk_…`), Checkout a Customer Portal jako přesměrování, takže CSP se nemění. Webhook `/api/stripe/webhook`: podpis přes `constructEvent` ze syrového těla (tolerance 5 min), bez `STRIPE_WEBHOOK_SECRET` 503, limit těla 512 kB, idempotence `ws.stripe_events`, payload se neukládá a předplatné se vždy znovu načte ze Stripe. Účet z metadat podepsané události, návrat z Checkoutu ověří `client_reference_id` proti přihlášenému účtu. Spravovat předplatné smí jen vlastník
- Rate limit: admin API a portál DB-backed (`lib/api-rate-limit.ts`, `isRateLimited`) ✅; Workspace veřejné vstupy `lib/ws/intake/rate-limit.ts` nad `ws.rate_limits` (IP jen jako HMAC) ✅ S11
- Veřejné API `/api/public/v1/*` (S11): tajný klíč `sk_live_…` jen ze serveru (s `Origin` = 401), v DB prefix + HMAC-SHA256 s `WS_KEY_PEPPER`, `timingSafeEqual`; veřejný klíč `pk_live_…` jen z `allowed_origins`; Zod + délky, tělo 64 kB, `Idempotency-Key`, záznam `ws.intake_log` bez IP. Widget jen `textContent`. DECISIONS #010
- E-maily (S15): jen přes frontu `ws.outbound_messages` a Resend na serveru (`lib/ws/email/transport.ts`, `server-only`). Veškerý text v HTML escapovaný, odkazy jen http/https, předmět bez konců řádků, jméno odesílatele očištěné. Odkazy z e-mailů podepsané HMAC (klíč odvozený z `WS_KEY_PEPPER`), akce majitele jednorázové 72 h (`ws.action_tokens`), GET nic nemění, `Referrer-Policy: no-referrer`. Hromadné zprávy jen se souhlasem (ověří se i těsně před odesláním), odkaz na odhlášení + `List-Unsubscribe` jedním klikem. Webhook `/api/resend/webhook`: podpis Svix, tolerance 5 min, idempotence `ws.webhook_events`, bez `RESEND_WEBHOOK_SECRET` 503. Novinky `ws.product_news` ws_app jen čte. DECISIONS #011
- Klientský portál (S16): `/z/[token]` bez přihlášení, token je DB UUID. `ws.portal_lookup` (SECURITY DEFINER) vrací jen účet/byznys/druh/ID; další čtení a zápisy jdou přes RLS s oběma filtry. Neplatný, cizí, archivovaný i vypnutý odkaz = stejná 404. Akce mají Zod, honeypot hodnocení, limity na IP i záznam; PDF kontroluje vazbu faktury na zakázku a vrací `private, no-store`. Interní poznámky, kontakty a vlastní kolonky se nenačítají. DECISIONS #012
- Kontext obrazovky (RD02): `ws.business_scope(org, slug)` (SECURITY DEFINER, migrace 085) vrací účet, byznys, předplatné, funkce a byznysy jen pro jednu Clerk organizaci; výsledek žije jen v paměti jednoho požadavku (klíč `accountId:slug`). Chybí-li funkce (42883), běží starý postup. DECISIONS #016
- Admin nad Workspace (S17, zpřesněno RD11): `/dashboard/klienti`, `/dashboard/novinky` čtou `ws` vlastníkem tabulek (`lib/ws/admin/db.ts`, `server-only`), každá akce `getAdmin()` (NextAuth). Admin zapisuje novinky a audit; poznámky `ws.account_admin_notes` už konzole nečte ani neupravuje. Klientský přehled nečte osobní/finanční obsah zákazníků, poptávek, termínů a faktur ani volné podrobnosti auditu; zůstávají agregované počty a údaje účtu, byznysů a členů týmu. Vlastník tabulek má technicky širší DB přístup (DECISIONS #017). Obrázek novinky z DB, jen PNG/JPEG/WebP podle bajtů, veřejný jen po zveřejnění. DECISIONS #013, #017
- Aktivita zakázky a hlášení z Claude Code (KP03/KP04): `project_activity` (migrace 093) drží koncepty a schválené zprávy; klient vidí jen `published` (`/p/[token]` i `/klient`), nikdy koncepty, zdroj ani příznak citlivosti. Schválení jen z adminu (`requireAuth`), citlivý koncept nejde schválit (CHECK v DB + server). Klíč projektu zapisuje jen koncepty, DECISIONS #019
- Klientský prostor (KP05–KP07): `/klient` (Clerk bez organizací), schéma `portal` + role `portal_app` bez práv do `public`, RLS, pozvánky s HMAC hashem, zápisy jen funkcemi `portal.submit_*`, DECISIONS #020. Test oddělení `lib/__tests__/portal-isolation.test.ts` ✅ (PGlite). Požadavek, zpráva a hodnocení mají limity v DB funkcích. Přepis hlasu `POST /api/klient/transcribe` jen pro přihlášeného člena, limity po IP a členovi
- Předání zadání do Claude Code (KP09, úroveň 2): příkaz pro terminál s textem klienta v dočasném souboru přes heredoc s náhodným oddělovačem, bez `$(…)`; test ve skutečném shellu (bash 3.2) potvrdil, že text nic nespustí. Claude Code se spouští s `--permission-mode plan` (od 2026-11-03), takže pokyny vložené do zadání nic nezmění bez schválení plánu člověkem. Plně automatické spuštění z textu klienta se nedělá
- Poptávky z webů do adminu (AD02, R-088): jedna cesta `lib/web-leads.ts` pro tři zdroje (vizeon.cz, alteno.cz, prvotka.cz). **Každý zdroj má vlastní klíč a vlastní okno rate limitu** (`<zdroj>_booking`, `<zdroj>_lead`) — uniklý klíč z jednoho repa nepustí poptávky za ostatní weby a weby si limit neberou navzájem. Klíče: `VIZEON_API_KEY`, `ALTENO_API_KEY` (objednávka s termínem, `x-api-key`, CORS allowlist podle domény), `ALTENO_LEAD_WEBHOOK_SECRET`, `PRVOTKA_LEAD_WEBHOOK_SECRET` (kontaktní formulář, `x-<zdroj>-lead-signature`, bez CORS hlaviček). Porovnání klíče `timingSafeEqual`, klíč se nikdy neloguje. Zod včetně horních délek u všech polí (doplněno v AD02), tělo jen JSON, SQL vázanými parametry. Staré adresy `/alteno/*` a `/dashboard/vizeon` přesměrovává `next.config.mjs` ze seznamu `lib/legacy-redirects.mjs` — jen na vlastní cesty pod `/dashboard`, ověřeno proti pokusu o odkaz mimo doménu
- Captcha: žádná, honeypot `website` + rate limit (DECISIONS #010). Turnstile při prvním spamu
- Secrets: jen env Vercelu, `.env*` v `.gitignore` (kromě vzorů), gitleaks v CI. Historie gitu 2026-10-08 čistá (90 commitů)
- Objednávací stránka `/r/[slug]` a widget podle slugu jen pro účet, který dokončil Checkout (aspoň jeden řádek `ws.subscriptions`, migrace 099, R-077); po skončeném předplatném poptávky přijímá dál (B5)
- Session: NextAuth JWT (admin) s platností 12 h (`lib/auth.ts`, od 2026-11-03, dřív výchozích 30 dní), zámek 5 chybných pokusů za 15 min na IP, bez dvoufázového ověření (otevřená položka). Clerk v produkci přijímá jen session tokeny pro `NEXT_PUBLIC_APP_URL` (`authorizedParties`, `lib/security/clerk.ts`, DECISIONS #021), Clerk (Workspace pod `/w` a `/api/ws`, klientský prostor pod `/klient` a `/api/klient` — proxy Clerk jinde nespouští). Cookie `__session` Clerku není HttpOnly (DECISIONS #009)
- Co je po nasazení 2026-11-13 veřejně dosažitelné (ověřeno zvenku, bez přihlášení): landing `/`, `/login`, `/podminky`, `/robots.txt` a `/.well-known/security.txt` vracejí 200; `/h/<token>` a `/p/<token>` 404 (ne 500); `POST /api/public/prvotka-leads` 401 (fail-closed, klíč ve Vercelu zatím není); `/w/prihlaseni`, `/w/registrace` a `/klient/prihlaseni` 200 s `X-Robots-Tag: noindex, nofollow`; `/r/test` 404. Hlavičky na `/` i `/login`: vynucená CSP s nonce, HSTS 2 roky s `preload`, COOP a CORP `same-origin`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, bez `x-powered-by`. **Registrace do Workspace přitom mluví s dev instancí Clerku** (`connect-src https://ultimate-chimp-4657.clerk.accounts.dev`) a se sandboxem Stripe — viz Otevřené položky
- Zálohy: Neon point-in-time restore (podle plánu Neonu) — test obnovy nikdy neproběhl

## Otevřené položky

| Položka | Proč | Kdo | Kdy |
|---|---|---|---|
| Vstup do Workspace je od nasazení veřejně dosažitelný | landing page vede tlačítkem na `/w/registrace` (200) a ta běží na **dev instanci Clerku** a sandboxu Stripe. Cizí člověk si může založit účet, který přepnutí na produkční Clerk nepřežije, a projít „platbou", která nic nestrhne. Buď vstup do Workspace schovat, dokud nebude Clerk i Stripe v produkčním režimu, nebo to vědomě nechat | Kryštof (rozhodnutí) | hned |
| `DATABASE_URL_WS` do Vercelu (Production + Preview) | migrace `ws` i role `ws_app` jsou na Neonu od 2026-10-09 (ověřeno: bez BYPASSRLS, do `public` nevidí); bez proměnné ve Vercelu Workspace v produkci nemá DB. Roli jen přes `scripts/ws-create-role.js`, nikdy v konzoli | Kryštof | před nasazením `/w` |
| Clerk produkční instance (`clerk deploy`, `clerk.zakaziq.cz`, produkční klíče, Google OAuth s vlastními údaji) | dev klíče mají limity a dev banner, dev instance nesmí do produkce | Kryštof + Claude | před spuštěním (S19) |
| Webhook Clerku: endpoint v Clerk dashboardu + `CLERK_WEBHOOK_SECRET` (lokálně i Vercel) | bez něj se nesynchronizují členové a název účtu (route vrací 503) | Kryštof | po prvním nasazení `/w` |
| Google OAuth přes přesměrování, ne popup | COOP `same-origin` by popup rozbil; Clerk SignIn ve výchozím stavu přesměrovává — ověřit ručně | Kryštof | při prvním přihlášení Googlem |
| Stripe: sandbox ZakazIQ, omezený klíč `rk_…`, `STRIPE_WEBHOOK_SECRET` (lokálně `stripe listen`, produkce endpoint v dashboardu) | bez klíčů Checkout nejde otevřít a webhook vrací 503; `sk_…` nepoužívat (SETUP.md → Stripe) | Kryštof | před ručním testem S08 / nasazením `/w` |
| Stripe live mód (produkt, cena, Portal, e-maily, šablona faktury s IČO, webhook) | sandbox nesmí do produkce | Kryštof + Claude | S19 |
| `WS_KEY_PEPPER` do Vercelu (Production + Preview, jiná hodnota než lokálně) | bez něj tajné klíče webů nejde vytvořit ani ověřit (API 503). Po nastavení už neměnit — změna zneplatní všechny tajné klíče | Kryštof | před nasazením `/w` |
| Zod 4 sonda `new Function` | hlásí `unsafe-eval` na portálu; Workspace zatím Zod jen na serveru (S07) — `z.config({ jitless: true })` až s prvním formulářem validovaným v prohlížeči | — | S10+ |
| `security.txt` ✅ | od nasazení 2026-11-13 vrací `https://www.zakaziq.cz/.well-known/security.txt` 200 (canonical na www, R-075). Zbývá hlídat `Expires` (2027-10-01) | Claude | hotovo |
| DNS `zakaziq.cz` (DNSSEC, CAA, SPF, DKIM, DMARC) + doména v Resendu | bez nich lze posílat poštu jménem domény a e-maily padají do spamu; postup `docs/workspace/SETUP.md` → E-maily (S15) | Kryštof | před nastavením `WS_EMAIL_FROM` |
| `WS_EMAIL_FROM` a `RESEND_WEBHOOK_SECRET` do Vercelu (+ endpoint webhooku v Resendu) | 2026-11-01: doména Verified, obě proměnné jen ve Vercel Production (Preview záměrně bez odesílání), webhook v Resendu založený a **vypnutý do nasazení** (platí pro celý účet, dnešní produkce cestu nemá). Zbývá: zapnout webhook při nasazení, DMARC `_dmarc`, klíč s právem jen Sending access pro `zakaziq.cz` | Kryštof + Claude | při nasazení |
| CI proměnná `SITE_URL` | job `headers` se jinak neprovede | Kryštof | po prvním nasazení Workspace |
| Dvoufázové ověření adminu (TOTP, nebo admin přes Clerk s MFA) | admin čte data všech klientů rolí vlastníka tabulek; dnes jen heslo + zámek na IP | Kryštof (rozhodnutí) + Claude | před spuštěním |
| `NEXT_PUBLIC_APP_URL` v Production = `https://www.zakaziq.cz` při nasazení Workspace | `authorizedParties` (DECISIONS #021) bere origin odtud; jiná hodnota = přihlášení přes Clerk v produkci neprojde | Kryštof | při nasazení `/w` |
| Monitoring chyb (Sentry nebo Vercel Observability) | o chybě po spuštění se jinak nikdo nedozví; Sentry potřebuje záznam v CSP-LOG (`connect-src`); výpadek 2026-11-04 (AUDIT-LOG) se zjistil jen ze screenshotu | Kryštof (rozhodnutí) | před spuštěním |
| Samostatná DB role pro běh adminu (bez DDL), `neondb_owner` jen na migrace | dnes admin běží rolí vlastníka s BYPASSRLS | Kryštof + Claude | po spuštění |
| Živý audit produkce | 2026-11-13 po nasazení ručně ověřeno, že CSP (vynucená, s nonce), COOP, CORP, HSTS, `security.txt` i absence `x-powered-by` na živé doméně **sedí**. Zbývá SPF a `rua` v DMARC (DNS) a celý běh skillu `web-security-audit` | Kryštof + Claude | před spuštěním |
| Chrome/Safari průchod vynucené CSP | Preview build READY; Chrome načetl landing page, ale konzole hlásí chybu konfigurace NextAuth; přihlášení Workspace i Safari čekají na ruční ověření | po doplnění Preview env |
| Migrace 092–096 na produkci a role `portal_app` (`scripts/portal-create-role.js`), `DATABASE_URL_PORTAL`, `PORTAL_INVITE_PEPPER`, `AGENT_KEY_PEPPER` do Vercelu | bez nich nejde vytvořit klíč projektu ani pozvánku a `/klient` nemá DB; roli jen skriptem, nikdy v konzoli (konzolové role obcházejí RLS) | Kryštof | před nasazením klientského prostoru |
| Přihlášení přes Clerk na `/klient` v prohlížeči | proxy, CSP a pozvánka jsou ověřené jen testy; skutečný průchod (registrace z pozvánky, přihlášení, odhlášení) nikdo neprošel | Kryštof + Claude | před prvním klientem |
| HSTS preload | zděděné `preload` — ověřit stav na hstspreload.org pro produkční doménu adminu | Kryštof | S19 |
| Test obnovy zálohy Neonu | zálohu, kterou nikdo neobnovil, nelze brát jako zálohu | Kryštof | před spuštěním |

## Neměnit bez zeptání

- `X-Frame-Options: SAMEORIGIN` na `/api/invoices/:id/pdf` — jinak přestane fungovat náhled PDF faktury.
- `Cache-Control: private, …` na `/api/invoices/:id/pdf` — `private` nikdy nerušit (sdílená cache by držela faktury klientů), DECISIONS #022.
- Výjimky `/r/*`, `/embed/*`, `/api/public/v1/*` z `X-Frame-Options`/CORP — jinak nepůjde vložit objednávka ani widget na weby klientů.
- `object-src`/`frame-src 'self'` jen na `/dashboard/faktury/*` — nerozšiřovat na celý admin.
- Pořadí v `proxy.ts`: admin auth → (Clerk) → CSP. Admin přihlášení se nesmí změnit.
- Workspace nikdy přes `DATABASE_URL` (admin role obchází RLS) — jen `DATABASE_URL_WS` / `lib/ws/db.ts`. RLS na `ws` se nevypíná a politika nikdy `USING (true)`.
