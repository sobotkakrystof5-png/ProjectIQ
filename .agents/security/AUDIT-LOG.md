# Audity a incidenty

> Jen historie. Audity, code review, incidenty, rotace klíčů.

Formát:

```
## YYYY-MM-DD — audit | review | incident
Spouštěč: deploy / měsíční / hlášení / alert
Rozsah: co se kontrolovalo
Výsledek: X OK / Y varování / Z chyb, nebo popis
Nálezy: skutečné nálezy
Opraveno: co se změnilo, commit
Zůstává: co zůstává a proč
```

---

## 2026-10-10 — review (S17, admin: klienti a novinky)
Spouštěč: kontrola podle `web-security-review` před commitem S17.
Rozsah: `app/dashboard/{klienti,novinky}/**`, `lib/ws/admin/*`, `lib/ws/news-format.ts`, `lib/ws/email/news-email.ts`, `app/z/novinky/[id]/obrazek`, `ensureMember` v `/w/novy`, `next.config.mjs` (CORP), migrace 083 a `scripts/ws-grants.sql`.
Výsledek:
- Přístup: stránky za middleware NextAuth a layoutem `/dashboard` (curl bez session → 307 na přihlášení), každá akce znovu `getAdmin()`; test „bez admina nic“ projde 9 akcí a ověří, že se nic nezapsalo. Přihlášení Workspace (Clerk) admin nijak neotevírá.
- Secrets: `DATABASE_URL` jen v modulu se `server-only`; tajný klíč webu se ukáže adminovi jednou, neloguje se a není v auditu ani promptu (test).
- Vstupy: Zod s délkami ve všech akcích, odkaz novinky jen https, obrázek podle prvních bajtů (SVG odmítnuto testem), limit 600 kB i v DB (CHECK).
- XSS: novinka v aplikaci jen jako React text, e-mail escapuje nadpis i text (test s `<b>`), `javascript:` obrázek se nevykreslí, náhled e-mailu v `iframe sandbox=""`.
- Data: `ws.account_admin_notes` bez práv pro `ws_app` (test 42501 v PGlite a ověřeno čtením na Neonu), SQL jen parametrizované.
- Pošta: novinky e-mailem jen po výslovném „Poslat e-mailem všem“ s potvrzeným počtem, jednou (atomicky `emailed_at`), jen účtům s `news_emails`, s odhlášením; klíč události brání dvojímu odeslání.
Nálezy: 1 — audit nesl e-mail admina (`admin:<e-mail>`), přitom `ws.audit_log` může číst klient pod RLS.
Opraveno: `actor = 'admin'` bez e-mailu (stejný commit).
Zůstává: přijatá rizika v DECISIONS #013 (admin mimo RLS, cache obrázku 1 h).

## 2026-10-10 — review (S15, e-maily, odkazy z e-mailů, novinky)
Spouštěč: kontrola podle `web-security-review` před commitem S15.
Rozsah: `lib/ws/email/*`, `app/z/**` (odkaz majitele, odhlášení, .ics), `app/api/resend/webhook`, `app/api/cron/ws-email`, `app/w/[business]/nastaveni/emaily`, `app/w/[business]/zvonek`, napojení do akcí poptávek, zákazníků, faktur a Stripe webhooku, migrace 081.
Výsledek:
- Secrets jen na serveru (`RESEND_API_KEY`, `WS_EMAIL_FROM`, `RESEND_WEBHOOK_SECRET`, `WS_KEY_PEPPER`); klientská komponenta Nastavení importuje jen čisté šablony bez env.
- Vstupy: Zod s délkami ve všech nových akcích, veřejná akce odkazu má rate limit, odkazy podepsané a ověřené `timingSafeEqual`, cizí účet z odkazu nepřijde (podpis zahrnuje účet).
- XSS: HTML e-mailu escapuje každý vstup (test s `<script>`, `javascript:` odkazem a hlavičkou v předmětu), náhled v `iframe sandbox=""`. Na stránkách `/z` jen React text.
- Oddělení účtů: nová `ws.action_tokens` pod RLS v testu „každá tabulka“, `ws.product_news` globální bez osobních údajů a ws_app jen čte (test 42501), SECURITY DEFINER `ws.accounts_with_due_messages` vrací jen ID účtů.
- Pošta: hromadné zprávy jen se souhlasem a ověřením před odesláním, odhlášení jedním klikem, stížnost na spam = odhlášení. Obsah zprávy se po odeslání maže.
- CSP beze změny (ověřeno: `srcdoc` náhled funguje pod vynucenou politikou /z).
Nálezy: 0 blokujících. Přijatá rizika v DECISIONS #011 (token v URL, přeposlaný e-mail majitele).
Zůstává: DNS a doména v Resendu, `WS_EMAIL_FROM` a webhook (STATE → Otevřené položky); migrace 081 ručně na Neon.

## 2026-10-10 — review (S12, zákazníci, věrnost a skupiny)
Spouštěč: kontrola podle `web-security-review` před dokončením S12.
Rozsah: `lib/ws/{customers,loyalty,segments,outreach,cron}.ts`, akce a stránky `/w/[business]/{zakaznici,nastaveni/vernost,nastaveni/skupiny}`, cron, migrace 077 a 078.
Výsledek: každá akce ověřuje přihlášený účet, byznys, roli vlastníka a vstup přes Zod; všechny dotazy mají `account_id`, PGlite testuje cizí účet. Textové vstupy se vykreslují Reactem, bez HTML sinků a nových skriptů. Cron přijímá jen správný `CRON_SECRET`.
Nálezy: po uplatnění odměny šlo ručně přidat razítko k téže návštěvě; částková pravidla věrnosti mohla číst částku v EUR jako Kč.
Opraveno: migrace 078 přidává atomickou kontrolu uplatněné odměny; věrnostní pravidla založená na částce se použijí jen pro CZK a historie návštěvy nesčítá různé měny. Pokryto regresními testy.
Zůstává: migraci 078 vloží Kryštof ručně do Neon SQL editoru; CSP se nemění.

## 2026-10-10 — review (zkrácení instrukcí agentů)
Spouštěč: požadavek zkrátit AGENTS.md při zachování kontextu a účelu (R-047).
Rozsah: AGENTS.md, docs/AGENTS-REFERENCE.md, návazné odkazy v CLAUDE.md a paměti.
Výsledek: úplná bezpečnostní pravidla B13, checklist a technický kontext jsou zachované v závazné referenci; stručný kořen ponechává hlavní zákazy a povinnost číst podrobnosti před bezpečnostní prací. Oprávnění, hlavičky, CSP, aplikace ani klíče se nemění.
Ověření: porovnání přesunuté technické části s původním dokumentem, kontrola odkazů a synchronizace bezpečnostní paměti do .agents/security.

## 2026-10-10 — review (projektové prostředí Codexu)
Spouštěč: přizpůsobení projektu pro Codex (R-046).
Rozsah: `.codex/config.toml`, `.codex/environments/environment.toml`, `scripts/codex-setup.sh`, `scripts/sync-agent-context.mjs` a společné instrukce.
Výsledek: konfigurace obsahuje jen limit instrukcí a pracovní příkazy; nepřidává oprávnění ani klíče. Setup pouze instaluje závislosti a ověřuje kontext, nečte/kopíruje `.env.local`, nespouští migrace, seed ani externí zápisy. Synchronizace odmítá symlinky v kontextu a zachovává jednu bezpečnostní historii.
Nálezy: AGENTS.md je větší než výchozí limit instrukcí Codexu; nastaven limit 96 KiB a povinnost číst celý soubor při nenačtení konfigurace.
Opraveno: pravidla práce obou agentů sjednocena, kontrola shody bezpečnostní paměti přidána. Hlavičky, CSP, přihlášení a aplikační kód se nemění.
Zůstává: nastavení připojení služeb v novém worktree podle `.env.example`; dostupnost klientských nástrojů závisí na prostředí.

## 2026-10-10 — review (S13, Nastavení)
Spouštěč: kontrola podle `web-security-review` během implementace S13.
Rozsah: `app/w/[business]/nastaveni/{actions,**/page}.tsx`, `components/ws/settings/{module,service,field,stage,appearance}-settings.tsx`, `lib/ws/settings.ts`, `lib/ws/intake/{intake,slots}.ts`, migrace 079.
Výsledek:
- Každá mutace začíná ověřeným Workspace kontextem, byznys z URL se znovu ověří proti účtu, nastavení mění jen vlastník a režim bez předplatného je pouze pro čtení. Vstupy mají Zod včetně UUID, délek, rozsahů minut, měny a hex barvy.
- SQL používá `account_id` a `business_id` v každém dotazu. Odstranění stavu nejdřív v jedné transakci přesune zakázky jen do ověřeného stavu téhož byznysu.
- Nejsou nové externí skripty, HTML vkládané do DOM ani změna CSP. Barva je omezená na hex a server znovu ověří kontrast s bílým textem. Logo se bez rozhodnutí o bezpečném úložišti nenahrává ani nevykresluje z nedůvěryhodné URL.
- Rozestup služby je číselný 0–240 minut; veřejný výpočet obsadí i rozestup existující návštěvy. Migrace 079 není na Neonu spuštěná, uživatel ji vloží ručně před nasazením.
Nálezy: 0. Zůstává: doplnit úpravy pracovníků, směn a řazení kolonek/stavů; po jejich implementaci review zopakovat.

## 2026-10-10 — review (S11, veřejné API, objednávací stránka, widget)
Spouštěč: review před commitem S11 (pravidla `web-security-review`, AGENTS.md B13).
Rozsah: `lib/ws/{keys,fields,accent}.ts`, `lib/ws/intake/*`, `app/api/public/v1/{requests,schema}`, `app/embed/[file]`, `app/r/**`, `app/w/[business]/nastaveni/**`, `components/ws/{order,settings}/*`, `middleware.ts`, migrace 076.
Výsledek:
- Klíče: tajný klíč jen HMAC-SHA256 s `WS_KEY_PEPPER` + prefix, porovnání `timingSafeEqual`, v čitelné podobě jen v odpovědi akce `rotateSecret` (nelogujeme, test: klíč není v `intake_log` ani v `requests`). Bez pepře selže zavřeně (503). Tajný klíč s hlavičkou `Origin` = 401 (únik do prohlížeče).
- Účty: účet a byznys jen z ověřeného klíče nebo veřejného slugu přes 3 úzké `SECURITY DEFINER` funkce (DECISIONS #010), zápisy pod RLS. Služba cizího účtu neprojde (test), cizí účet nezmění napojení (složený cizí klíč, test).
- Vstupy: Zod na tělo i vlastní kolonky, délky všech polí, tělo max 64 kB, `Idempotency-Key` tvarem omezený. Rate limit v DB (IP jako HMAC, ne čitelně). Honeypot `website`. Captcha zatím ne (DECISIONS #010).
- CORS jen přesný origin z `allowed_origins`, bez `Allow-Credentials`, `Vary: Origin`; preflight z cizí domény 403 (testy). `frame-ancestors` pro `/r/<slug>` z DB, chyba = jen `'self'`.
- XSS: widget vkládá data jen přes `textContent` (test: v zdrojáku není `innerHTML`, data v JSON escapovaná vůči `</script>` a U+2028). Objednávací stránka a Nastavení přes React, žádné `dangerouslySetInnerHTML`. Barva byznysu jen ověřený `#rrggbb`.
- Nalezeno při ověření naostro: Next 14 ukládal odpovědi Neon HTTP (`fetch`) do data cache i v `force-dynamic` route handlerech — `/embed` a `/r` četly stará data (riziko: zrušený klíč by dál fungoval z cache). Opraveno `fetchOptions: { cache: 'no-store' }` v `lib/ws/db.ts` pro celý Workspace.
- `npm audit`: beze změny, žádná nová závislost (QR kód přes existující `qrcode.react`).
Nálezy: 1 (data cache, opraveno v commitu S11).
Zůstává: `WS_KEY_PEPPER` do Vercelu; captcha zvážit podle provozu (DECISIONS #010); CORS z cizí domény v prohlížeči ověřen jen curl/testy (Chrome blokuje veřejný web → localhost).

## 2026-10-10 — review (S10, poptávky a kalendář)
Spouštěč: kontrola podle `web-security-review` před commitem S10.
Rozsah: `app/w/[business]/poptavky/actions.ts` (9 server actions), `lib/ws/{bookings,calendar}.ts`, `app/api/ws/[business]/zmeny/route.ts`, stránky `/poptavky`, `/kalendar`, `/zakazky`, `components/ws/app/{booking,calendar,jobs}/**`, `components/ws/app/detail-slot.tsx`. Grep na `innerHTML`/`dangerouslySetInnerHTML` (0), klíče v kódu (0).
Výsledek:
- Vstupy: každá akce Zod (UUID, slug regexem, den jako platné datum 2020–2100, minuty 0–1439, jméno max. 120, telefon max. 30 a normalizace E.164, e-mail max. 200, poznámka max. 1000, důvod blokace max. 80, blokace max. rok). Bez předplatného `assertWritable` (jen čtení).
- Data: `account_id` jen z `requireWorkspace()`, byznys z URL přes `requireBusiness`. Pracovník, služba, zákazník a stav zakázky z formuláře se v SQL dohledají v účtu **a** byznysu, cizí = NULL/nenalezeno (kontrola cizího klíče sama nestačí, ověřuje jen účet). Testy: účet B nepotvrdí, neodmítne, nezruší, nepřesune ani nepřesune zakázku účtu A ani s byznysem A v ruce; pracovník a zákazník z cizího účtu do termínu nejdou.
- Kolize: jen DB (`appointments_no_overlap`), souběžné potvrzení téže poptávky hlídá `UPDATE … WHERE status = 'new'` (testy souběhu).
- `/api/ws/[business]/zmeny`: přihlášení přes `requireWorkspace`, vrací jen ETag (hash), žádná data, `Cache-Control: private, no-cache`. Polling fetch na vlastní origin — `connect-src 'self'` stačí, CSP beze změny.
- Vykreslení: jména, zprávy, poznámky a kolonky jako text; parametry `?den`, `?cas`, `?pracovnik` ověřené (datum, rozsah, UUID z byznysu).
Nálezy: 0.
Zůstává: blokace celého byznysu (bez pracovníka) DB omezení nehlídá (R-035) — ruční rezervace přes ni jde zapsat; výpočet volných časů pro web ji zohlední v S11.

## 2026-10-09 — review (S09, kostra aplikace a Dnes)
Spouštěč: skill `web-security-review` před commitem S09.
Rozsah: `app/w/page.tsx`, `app/w/[business]/{layout,page,loading,actions}.tsx|ts`, `app/w/[business]/[section]/page.tsx`, `components/ws/app/**`, `lib/ws/{today,search,detail-param,command-parser,nav,app-origin,demo-seed}.ts`, `lib/ws/context.ts` (`React.cache`), `scripts/ws-seed.mjs`. Grep na `innerHTML`/`dangerouslySetInnerHTML` (0), klíče v kódu (0).
Výsledek:
- Vstupy: `searchAction` (Zod, dotaz max. 160 znaků, oříznutí na 80, ILIKE s escapováním `%`, `_`, `\`, byznys z URL přes `requireBusiness`), `rememberBusinessAction` (slug regexem a proti účtu). URL parametry: `?detail=` jen známé tvary s UUID, `?zakaznik=` UUID, `?tyden=` platné datum, `kdo`/`sluzba` zkrácené a vykreslené jako text.
- Data: každý dotaz `account_id = ctx.accountId` + `business_id` ověřeného byznysu, pod RLS. Testy: účet B nevidí kartu zákazníka, poptávku, Dnes ani výsledky hledání účtu A ani s byznysem A v ruce; poptávka A přes jiný byznys taky ne.
- Cookie `ws_byznys`: HttpOnly, SameSite=Lax, Secure v produkci, path `/w`, nese jen slug, při čtení se znovu ověří proti účtu.
- Odkazy z upozornění (`ws.notifications.link`) se vykreslí jako odkaz jen, když začínají `/w/` (žádné `javascript:` ani cizí doména).
- Odkaz na objednání: z `NEXT_PUBLIC_APP_URL`, bez ní z hlavičky Host (jen lokálně; vidí ho jen přihlášený uživatel sám).
- Seed skript: bez `--ano` nic nezapíše, maže jen označená data, zápis jako `ws_app` pod RLS.
- CSP beze změny: nové stránky pod vynucenou politikou `/w`, v konzoli jen známé blokované Inter z adminu.
Nálezy: 0.
Zůstává: —

## 2026-10-09 — review (S08, Stripe předplatné)
Spouštěč: skill `web-security-review` před commitem S08.
Rozsah: `lib/ws/{stripe,billing,stripe-webhook}.ts`, `app/api/stripe/webhook/route.ts`, `app/w/ucet/{actions,page}.tsx`, `app/w/predplatne/page.tsx`, `app/w/novy/page.tsx`, `components/ws/billing/*`. gitleaks nad soubory commitu, grep na klíče, kontrola klientského bundlu (`api.stripe.com` v `.next/static`: 0 výskytů).
Výsledek:
- Secrets: tajný klíč jen v `lib/ws/stripe.ts` (`server-only`), nic za `NEXT_PUBLIC_` kromě publikovatelného klíče. Doporučený omezený klíč `rk_…` s právy Customers/Checkout/Portal write, Subscriptions/Invoices read.
- Webhook: podpis ze syrového těla, cizí klíč, staré razítko, změněné tělo i chybějící hlavička → 400 (testy), bez klíče 503, idempotence, do logu jen typ a id události. Zpracování si předplatné vždy znovu načte ze Stripe, podvržený obsah události by se nepropsal.
- Server actions: jen vlastník, vstup jen `'novy' | 'ucet'` přes Zod, `account_id` z `requireWorkspace()`. `/w/predplatne` ověří tvar `session_id` a že relace patří přihlášenému účtu (test s cizí relací). Přesměrování jen na adresy, které vrátí Stripe.
- Účty: zápis pod RLS s účtem z metadat, předplatné jednoho účtu nejde metadaty převést na jiný (test).
- `npm audit --omit=dev`: 11, beze změny (`stripe` 22.6.2 bez nálezu).
Nálezy: 1 opraveno před commitem. Při stavu `past_due` šlo otevřít nový Checkout, takže by vzniklo druhé předplatné vedle nezaplaceného, které Stripe dál zkouší strhnout, a hrozila dvojí platba. Teď vede jen na výměnu karty v Customer Portalu (test).
Opraveno: v commitu S08.
Zůstává: sandbox a klíče Stripe, live mód (STATE → Otevřené položky).

## 2026-10-09 — review (S07, Clerk, registrace, nový byznys)
Spouštěč: skill `web-security-review` před commitem S07.
Rozsah: `middleware.ts` (Clerk jen `/w` a `/api/ws`, admin větev beze změny), `lib/security/csp.ts` (v3), `app/w/novy/actions.ts` (server action), `app/api/clerk/webhook/route.ts` + `lib/ws/clerk-webhook.ts`, `lib/ws/onboarding.ts`, `lib/ws/clerk-orgs.ts`, komponenty `/w`. gitleaks nad soubory commitu, grep na `innerHTML`/`dangerouslySetInnerHTML` a klíče v kódu, `npm audit --omit=dev`.
Výsledek:
- Vstupy: průvodce validuje Zodem na serveru (název 2–80 znaků, obor z výčtu), `account_id` generuje server, `userId` jen z `auth()`. Webhook: Svix podpis přes `verifyWebhook` (HMAC + časové razítko, test na podvržený podpis, cizí klíč, staré razítko), bez klíče 503, limit těla 256 kB, idempotence přes `ws.webhook_events`, do logu jen typ a id události.
- Dotazy jen parametrizované (`q`/`wsDb`), zápisy pod RLS se správným `app.account_id`; test „druhý účet nevidí nic z prvního“ i bez aplikačního filtru.
- Secrets: jen `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` do prohlížeče (publikovatelný); `CLERK_SECRET_KEY` čte jen serverový kód Clerku, `lib/ws/clerk-orgs.ts` má `server-only`. gitleaks bez nálezu. Klíče stažené `clerk env pull` do `.env.local` (gitignored), hodnoty se nikde nevypsaly.
- Admin: `/dashboard`, `/alteno`, `/hub` dál 307 na přihlášení NextAuth, `/login` 200 s Report-Only CSP, admin chunky bez Clerku.
- `npm audit --omit=dev`: 11, beze změny.
Nálezy: žádný k opravě. Přijato: `__session` bez HttpOnly (DECISIONS #009). Poznámka: limit těla webhooku kontroluje jen `Content-Length` (chunked tělo omezí až Vercel, 4,5 MB) — u podepsaného endpointu přijatelné.
Opraveno: —
Zůstává: produkční instance Clerku, endpoint webhooku a `CLERK_WEBHOOK_SECRET` (STATE → Otevřené položky).

## 2026-10-08 — review (S06, databáze a oddělení účtů)
Spouštěč: nové schéma `ws`, DB role, přístupová vrstva.
Rozsah: migrace 064–075, `scripts/ws-grants.sql`, `scripts/ws-create-role.js`, `lib/ws/{db,context}.ts`, testy v PGlite.
Výsledek: oddělení účtů ověřené automaticky na všech 30 tabulkách s daty účtu (čtení, změna, mazání, zápis s cizím `account_id`, cizí UUID přes cizí klíč); mutační kontrola — politika `USING (true)` test shodí.
Nálezy:
- Role z Neon konzole mají `neon_superuser` → `BYPASSRLS` (ověřeno na `neondb_owner`). Řešeno: role jen přes SQL skript, který na konci ověří, že RLS platí.
- `current_setting('app.account_id', true)` vrací po transakci `''` → `''::uuid` by shodil dotazy. Řešeno `NULLIF` v `ws.current_account()`.
- Kontrola cizích klíčů obchází RLS. Řešeno složenými klíči `(account_id, x_id)`.
Opraveno: vše výše před commitem „ws/db: schéma a oddělení účtů“.
Zůstává: migrace a role ještě nejsou na produkčním Neonu (STATE → Otevřené položky); přijatá rizika v DECISIONS #008.

## 2026-10-08 — audit (lokální, zavedení základu S02)
Spouštěč: zavedení bezpečnostního základu.
Rozsah: hlavičky přes `curl` na produkčním buildu (`next start`) pro `/login`, `/dashboard`, `/w/_design`, `/r/*`, `/p/[token]`, `/api/invoices/[id]/pdf`, `/embed/*`, `/api/public/v1/*`, `/.well-known/security.txt`; průchod 30 admin stránek v headless Chromu s CSP hlášeními; `gitleaks git` přes celou historii; kontrola trackovaných `.env*` souborů a `NEXT_PUBLIC_` proměnných; `npm audit --omit=dev`.
Výsledek: hlavičky odpovídají STATE.md na všech cestách; nonce na všech skriptech dynamických stránek; admin přihlášení beze změny (bez session 307 → `/api/auth/signin`, se session 200).
Nálezy:
- `/login` statický → skripty bez nonce (brání vynucení admin CSP).
- Sonda `unsafe-eval` ze Zod 4 na portálu (neškodná).
- `X-Frame-Options: DENY` platil i pro PDF faktury → náhled v `<object>` na detailu faktury v Chromu nejspíš nefungoval ani před S02 (neověřeno na produkci).
- gitleaks: 90 commitů, žádný únik. Trackované `.env.example` a `.env.local.example` obsahují jen prázdné hodnoty.
- `npm audit --omit=dev`: 11 zranitelností (1 critical `next` 14) — beze změny proti 2026-10-08 ráno.
- Bez `favicon.ico` (404 v konzoli) — kosmetické.
Opraveno: `X-Frame-Options: SAMEORIGIN` pro `/api/invoices/:id/pdf`; `poweredByHeader: false`; `.gitignore` na všechny `.env*` kromě vzorů, `*.key`, `*.p12`. Commit „security: základní hlavičky a paměť".
Zůstává: viz STATE.md → Otevřené položky (vynucení admin CSP, DNS, živý audit `security-check.sh` po nasazení).

## Incidenty

(zatím žádné)

## 2026-10-10 — S14: faktury, peníze, PDF a daně

Rozsah: nové actions a API PDF/ICS, lib/ws/money/, components/ws/money/, migrace 080 a build balení next.config.mjs. Admin soubory neměněné.

- Mutace: requireWorkspace, byznys, zapnutý modul, assertWritable; daňové nastavení jen vlastník. Parametrizované SQL + account_id a RLS. SECURITY INVOKER, bez výjimek RLS. Zámky/unikátní platba chrání proti duplicitám.
- PDF do 4 MB s %PDF-, neveřejné bytea pod RLS, attachment/nosniff/private-no-store. PDF route kontroluje identitu/účet/byznys/modul, generování 20/10 min.
- Generátor bez JavaScriptu/sítě; texty escapované. Logo HTTPS bez credentials/redirectů, připnutá veřejná IPv4, 512 kB a PNG/JPEG magic bytes; odmítnutí privátní sítě a SVG. Lokální písma, žádný nový skript či CSP host.
- AI 10/h/účet, klíč jen server, dokument nedůvěryhodná data, výstup Zod a ruční kontrola. Logy bez kompletních chyb/payloadů. E-mail zatím koncept.
- Opraveno: mobilní přetékání skrytých popisků grafu; externalizace Puppeteer/Chromium a tracing binárek pro PDF (bundling měnil jejich cestu). Hlavičky/CSP/auth beze změny.
- Ověřeno: PGlite (izolace, idempotence migrace, řada za účet, oba směry převzetí platby), falešné/velké PDF, privátní logo, escapování HTML, skutečný lokální PDF smoke, typy/build a admin HTTP. Neon/Vercel a externí AI volání neověřené.

## 2026-10-10 — review (S16, klientský portál)
Spouštěč: `web-security-review` před commitem S16.
Rozsah: migrace 082, `lib/ws/{portal,portal-rules,jobs}.ts`, `/z/[token]` včetně veřejné faktury a server actions, `components/ws/portal/`, zprávy a odkazy v e-mailech, detail zakázky/termínu. Kontrola vstupů, parametrizace SQL, RLS, tokenů, rate limitů, DOM sinků, odkazů a serverových secrets.
Výsledek:
- Token generuje DB jako UUID; `ws.portal_lookup` je jediná `SECURITY DEFINER` funkce a vrací jen ID. Následné dotazy mají `account_id` + `business_id` a RLS. Cizí, neplatný, archivovaný i vypnutý odkaz vrací stejnou 404.
- Veřejné mutace validuje Zod, hodnocení má honeypot, limity jsou na IP i záznam. Přesun znovu ověřuje pravidlo a volný čas; kolizi rozhodne DB. PDF ověří modul, zakázku, typ a stav faktury, odpověď je `private, no-store` + `nosniff`.
- Portál nenačítá `appointments.note`, `customers.note`, kontakty ani `field_values`; React vykresluje zprávy jako text. Nové `dangerouslySetInnerHTML`/`innerHTML`, klientské secrets ani skripty třetích stran: 0.
- Ověřeno `ws-portal.test.ts` 13/13 (včetně cizího účtu, kolize a skrytých poznámek), celkem 434 testů + 1 vynechaný, TypeScript a produkční build. CSP se neměnila.
Nálezy: 0 k opravě. Přijaté riziko trvalého odkazu a chybějící jednotlivé rotace: DECISIONS #012, revize S19.
Zůstává: migrace 082 a skutečná data na Neonu nejsou ověřené.
