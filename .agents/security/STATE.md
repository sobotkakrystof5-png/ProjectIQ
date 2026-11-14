# Bezpečnostní stav

> Současný stav. Přepisuje se — historie je v ostatních souborech.
> Čti na začátku každého sezení, které sahá na hlavičky, CSP, proxy, API nebo vstupy.

**Poslední aktualizace:** 2026-11-14, **úplný audit od A do Z** (AUDIT-LOG 2026-11-14): živý sken produkce 30 prošlo / 3 varování / **0 chyb**, code review celého stromu (37 routů, 47 souborů server actions, CSP, CORS, nahrávání, SQL, rate limity, CI, 311 commitů historie). Opraveno: fail-open kontrola DNS v auditním skriptu (DECISIONS #028), 500 místo 404 na čtyřech veřejných odkazech adminu, chybějící strop těla na pěti veřejných JSON routech, pět tvarů tajemství, které pouštěl `redactSensitive()`, `Vary: Origin` a localhost v CORS leadů, `Secure` u cookie motivu, očištění názvu nahraného PDF, širší `Permissions-Policy`. **Skutečný stav DNS je horší, než tu dřív stálo** — viz sekce DNS. Předchozí: 2026-11-13 nasazení modernizace (celá AD00–AD18 je na produkci od 2026-11-14, `8210f04`)

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
| Strict-Transport-Security | ✅ `max-age=63072000; includeSubDomains; preload` | `preload` zděděný (DECISIONS #005), ale **doména na seznamu není** — `hstspreload.org` vrací pro apex i www `status: unknown` (ověřeno 2026-11-14), takže token je bez účinku |
| Content-Security-Policy | ✅ vynucená pro všechny cesty; profily `admin` a `workspace` | DECISIONS #003, #007, #015; živé ověření čeká na Preview |
| X-Content-Type-Options | ✅ nosniff | |
| X-Frame-Options | ✅ DENY | mimo `/r/*`, `/embed/*`, `/api/public/v1/*`; PDF faktury `SAMEORIGIN` (DECISIONS #004) |
| Referrer-Policy | ✅ strict-origin-when-cross-origin | |
| Permissions-Policy | ✅ vše zakázané (kamera, mikrofon, poloha, platby, USB, Bluetooth, serial, HID, idle-detection, screen-wake-lock, local-fonts, browsing-topics…); výjimka `microphone=(self)` jen na `/p/*` a `/klient/*` | #018; `publickey-credentials-get` schválně **není** zakázané — zavřelo by WebAuthn pro budoucí 2FA adminu (audit 2026-11-14) |
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

Doménu spravuje Kryštof, nameservery WEDOS (`ns.wedos.{net,cz,eu,com}`). **Ověřeno
2026-11-14** přes 1.1.1.1, 8.8.8.8, autoritativní `ns.wedos.net` a parent `a.ns.nic.cz`.

Dřívější záznamy tady byly nepřesné: audit se pouštěl na `www.zakaziq.cz`, což je CNAME na
`bfa873afb15bb4ef.vercel-dns-017.com`. Dotaz na CAA alias následuje, takže se jako naše CAA
vykazovala Vercelovská, a SPF s DMARC vycházely jako chybějící, protože leží na apexu.
Skript to od DECISIONS #028 dělá správně a pouští se s `AUDIT_RESOLVER=1.1.1.1`, když
systémový resolver nejede.

| Položka | Stav 2026-11-14 | Cíl |
|---|---|---|
| DNSSEC | ❌ parent `.cz` nemá DS | zapnout u WEDOS |
| CAA | ❌ apex bez záznamu — certifikát smí vydat kdokoli | `0 issue "letsencrypt.org"` (+ CA Vercelu) |
| SPF apex | ❌ **chybí**, přitom doména odesílá i přijímá | `v=spf1 include:amazonses.com -all`, nebo hodnotu z Resend dashboardu podle jejich dnešní MTA |
| SPF `send` | ✅ `v=spf1 ip4:52.3.252.119 ip4:44.222.39.36 ip4:199.249.231.0/24 ~all` | ponechat podle Resendu |
| DKIM | ✅ `resend._domainkey` existuje (1024b RSA) | ponechat |
| DMARC | ⚠️ `v=DMARC1; p=none;` **bez `rua=`** — nic neblokuje a reporty nikam nechodí | doplnit `rua=mailto:info@vizeon.cz`, po 2–4 týdnech čistých reportů `p=quarantine` → `p=reject` |
| MX | ✅ apex `receive-euw1.forge.rmta.net`, `send` `feedback.forge.rmta.net` (Resend) | doména přijímá poštu, takže apex SPF je povinný |

**Proč to je nejvážnější otevřená věc:** Workspace odesílá z adresy na **apexu**
(`WS_EMAIL_FROM`, např. `rezervace@zakaziq.cz`). Legitimní pošta projde díky DKIM
`d=zakaziq.cz` a relaxed alignmentu, ale apex bez SPF a DMARC na `p=none` bez reportů
znamená, že **podvrhnout e-mail jménem `@zakaziq.cz` jde a nikdo se o tom nedozví**.
Threat model výše to má jako nejhorší případ: phishing jménem byznysů klientů.

Hodnoty SPF/DKIM vždy z Resend dashboardu, ne odsud — tady je jen tvar a zjištěný stav.

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
- AI asistent adminu (AD14, DECISIONS #025): `/api/ai-assistant` i server actions v `app/ai-actions.ts` jen za přihlášením, tělo přes Zod, **systémový prompt a kontext výhradně ze serveru** (`lib/ai/prompts.ts`, `lib/ai/context.ts`) — dřív šly z prohlížeče bez kontroly. Kontext nečte `pdf_data`, přihlašovací tabulky, `project_agent_keys`, env ani schéma `ws`; je zarámovaný `<kontext>` a prošlý `redactSensitive()`, stejně jako věta uživatele. Model **nekoná**: vrací typovaný návrh (`z.discriminatedUnion`, žádné `tools`), ten leží v `ai_suggestions` (migrace 110) a provede ho až klik člověka — prohlížeč posílá jen `id` ověřené jako UUID, server řádek znovu parsuje a spustí whitelist executorů volajících tytéž server actions jako lidský formulář. Asistent neodesílá (jen skládá `mailto:`/`sms:`/`wa.me`), nic nemaže, nevystavuje faktury ani nezapisuje příjmy a není na žádné veřejné routě. Rate limit 12/min, `max_tokens` a `maxDuration=60`. Názvy modelů jen v `lib/ai/models.ts` (haiku/sonnet místo opusu). Přijaté riziko: vložená instrukce v textech psaných klientem — mitigace je klik člověka, whitelist a viditelný příjemce zprávy v panelu
- Veřejné odkazy adminu (audit 2026-11-14): token z `/p/[token]` a `/h/[token]` projde `publicToken()` (`lib/public-token.ts`), než se dostane do dotazu — `public_token` i `survey_token` jsou `uuid` a nesmyslná hodnota dřív skončila na Postgres `22P02` se stavem 500. Platí i pro `getProjectByToken()` a `submitSurvey()` v `app/portal-actions.ts`; `/api/public/portal/[token]/transcribe` to dělala správně už dřív
- Strop těla veřejných vstupů: Workspace `readJson()` 64 kB (`lib/ws/intake/http.ts`), admin od auditu 2026-11-14 `readJsonLimited()` (`lib/security/request-body.ts`) — 64 kB pro `/api/public/{agent-leads,leads}` a oba handlery v `lib/web-leads.ts`, u `/api/public/invoices` strop odvozený z `MAX_PDF_BYTES` (base64 nese PDF). Limit platí i pro `chunked` tělo bez `content-length`; ověření klíče je vždy **před** čtením těla
- Zakrývání tajemství (`redactSensitive()` v `lib/project-activity.ts`) zná JWT, `Bearer`, `sk-`, `sk|pk|rk_live|test_`, `zk_agent_`, `gh[pousr]_`, `xox[abprs]-`, `AKIA`, connection stringy, řádky `.env`, cesty v domovské složce a od auditu 2026-11-14 i `whsec_`, `re_`, `AIza`, `npg_` a celý blok `-----BEGIN … PRIVATE KEY-----`. Jde jím kontext asistenta, paměť projektu, hlášení z Claude Code i předávací dokument
- Captcha: žádná, honeypot `website` + rate limit (DECISIONS #010). Turnstile při prvním spamu
- Secrets: jen env Vercelu, `.env*` v `.gitignore` (kromě vzorů), gitleaks v CI. Historie gitu 2026-10-08 čistá (90 commitů)
- Objednávací stránka `/r/[slug]` a widget podle slugu jen pro účet, který dokončil Checkout (aspoň jeden řádek `ws.subscriptions`, migrace 099, R-077); po skončeném předplatném poptávky přijímá dál (B5)
- Session: NextAuth JWT (admin) s platností 12 h (`lib/auth.ts`, od 2026-11-03, dřív výchozích 30 dní), zámek 5 chybných pokusů za 15 min na IP, bez dvoufázového ověření (otevřená položka). Clerk v produkci přijímá jen session tokeny pro `NEXT_PUBLIC_APP_URL` (`authorizedParties`, `lib/security/clerk.ts`, DECISIONS #021), Clerk (Workspace pod `/w` a `/api/ws`, klientský prostor pod `/klient` a `/api/klient` — proxy Clerk jinde nespouští). Cookie `__session` Clerku není HttpOnly (DECISIONS #009)
- Co je po nasazení 2026-11-13 veřejně dosažitelné (ověřeno zvenku, bez přihlášení): landing `/`, `/login`, `/podminky`, `/robots.txt` a `/.well-known/security.txt` vracejí 200; `/h/<token>` a `/p/<token>` 404 (ne 500); `POST /api/public/prvotka-leads` 401 (fail-closed, klíč ve Vercelu zatím není); `/w/prihlaseni`, `/w/registrace` a `/klient/prihlaseni` 200 s `X-Robots-Tag: noindex, nofollow`; `/r/test` 404. Hlavičky na `/` i `/login`: vynucená CSP s nonce, HSTS 2 roky s `preload`, COOP a CORP `same-origin`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, bez `x-powered-by`. **Registrace do Workspace přitom mluví s dev instancí Clerku** (`connect-src https://ultimate-chimp-4657.clerk.accounts.dev`) a se sandboxem Stripe — viz Otevřené položky
- Závislosti: `npm audit` **0 zranitelností** i s dev závislostmi (2026-11-14). Historie gitu čistá přes všech **311 commitů** — každý nález tvaru klíče je zástupná hodnota z dokumentace; `.env` nikdy nebyl ve verzích
- Zálohy: Neon point-in-time restore (podle plánu Neonu) — test obnovy nikdy neproběhl

## Otevřené položky

| Položka | Proč | Kdo | Kdy |
|---|---|---|---|
| Vstup do Workspace je veřejně dosažitelný na dev Clerku | **potvrzeno zvenku 2026-11-14:** `/w/registrace` vrací 200 a načítá `ultimate-chimp-4657.clerk.accounts.dev`; landing na ni vede tlačítkem (`components/marketing/content.ts` → `signUp`). Cizí člověk si založí účet, který přepnutí na produkční Clerk nepřežije, a projde „platbou" v sandboxu. Buď vstup schovat, dokud nebude Clerk i Stripe v produkčním režimu, nebo to vědomě nechat | Kryštof (rozhodnutí) | hned |
| **SPF na apexu a `rua` v DMARC** | nejvážnější otevřená věc z auditu 2026-11-14: apex nemá SPF a DMARC je `p=none` bez reportů, přitom Workspace odesílá z adresy na apexu a doména má MX. Podvrhnout e-mail jménem `@zakaziq.cz` jde a nikdo se o tom nedozví. Hodnoty a cíle v sekci DNS | Kryštof (WEDOS) | hned |
| **CAA a DNSSEC na apexu** | ověřeno autoritativně 2026-11-14: ani jedno. Bez CAA smí certifikát pro doménu vydat kdokoli | Kryštof (WEDOS) | před spuštěním |
| Hlášení porušení CSP | politika je od S19 **vynucená** pro všechny cesty, ale bez `report-to`/`report-uri`. Porušení v produkci tedy nikdo nevidí — projeví se rozbitou obrazovkou u uživatele, ne záznamem. Potřebuje routu s limitem a řádek v CSP-LOG; přirozeně to patří k monitoringu chyb níž | Kryštof (rozhodnutí) + Claude | před spuštěním |
| `DATABASE_URL_WS` do Vercelu (Production + Preview) | migrace `ws` i role `ws_app` jsou na Neonu od 2026-10-09 (ověřeno: bez BYPASSRLS, do `public` nevidí); bez proměnné ve Vercelu Workspace v produkci nemá DB. Roli jen přes `scripts/ws-create-role.js`, nikdy v konzoli | Kryštof | před nasazením `/w` |
| Clerk produkční instance (`clerk deploy`, `clerk.zakaziq.cz`, produkční klíče, Google OAuth s vlastními údaji) | dev klíče mají limity a dev banner, dev instance nesmí do produkce | Kryštof + Claude | před spuštěním (S19) |
| Webhook Clerku: endpoint v Clerk dashboardu + `CLERK_WEBHOOK_SECRET` (lokálně i Vercel) | bez něj se nesynchronizují členové a název účtu (route vrací 503) | Kryštof | po prvním nasazení `/w` |
| Google OAuth přes přesměrování, ne popup | COOP `same-origin` by popup rozbil; Clerk SignIn ve výchozím stavu přesměrovává — ověřit ručně | Kryštof | při prvním přihlášení Googlem |
| Stripe: sandbox ZakazIQ, omezený klíč `rk_…`, `STRIPE_WEBHOOK_SECRET` (lokálně `stripe listen`, produkce endpoint v dashboardu) | bez klíčů Checkout nejde otevřít a webhook vrací 503; `sk_…` nepoužívat (SETUP.md → Stripe) | Kryštof | před ručním testem S08 / nasazením `/w` |
| Stripe live mód (produkt, cena, Portal, e-maily, šablona faktury s IČO, webhook) | sandbox nesmí do produkce | Kryštof + Claude | S19 |
| `WS_KEY_PEPPER` do Vercelu (Production + Preview, jiná hodnota než lokálně) | bez něj tajné klíče webů nejde vytvořit ani ověřit (API 503). Po nastavení už neměnit — změna zneplatní všechny tajné klíče | Kryštof | před nasazením `/w` |
| Zod 4 sonda `new Function` | hlásí `unsafe-eval` na portálu; Workspace zatím Zod jen na serveru (S07) — `z.config({ jitless: true })` až s prvním formulářem validovaným v prohlížeči | — | S10+ |
| `security.txt` ✅ | od nasazení 2026-11-13 vrací `https://www.zakaziq.cz/.well-known/security.txt` 200 (canonical na www, R-075). Zbývá hlídat `Expires` (2027-10-01) | Claude | hotovo |
| ~~DNS: doména v Resendu, DKIM~~ ✅ | 2026-11-14 ověřeno: doména v Resendu je, `resend._domainkey` existuje, `send.zakaziq.cz` má vlastní SPF a MX. Zbývá apex SPF, CAA, DNSSEC a `rua` — vlastní řádky výše | Claude | hotovo |
| `WS_EMAIL_FROM` a `RESEND_WEBHOOK_SECRET` do Vercelu (+ endpoint webhooku v Resendu) | 2026-11-01: doména Verified, obě proměnné jen ve Vercel Production (Preview záměrně bez odesílání), webhook v Resendu založený a **vypnutý do nasazení** (platí pro celý účet, dnešní produkce cestu nemá). Zbývá: zapnout webhook při nasazení, DMARC `_dmarc`, klíč s právem jen Sending access pro `zakaziq.cz` | Kryštof + Claude | při nasazení |
| CI proměnná `SITE_URL` | job `headers` se jinak neprovede | Kryštof | po prvním nasazení Workspace |
| Dvoufázové ověření adminu (TOTP, nebo admin přes Clerk s MFA) | admin čte data všech klientů rolí vlastníka tabulek; dnes jen heslo + zámek na IP | Kryštof (rozhodnutí) + Claude | před spuštěním |
| `NEXT_PUBLIC_APP_URL` v Production = `https://www.zakaziq.cz` při nasazení Workspace | `authorizedParties` (DECISIONS #021) bere origin odtud; jiná hodnota = přihlášení přes Clerk v produkci neprojde | Kryštof | při nasazení `/w` |
| Monitoring chyb (Sentry nebo Vercel Observability) | o chybě po spuštění se jinak nikdo nedozví; Sentry potřebuje záznam v CSP-LOG (`connect-src`); výpadek 2026-11-04 (AUDIT-LOG) se zjistil jen ze screenshotu | Kryštof (rozhodnutí) | před spuštěním |
| Samostatná DB role pro běh adminu (bez DDL), `neondb_owner` jen na migrace | dnes admin běží rolí vlastníka s BYPASSRLS | Kryštof + Claude | po spuštění |
| ~~Živý audit produkce~~ ✅ | 2026-11-14 proběhl celý `web-security-audit` i `web-security-review`: 30 prošlo / 3 varování / 0 chyb, nálezy a opravy v AUDIT-LOG. **Audit nepouštět v cyklu** — po patnácti dotazech na citlivé cesty začne Vercel vracet challenge 403 a druhý běh vypadá falešně mnohem hůř | Claude | hotovo |
| Chrome/Safari průchod vynucené CSP | Preview build READY; Chrome načetl landing page, ale konzole hlásí chybu konfigurace NextAuth; přihlášení Workspace i Safari čekají na ruční ověření | po doplnění Preview env |
| Migrace 092–096 na produkci a role `portal_app` (`scripts/portal-create-role.js`), `DATABASE_URL_PORTAL`, `PORTAL_INVITE_PEPPER`, `AGENT_KEY_PEPPER` do Vercelu | bez nich nejde vytvořit klíč projektu ani pozvánku a `/klient` nemá DB; roli jen skriptem, nikdy v konzoli (konzolové role obcházejí RLS) | Kryštof | před nasazením klientského prostoru |
| Přihlášení přes Clerk na `/klient` v prohlížeči | proxy, CSP a pozvánka jsou ověřené jen testy; skutečný průchod (registrace z pozvánky, přihlášení, odhlášení) nikdo neprošel | Kryštof + Claude | před prvním klientem |
| HSTS preload — rozhodnout | **zjištěno 2026-11-14:** doména na seznamu **není** (`hstspreload.org` → `status: unknown` pro apex i www), takže zděděný token je bez účinku a první HTTP požadavek z čerstvého prohlížeče jde v plainu. Přihlásit se, nebo token zahodit? Zápis je s `includeSubDomains` a 2 roky prakticky nevratný a vztáhne se i na budoucí subdomény | Kryštof (rozhodnutí) | před spuštěním |
| Test obnovy zálohy Neonu | zálohu, kterou nikdo neobnovil, nelze brát jako zálohu | Kryštof | před spuštěním |

## Neměnit bez zeptání

- `X-Frame-Options: SAMEORIGIN` na `/api/invoices/:id/pdf` — jinak přestane fungovat náhled PDF faktury.
- `Cache-Control: private, …` na `/api/invoices/:id/pdf` — `private` nikdy nerušit (sdílená cache by držela faktury klientů), DECISIONS #022.
- Výjimky `/r/*`, `/embed/*`, `/api/public/v1/*` z `X-Frame-Options`/CORP — jinak nepůjde vložit objednávka ani widget na weby klientů.
- `object-src`/`frame-src 'self'` jen na `/dashboard/faktury/*` — nerozšiřovat na celý admin.
- Pořadí v `proxy.ts`: admin auth → (Clerk) → CSP. Admin přihlášení se nesmí změnit.
- Workspace nikdy přes `DATABASE_URL` (admin role obchází RLS) — jen `DATABASE_URL_WS` / `lib/ws/db.ts`. RLS na `ws` se nevypíná a politika nikdy `USING (true)`.
- Kontrola klíče **před** čtením těla ve veřejných API — jinak neověřený požadavek načte tělo do paměti funkce.
- `publicToken()` před každým dotazem na `public_token`/`survey_token` — bez něj je nesmyslný token 500, ne 404.
- DNS sekce auditního skriptu selhává **zavřeně** (DECISIONS #028) — nedostupný resolver nesmí znovu vycházet jako „záznam existuje".
