# Bezpečnostní stav

> Současný stav. Přepisuje se — historie je v ostatních souborech.
> Čti na začátku každého sezení, které sahá na hlavičky, CSP, proxy, API nebo vstupy.

**Poslední aktualizace:** 2026-11-23, **ochrana proti XSS a DDoS** (DECISIONS #050; audit z 2026-11-20, do `main` sloučený 2026-11-23): jeden modul pro cizí text v HTML (`lib/security/html.ts`) + test, který hlídá nebezpečné vzory ve zdrojáku, brána na IP v `proxy.ts`, paměťová předbrána před databázovými limity, strop souběhu Chromia a strop těla u nahrávek. Firewall platformy (Vercel WAF) z kódu nenastavíš — pravidla jsou navržená níž a čekají na Kryštofa. Předchozí: 2026-11-15, **klientský prostor `/klient` přešel z vývojové instance Clerku na Supabase Auth** (e-mail a heslo, registrace jen přes hook s otiskem pozvánky, pozvánka vždy vázaná na e-mail; DECISIONS #031, AUDIT-LOG 2026-11-15) a portál `/p` dostal výměnu odkazu a omezení rezervace. Předchozí téhož dne: **přihlášení do adminu přešlo na Supabase Auth** (e-mail, heslo, TOTP; DECISIONS #029). NextAuth, `ADMIN_PASSWORD_HASH` a `bcryptjs` z repa odešly, cookie se session je zpevněná proti výchozímu stavu `@supabase/ssr` (`httpOnly`, 12 h místo 400 dní) a **CSP se nemění** — prohlížeč na Supabase nesahá. Zbývá vytvořit admin účet, doplnit env do Vercelu, vypnout veřejnou registraci a omezit délku session (Otevřené položky); naživo to nikdo nezkusil. Předchozí: 2026-11-14, **úplný audit od A do Z** (AUDIT-LOG 2026-11-14): živý sken produkce 30 prošlo / 3 varování / **0 chyb**, code review celého stromu (37 routů, 47 souborů server actions, CSP, CORS, nahrávání, SQL, rate limity, CI, 311 commitů historie). Opraveno: fail-open kontrola DNS v auditním skriptu (DECISIONS #028), 500 místo 404 na čtyřech veřejných odkazech adminu, chybějící strop těla na pěti veřejných JSON routech, pět tvarů tajemství, které pouštěl `redactSensitive()`, `Vary: Origin` a localhost v CORS leadů, `Secure` u cookie motivu, očištění názvu nahraného PDF, širší `Permissions-Policy`. **Skutečný stav DNS je horší, než tu dřív stálo** — viz sekce DNS. Předchozí: 2026-11-13 nasazení modernizace (celá AD00–AD18 je na produkci od 2026-11-14, `8210f04`)

## Projekt

- Weby: jedna aplikace na `https://www.zakaziq.cz` (apex přesměrovává 308 na www), Vercel, deploy z `main`. Od 2026-11-13 je na produkci všechno najednou: admin konzole, landing page, Workspace `/w` i klientský prostor `/klient` (do té doby jen admin)
- Hosting: Vercel (Hobby, crony ve `vercel.json`); přihlášení do adminu Supabase Auth (projekt `zakaziq`, eu-central-1, jen `auth.*` — data jsou v Neonu)
- Framework: Next.js 16.4 App Router (Turbopack, React 19); `proxy.ts` běží na Node runtime (dřív edge middleware)
- Repo: github.com/sobotkakrystof5-png/ProjectIQ, soukromé: ověřit
- Kde jsou hlavičky:
  - `next.config.mjs` → statické hlavičky pro všechny odpovědi (HSTS, nosniff, X-Frame-Options, CORP, COOP…)
  - `proxy.ts` + `lib/security/csp.ts` → CSP s nonce per request, admin přihlášení (Supabase Auth, DECISIONS #029), místo pro Clerk (S07)
  - `lib/security/embed.ts` → `frame-ancestors` pro `/r/[slug]` a CORS pro `/api/public/v1/*`; domény z `web_integrations.allowed_origins` (`/r` přes `lib/ws/intake/embed-origins.ts` v proxy, API přes `lib/ws/intake/http.ts`)

- Workspace PDF S14: /api/ws/[business]/faktury/[id]/pdf kontroluje účet/byznys/modul a vrací přílohu; generátor bez sítě/JavaScriptu, logo se stahuje s připnutou veřejnou IPv4 a limitem. Puppeteer/Chromium externalizované, binárky trasované pro PDF. CSP/hlavičky beze změny. Review v AUDIT-LOG.

## Threat model

Co aplikace drží, a proto na čem záleží:

- [x] **Osobní údaje zákazníků firem** (jména, telefony, e-maily, historie návštěv) → GDPR, únik mezi účty je nejhorší možná chyba (izolace `account_id`, AGENTS.md B3)
- [x] **Přihlášení** — admin (Supabase Auth od 2026-11-15: e-mail, heslo a TOTP; jeden účet podle `ADMIN_EMAIL`; zámek na IP zrušen 2026-11-15, DECISIONS #030), klienti `/klient` (Supabase Auth od 2026-11-15, DECISIONS #031), firmy `/w` (Clerk od S07) → krádež session
- [x] **Platby** — Stripe Checkout (přesměrování, karty nikdy u nás) → ověření podpisu webhooku, idempotence (`ws.stripe_events`)
- [x] **Faktury** (IČO, DIČ, adresy, PDF v DB) → jen za přihlášením, PDF route kontroluje session sama
- [x] **Veřejné vstupy** — poptávky z webů klientů (`/api/public/v1/*`, widget, objednávací stránka), booking API vizeon/alteno, portálové formuláře a kontaktní formulář landing (`app/(marketing)/actions.ts`) → spam, zahlcení, XSS přes uložená data; kontaktní formulář má Zod limity, honeypot, časovou kontrolu a rate limit
- [x] **Vkládání na cizí weby** — `/r/[slug]` v iframe, `/embed/[slug].js` → clickjacking, únik přes špatné CORS
- [x] **E-maily** z domény ZakazIQ přes Resend → podvržení odesílatele bez SPF/DKIM/DMARC
- [x] **Secrets** — DB, Clerk, Stripe, Resend, Anthropic, Gmail app password → jen v env Vercelu. Klíč Supabase je `sb_publishable_…`, tedy veřejný; `service_role` v repu ani v env **není a nemá být**

Realistický útočník: automatické skenery a boti na formuláře; u SaaS zvědavý zákazník, který zkouší cizí `account_id`/slug. Nejhorší případ: data jedné firmy vidí jiná firma; doména zneužitá k phishingu jménem byznysů klientů.

## Hlavičky

| Hlavička | Stav | Poznámka |
|---|---|---|
| Strict-Transport-Security | ✅ `max-age=63072000; includeSubDomains; preload` | `preload` zděděný (DECISIONS #005), ale **doména na seznamu není** — `hstspreload.org` vrací pro apex i www `status: unknown` (ověřeno 2026-11-14), takže token je bez účinku |
| Content-Security-Policy | ✅ vynucená pro všechny cesty; profily `admin` a `workspace` | DECISIONS #003, #007, #015; živé ověření čeká na Preview |
| X-Content-Type-Options | ✅ nosniff | |
| X-Frame-Options | ✅ DENY | mimo `/r/*`, `/embed/*`, `/api/public/v1/*`; PDF faktury `SAMEORIGIN` (DECISIONS #004) |
| Referrer-Policy | ✅ strict-origin-when-cross-origin | |
| Permissions-Policy | ✅ vše zakázané (kamera, mikrofon, poloha, platby, USB, Bluetooth, serial, HID, idle-detection, screen-wake-lock, local-fonts, browsing-topics…); výjimka `microphone=(self)` jen na `/p/*`, `/klient/*` a `/dashboard/*` (diktování asistentovi) | #018, #032; `publickey-credentials-get` schválně **není** zakázané — zavřelo by WebAuthn pro budoucí 2FA adminu (audit 2026-11-14) |
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
- admin: žádný cizí zdroj (TradingView odebrán 2026-11-15, CSP-LOG v10), na `/dashboard/faktury/*` `object-src 'self'` + `frame-src 'self'` (náhled PDF). **Google Fonts odebrané 2026-11-11** (CSP-LOG v8) — celé repo je na Instrument Sans přes `next/font`, písma jdou z vlastní domény
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
- Doručení e-mailů z adminu (R-146): webhook `/api/resend/vizeon`, podpis Svix (`verifySvix`, tolerance 5 min), bez `VIZEON_RESEND_WEBHOOK_SECRET` 503, tělo do 64 kB, ukládá jen e-maily se štítkem `zakaziq=admin` a jen id, stav, čas a druh vrácení (`email_deliveries`, migrace 135). DECISIONS #054
- Klientský portál (S16): `/z/[token]` bez přihlášení, token je DB UUID. `ws.portal_lookup` (SECURITY DEFINER) vrací jen účet/byznys/druh/ID; další čtení a zápisy jdou přes RLS s oběma filtry. Neplatný, cizí, archivovaný i vypnutý odkaz = stejná 404. Akce mají Zod, honeypot hodnocení, limity na IP i záznam; PDF kontroluje vazbu faktury na zakázku a vrací `private, no-store`. Interní poznámky, kontakty a vlastní kolonky se nenačítají. DECISIONS #012
- Kontext obrazovky (RD02): `ws.business_scope(org, slug)` (SECURITY DEFINER, migrace 085) vrací účet, byznys, předplatné, funkce a byznysy jen pro jednu Clerk organizaci; výsledek žije jen v paměti jednoho požadavku (klíč `accountId:slug`). Chybí-li funkce (42883), běží starý postup. DECISIONS #016
- Admin nad Workspace (S17, zpřesněno RD11): `/dashboard/klienti`, `/dashboard/novinky` čtou `ws` vlastníkem tabulek (`lib/ws/admin/db.ts`, `server-only`), každá akce `getAdmin()` (Supabase Auth). Admin zapisuje novinky a audit; poznámky `ws.account_admin_notes` už konzole nečte ani neupravuje. Klientský přehled nečte osobní/finanční obsah zákazníků, poptávek, termínů a faktur ani volné podrobnosti auditu; zůstávají agregované počty a údaje účtu, byznysů a členů týmu. Vlastník tabulek má technicky širší DB přístup (DECISIONS #017). Obrázek novinky z DB, jen PNG/JPEG/WebP podle bajtů, veřejný jen po zveřejnění. DECISIONS #013, #017
- Aktivita zakázky a hlášení z Claude Code (KP03/KP04): `project_activity` (migrace 093) drží koncepty a schválené zprávy; klient vidí jen `published` (`/p/[token]` i `/klient`), nikdy koncepty, zdroj ani příznak citlivosti. Schválení jen z adminu (`requireAuth`), citlivý koncept nejde schválit (CHECK v DB + server). Klíč projektu zapisuje jen koncepty, DECISIONS #019
- Klientský prostor (KP05–KP07, přihlášení od 2026-11-15 přes **Supabase Auth**, DECISIONS #031): `/klient` e-mail a heslo v server actions (`app/klient/actions.ts`), session v `proxy.ts` (`checkUserSession`), identita `getClaims()` v `lib/portal/context.ts`; účet vzniká jen přes hook `POST /api/auth/supabase-hook` s otiskem platné pozvánky (fail-closed, `SUPABASE_AUTH_HOOK_SECRET`), pozvánka vždy vázaná na e-mail (migrace 113), ne na `ADMIN_EMAIL`; `next` po přihlášení jen uvnitř `/klient`. Schéma `portal` + role `portal_app` bez práv do `public`, RLS, pozvánky s HMAC hashem, zápisy jen funkcemi `portal.submit_*`, DECISIONS #020. Test oddělení `lib/__tests__/portal-isolation.test.ts` ✅ (PGlite). Požadavek, zpráva a hodnocení mají limity v DB funkcích. Přepis hlasu `POST /api/klient/transcribe` jen pro přihlášeného člena, limity po IP a členovi. **Účetní data (KP13, migrace 122):** souhrn peněz a faktury zakázky jdou do `portal.project_money` a `portal.invoices` triggerem (jen vytištěné údaje dokladu, bez ledgeru, linií, konceptů a AI přepisu), nahrané PDF archivní faktury vydá jen `portal.invoice_pdf` po kontrole členství, `GET /api/klient/faktury/[id]/pdf` ověří přihlášení sám a má limit na člena, DECISIONS #042. **Konzultace z volna (KP14, migrace 123):** klient vidí jen volné časy (`portal.free_consultation_slots`) a své konzultace (`portal.consultations`), rezervuje, přesouvá a ruší jen funkcemi `portal.book_/move_/cancel_consultation` (členství, lhůta 24 h, limity, kolize pod zámkem v DB); Meet a potvrzení dokončuje kód adminu jen podle id z DB; limit pokusů 30/10 min na člena a 15/10 min na zakázku u `/p`, DECISIONS #043. **Chat s klientem (KP15, migrace 124):** zprávy a schválení jen funkcemi `portal.post_message`/`answer_approval`, přečteno `touch_thread`; `portal_app` nevidí aktivitu admina ani cestu souboru (práva na sloupce); přílohy v soukromém bucketu `chat-prilohy` (Supabase Storage, `SUPABASE_SERVICE_ROLE_KEY` jen server), ven jen přes `/api/klient/prilohy/[id]` a `/api/zpravy/prilohy/[id]` s `nosniff` a sandbox CSP, typ podle obsahu, 4 MB na odeslání; e-mail druhé straně nejvýš 1×/h, DECISIONS #044. **Přehled klienta (KP16, migrace 125):** přehled, faktury a konzultace čtou všechny zakázky klienta jedním požadavkem přes `portalDb(clientId)`; hodnocení přes dotazník R-119 — token vydá jen `portal.client_surveys` (člen proti `app.client_id`); e-mail o hotové etapě zabírá jen vlastník funkcí `portal_phase_email_claim`, nejvýš 1× za 24 h na zakázku, DECISIONS #045. **Poptávky z webu klienta (KP17, migrace 126):** veřejný vstup `POST /api/public/web-udalost` jen ze serveru (s `Origin` 403, bez CORS), klíč webu zakázky `zk_web_…` (HMAC s `AGENT_KEY_PEPPER`, jen hlavička), limity 60/h na klíč a 300/h na IP, tělo do 1 kB; ukládá se jen druh a čas, žádné osobní údaje; klient čte jen měsíční součty přes `portal.web_lead_months`, DECISIONS #046. **GDPR prostoru (KP10, migrace 127):** export a výmaz člena jen skriptem `scripts/portal-gdpr.mjs` (funkce jen pro vlastníka, účet v Supabase přes Admin API), retence R-076 i pro témata konzultací, dotazník a stav čtení; stránka `/klient/soukromi`; inventura `docs/klientsky-prostor/GDPR.md`, DECISIONS #047
- Předání zadání do Claude Code (KP09, úroveň 2): příkaz pro terminál s textem klienta v dočasném souboru přes heredoc s náhodným oddělovačem, bez `$(…)`; test ve skutečném shellu (bash 3.2) potvrdil, že text nic nespustí. Claude Code se spouští s `--permission-mode plan` (od 2026-11-03), takže pokyny vložené do zadání nic nezmění bez schválení plánu člověkem. Plně automatické spuštění z textu klienta se nedělá
- Poptávky z webů do adminu (AD02, R-088): jedna cesta `lib/web-leads.ts` pro tři zdroje (vizeon.cz, alteno.cz, prvotka.cz). **Každý zdroj má vlastní klíč a vlastní okno rate limitu** (`<zdroj>_booking`, `<zdroj>_lead`) — uniklý klíč z jednoho repa nepustí poptávky za ostatní weby a weby si limit neberou navzájem. Klíče: `VIZEON_API_KEY`, `ALTENO_API_KEY` (objednávka s termínem, `x-api-key`, CORS allowlist podle domény), `ALTENO_LEAD_WEBHOOK_SECRET`, `PRVOTKA_LEAD_WEBHOOK_SECRET`, `VIZEON_LEAD_WEBHOOK_SECRET` (kontaktní formulář, od 2026-11-22 i vizeon.cz přes `/api/public/vizeon-leads`, R-136; `x-<zdroj>-lead-signature`, bez CORS hlaviček). Porovnání klíče `timingSafeEqual`, klíč se nikdy neloguje. Zod včetně horních délek u všech polí (doplněno v AD02), tělo jen JSON, SQL vázanými parametry. Staré adresy `/alteno/*` a `/dashboard/vizeon` přesměrovává `next.config.mjs` ze seznamu `lib/legacy-redirects.mjs` — jen na vlastní cesty pod `/dashboard`, ověřeno proti pokusu o odkaz mimo doménu
- AI asistent adminu (AD14, DECISIONS #025): `/api/ai-assistant` i server actions v `app/ai-actions.ts` jen za přihlášením, tělo přes Zod, **systémový prompt a kontext výhradně ze serveru** (`lib/ai/prompts.ts`, `lib/ai/context.ts`) — dřív šly z prohlížeče bez kontroly. Kontext nečte `pdf_data`, přihlašovací tabulky, `project_agent_keys`, env ani schéma `ws`; je zarámovaný `<kontext>` a prošlý `redactSensitive()`, stejně jako věta uživatele. Model **koná vratné akce sám** (R-111, DECISIONS #032): kontakt, termín, poznámka, stav zakázky, záloha, náklad a „faktura zaplacena" běží hned, se Zpět. Odeslání zprávy klientovi, vystavení faktury a mazání čekají na klik člověka; faktury asistent jen připraví jako koncept (R-117). Plán od modelu prochází bránou `lib/ai/plan-format.ts` a whitelistem executorů, které volají tytéž server actions jako lidský formulář. Asistent sám nic neodesílá a není na žádné veřejné routě. Rate limit 12/min, `max_tokens` a `maxDuration=60`. Názvy modelů jen v `lib/ai/models.ts` (haiku/sonnet místo opusu). Přijaté riziko: vložená instrukce v textech psaných klientem — mitigace je klik člověka, whitelist a viditelný příjemce zprávy v panelu
- Přihlášení do adminu (2026-11-15, DECISIONS #029): **Supabase Auth** (projekt `zakaziq`, eu-central-1) — e-mail, heslo a TOTP. NextAuth, `ADMIN_PASSWORD_HASH` a `bcryptjs` z repa odešly; rozsah je jen admin (`/w` a `/klient` dál Clerk), **data zůstávají v Neonu**. Dovnitř projde jen session s e-mailem `ADMIN_EMAIL` (R-001); prázdná hodnota nepustí nikoho. Zapsaný TOTP faktor **nelze přeskočit** (`aal1` session se do adminu nedostane). Ověřuje se `getClaims()` (podpis ES256 lokálně), nikdy `getSession()`; kontrola je v `proxy.ts` (od 2026-11-24 i druhý faktor) a v `requireAdminPage()` na každé stránce `app/dashboard/**` (hlídací test `admin-page-guard`; dřív jen layout a 5 z 36 stránek, audit 2026-11-24 #2). Když se na faktory nejde zeptat, nepouští se. Cookie je zpevněná proti výchozímu stavu `@supabase/ssr`: `httpOnly: true` (výchozí `false`), `secure` mimo vývoj, `sameSite: 'lax'`, platnost nejvýš 12 h (výchozích 400 dní). Přihlášení i nastavení TOTP běží **jen v server actions** — prohlížeč na Supabase nesahá, browser klient v repu není a **CSP se nemění**. Zámek na IP v aplikaci **zrušen** 2026-11-15 (DECISIONS #030) — pokusy se jen zapisují do `login_attempts`, hádání brzdí limit Supabase; hláška nerozlišuje neznámý e-mail, špatné heslo a cizí účet. Veřejnou registraci zavírá hook `before_user_created_jen_admin` (cizí účet nevznikne, `403`; ověřeno proti živé DB, **ale musí se zapnout v dashboardu**) a délku session drží strop 12 h od přihlášení z `amr` v podepsaných claims (`lib/supabase/session-age.ts`) — obojí proto, že v Supabase jsou to placené funkce a projekt je Free (R-106). Testy `lib/__tests__/admin-supabase-auth.test.ts`; **naživo neověřeno** — projekt má nula uživatelů
- Veřejné odkazy adminu (audit 2026-11-14): token z `/p/[token]` a `/h/[token]` projde `publicToken()` (`lib/public-token.ts`), než se dostane do dotazu — `public_token` i `survey_token` jsou `uuid` a nesmyslná hodnota dřív skončila na Postgres `22P02` se stavem 500. Platí i pro `getProjectByToken()` a `submitSurvey()` v `app/portal-actions.ts`; `/api/public/portal/[token]/transcribe` to dělala správně už dřív
- Strop těla veřejných vstupů: Workspace `readJson()` 64 kB (`lib/ws/intake/http.ts`), admin od auditu 2026-11-14 `readJsonLimited()` (`lib/security/request-body.ts`) — 64 kB pro `/api/public/{agent-leads,leads}` a oba handlery v `lib/web-leads.ts`, u `/api/public/invoices` strop odvozený z `MAX_PDF_BYTES` (base64 nese PDF). Limit platí i pro `chunked` tělo bez `content-length`; ověření klíče je vždy **před** čtením těla
- Zakrývání tajemství (`redactSensitive()` v `lib/project-activity.ts`) zná JWT, `Bearer`, `sk-`, `sk|pk|rk_live|test_`, `zk_agent_`, `gh[pousr]_`, `xox[abprs]-`, `AKIA`, connection stringy, řádky `.env`, cesty v domovské složce a od auditu 2026-11-14 i `whsec_`, `re_`, `AIza`, `npg_` a celý blok `-----BEGIN … PRIVATE KEY-----`. Jde jím kontext asistenta, paměť projektu, hlášení z Claude Code i předávací dokument
- Připomínky schůzek e-mailem a SMS (R-137, DECISIONS #049): fronta `meeting_reminders` (zámek `pending` → `sending`, SMS se naslepo neopakuje), spouštěč každou minutu = pg_cron `zakaziq-meeting-reminders` v Supabase (pg_net, klíč z Vault) na `/api/cron/meeting-reminders` s vlastním `MEETING_REMINDERS_SECRET`, SMS přes Odorik (`ODORIK_API_*`, jen server, text jen GSM bez diakritiky). Smazaná schůzka zmizí i z Google Kalendáře. CSP beze změny
- Schůzky s Google Meet a e-mail z vizeon.cz (R-114, DECISIONS #035): OAuth s PKCE a `state`, scope jen `calendar.events` + `email`, obnovovací token AES-256-GCM (`GOOGLE_TOKEN_KEY`), událost bez hostů (`sendUpdates=none`), Resend vlastním klíčem `VIZEON_RESEND_API_KEY` s `Idempotency-Key`. CSP beze změny
- Hovory od asistenta z Growth OS (R-112, DECISIONS #033): `POST /api/public/outreach`, Bearer `GROWTH_OS_API_KEY`, tělo 256 kB, 60/min, Zod (telefon `+…`, ukázka jen `https://`), jeden parametrizovaný upsert z JSON. Shrnutí hovoru od modelu jen jako text. Retence `outreach_leads` zatím chybí
- AI asistent jako CRM (R-120, DECISIONS #039): snímek v2 s hovory a e-maily (tělo 1 MB), zpětný kanál `GET /api/public/outreach/handled` (týž klíč, bez jmen a kontaktů) a náhled ukázky přes `/api/outreach/leads/[id]/nahled` (session, jen https `navrhy.vizeon.cz`, jen obrázky do 2 MB — ochrana proti SSRF). Nahrávky hovorů admin nečte (stačí přepis). E-maily od robota 12 měsíců (`purge_outreach_emails`). CSP beze změny
- Navrhovač nabídek, rozbor firmy (R-147, DECISIONS #055): agenti u Anthropicu (Managed Agents) v prostředí s **neomezeným přístupem na web**, ale se zapnutým jen hledáním a čtením webů (žádný příkazový řádek, soubory, MCP ani klíče v kontejneru). Dostávají jen veřejné údaje o firmě (název, web, IČO, město, obor, starší rešerše z Growth OS), ne telefon, e-maily ani přepisy. Výstup jen přes vlastní nástroj `ulozit_rozbor`, server ho ořeže a tvrzení bez zdroje zahodí (`lib/admin/offers/result.ts`), odkazy jen `safeHttpUrl` s `rel="noopener noreferrer nofollow"`. Čekající kroky server odmítá, běh u Anthropicu se po převzetí maže. Strop 2 USD na běh, 15 běhů denně, jen za přihlášením a na kliknutí. Retence: bez zakázky 12 měsíců, smazání kontaktu maže rozbor. CSP beze změny (Anthropic volá server)
- Schůzky z Wispr Flow (R-144, DECISIONS #052) jsou od 2026-11-25 zrušené (R-145): vstup `/api/public/schuzky` neexistuje, `MEETING_NOTES_API_KEY` je smazaný z Vercelu i Klíčenky, Google propojení zase bez `gmail.compose`. Uložené přepisy zůstaly v `meeting_notes`; retence 3 roky po schůzce, skryté po roce (`purgeMeetingNotes`, cron `client-retention`). CSP beze změny
- Denní reporty hovorů z Growth OS (R-118, DECISIONS #036): `POST /api/public/outreach/reports`, týž klíč, tělo 2 MB, 30/min, Zod; bez telefonů a e-mailů. Přepisy spojených hovorů 90 dní, hovory 12 měsíců (`purge_outreach_retention`, cron `client-retention`). Prompt pro Claude Code je šablona s přepisy ve značce `<prepis>` bez `<>`
- Captcha: žádná, honeypot `website` + rate limit (DECISIONS #010). Turnstile při prvním spamu
- Secrets: jen env Vercelu, `.env*` v `.gitignore` (kromě vzorů), gitleaks v CI. Historie gitu 2026-10-08 čistá (90 commitů)
- Objednávací stránka `/r/[slug]` a widget podle slugu jen pro účet, který dokončil Checkout (aspoň jeden řádek `ws.subscriptions`, migrace 099, R-077); po skončeném předplatném poptávky přijímá dál (B5)
- Session: Supabase Auth (admin) od 2026-11-15: e-mail, heslo a TOTP jako druhý faktor (DECISIONS #029), strop 12 h od přihlášení (R-106, `lib/supabase/session-age.ts`), zámek na IP zrušen (DECISIONS #030). Clerk v produkci přijímá jen session tokeny pro `NEXT_PUBLIC_APP_URL` (`authorizedParties`, `lib/security/clerk.ts`, DECISIONS #021), Clerk (Workspace pod `/w` a `/api/ws` — proxy Clerk jinde nespouští; `/klient` od 2026-11-15 Supabase Auth se stejně zpevněnou cookií jako admin, DECISIONS #031). Cookie `__session` Clerku není HttpOnly (DECISIONS #009)
- Co je po nasazení 2026-11-13 veřejně dosažitelné (ověřeno zvenku, bez přihlášení): landing `/`, `/login`, `/podminky`, `/robots.txt` a `/.well-known/security.txt` vracejí 200; `/h/<token>` a `/p/<token>` 404 (ne 500); `POST /api/public/prvotka-leads` 401 (fail-closed, klíč ve Vercelu zatím není); `/w/prihlaseni`, `/w/registrace` a `/klient/prihlaseni` 200 s `X-Robots-Tag: noindex, nofollow`; `/r/test` 404. Hlavičky na `/` i `/login`: vynucená CSP s nonce, HSTS 2 roky s `preload`, COOP a CORP `same-origin`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, bez `x-powered-by`. **Registrace do Workspace přitom mluví s dev instancí Clerku** (`connect-src https://ultimate-chimp-4657.clerk.accounts.dev`) a se sandboxem Stripe — viz Otevřené položky
- Závislosti: `npm audit` **0 zranitelností** i s dev závislostmi (2026-11-14). Historie gitu čistá přes všech **311 commitů** — každý nález tvaru klíče je zástupná hodnota z dokumentace; `.env` nikdy nebyl ve verzích
- Zálohy: Neon point-in-time restore (podle plánu Neonu) — test obnovy nikdy neproběhl

- **Vercel Preview (od 2026-11-21):** `DATABASE_URL` a `DATABASE_URL_WS` míří na testovací Neon „ZakazIQ RD test“ (`ep-shiny-union-b922fwm5`), ne na produkci — do té doby `DATABASE_URL` pro Preview mířil na produkci (AUDIT-LOG 2026-11-21). Přihlášení admina v Preview přes Supabase `zakaziq` (jen identita), klientský prostor v Preview přihlásit nejde. Kontrolní větev `preview/test`.

## Ochrana proti XSS a DDoS (2026-11-20, DECISIONS #050)

### XSS — kde se cizí text mění v HTML

Obrana má čtyři vrstvy, od nejsilnější: **(1)** CSP s nonce a `strict-dynamic` (žádný inline skript, cizí `<script>` se nespustí ani po vložení), **(2)** React escapuje vše v JSX, **(3)** jediný modul pro ruční HTML — `lib/security/html.ts`: `escapeHtml` (`& < > " '`), `safeHttpUrl`/`isSafeHttpUrl` (jen `http(s)`, bez `user:heslo@`, bez řídicích znaků), `linkifyHtml`, `jsonForScript`, `stripControlChars`, **(4)** test `lib/security/__tests__/xss-guard.test.ts`, který selže, když se ve zdrojáku objeví:

| Vzor | Povoleno |
|---|---|
| `dangerouslySetInnerHTML` | jen JSON-LD přes `jsonLdString()` a konstanta s motivem v `ws-root.tsx` |
| `.innerHTML =`, `.outerHTML =`, `insertAdjacentHTML`, `document.write` | jen `components/TradingViewChart.tsx` (konfigurační JSON vlastního kódu) |
| `eval(`, `new Function(` | nikde |
| `<iframe srcDoc=…>` | jen se `sandbox=""` (náhled e-mailu v Novinkách a v Nastavení › E-maily) |
| vlastní `function escapeHtml` nebo ruční `.replace(/&/g, '&amp;')` | nikde mimo `lib/security/html.ts` |
| `href="${…}"` v e-mailových šablonách | jen s `escapeHtml(`, `safeUrl(` nebo `safeHttpUrl(` |

Co se opravilo 2026-11-20 (nález = konkrétní díra, ne teoretická): `lib/email.ts` escapoval jen `& < >` a vkládal `href` bez kontroly — uvozovka v textu odstavce vložila do odkazu další atribut (`linkifyHtml` escapuje díly zvlášť); `lib/ws/email/layout.ts` dosazoval do `href` text s `&quot;` (stejná oprava); hromadný e-mail ze Startupu vkládal `live_url` z databáze; odkazy z cizího RSS daňových novinek šly do `href` bez kontroly schématu (zahazují se už při načtení i při vykreslení); ICS ponechal osamělé `\r` (vložení řádku); `/p/[token]` a `/klient/projekt` vykreslovaly adresu ukázky bez kontroly schématu. Zbylá místa s cizím obsahem jsou v pořádku a zůstávají beze změny: widget `/embed/*.js` (JSON s escapem `<`, `textContent`), PDF (Chromium bez JavaScriptu a sítě, vstup přes `escapeHtml`), CSV (buňky začínající `= + - @` dostanou apostrof), obrázek novinky (typ podle bajtů).

### DDoS — vrstvy a co která dělá

| Vrstva | Kde | Co zastaví | Stav |
|---|---|---|---|
| 0. Síť (L3/L4) | Vercel, automaticky | objemové útoky na síť | platforma, bez zásahu |
| 1. Firewall (L7) | **Vercel WAF** (Firewall v dashboardu) | záplavu požadavků **dřív, než se spustí funkce** — jediná vrstva, která šetří i počet spuštění a tím limity Hobby | ❌ **nenastaveno** — viz návrh pravidel níž, čeká na Kryštofa |
| 2. Brána aplikace | `proxy.ts` → `lib/security/front-gate.ts` | 240 stránek / 120 API požadavků za 10 s z jedné IP (IPv6 po /64), 429 + `Retry-After`; dřív než Clerk, Supabase a databáze. Od 2026-11-24 i `/api/public/*`, `/api/klient/*` a `/embed/*` (dřív je matcher vynechával; webhooky a crony dál mimo, #053). Vypnutí při potížích: `FRONT_GATE=off` | ✅ v kódu, jen v produkci |
| 3. Předbrána limiterů | `lib/api-rate-limit.ts`, `lib/ws/intake/rate-limit.ts` | klient, který pošle 4× (`hitLimit` 2×) povolený počet za okno, se zahodí **bez dotazu do Neonu** — dřív stál každý zahozený požadavek 3 dotazy | ✅ |
| 4. Limity vstupů | databáze (`api_requests`, `ws.rate_limits`) | přesné počty na endpoint, IP (IPv6 po /64 i v `api_requests` od 2026-11-24, #053), účet, odkaz | ✅ úklid `api_requests` už ne při každém požadavku (2 %) |
| 5. Drahé operace | `lib/invoice-pdf/render.ts` → `lib/security/semaphore.ts` | nejvýš 2 Chromia najednou na instanci, čekající po 25 s vzdají; dřív stačilo pár souběžných stažení PDF na vyčerpání paměti | ✅ |
| 6. Velikost těla | `lib/security/request-body.ts` | `readJsonLimited`, `readFormDataLimited`: strop platí i pro `chunked` tělo bez `content-length`; nově u přepisu hlasu (3 routy) a nahrání PDF faktury | ✅ |

**Co aplikace nezvládne sama (a nesmí se tvrdit opak):** brána i předbrána žijí v paměti jedné instance, takže při škálování se útok rozdělí mezi instance a každá povolí celý strop. Zastaví klienta, který zatěžuje databázi, a drží paměť instance — nezastaví útok, který stojí funkce (a Hobby limity) už tím, že se spouštějí. Landing page je navíc `force-dynamic` kvůli nonce (R-033), takže každý požadavek na `/` spustí funkci a nejde ho obsloužit z CDN cache. Proto je vrstva 1 nutná.

**IP klienta** (`lib/security/client-ip.ts`): `x-vercel-forwarded-for` → `x-forwarded-for` → `x-real-ip`, hodnota se ověří jako IP (`unknown`, když není); na Vercelu hlavičky nastavuje platforma a klientovy zahazuje. Brána a předbrány bez IP nikoho nezamykají (jinak by první robot zamkl všechny).

**Návrh pravidel pro Vercel WAF** (nic z toho není zapnuté; MCP integrace dostává pro firewall 404, takže je nastaví Kryštof z dashboardu nebo CLI — `vercel pricing firewall` ukáže, co Hobby dovoluje; počet pravidel a rate limit pravidel na Hobby **neověřeno**). Pravidla vytvářet nejdřív v režimu `log` (`--rate-limit-action log`), po týdnu bez falešných zásahů přepnout na `deny`/`challenge`:

```bash
# 1) veřejné API — strop na IP (aplikace má vlastní 10/min na endpoint)
vercel firewall rules add "Veřejné API – strop" \
  --condition '{"type":"path","op":"pre","value":"/api/public"}' \
  --action rate_limit --rate-limit-window 60 --rate-limit-requests 120 --rate-limit-keys ip --rate-limit-action deny --yes
# 2) přihlášení a registrace
vercel firewall rules add "Přihlášení – strop" \
  --condition '{"type":"path","op":"pre","value":"/login"}' --or \
  --condition '{"type":"path","op":"pre","value":"/w/prihlaseni"}' --or \
  --condition '{"type":"path","op":"pre","value":"/w/registrace"}' --or \
  --condition '{"type":"path","op":"pre","value":"/klient/prihlaseni"}' \
  --action rate_limit --rate-limit-window 60 --rate-limit-requests 60 --rate-limit-keys ip --rate-limit-action deny --yes
# 3) celý web — velkorysý strop (započítává i soubory z /_next/static, proto vysoko)
vercel firewall rules add "Celý web – strop" \
  --condition '{"type":"path","op":"pre","value":"/"}' \
  --action rate_limit --rate-limit-window 60 --rate-limit-requests 1200 --rate-limit-keys ip --rate-limit-action challenge --yes
vercel firewall publish
```

**Při probíhajícím útoku** (`vercel firewall overview` ukáže provoz a zásahy): (1) zapnout `vercel firewall attack-mode enable --duration 1h` — **pozor, výzva zastaví i volání bez prohlížeče** (webhooky Stripe/Clerk/Resend, poptávky z webů klientů a z vizeon.cz, Growth OS, cron); jestli je Vercel propustí, jsem **neověřil**, takže po zapnutí hned zkontrolovat doručení webhooků a případně přidat `bypass` pravidlo pro `/api/stripe/webhook`, `/api/clerk/webhook`, `/api/resend/webhook`, `/api/resend/vizeon`, `/api/cron`; (2) jednotlivou IP zablokovat `vercel firewall ip-blocks block <ip>`; (3) když brána aplikace škodí legitimním lidem, vypnout `FRONT_GATE=off` ve Vercelu (účinné po dalším nasazení); (4) nepouštět `web-security-audit` v cyklu (po patnácti dotazech Vercel vrací challenge); (5) po útoku zapsat do `AUDIT-LOG.md`.

## Otevřené položky

| Položka | Proč | Kdo | Kdy |
|---|---|---|---|
| Vstup do Workspace je veřejně dosažitelný na dev Clerku | **potvrzeno zvenku 2026-11-14:** `/w/registrace` vrací 200 a načítá `ultimate-chimp-4657.clerk.accounts.dev`; landing na ni vede tlačítkem (`components/marketing/content.ts` → `signUp`). Cizí člověk si založí účet, který přepnutí na produkční Clerk nepřežije, a projde „platbou" v sandboxu. Buď vstup schovat, dokud nebude Clerk i Stripe v produkčním režimu, nebo to vědomě nechat | Kryštof (rozhodnutí) | hned |
| **SPF na apexu a `rua` v DMARC** | nejvážnější otevřená věc z auditu 2026-11-14: apex nemá SPF a DMARC je `p=none` bez reportů, přitom Workspace odesílá z adresy na apexu a doména má MX. Podvrhnout e-mail jménem `@zakaziq.cz` jde a nikdo se o tom nedozví. Hodnoty a cíle v sekci DNS | Kryštof (WEDOS) | hned |
| **CAA a DNSSEC na apexu** | ověřeno autoritativně 2026-11-14: ani jedno. Bez CAA smí certifikát pro doménu vydat kdokoli | Kryštof (WEDOS) | před spuštěním |
| **Vercel WAF pravidla** (strop na IP pro `/api/public`, přihlášení a celý web; Attack Challenge pohotovostně) | jediná vrstva, která zastaví záplavu dřív, než se spustí funkce; aplikace to nenahradí (sekce Ochrana proti XSS a DDoS). Návrh příkazů je tam. Vercel MCP pro firewall vrací 404 — buď znovu přihlásit integraci, nebo pustit příkazy z CLI. Začít v režimu `log` | Kryštof | před spuštěním |
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
| Webhook Resendu pro e-maily z adminu (R-146): migrace 135, endpoint `https://www.zakaziq.cz/api/resend/vizeon` v účtu Resendu s doménou vizeon.cz, `VIZEON_RESEND_WEBHOOK_SECRET` do Vercel Production | bez tajemství kalendář ukazuje jen „Pozvánka odešla", ne doručení (route vrací 503); bez migrace by webhook vracel 500 | Kryštof | po nasazení R-146 |
| `WS_EMAIL_FROM` a `RESEND_WEBHOOK_SECRET` do Vercelu (+ endpoint webhooku v Resendu) | 2026-11-01: doména Verified, obě proměnné jen ve Vercel Production (Preview záměrně bez odesílání), webhook v Resendu založený a **vypnutý do nasazení** (platí pro celý účet, dnešní produkce cestu nemá). Zbývá: zapnout webhook při nasazení, DMARC `_dmarc`, klíč s právem jen Sending access pro `zakaziq.cz` | Kryštof + Claude | při nasazení |
| CI proměnná `SITE_URL` | job `headers` se jinak neprovede | Kryštof | po prvním nasazení Workspace |
| **Supabase pro klientský prostor — nastavení** (2026-11-15, DECISIONS #031) | **Hotovo 2026-11-21:** migrace 113, hook Before User Created na **HTTPS** s tajemstvím ve Vercelu (`SUPABASE_AUTH_HOOK_SECRET`; nepodepsaný požadavek vrací 401), vlastní SMTP přes Resend (`info@zakaziq.cz`), česká šablona „Reset Password“ (`docs/klientsky-prostor/supabase-sablona-reset-hesla.html`), soukromý bucket `chat-prilohy`. Naostro ověřeno 2026-11-21: pozvánka → heslo a e-mail s obnovou hesla z Resendu došel. **Zbývá:** `ADMIN_USER_ID` ve Vercelu Production je (ověřeno 2026-11-21, hodnota je šifrovaná; shodu s účtem admina nepřímo potvrzuje úspěšné přihlášení admina), zapnout TOTP u admina (0 ověřených faktorů). Postup `docs/AUTH-SUPABASE-PLAN.md` → F1 | Kryštof | před pilotem |
| Dvoufázové ověření adminu — **v kódu, nezapnuté** | 2026-11-15 přišlo s Supabase Auth (DECISIONS #029): zapnutí je v `/dashboard/profil` → Přihlášení. Dokud si ho nikdo nezapne, platí jen heslo a limit Supabase (zámek na IP zrušen, #030) | Kryštof | hned po vytvoření účtu |
| **Admin účet v Supabase** | projekt `zakaziq` má nula uživatelů, takže se do adminu nepřihlásí nikdo. Účet zakládá Kryštof v dashboardu (Authentication → Users → Add user, e-mail = `ADMIN_EMAIL`, heslo zná jen on). **Env ve Vercelu hotové 2026-11-15** (Production z integrace Supabase — ověřeno, že míří na `awcgvgkeuwgspybwvvpn`; Preview doplněno ručně). `ADMIN_EMAIL` v Production je `sensitive`, hodnotu **nelze přečíst** — shodu s účtem prokáže až první přihlášení. `ADMIN_PASSWORD_HASH` a `NEXTAUTH_SECRET` odebrat **až po nasazení**, dnešní produkce na nich běží. Devět `SUPABASE_*` spravuje integrace (`SERVICE_ROLE_KEY` mezi nimi), ruční mazání nemá smysl | Kryštof | před nasazením |
| **Zapnout hook `before_user_created_jen_admin` v dashboardu** | obojí (vypnutí registrace i `timebox` session) je v Supabase **placená funkce** a náš projekt je Free, takže se to řeší jinak (R-106): registraci zavírá Postgres hook, délku session drží kód (`lib/supabase/session-age.ts`, strop z `amr`). Funkce **v databázi je a je ověřená**, ale dokud se nezapne v Authentication → Hooks → Before User Created, je to nepoužitý kus SQL a registrace zůstává otevřená | Kryštof | před nasazením |
| Prázdná kopie schématu adminu v Supabase | projekt `zakaziq` nese 56 tabulek staršího schématu s 0 řádky (ověřeno počítáním). Svádí k domněnce, že se někde čte odsud; pokus o odstranění byl 2026-11-15 zamítnut | Kryštof (rozhodnutí) | kdykoli |
| `NEXT_PUBLIC_APP_URL` v Production = `https://www.zakaziq.cz` při nasazení Workspace | `authorizedParties` (DECISIONS #021) bere origin odtud; jiná hodnota = přihlášení přes Clerk v produkci neprojde | Kryštof | při nasazení `/w` |
| Monitoring chyb (Sentry nebo Vercel Observability) | o chybě po spuštění se jinak nikdo nedozví; Sentry potřebuje záznam v CSP-LOG (`connect-src`); výpadek 2026-11-04 (AUDIT-LOG) se zjistil jen ze screenshotu | Kryštof (rozhodnutí) | před spuštěním |
| Samostatná DB role pro běh adminu (bez DDL), `neondb_owner` jen na migrace | dnes admin běží rolí vlastníka s BYPASSRLS | Kryštof + Claude | po spuštění |
| ~~Živý audit produkce~~ ✅ | 2026-11-14 proběhl celý `web-security-audit` i `web-security-review`: 30 prošlo / 3 varování / 0 chyb, nálezy a opravy v AUDIT-LOG. **Audit nepouštět v cyklu** — po patnácti dotazech na citlivé cesty začne Vercel vracet challenge 403 a druhý běh vypadá falešně mnohem hůř | Claude | hotovo |
| Chrome/Safari průchod vynucené CSP | Preview build READY; Chrome načetl landing page, ale konzole hlásí chybu konfigurace NextAuth; přihlášení Workspace i Safari čekají na ruční ověření | po doplnění Preview env |
| Migrace 092–096 na produkci a role `portal_app` (`scripts/portal-create-role.js`), `DATABASE_URL_PORTAL`, `PORTAL_INVITE_PEPPER`, `AGENT_KEY_PEPPER` do Vercelu | bez nich nejde vytvořit klíč projektu ani pozvánku a `/klient` nemá DB; roli jen skriptem, nikdy v konzoli (konzolové role obcházejí RLS) | Kryštof | před nasazením klientského prostoru |
| Přihlášení klienta na `/klient` (Supabase Auth, DECISIONS #031) | Pozvánka → heslo → obnova hesla prošla naostro 2026-11-21 (e-mail z Resendu); přihlášení, odhlášení a zámek na telefonu zatím nikdo neověřil | Kryštof + Claude | před prvním klientem |
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
- `lib/security/html.ts` je jediné místo pro escapování HTML a ověření odkazů. Nová kopie `escapeHtml`, `dangerouslySetInnerHTML`, `innerHTML` ani `srcDoc` bez `sandbox=""` neprojde testem `xss-guard.test.ts` — výjimka je nové rozhodnutí v DECISIONS, ne úprava seznamu v testu (#050).
- Brána v `proxy.ts` (`frontGate`) musí zůstat **před** Clerkem, Supabase a CSP; nezužovat `FRONT_GATE_LIMITS` pod hodnoty, které zamknou kancelář za jednou IP, a nepřidávat do ní webhooky (Stripe, Clerk, Resend posílají shluky z pár adres).
- `renderPdf` vždy přes semafor; nikdy nové volání `puppeteer.launch` mimo `lib/invoice-pdf/render.ts`.
- Nahrávky a formuláře přes `readFormDataLimited`, ne holé `req.formData()` — kontrola `content-length` nestačí.
- DNS sekce auditního skriptu selhává **zavřeně** (DECISIONS #028) — nedostupný resolver nesmí znovu vycházet jako „záznam existuje".
