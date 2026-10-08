# Bezpečnostní stav

> Současný stav. Přepisuje se — historie je v ostatních souborech.
> Čti na začátku každého sezení, které sahá na hlavičky, CSP, middleware, API nebo vstupy.

**Poslední aktualizace:** 2026-10-08, sezení S02 (bezpečnostní základ)

## Projekt

- Weby: admin konzole (produkce, Vercel, deploy z `main`), ZakazIQ Workspace + landing page (větev `workspace`, zatím nenasazeno, cílová doména `zakaziq.cz`)
- Hosting: Vercel (Hobby, crony ve `vercel.json`)
- Framework: Next.js 14.2 App Router
- Repo: github.com/sobotkakrystof5-png/ProjectIQ, soukromé: ověřit
- Kde jsou hlavičky:
  - `next.config.mjs` → statické hlavičky pro všechny odpovědi (HSTS, nosniff, X-Frame-Options, CORP, COOP…)
  - `middleware.ts` + `lib/security/csp.ts` → CSP s nonce per request, admin přihlášení (NextAuth), místo pro Clerk (S07)
  - `lib/security/embed.ts` → `frame-ancestors` pro `/r/[slug]` a CORS pro `/api/public/v1/*` (data z `web_integrations.allowed_origins` v S11)

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

Verze: **v2** (CSP-LOG.md)
Režim: admin + zbytek **Report-Only**, Workspace (`/w`, `/r`, `/z`) a landing page (přesné cesty `/`, `/podminky`, `/ochrana-udaju`, `/zpracovatelska-smlouva`, DECISIONS #007) **vynucená**
Výběr profilu: `cspProfileFor()` v `lib/security/csp.ts`

Společný základ: `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'nonce-…' 'strict-dynamic' https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self'; frame-src 'none'; worker-src 'self' blob:; manifest-src 'self'` (+ `upgrade-insecure-requests` jen vynucená). Dev navíc `'unsafe-eval'` a `ws:`/`wss:`.

Třetí strany:
- admin: Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`), TradingView (`frame-src www.tradingview-widget.com`), na `/dashboard/faktury/*` `object-src 'self'` + `frame-src 'self'` (náhled PDF)
- Workspace: zatím žádné. S07 přidá Clerk, S08 případně Stripe (`form-action`)
- `/r/*`: `frame-ancestors 'self'` + povolené domény klienta (zatím prázdné)

Známé výjimky: `style-src 'unsafe-inline'` (DECISIONS #002).

**Proč admin ještě není vynucený:** `/login` a 404 stránka jsou statické → jejich skripty nemají nonce (ověřeno: 14 hlášení na `/login`). Vynucení vyžaduje `/login` dynamický (`export const dynamic = 'force-dynamic'` v `app/(auth)/login`) — zásah do adminu, chce souhlas. Ostatní admin stránky jsou čisté (CSP-LOG v1 → Ověřeno).

## DNS a pošta (`zakaziq.cz`)

Doménu spravuje Kryštof (registrátor: doplnit). Nic z toho zatím není ověřené — doména ještě nemá web.

| Položka | Stav | Cíl |
|---|---|---|
| DNSSEC | ❓ neověřeno | zapnout u registrátora |
| CAA | ❓ | `0 issue "letsencrypt.org"` (Vercel vydává přes Let's Encrypt) + `0 iodef "mailto:info@vizeon.cz"` |
| SPF | ❓ | Resend posílá ze subdomény (`send.zakaziq.cz`): `v=spf1 include:amazonses.com ~all` podle hodnot z Resend dashboardu; kořen domény bez pošty `v=spf1 -all` |
| DKIM | ❓ | záznam `resend._domainkey` z Resend dashboardu |
| DMARC | ❓ | začít `v=DMARC1; p=none; rua=mailto:…` → po 2–4 týdnech čistých reportů `p=quarantine` → `p=reject` |
| MX | ❓ | jen pokud bude doména přijímat poštu (Reply-To jde na e-mail klienta, takže nemusí) |

Hodnoty SPF/DKIM vždy z Resend dashboardu, ne odsud — tady je jen tvar.

## Aplikace

- Validace na serveru: Zod ve veřejných admin API a portálových akcích ✅; Workspace povinně (AGENTS.md B11, B13)
- Izolace účtů: `requireWorkspace()` + `account_id` — vzniká v S06/S07, test povinný
- Rate limit: admin API a portál DB-backed (`lib/api-rate-limit.ts`, `isRateLimited`) ✅; Workspace API v S11
- Captcha: žádná. Zvážit Turnstile pro `/r/[slug]` a widget v S11
- Secrets: jen env Vercelu, `.env*` v `.gitignore` (kromě vzorů), gitleaks v CI. Historie gitu 2026-10-08 čistá (90 commitů)
- Session: NextAuth JWT (admin), Clerk (Workspace)
- Zálohy: Neon point-in-time restore (podle plánu Neonu) — test obnovy nikdy neproběhl

## Otevřené položky

| Položka | Proč | Kdo | Kdy |
|---|---|---|---|
| Admin CSP → vynucená | Report-Only nic nechrání. Potřeba dynamický `/login` (souhlas se zásahem do adminu) a 404 | Kryštof + Claude | do S19 |
| Clerk domény do CSP | S07 — `script-src` (strict-dynamic stačí), `connect-src`, `frame-src`, `img-src` podle instance; popup OAuth vs COOP | S07 | S07 |
| `frame-ancestors` a CORS z `web_integrations.allowed_origins` | `/r/*` teď jen `'self'`, CORS helper bez dat | S11 | S11 |
| Zod 4 sonda `new Function` | hlásí `unsafe-eval` na portálu; ve Workspace nastavit `z.config({ jitless: true })` | S06/S07 | S07 |
| `npm audit` — 11 zranitelností (1 critical `next` 14) | CI job audit je dočasně jen upozornění (DECISIONS #006) | Kryštof | S19 |
| `security.txt` — `Expires: 2027-10-01` | prošlý security.txt je horší než žádný | Kryštof | připomínka 2027-09 |
| DNS `zakaziq.cz` (DNSSEC, CAA, SPF, DKIM, DMARC) | bez nich lze posílat poštu jménem domény | Kryštof | před prvním e-mailem z Resendu (S15) |
| CI proměnná `SITE_URL` | job `headers` se jinak neprovede | Kryštof | po prvním nasazení Workspace |
| Živý audit `security-check.sh` | hlavičky ověřené jen lokálně | Claude | po deployi (S19, a po každém deployi) |
| HSTS preload | zděděné `preload` — ověřit stav na hstspreload.org pro produkční doménu adminu | Kryštof | S19 |
| Test obnovy zálohy Neonu | zálohu, kterou nikdo neobnovil, nelze brát jako zálohu | Kryštof | před spuštěním |

## Neměnit bez zeptání

- `X-Frame-Options: SAMEORIGIN` na `/api/invoices/:id/pdf` — jinak přestane fungovat náhled PDF faktury.
- Výjimky `/r/*`, `/embed/*`, `/api/public/v1/*` z `X-Frame-Options`/CORP — jinak nepůjde vložit objednávka ani widget na weby klientů.
- `object-src`/`frame-src 'self'` jen na `/dashboard/faktury/*` — nerozšiřovat na celý admin.
- Pořadí v `middleware.ts`: admin auth → (Clerk) → CSP. Admin přihlášení se nesmí změnit.
