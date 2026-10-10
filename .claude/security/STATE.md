# Bezpečnostní stav

> Současný stav. Přepisuje se — historie je v ostatních souborech.
> Čti na začátku každého sezení, které sahá na hlavičky, CSP, middleware, API nebo vstupy.

**Poslední aktualizace:** 2026-10-10, sezení S16 (klientský portál)

## Projekt

- Weby: admin konzole (produkce, Vercel, deploy z `main`), ZakazIQ Workspace + landing page (větev `workspace`, zatím nenasazeno, cílová doména `zakaziq.cz`)
- Hosting: Vercel (Hobby, crony ve `vercel.json`)
- Framework: Next.js 14.2 App Router
- Repo: github.com/sobotkakrystof5-png/ProjectIQ, soukromé: ověřit
- Kde jsou hlavičky:
  - `next.config.mjs` → statické hlavičky pro všechny odpovědi (HSTS, nosniff, X-Frame-Options, CORP, COOP…)
  - `middleware.ts` + `lib/security/csp.ts` → CSP s nonce per request, admin přihlášení (NextAuth), místo pro Clerk (S07)
  - `lib/security/embed.ts` → `frame-ancestors` pro `/r/[slug]` a CORS pro `/api/public/v1/*`; domény z `web_integrations.allowed_origins` (`/r` přes `lib/ws/intake/embed-origins.ts` v middleware, API přes `lib/ws/intake/http.ts`)

- Workspace PDF S14: /api/ws/[business]/faktury/[id]/pdf kontroluje účet/byznys/modul a vrací přílohu; generátor bez sítě/JavaScriptu, logo se stahuje s připnutou veřejnou IPv4 a limitem. Puppeteer/Chromium externalizované, binárky trasované pro PDF. CSP/hlavičky beze změny. Review v AUDIT-LOG.

## Threat model

Co aplikace drží, a proto na čem záleží:

- [x] **Osobní údaje zákazníků firem** (jména, telefony, e-maily, historie návštěv) → GDPR, únik mezi účty je nejhorší možná chyba (izolace `account_id`, AGENTS.md B3)
- [x] **Přihlášení** — admin (NextAuth, jeden účet, brute-force lockout), firmy (Clerk od S07) → krádež session
- [x] **Platby** — Stripe Checkout (přesměrování, karty nikdy u nás) → ověření podpisu webhooku, idempotence (`ws.stripe_events`)
- [x] **Faktury** (IČO, DIČ, adresy, PDF v DB) → jen za přihlášením, PDF route kontroluje session sama
- [x] **Veřejné vstupy** — poptávky z webů klientů (`/api/public/v1/*`, widget, objednávací stránka), booking API vizeon/alteno, portálové formuláře → spam, zahlcení, XSS přes uložená data
- [x] **Vkládání na cizí weby** — `/r/[slug]` v iframe, `/embed/[slug].js` → clickjacking, únik přes špatné CORS
- [x] **E-maily** z domény ZakazIQ přes Resend → podvržení odesílatele bez SPF/DKIM/DMARC
- [x] **Secrets** — DB, NextAuth, Clerk, Stripe, Resend, Anthropic, Gmail app password → jen v env Vercelu

Realistický útočník: automatické skenery a boti na formuláře; u SaaS zvědavý zákazník, který zkouší cizí `account_id`/slug. Nejhorší případ: data jedné firmy vidí jiná firma; doména zneužitá k phishingu jménem byznysů klientů.

## Hlavičky

| Hlavička | Stav | Poznámka |
|---|---|---|
| Strict-Transport-Security | ✅ `max-age=63072000; includeSubDomains; preload` | `preload` zděděný, DECISIONS #005 |
| Content-Security-Policy | ⚠️ admin Report-Only, `/w` `/r` `/z` vynucená | DECISIONS #001, #003 |
| X-Content-Type-Options | ✅ nosniff | |
| X-Frame-Options | ✅ DENY | mimo `/r/*`, `/embed/*`, `/api/public/v1/*`; PDF faktury `SAMEORIGIN` (DECISIONS #004) |
| Referrer-Policy | ✅ strict-origin-when-cross-origin | |
| Permissions-Policy | ✅ vše zakázané (kamera, mikrofon, poloha, platby, USB…) | |
| Cross-Origin-Opener-Policy | ✅ same-origin | Clerk popup OAuth by ho porušil — používat přesměrování (S07) |
| Cross-Origin-Resource-Policy | ✅ same-origin | `cross-origin` pro `/embed/*` a `/api/public/v1/*` |
| X-XSS-Protection | ✅ 0 | |
| X-DNS-Prefetch-Control | ✅ off | |
| X-Powered-By | ✅ odstraněno (`poweredByHeader: false`) | |

## CSP

Verze: **v4** (CSP-LOG.md)
Režim: admin + zbytek **Report-Only**, Workspace (`/w`, `/r`, `/z`) a landing page (přesné cesty `/`, `/podminky`, `/ochrana-udaju`, `/zpracovatelska-smlouva`, DECISIONS #007) **vynucená**
Výběr profilu: `cspProfileFor()` v `lib/security/csp.ts`

Společný základ: `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'nonce-…' 'strict-dynamic' https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self'; frame-src 'none'; worker-src 'self' blob:; manifest-src 'self'` (+ `upgrade-insecure-requests` jen vynucená). Dev navíc `'unsafe-eval'` a `ws:`/`wss:`.

Třetí strany:
- admin: Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`), TradingView (`frame-src www.tradingview-widget.com`), na `/dashboard/faktury/*` `object-src 'self'` + `frame-src 'self'` (náhled PDF)
- Workspace `/w/*`: Clerk — `connect-src` Frontend API (host z publishable key), `img-src img.clerk.com`, `frame-src challenges.cloudflare.com` (Turnstile). Skript clerk-js s nonce. S08 případně Stripe (`form-action`)
- `/r/<slug>`: `frame-ancestors 'self'` + povolené domény byznysu z DB (S11, v4; chyba = jen `'self'`)

Známé výjimky: `style-src 'unsafe-inline'` (DECISIONS #002).

**Proč admin ještě není vynucený:** `/login` a 404 stránka jsou statické → jejich skripty nemají nonce (ověřeno: 14 hlášení na `/login`). Vynucení vyžaduje `/login` dynamický (`export const dynamic = 'force-dynamic'` v `app/(auth)/login`) — zásah do adminu, chce souhlas. Ostatní admin stránky jsou čisté (CSP-LOG v1 → Ověřeno).

## DNS a pošta (`zakaziq.cz`)

Doménu spravuje Kryštof (registrátor: doplnit). Nic z toho zatím není ověřené — doména ještě nemá web.

| Položka | Stav | Cíl |
|---|---|---|
| DNSSEC | ❓ neověřeno | zapnout u registrátora |
| CAA | ❓ | `0 issue "letsencrypt.org"` (Vercel vydává přes Let's Encrypt) + `0 iodef "mailto:info@vizeon.cz"` |
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
- Captcha: žádná, honeypot `website` + rate limit (DECISIONS #010). Turnstile při prvním spamu
- Secrets: jen env Vercelu, `.env*` v `.gitignore` (kromě vzorů), gitleaks v CI. Historie gitu 2026-10-08 čistá (90 commitů)
- Session: NextAuth JWT (admin), Clerk (Workspace, jen pod `/w` a `/api/ws` — middleware Clerk jinde nespouští). Cookie `__session` Clerku není HttpOnly (DECISIONS #009)
- Zálohy: Neon point-in-time restore (podle plánu Neonu) — test obnovy nikdy neproběhl

## Otevřené položky

| Položka | Proč | Kdo | Kdy |
|---|---|---|---|
| `DATABASE_URL_WS` do Vercelu (Production + Preview) | migrace `ws` i role `ws_app` jsou na Neonu od 2026-10-09 (ověřeno: bez BYPASSRLS, do `public` nevidí); bez proměnné ve Vercelu Workspace v produkci nemá DB. Roli jen přes `scripts/ws-create-role.js`, nikdy v konzoli | Kryštof | před nasazením `/w` |
| Admin CSP → vynucená | Report-Only nic nechrání. Potřeba dynamický `/login` (souhlas se zásahem do adminu) a 404 | Kryštof + Claude | do S19 |
| Clerk produkční instance (`clerk deploy`, `clerk.zakaziq.cz`, produkční klíče, Google OAuth s vlastními údaji) | dev klíče mají limity a dev banner, dev instance nesmí do produkce | Kryštof + Claude | před spuštěním (S19) |
| Webhook Clerku: endpoint v Clerk dashboardu + `CLERK_WEBHOOK_SECRET` (lokálně i Vercel) | bez něj se nesynchronizují členové a název účtu (route vrací 503) | Kryštof | po prvním nasazení `/w` |
| Google OAuth přes přesměrování, ne popup | COOP `same-origin` by popup rozbil; Clerk SignIn ve výchozím stavu přesměrovává — ověřit ručně | Kryštof | při prvním přihlášení Googlem |
| Stripe: sandbox ZakazIQ, omezený klíč `rk_…`, `STRIPE_WEBHOOK_SECRET` (lokálně `stripe listen`, produkce endpoint v dashboardu) | bez klíčů Checkout nejde otevřít a webhook vrací 503; `sk_…` nepoužívat (SETUP.md → Stripe) | Kryštof | před ručním testem S08 / nasazením `/w` |
| Stripe live mód (produkt, cena, Portal, e-maily, šablona faktury s IČO, webhook) | sandbox nesmí do produkce | Kryštof + Claude | S19 |
| `WS_KEY_PEPPER` do Vercelu (Production + Preview, jiná hodnota než lokálně) | bez něj tajné klíče webů nejde vytvořit ani ověřit (API 503). Po nastavení už neměnit — změna zneplatní všechny tajné klíče | Kryštof | před nasazením `/w` |
| Zod 4 sonda `new Function` | hlásí `unsafe-eval` na portálu; Workspace zatím Zod jen na serveru (S07) — `z.config({ jitless: true })` až s prvním formulářem validovaným v prohlížeči | — | S10+ |
| `npm audit` — 11 zranitelností (1 critical `next` 14) | CI job audit je dočasně jen upozornění (DECISIONS #006) | Kryštof | S19 |
| `security.txt` — `Expires: 2027-10-01` | prošlý security.txt je horší než žádný | Kryštof | připomínka 2027-09 |
| DNS `zakaziq.cz` (DNSSEC, CAA, SPF, DKIM, DMARC) + doména v Resendu | bez nich lze posílat poštu jménem domény a e-maily padají do spamu; postup `docs/workspace/SETUP.md` → E-maily (S15) | Kryštof | před nastavením `WS_EMAIL_FROM` |
| `WS_EMAIL_FROM` a `RESEND_WEBHOOK_SECRET` do Vercelu (+ endpoint webhooku v Resendu) | bez `WS_EMAIL_FROM` Workspace neodešle žádný e-mail; bez webhooku se nedozvíme o nedoručených | Kryštof | po ověření domény v Resendu |
| CI proměnná `SITE_URL` | job `headers` se jinak neprovede | Kryštof | po prvním nasazení Workspace |
| Živý audit `security-check.sh` | hlavičky ověřené jen lokálně | Claude | po deployi (S19, a po každém deployi) |
| HSTS preload | zděděné `preload` — ověřit stav na hstspreload.org pro produkční doménu adminu | Kryštof | S19 |
| Test obnovy zálohy Neonu | zálohu, kterou nikdo neobnovil, nelze brát jako zálohu | Kryštof | před spuštěním |

## Neměnit bez zeptání

- `X-Frame-Options: SAMEORIGIN` na `/api/invoices/:id/pdf` — jinak přestane fungovat náhled PDF faktury.
- Výjimky `/r/*`, `/embed/*`, `/api/public/v1/*` z `X-Frame-Options`/CORP — jinak nepůjde vložit objednávka ani widget na weby klientů.
- `object-src`/`frame-src 'self'` jen na `/dashboard/faktury/*` — nerozšiřovat na celý admin.
- Pořadí v `middleware.ts`: admin auth → (Clerk) → CSP. Admin přihlášení se nesmí změnit.
- Workspace nikdy přes `DATABASE_URL` (admin role obchází RLS) — jen `DATABASE_URL_WS` / `lib/ws/db.ts`. RLS na `ws` se nevypíná a politika nikdy `USING (true)`.
