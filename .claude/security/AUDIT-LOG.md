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

## 2026-11-12 — review: klikací kontakt a propojení kalendáře (AD10)
Spouštěč: AD10 — odkazy `tel:`/`sms:`/`mailto:`/`wa.me`, šablony zpráv, migrace 105, před commitem.
Rozsah: `lib/contacts/href.ts`, `lib/message-templates.ts`, `components/admin/contact-actions.tsx`, `migrations/105_propojeni_kalendar_hovory.sql` (dvě nové funkce + náhrada obou překryvových guardů), `app/calls-actions.ts` (`updateLead`), `app/calendar-actions.ts`, `app/portal-actions.ts` (`submitConsultation` — veřejný vstup), obrazovky, které kontakt nově vykreslují.
Výsledek: 1 nález opravený ve stejném commitu. Žádný nový veřejný endpoint, žádný secret, žádné nové vykreslování nedůvěryhodného HTML, **CSP beze změny** (odkazy `tel:`, `sms:`, `mailto:` a `wa.me` jsou navigace, ne načítání zdroje; žádná nová doména v `connect-src` ani `script-src`).
Nálezy:
1. **Adresa v `mailto:` směla obsahovat `&` a `%`.** První verze `MAILTO_SAFE` opisovala místní část z RFC 5322, kde jsou ty znaky povolené. Mírnější poštovní klient si `jana&subject=Vymysleno@example.cz` může vyložit jako adresu s parametrem a přepsat předmět nebo přidat příjemce — přesně to, co řešil R-062 ve Workspace.
Opraveno: (1) `MAILTO_SAFE` je zúžený na `[A-Za-z0-9._+-]+@…`; `&`, `%`, `?`, `#` ani mezera adresu nepustí a odkaz se pak nevykreslí vůbec (nic se potichu neopravuje). Hlídají to testy v `lib/__tests__/contacts-href.test.ts`.
Ověřeno:
- **Vkládání parametrů do odkazů.** Předmět i text jdou přes `encodeURIComponent`; telefon se do `tel:`, `sms:` i `wa.me` dostane jen jako E.164 z `normalizePhone` (`+` a číslice), takže do URL nemá co propašovat. Texty šablon obsahují jen údaje z databáze a vždy zakódované.
- **Veřejný vstup `submitConsultation`** se nezměnil v tom, co přijímá: Zod (`bookingSchema`), limit 3 rezervace / 30 minut na zakázku, projekt se bere z tokenu, ne z těla. Nový je jen zápis navíc — rezervace, kalendářní událost a zrcadlený kontakt v jedné transakci. Id rezervace se dohledává podle `project_id` + `scheduled_at` (globálně unique), ne z vstupu. Kontakt se z veřejného vstupu **nezakládá**; `admin_slot_ensure_event` použije ten, který má zakázka.
- **Nové funkce** `admin_lead_reschedule` a `admin_slot_ensure_event` jsou `SECURITY INVOKER SET search_path = pg_catalog, pg_temp` s kvalifikovanými `public.*` tabulkami (vzor 080 a 104). `EXECUTE` pro PUBLIC tím nic nepřidává: `ws_app` ani `portal_app` nemají na tabulky v `public` práva.
- **Zeslabení překryvového guardu je úzké.** Obě trigger funkce z migrace 044 se liší jediným `IS DISTINCT FROM` na druhé straně dvojice (rezervace × její vlastní událost). Cizí překryv dál končí `23P01` — hlídá to test „cizí překryv guard pořád zastaví" a „kolizi s jinou událostí odmítne českou hláškou". Na starém buildu (bez nových sloupců) je `NEW.consultation_slot_id` NULL, takže se guard chová úplně stejně jako dřív.
- **Chybová hlášení nic neprozrazují**: `23P01` se překládá na českou větu o obsazeném termínu, ostatní chyby na obecnou hlášku + `console.error` na serveru.
Zůstává: `app/portal-actions.ts` dál posílá dva e-maily uvnitř akce a má plovoucí `void createNotification` (otevřený problém z AD08, AD10 se toho nedotkl).

## 2026-11-12 — review: jedna entita kontaktu (AD09)
Spouštěč: AD09 — tabulka `contacts`, obrazovka Kontakty a sloučení duplicit, před commitem.
Rozsah: `migrations/104_kontakty.sql` (nová tabulka, čtyři funkce, tři triggery), `lib/admin/contacts.ts`, `app/contacts-actions.ts`, `app/dashboard/kontakty/**`, `components/admin/contacts/*`, `scripts/admin-contacts-backfill.mjs`, změněný `convertLeadToProject` v `app/calls-actions.ts`.
Výsledek: 1 nález opravený ve stejném commitu, 1 věc zapsaná jako otevřený problém. Žádný nový veřejný vstup, žádný secret, žádné nové vykreslování nedůvěryhodného HTML, CSP beze změny.
Nálezy:
1. **Funkce migrace 104 neměly připnutý `search_path`.** `contacts_root`, `contacts_before_write`, `projects_contact_snapshot` a `contacts_snapshot_propagate` používaly nekvalifikované `contacts` a `projects`, takže o tom, co ty názvy znamenají, rozhodoval `search_path` toho, kdo zápis provedl. Migrace `ws` (080) to dělají správně.
2. **`contacts` je nové uložení osobních údajů, které nic nemaže.** `public.purge_client_retention` (R-076) o tabulce neví a admin žádnou cestu výmazu nemá. Při žádosti o výmaz je od teď potřeba smazat i kontakt. Zapsáno do otevřených problémů (řeší se s AD16/KP10), ne nová kategorie údajů — kontakt je odvozený z leadů a zakázek, které v adminu leží dnes.
Opraveno: (1) všechny čtyři funkce mají `SECURITY INVOKER SET search_path = pg_catalog, pg_temp` a tabulky kvalifikované jako `public.*`.
Ověřeno:
- Všechny dotazy parametrizované. Do textu SQL jde jen `ORDER BY` z whitelistu `CONTACT_SORT` (přes `parseTableParams`, AD07) a podmínka pohledu ze zúženého typu `'aktivni' | 'duplicity' | 'sloucene'`; hledaný text, id ani telefon se do textu dotazu nedostanou. V backfill skriptu pochází název tabulky z konstanty `SOURCES` v tomtéž souboru, nikdy od uživatele.
- Každá server action začíná `requireAuth()` a ověřuje `id` jako UUID a údaje Zodem včetně maximálních délek. `/dashboard/kontakty/[id]` ověří UUID **před** dotazem, takže nesmyslná adresa vrací 404 bez dotazu do databáze (třída chyby, kterou má `/p/[token]`).
- Funkce jsou `SECURITY INVOKER`, takže `EXECUTE` pro PUBLIC nic nepřidává — `ws_app` ani `portal_app` nemají na `public.contacts` práva (granty jsou výčtové, `ALTER DEFAULT PRIVILEGES` je jen ve schématu `ws`).
- Poznámka kontaktu se vykresluje jako text (React), nikde `dangerouslySetInnerHTML`. Žádná nová env proměnná, žádný externí skript, `/dashboard` je dál `noindex, nofollow`.
- Regulární výrazy v `lib/contacts/normalize.ts` nemají nejednoznačné opakování (segmenty e-mailu nesmí obsahovat `.`), vstup je navíc omezený délkou v Zodu.
Zůstává: nález 2 (výmaz kontaktu). Průchod obrazovky v prohlížeči okem. Migrace 104 je aplikovaná jen na testovacím Neonu.

## 2026-11-11 — review: sdílená tabulka a výpisy adminu (AD07)
Spouštěč: AD07 — řazení, filtry a stránkování výpisů adminu ze serveru, před commitem.
Rozsah: vstupy z adresy na devíti obrazovkách `/dashboard`, skládání SQL v `lib/admin-table.ts` a `lib/admin/{completed,invoices,costs,leads,projects,waitlist}.ts`, nové a změněné server actions, export CSV.
Výsledek: 3 nálezy, všechny opravené ve stejném commitu. Žádný secret, žádné nové vykreslování nedůvěryhodného HTML, CSP beze změny.
Nálezy:
1. **`getCallsScreen(params, waiting)` brala `TableParams` jako argument server action** — a `TableParams.orderBy` je hotový kus SQL, který se vkládá do textu dotazu. Server action je veřejný endpoint, takže přihlášený admin (jediný účet, ale pravidlo platí) mohl poslat libovolné `ORDER BY`. Porušení B13 „každý vstup validovat na serveru" a vlastního pravidla AD07, že do `ORDER BY` jde jen whitelist.
2. **`exportWaitlistCsv(dbUrl)` a `sendLaunchEmailBlast(projectId, { dbUrl, appUrl })` braly connection string z prohlížeče** (`exportWaitlistCsv` nová, druhá existovala dřív). Server by se tak připojil na libovolnou adresu, kterou mu klient podstrčí, a poslal e-maily s libovolným odkazem.
3. **CSV export bez ochrany proti vzorcům** — jméno začínající `=`, `+`, `-` nebo `@` je v Excelu vzorec, ne text (platilo i pro původní export v prohlížeči).
Opraveno: (1) `getCallsScreen` zrušená, stránka volá `loadCallsScreen` z `lib/admin/leads.ts` (server-only modul, není to endpoint); řazení si každá stránka ověří sama přes `parseTableParams`. (2) obě akce berou **id projektu**, adresu databáze i webu si dohledají v `startup_projects`; `dbUrl` se do prohlížeče vůbec neposílá. (3) hodnota začínající `=+-@` dostane v CSV apostrof.
Navíc: zrušeno sedm server actions, které tahaly celé tabulky (`getLeads`, `getAllLeadNotes`, `getCompletedProjects`, `getProjectSurveys`, `getAllInvoices`, `getInvoiceRegistryScreen`, `getWaitlistEntries`) — o tolik méně endpointů, které umí vrátit všechna data najednou.
Ověřeno: `npx tsc`, 802 testů (nový `lib/__tests__/admin-table.test.ts` zkouší i `sort=x';DROP TABLE costs--` a vlastnosti prototypu), produkční build a smoke test přes HTTP s podepsanou session — 23 adres včetně pokusu o injekci vrací 200 a server nehlásí chybu.
Zůstává: hledání ve Fakturách neescapuje `%` a `_` v `ILIKE` (jen širší výsledky, ne bezpečnostní problém). Průchod v prohlížeči okem.

## 2026-11-11 — review: zúžení CSP po sjednocení písma (AD04)
Spouštěč: AD04 — Dílky jako výchozí vzhled celého repa (R-081), krok „písmo a CSP".
Rozsah: `app/globals.css`, `app/layout.tsx`, `app/admin-tokens.css`, `tailwind.config.ts`, `lib/security/csp.ts`, hlavičky a servírované CSS z produkčního buildu.
Výsledek: politika **zúžená**, nic nepřibylo. Žádný nový externí zdroj, žádné `unsafe-*`, žádný wildcard.
Nálezy: výjimka `style-src fonts.googleapis.com` + `font-src fonts.gstatic.com` v profilu `admin` existovala jen kvůli `@import` Interu v `app/globals.css`. Ten je pryč, takže výjimka platila zbytečně i pro `/login`, `/p/[token]` a `/h/[token]`.
Opraveno: obě hodnoty odebrané z `extras(profile === 'admin')`, CSP-LOG v8, řádek v STATE.md. Test `csp.test.ts` nově tvrdí opak (profil `admin` ani `/login` `fonts.*` neobsahuje), nový `lib/__tests__/fonts-dilky.test.ts` hlídá, že se Inter nevrátí.
Ověřeno: produkční build + `next start` lokálně. `/login`, `/p/[token]` i 404 vracejí `style-src 'self' 'unsafe-inline'` a `font-src 'self' data:`; HTML `/login` a všechny tři servírované CSS soubory mají 0 výskytů `fonts.googleapis`; `<html>` nese třídy písem.
Zůstává: průchod přihlášeného adminu v prohlížeči (agent nemá heslo) — konzole ověří AD04 krok „hotovo, když". Nesouvisející nález: `/p/<nesmyslný token>` vrací lokálně 500 (`22P02`, `public_token` je `uuid`), na produkci podle záznamu 2026-11-04 404 — zapsáno do otevřených problémů.

## 2026-11-04 — incident: produkce bez databáze po výměně hesla `neondb_owner`
Spouštěč: hlášení Kryštofa (na produkci „Application error: a server-side exception has occurred“, digest 1150213469).
Rozsah: Vercel runtime errors za 3 dny, env proměnné projektu `project-iq` (jen metadata, hodnoty nedešifrované), `.env.local` (jen host a role, čtecí dotaz na existenci tabulek), produkční deploy.
Výsledek: výpadek všeho nad `DATABASE_URL` na produkci. Příčina v konfiguraci, ne v kódu (produkce dál na `d948400` z 2026-09-19).
Nálezy: (1) Heslo `neondb_owner` na produkčním Neonu (`projectiq`) bylo vyměněné (rotace po vložení connection stringu do chatu 2026-11-01), ale Production `DATABASE_URL` ve Vercelu zůstala z 2026-06-14 → `NeonDbError: password authentication failed for user 'neondb_owner'`. První zachycená chyba 2026-11-04 10:38 (09:38 UTC), do opravy 12× na `/hub`, 2 uživatelé. Postiženo i `/dashboard`, `/alteno`, portál `/p/[token]` a veřejné endpointy poptávek z vizeon.cz a alteno.cz. Přesný čas výměny hesla neznámý (Hobby drží runtime logy 1 h). (2) `.env.local` → `DATABASE_URL` míří na testovací Neon `ZakazIQ RD test` (bez `projects` a `client_leads`), jako zdroj pro Production se nehodí: chyba hesla by se změnila v chybějící tabulky. (3) Bez monitoringu se o výpadku ví jen z hlášení.
Opraveno: Kryštof uložil nový connection string do Production `DATABASE_URL` (`vercel env update`, citlivá, 2026-11-04 14:31). Produkce znovu nasazená (`vercel redeploy`, stejný commit `d948400`, alias `www.zakaziq.cz`). Ověřeno: `/p/<neexistující token>` vrací 404 (dotaz do DB prošel, dřív 500), `/login` 200, 10 minut po nasazení žádný záznam v runtime logu. Výměna hesla `neondb_owner` je tím potvrzená.
Zůstává: přihlášený `/hub` po opravě nikdo neotevřel; ověřit, jestli 2026-11-04 nepropadla poptávka z vizeon.cz nebo alteno.cz; monitoring chyb (STATE → Otevřené položky). Při příští rotaci hesla měnit Neon a Vercel Production v jednom kroku a hned znovu nasadit.

## 2026-11-03 — review celého kódu před spuštěním
Spouštěč: žádost Kryštofa o kompletní revizi designu, frontendu a backendu před spuštěním.
Rozsah: `proxy.ts`, `next.config.mjs`, `lib/security/*`, autorizace všech 53 souborů se server actions a všech API rout (admin, Workspace, veřejné, webhooky, crony), `lib/ws/db.ts`, `context.ts`, klíče, rate limit, příjem poptávek, `/r` a `/z` akce, kontaktní formulář, přepis hlasu, hlášení z Claude Code, pozvánky, předání do terminálu, e-mailové šablony, PDF (Puppeteer), Stripe/Resend webhooky, NextAuth, CI, design systém ve frontendu. `npm audit` (0), `tsc` (0 chyb), `npm test`.
Výsledek: bez zneužitelné díry. Nálezy jsou provozní a zpevnění.
Nálezy: (1) Clerk middleware bez `authorizedParties`; (2) session adminu 30 dní, bez dvoufázového ověření, zámek jen na IP; (3) `/r/[slug]` fungovala i pro účet, který nedokončil Checkout (veřejná objednávka pod libovolným názvem firmy zdarma, poptávky bez čtenáře); (4) předání do Claude Code spouštělo agenta s textem klienta v běžném režimu; (5) žádné `error.tsx`/`global-error.tsx` (anglická výchozí stránka Nextu) a žádný monitoring chyb; (6) CI bez testů a typů, `security.yml` neběžel na větvích `ws/*`, Node 20; (7) 2 testy padaly na pevném datu (`ws-email.test.ts`); (8) admin běží rolí vlastníka DB; (9) výměna hesla `neondb_owner` po úniku do chatu (2026-11-01) nepotvrzená; (10) Vercel Hobby je podle podmínek jen pro nekomerční použití.
Opraveno: (1) `lib/security/clerk.ts` + `proxy.ts`, DECISIONS #021; (2) session 12 h; (3) migrace 099 (aplikována: ne), R-077; (4) `--permission-mode plan` + test ve shellu; (5) `error.tsx` pro `/w`, `/w/[byznys]`, `/r`, `/z`, `/klient`, landing a `app/global-error.tsx`; (6) `.github/workflows/ci.yml`, `security.yml` na `ws/**` a Node 24; (7) test mimo pevná data a s úklidem v `finally`.
Zůstává: dvoufázové ověření adminu, monitoring chyb, samostatná DB role adminu, potvrzení výměny hesla `neondb_owner`, přechod na Vercel Pro (STATE → Otevřené položky). Další testy míchají pevná data z listopadu 2026 se skutečnými hodinami (16 souborů). Veřejný klíč widgetu jde mimo prohlížeč použít s podvrženým `Origin`, proti spamu chrání jen limit (DECISIONS #010).
Kontrola oprav (`web-security-review` nad rozdílem): bez nového tajemství, vstupu ani HTML výstupu; chybové stránky nevykreslují text chyby; migrace 099 má `SECURITY DEFINER` s pevným `search_path` a `REVOKE PUBLIC`; CI bez secrets s `contents: read`. Bez nálezu. Ověřeno: `tsc` 0 chyb, `npm test` 721 + 1 přeskočený, `next build` prošel.

## 2026-10-31 — statická analýza Semgrep (kód a CI)
Spouštěč: žádost Kryštofa o test bezpečnosti kódu nástrojem Semgrep.
Rozsah: celé repo (1015 souborů, bez `node_modules`, `.next`, `graphify-out`, `.agents`, `public`); pravidla `p/security-audit`, `typescript`, `nextjs`, `react`, `secrets`, `owasp-top-ten`, `jwt`, `sql-injection`, `xss`; telemetrie vypnutá, nic se nenahrává. Semgrep 1.183.0 v dočasném venv mimo repo.
Výsledek: 12 nálezů, žádný v aplikačním kódu (SQL injection, XSS, secrets, JWT bez nálezu).
Nálezy: 5× `github-actions-mutable-action-tag` (`security.yml`), 1× `npm-missing-minimum-release-age` (`.npmrc`), 6× `wildcard-postmessage-configuration` ve vendorovaném skriptu skillu Impeccable (`live-browser.js`, ne náš kód). Parser neprošel úplně `& Zdraví`/`& čas` v JSX (omezení Semgrepu).
Opraveno: akce v `.github/workflows/security.yml` připnuté na commit SHA (`actions/checkout`, `actions/setup-node`, `gitleaks/gitleaks-action`, verze v komentáři); `.npmrc` má `min-release-age = 7` (npm 11.10+, starší npm klíč ignoruje). Opakovaný sken obou souborů: 0 nálezů.
Zůstává: SHA akcí se neaktualizují samy (zvážit Dependabot pro `github-actions`); `postMessage` ve vendorovaném skriptu se neřeší; Semgrep nevidí oddělení účtů, logiku webhooků ani produkční konfiguraci (viz review V3).

## 2026-10-31 — review V3: veřejné vstupy, webhooky, cron (launch plán)
Spouštěč: launch plán, fáze 3 (V3), průchod nad vstupními body větve `ws/redesign-app`.
Rozsah: kontaktní formulář landing, `app/api/{stripe,clerk,resend}/webhook`, `app/api/public/v1/requests`, `app/api/cron/ws-*`, `lib/ws/cron.ts`, `lib/ws/email/resend-webhook.ts`, `lib/ws/intake/rate-limit.ts`, XSS sinky, veřejné `NEXT_PUBLIC_*`, sledované `.env*`. Celý rozdíl (613 souborů) řádek po řádku nečten; `proxy.ts`, `next.config.mjs` a `lib/security/*` v tomto průchodu nově nezkoumány (pokryté dřívějšími review).
Výsledek: bez nálezu „opravit hned“.
- Webhooky Stripe, Clerk i Resend jsou fail-closed (bez tajemství 503), čtou tělo s limitem, ověřují podpis a čerstvost; Resend používá `timingSafeEqual`. Cron porovnává `CRON_SECRET` v konstantním čase a bez něj nepustí nikoho.
- Veřejné API poptávek: rate limit na IP i byznys před autentizací, idempotence, CORS jen z povolených domén klíče.
- XSS: `dangerouslySetInnerHTML` jen pro JSON-LD z vlastního objektu a pevný skript motivu s nonce; `innerHTML` jen v admin `TradingViewChart` (konstantní obsah, admin se nemění). V klientském kódu jsou jen `NEXT_PUBLIC_APP_URL` a publishable klíč Clerku. V gitu jsou jen `.env.example` a `.env.local.example`.
- Opravit před spuštěním: Vercel Production má dnes dev/sandbox klíče Clerku a Stripe a chybí `CLERK_WEBHOOK_SECRET`, `RESEND_WEBHOOK_SECRET`, `WS_EMAIL_FROM`. Před mergem je nahradit live hodnotami.
- Přijato (nízké): kontaktní formulář kontroluje a zapisuje limit ve dvou dotazech (ne atomicky) a ukládá IP v čitelné podobě do admin tabulky `api_requests` (mazání po 1 dni); bez captchy, jen honeypot, časová kontrola a limit 5/15 min na IP. Při distribuovaném spamu přibudou řádky v Hovorech; zvážit Turnstile po spuštění.
Ověřeno: `npm test` (588 passed, 1 skipped), `npx tsc --noEmit`.
Zůstává: V2 (admin s daty po Next 16), živý audit produkční domény po nasazení.

## 2026-10-31 — audit závislostí a obnova blokujícího CI
Spouštěč: launch plán, fáze 3 (V4); naplnění podmínky v rozhodnutí #006.
Rozsah: produkční i vývojové závislosti podle npm advisories; lockfile po `npm audit fix`.
Výsledek: první audit našel 5 zranitelností (3 high, 2 moderate), včetně Zod přes Puppeteer/Chromium, Nodemailer a postcss-selector-parser. `npm audit fix` bez `--force` aktualizoval lockfile v rámci existujících rozsahů. Následný `npm audit` i `npm audit --omit=dev --audit-level=high` hlásí 0 zranitelností.
Ověřeno: `npm test` — 583 passed, 1 skipped; `npx tsc --noEmit`; `npm run build:check` prošly. `gitleaks git --log-opts='main..HEAD' --redact` — bez nálezu.
Opraveno: `.github/workflows/security.yml` už nemá `continue-on-error`; high/critical audit nyní blokuje CI podle rozhodnutí #006. `package.json` beze změny; aktualizován `package-lock.json`.
Zůstává: celý V3 bezpečnostní review proti `main`, živé Preview/provozní ověření a ruční kroky z `docs/workspace/LAUNCH-PLAN.md`.

## 2026-10-31 — review kontaktního formuláře landing
Spouštěč: launch plán; nový veřejný formulář podpory.
Rozsah: `app/(marketing)/actions.ts`, formulář a sekce v `components/marketing/`, rate limit a zápis do existující tabulky `client_leads`.
Výsledek: scoped review bez vysokého nálezu; nejširší kontrola V3 celého rozdílu proti `main` zůstává otevřená.
- Jméno, e-mail a zpráva mají Zod limity; data se vkládají parametrizovaně bez HTML interpretace. Honeypot a časová kontrola omezují automatický spam; limit je 5 požadavků za 15 minut na IP. Chyba loguje pouze typ chyby, ne obsah ani kontaktní údaje.
- Dotazy jsou v existujících Hovorech `/dashboard/calls`, s termínem odpovědi následující den a typem úkolu e-mail. Automatická notifikace se neposílá; odpovědná osoba a monitoring Hovorů zůstávají provozní blokátor. Právní účel a retenci osobních údajů doplnit před veřejným spuštěním.
- Bez nové závislosti, env proměnné, externí služby, e-mailového odeslání nebo změny CSP.
Ověřeno: kontaktní testy 5/5, celé `npm test` 588 passed + 1 skipped, `npx tsc --noEmit`, `npx next build --webpack` (47/47 stránek). Turbopack build v tomto prostředí selhal při vytvoření procesu/vazbě na interní port; Webpack build uspěl.

## 2026-10-17 — review S19 (částečné, před nasazením)
Spouštěč: bezpečnostní audit a spuštění S19.
Rozsah: dřívější detailní review S06–S18 v tomto logu; aktuální rozdíly veřejného příjmu poptávek, rate limitů, cen a CSP; webhooky Stripe/Clerk/Resend; čtení těla veřejného API; CSP pro všechny cesty.
Nálezy:
- **Střední, opraveno:** Stripe, Resend a veřejné API kontrolovaly limit těla až po `req.text()`; Clerk kontroloval jen deklarovaný `content-length`. Chunked požadavek tak mohl být celý načten před limitem. Nové `lib/security/request-body.ts` počítá bajty průběžně a odmítne tělo nad limit; použito pro Stripe, Clerk, Resend a veřejné API. Podpisy webhooků se ověřují až po omezeném načtení.
- Při kontrole dosavadních auditních záznamů S06–S18 a aktuálního diffu se nenašel nový nález vysoké závažnosti v kontrolovaných změnách. Produkční kód nebylo možné nezávisle načíst.
Ověřeno: celá sada `npm test` — 480 prošlo, 1 přeskočen; CSP a stream-limit testy 17/17; `npx tsc --noEmit` prošel; `npx next build --webpack` prošel. Standardní `npm run build:check` s Turbopackem stále padá při bindu lokálního portu (`Operation not permitted`). `npm audit --omit=dev --audit-level=high` neproběhl, protože prostředí nepřeložilo `registry.npmjs.org`. `security-check.sh` neprošel k HTTP kontrole, protože prostředí nepřeložilo `www.zakaziq.cz` (`curl` 6; lokální `dig` blokován). Vercel konektor nenašel projekt.
Zůstává: Vercel Preview a Chrome/Safari, živý audit hlaviček/TLS/DNS, audit závislostí, produkční konfigurace a ruční ověření spouštěcích položek v `docs/workspace/LAUNCH.md`. S19 není dokončen a spuštění není schváleno.

## 2026-10-17 — živý audit S19 a Preview
Spouštěč: pokračování bezpečnostního auditu a ověření připravenosti ke spuštění.
Rozsah: Vercel projekt `project-iq`, živá `www.zakaziq.cz`, Preview `project-pnfallur8-sobotkakrystof5-pngs-projects.vercel.app`, produkční `npm audit --omit=dev`, Chrome landing.
Výsledek produkce: Vercel API uvádí `zakaziq.cz` i `www.zakaziq.cz` jako ověřené; produkční alias je stále starší `main`, SHA `d9484001`. `security-check.sh www.zakaziq.cz` v 12:19: 16 prošlo, 5 varování, 4 chyby. HTTPS přesměrování 308 a odpověď 200. Nálezy: CSP, COOP a CORP chybí; `x-powered-by: next.js`; skript nedostal 200 z `/.well-known/security.txt`, SPF a DMARC chybí. Zdrojový soubor `public/.well-known/security.txt` je v repu i Preview deployment package; obsah endpointu zůstává k ověření po Vercel challenge. Přímý `curl -v` později ověřil certifikát `www.zakaziq.cz` i TLS 1.3. Přímé DNS dotazy apexu nevrátily DS, CAA ani TXT. Vercel po automatických kontrolách začal vracet challenge 403; znovu nespouštět hromadné HTTP sondy.
Výsledek Preview: build `dpl_D51psLjGaMLpS9H8tBTDCtshoF3o` READY; první build selhal na peer rozsahu `next-auth@4`/Nodemailer 10, `.npmrc` s `legacy-peer-deps=true` umožnil opakovaný build. `security-check.sh` na Preview: 26 prošlo, 6 varování, 1 chyba; CSP, COOP, CORP a další hlavičky jsou přítomné. Chyba načtení certifikátu i výsledek „TLS 1.3 nepodporováno“ jsou falešné: skript vyžadoval `timeout`, který v prostředí/macOS není nainstalovaný. Skript opraven funkcí `timed` (timeout/gtimeout, jinak přímé volání s EOF); `bash -n` prošel. DNS/e-mailové kontroly na hostu `vercel.app` nejsou relevantní pro custom doménu. Preview audit později chránil Vercel challenge, ruční requesty zastaveny.
Chrome: landing page se vykreslila; console obsahovala `[next-auth][error][CLIENT_FETCH_ERROR]` s hlášením o server konfiguraci. CSP porušení nebyla v zaznamenaných warn/error zprávách. Přihlášení Workspace/adminu ani Safari neověřeny. Žádný formulář ani citlivé údaje nebyly odeslány.
Závislosti: Nodemailer aktualizován na 10.1.2; přibylo `.npmrc` kvůli nepovinnému peer NextAuth 4 EmailProvider (aplikace používá CredentialsProvider). `npm audit --omit=dev --audit-level=high`: 5 high a 2 moderate, zbývá řetězec Tailwind 3 (`braces`/`micromatch`/`postcss`); `npm audit fix --legacy-peer-deps` bez `--force` nepřinesl opravy. Full audit vyžaduje samostatnou Tailwind 4 migraci. CI audit zůstává neblokující podle rozhodnutí #006.
Ověřeno: Preview Vercel build a všechny routy v build outputu; Chrome landing; `npm test` 480 prošlo, 1 přeskočen; `npx tsc --noEmit`; `npm ci --dry-run`; `bash -n .claude/security/security-check.sh`; `curl` TLS. Produkce se nenasazovala.
Otevřené: opravit produkční hlavičky až v autorizovaném deployi; nastavit SPF/DMARC/DNSSEC/CAA; publikovat security.txt po doplnění skutečného kontaktu; vyřešit NextAuth konfiguraci Preview; Chrome/Safari login a Workspace; záloha/obnova, produkční Clerk/Stripe/Resend, právní texty, podpora a pilot podle `docs/workspace/LAUNCH.md`.

## 2026-10-17 — review (S18, GDPR, PWA, tmavý režim)
Spouštěč: kontrola podle `web-security-review` před commitem S18.
Rozsah: migrace 084 a `scripts/ws-grants.sql`, `lib/ws/{gdpr,zip,csv,theme}.ts`, `/w/ucet/export`, `/w/ucet/zpracovani`, akce `eraseCustomer`, `closeAccountAction`, `reopenAccountAction`, `/api/cron/ws-gdpr`, `marketingConsent` v `lib/ws/intake/intake.ts`, `/r` a widgetu, `components/ws/ws-root.tsx` (inline skript), `public/sw.js`, `public/offline.html`, manifest.
Výsledek:
- Secrets: nic nového, žádná `NEXT_PUBLIC_` proměnná; cron ověřuje `CRON_SECRET` (`isCronAuthorized`), Clerk se volá ze serveru.
- Vstupy: Zod u všech akcí (UUID, název účtu max. 200 znaků, `marketingConsent` boolean), export bez vstupu; potvrzení zrušení účtu porovnává server.
- Přístup: výmaz, export, záznam o zpracování i zrušení jen majitel; výmaz cizího zákazníka vrátí null a nic nesmaže (test); po zrušení se zavřou objednávací stránka, widget, API i portál (archivace byznysů, test).
- XSS a injekce: jediný `dangerouslySetInnerHTML` je konstantní skript s nonce; CSV s ochranou před vzorci (test), cesty v ZIPu očištěné; SQL jen parametrizované, funkce s pevným `search_path`.
- Data v prohlížeči: service worker neukládá nic kromě offline stránky a ikony.
Nálezy: 0 k opravě. Přijatý kompromis viz DECISIONS #014.
Opraveno: —
Zůstává: refundace nevyčerpaného období při zrušení účtu se neřeší (Otevřené problémy v `memory/memory.md`); rozesílané e-maily majiteli (přehledy dne) mohou v záznamu odeslaných zpráv (`ws.outbound_messages.payload`) dál nést jméno vymazaného zákazníka; výmaz maže jen zprávy s jeho id nebo klíčem.

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

## 2026-10-17 — review (upgrade na Next 16.4.2 a React 19)
Spouštěč: `web-security-review` před commitem upgradu (R-053).
Rozsah: `middleware.ts` → `proxy.ts` (Node runtime místo edge), `next.config.mjs` (`serverExternalPackages`, `turbopack.root`, `outputFileTracingRoot`), async `params`/`searchParams`/`cookies()`/`headers()` v ~70 souborech, závislosti (`next`, `react`, `qrcode.react`, `lucide-react`).
Výsledek:
- `proxy.ts`: pořadí větví (Clerk `/w` + `/api/ws` → NextAuth admin → CSP s nonce) a matcher beze změny. Ověřeno na produkčním buildu: `/dashboard`, `/alteno`, `/hub` → 307 na přihlášení, `/w` → `/w/prihlaseni`, `/api/public/v1/schema` bez klíče 401, `/p/<uuid>` 404; CSP s nonce na `/`, `/w/*`, `/r/*`, admin `/login` zůstává Report-Only. CSP se neoslabila.
- `appOrigin()` je async (čte `headers()` jen jako vývojový záložní zdroj, ostrá adresa je `NEXT_PUBLIC_APP_URL`). Server action pro cookie byznysu: `cookies()` s `await`, atributy beze změny.
- Tracing PDF: v `route.js.nft.json` jsou binárky `@sparticuz/chromium` (původní klíč `outputFileTracingIncludes` fungoval i pod Turbopackem).
- `npm audit`: Next 16.2.12 byl dál označený (critical v `next/og`, Image Optimization, Windows hosting; opravy až od 16.3.8), proto cíl 16.4.2 — critical u `next` zmizely. Zbývá `nodemailer` 7, `next-auth` 4, řetězec `tailwindcss` 3 (DECISIONS #006).
- Ověřeno: `tsc` čistý, `npm test` 451 + 1 vynechaný, `npm run build` (Turbopack) bez varování, smoke test produkčního serveru. Neověřeno: přihlášení do adminu a Clerku v prohlížeči, skutečné PDF na Vercelu, Vercel Preview.
Nálezy: 0 k opravě.

## 2026-10-17 — review redesignu Landing a Dnes
Spouštěč: `web-security-review` před lokálním commitem redesignu.
Rozsah: `components/marketing/{hero,live-demo,features,how-it-works}.tsx`, `components/ws/app/today/{today-board,week-calendar}.tsx`, `app/w/[business]/{page,loading}.tsx`, lokální CSS landing page.
Výsledek: 0 nálezů. Ukázka používá pouze statická fiktivní data a místní stav Reactu; nepřijímá vstup z URL, nevolá API, neodesílá e-maily. Žádné nové HTML sinky, externí skripty, balíčky, env, autentizační či DB operace. Dnes předává stejná serverová data a odkazy do stávajících komponent; account_id ani mutace se nemění. CSP beze změny.
Ověření: 475 testů + 1 přeskočený, typová kontrola; Chrome nad upravenými komponentami s fiktivními daty. Kompletní produkční build blokují podmínky worktree a DNS Google Fonts. Přihlášení ani externí služby nebyly použity.

## 2026-10-18 — review RD02 (rychlost: kontext jedním dotazem, streamování kostry)
Spouštěč: `web-security-review` před commitem (nová DB funkce).
Rozsah: `migrations/085_ws_kontext_jednim_dotazem.sql`, `lib/ws/{scope,context,chrome,frame-chrome}.ts`, `app/w/[business]/layout.tsx`, `components/ws/app/{app-frame,detail-slot,skeletons}.tsx`, `vercel.json` (region `fra1`).
Výsledek:
- `ws.business_scope`: parametrizovaný dotaz (`${org}`, `${slug}` jdou jako parametry, slug navíc ověřený regulárním výrazem a délkou před voláním), pevný `search_path`, `REVOKE PUBLIC`, `EXECUTE` jen `ws_app`, vyjmenované sloupce. Testy `ws-request-scope.test.ts` (17): cizí slug i organizace nic nevrátí, nesmyslný slug neškodí, archivovaný byznys nevrátí nic, odpověď neobsahuje ID účtu B.
- Paměť požadavku (`React.cache`) je klíčovaná `accountId:slug`, takže seed jednoho účtu nepustí byznys jiného účtu (test). Mimo render (server action, route handler) se nepoužívá.
- Streamování: promise s doplňky (zvonek, služby) vzniká na serveru v layoutu s kontextem přihlášeného, nese jen jeho data; chyba se loguje a vrací prázdné hodnoty (nic nepadá, nic se neukáže cizímu). Žádné nové `dangerouslySetInnerHTML`, balíčky, env ani skripty třetích stran. CSP beze změny; ověřeno v Chromu bez chyb v konzoli (kromě varování Clerku o vývojových klíčích).
- `vercel.json` `regions: ["fra1"]` jen přesouvá běh funkcí blíž Neonu; projeví se po deployi.
Nálezy: 0 k opravě. Zůstává: migrace 085 není na Neonu (do té doby běží záložní postup), obrazovky s přihlášením neověřeny.

## 2026-10-18 — review RD03 (rychlost: indexy, součty v SQL, živé obnovení, balíček)
Spouštěč: `web-security-review` před commitem.
Rozsah: `migrations/086_ws_indexy_rychlost.sql`, `lib/ws/money/data.ts` (`getMoneyTotals`), `lib/ws/calendar.ts` (`getChangeStamp`), `app/api/ws/[business]/zmeny/route.ts`, `components/ws/{ws-root,app/app-frame}.tsx`.
Výsledek:
- Migrace jen indexy (žádná data, práva ani RLS). `getMoneyTotals` je parametrizovaný dotaz se stejným filtrem účtu a zkušebních poptávek jako `getFinance`, test `ws-money-totals.test.ts` ověřuje, že cizí účet nic nevrátí.
- Route `/zmeny`: ověření beze změny (proxy `auth.protect` + `loadBusinessScope` ověří organizaci a slug proti účtu), vrací jen ETag. Odesílání e-mailů jde přes `after()` pod stejným kontextem účtu a chyba se loguje bez osobních údajů.
- Žádné nové závislosti, env, `dangerouslySetInnerHTML` ani skripty třetích stran; CSP beze změny (dynamický import je vlastní chunk z `'self'`).
Nálezy: 0 k opravě.

## 2026-10-18 — review RD05 + RD06 (kalendář a zakázky)
Spouštěč: dokončení sezení RD05 a RD06 redesignu aplikace (před commitem, skill `web-security-review`).
Rozsah: nové a změněné vstupy — server actions `slotAdvice`, `searchCustomers`, `resizeAppointment`, `createManualBooking` (nové `durationMin`), `moveJobStage` (zápis do `ws.audit_log`); `lib/ws/{slot-advice,bookings,calendar,jobs}.ts` (SQL); parametry adresy `kdo`, `zakaznik`, `den`, `cas`, `pohled`, `filtr`, `detail=najit-cas`; inline styl s barvou pracovníka; `next/dynamic` načítání dvou komponent.
Výsledek: bez nálezů vysoké ani střední závažnosti.
Ověřeno: každá akce volá `requireWorkspace()` a `requireBusiness()` (slug z URL se ověří proti účtu), vstup prochází Zod (slug, uuid, celá čísla s mezemi 15–720 min, text do 80 znaků, `likePattern` escapuje `%`, `_`, `\`); všechny SQL dotazy mají `account_id` i `business_id` a běží pod RLS, parametry jsou vázané (žádné skládání textu z uživatelského vstupu); cizí účet nic nepřesune ani nepřečte (testy `ws-calendar.test.ts`, `ws-jobs-board.test.ts`); zápis historie stavů bere `actor` z kontextu a názvy stavů z DB, ne z vstupu. Barva pracovníka jde do inline stylu jen jako `#rrggbb` (kontrola regulárním výrazem i `CHECK` v DB) nebo jako token `--staff-N`; `kdo` se přijme jen z id pracovníků byznysu, `zakaznik` jen jako UUID a hledá se s `account_id`. Žádná nová env proměnná, žádný skript třetí strany, CSP beze změny (dynamické chunky jsou ze stejného původu a dostanou nonce jako dosavadní líné načtení palety ⌘K).
Zůstává (přijato): `slotAdvice` a `searchCustomers` nemají vlastní rate limit — jsou to čtení pro přihlášeného člena účtu, stejně jako ⌘K hledání (`searchAction`); dotaz odchází po 200–250 ms pauze v psaní. Kdyby se zneužívaly, doplnit limit podle `ctx.userId`.

## 2026-10-18 — review RD07 (veřejná objednávka, widget, pracovník a portál)
Spouštěč: `web-security-review` před commitem RD07.
Rozsah: nový volitelný `staffId` ve veřejném API a objednávce, kontrola dostupnosti (`lib/ws/intake/*`, `app/api/public/v1/schema/route.ts`, `app/r/[slug]/actions.ts`), widget launcher a CSS (`app/embed/*`, `lib/ws/intake/widget-*`), nový požadavkový portál a migrace 087, předvolba pracovníka při potvrzení (`lib/ws/portal.ts`, `lib/ws/bookings.ts`, `lib/ws/today.ts`).
Výsledek: bez nálezů.
- Vstupy procházejí Zodem; pracovník se ověřuje pod stejným účtem a byznysem, musí nabízet zvolenou službu a zvolený čas se ověřuje znovu při uložení. Potvrzení používá preferenci pouze tehdy, když je pracovník stále aktivní a způsobilý; kolizi dál atomicky rozhodne existující databázové omezení.
- Widget vygeneruje pouze launcher, žádný klíč. Název firmy a text tlačítka jdou do DOM jako text; slug je validovaný a URL kódovaný. Iframe má omezený sandbox; `frame-ancestors` zůstává na přesných povolených doménách. CSS se načítá z oddělené routy, akcent se sanitizuje přes `usableAccent`, žádné inline HTML ani styly. Zákaznickým webům je v dokumentaci vysvětleno povolení `script-src`, `style-src` a `frame-src` pro ZakazIQ.
- Token poptávky generuje DB. `ws.portal_lookup` vrací pouze účet/byznys/druh/ID; čekající portál čte jen status, požadovaný čas, službu a jméno pro pozdrav, nikdy kontakty. Zkušební a odpojené zákazníky vylučuje. Po propojení na potvrzený termín se vrací běžný termínový portál; akce hodnocení čekající poptávky odmítne. Výmaz zákazníka odkaz zneplatní.
- Bez nových závislostí, env proměnných, externích skriptů ani změny CSP aplikace. Migrace 087 je připravená, na skutečné DB nebyla spuštěna.
Ověřeno: `npm test` (551 prošlo, 1 přeskočený), `npx tsc --noEmit`, `npx next build --webpack`; lokální vizuální průchod s fiktivními daty v úzkém (614 px) a širokém (1228 px) zobrazení. `npm run build:check` neprošel kvůli sandboxovému zákazu vytvoření procesu/vazby na interní port; stejný zdroj úspěšně sestavil Webpack. Živý Preview se skutečným přihlášením, cizí doména widgetu a chování po migraci 087 zatím ověřeny nebyly.

## 2026-10-18 — review RD10 (fakturace)
Spouštěč: dokončení RD10 redesignu faktur před commitem, skill `web-security-review`.
Rozsah: `migrations/088_ws_faktury_profil_a_zpet.sql`, `scripts/ws-grants.sql`, akce v `app/w/[business]/faktury/actions.ts`, `lib/ws/money/{schema,data,pdf}.ts`, profil a fakturační formuláře/seznam, QR v PDF.
Výsledek:
- Zod ověřuje profil, fakturu, datum i platbu; zápis profilu vyžaduje roli vlastníka, `assertWritable` a ukládá jen pod `ctx.accountId`. Profil je účetní, ale každá faktura si ponechává vlastní snímek. Všechny datové dotazy dál filtrují účet a u faktury také byznys; zákazník/zakázka/služba se načítají jen v daném účtu/byznysu.
- `money_pay` a `money_unpay` jsou `SECURITY INVOKER`, mají pevný `search_path`, odebírají `PUBLIC` a udělují `EXECUTE` jen `ws_app` (migrace, `scripts/ws-grants.sql`). Funkce zamykají fakturu i transakci, platbu opakovaně nevytvoří a kontrolují účet/byznys. „Zpět“ odstraní pouze příjem vytvořený fakturou; převzatou nebo kalendářem použitou platbu odpojí a zachová. Nulová faktura se vrátí bez falešné transakce.
- IBAN se před SPAYD kontroluje délkou, formátem a mod97; QR je jen pro neuhrazenou vystavenou fakturu v CZK. HTML text je escapovaný; vložené SVG generuje pouze `qrcode.react` z kontrolovaného SPAYD řetězce. Žádná nová závislost, env proměnná, externí skript ani změna CSP.
Nálezy: 0 k opravě.
Ověřeno: `npx tsc --noEmit`, cílené `ws-money.test.ts` (33 prošlo, 1 přeskočený), celé `npm test` (558 prošlo, 1 přeskočený), `npx next build --webpack`. `npm run build:check` narazil na sandboxové omezení vytváření procesu/portu; Webpack sestavení prošlo.
Zůstává: vizuální a přihlášený Preview, PDF v prohlížeči, skutečné nastavení ověřené domény Resendu a migrací 080/087/088 na určené DB.

## 2026-10-18 — review RD12 (věrnost)
Spouštěč: dokončení RD12 před commitem, skill `web-security-review`.
Rozsah: nové a změněné vstupy v `app/w/[business]/zakaznici/actions.ts` (ruční razítko, oprava, uplatnění a jejich vrácení), DB logika v `lib/ws/loyalty.ts`, výběr karty v zákaznickém detailu/Dnes/portálu/e-mailu a HTML karta v `lib/ws/email/layout.ts`.
Výsledek:
- Všechny server actions začínají `requireWorkspace()`, Zod validací s limity a `requireBusiness()`; zápis vyžaduje `assertWritable`. Zákazníci a události se hledají pod `account_id`, byznysem a RLS; žádné ID účtu nepřichází z formuláře.
- SQL používá vázané parametry. Přidání razítka a uplatnění odměny sdílí advisory lock pro zákazníka/program. „Zpět“ ověřuje účet, byznys, autora, druh události, časový limit a že na kartě nepřibyla pozdější událost.
- Text odměny se v e-mailové HTML šabloně escapuje; akcent se před vložením do CSS ověřuje jako šestimístný hex s kontrastem. Žádné nové HTML sinky, env, závislosti, API routy ani třetí strany; CSP se neměnila.
Nálezy: 0 k opravě.
Ověřeno: cílené testy pokrývají izolaci účtů, souběh a zastaralé „Zpět“; celé `npm test` (566 prošlo, 1 přeskočený), `npx tsc --noEmit`, `npx next build --webpack`. Přihlášený lokální průchod nebyl možný, server přesměroval na přihlášení. `npm run build:check` selhal na sandboxovém omezení Turbopacku při vytváření procesu/vazbě na port; Webpack build prošel.

## 2026-10-18 — review RD16 + RD13 (kontakt zákazníka a Nastavení)
Spouštěč: dokončení RD16 a RD13 redesignu před commitem, skill `web-security-review`.
Rozsah: nové akce `saveCustomerContact`, `getCustomerMessageTemplates`, `sendCustomerMessage`, `undoCustomerMessage`; `lib/ws/{customers,email/outbox,email/queue,email/mailto}.ts`, migrace 089; zákaznická kontaktní UI; server actions a formuláře pěti částí Nastavení, autosave, oborové funkce, barvy pracovníků a checklist Dnes.
Výsledek: bez otevřených nálezů.
- Akce vyžadují workspace kontext, validují Zod vstupy s limity, ověřují slug byznysu v účtu a u zápisu předplatné. SQL má vázané parametry a účet; zpráva i zrušení fronty ověřují účet, byznys, zákazníka a ID. Zrušení je povolené i v read-only režimu, aby šlo využít 60s „Zpět“.
- Nabídka se kontroluje proti souhlasu, ukončení a odhlášení při vytvoření i znovu těsně před odesláním; osobní zprávy odhlášením blokované nejsou. Obsah zpráv skládá existující HTML kompozitor s escapováním. Bez připraveného Resend transportu se vrací jen `mailto:` a zpráva se neukládá jako odeslaná. Kontrola odhalila možnost vložit parametry do části adresy `mailto:`; opravena validací a samostatným bezpečným kódováním adresy, test pokrývá pokus o `bcc`.
- Nastavení zůstává jen pro vlastníka; závislosti modulů se při obnově stavového snapshotu opraví do konzistentního stavu. Náhled šablon používá `iframe sandbox`; CSP ani skripty se neměnily. Bez nové závislosti, env proměnné nebo externího API.
- Migrace 089 pouze rozšiřuje omezení typů v `message_settings`; je připravená a na Neonu se nespouštěla. GDPR export obsahuje nové zprávy a existující výmaz zákazníka je odstraní přes `customer_id`.
Ověřeno: `npm test` (570 prošlo, 1 přeskočený), `npx tsc --noEmit`, `npx next build --webpack`, `git diff --check`. `npm run build:check` Turbopack blokuje sandbox při vytváření procesu/vazbě na port; Webpack build prošel. Přihlášené UI, živý Resend a data po migraci ověřené nejsou.

## 2026-10-19 — review RD08, RD09, RD11, RD14 a kalendáře
Spouštěč: dokončení skupinových rezervací, více služeb, omezení osobních dat v administraci a návodů; bezpečnostní kontrola před commitem.
Rozsah: veřejné API `/api/public/v1/schema` a `/requests`, objednávka `/r` a widget, server actions poptávek/kalendáře, `lib/ws/{intake,bookings,portal,gdpr,calendar,admin}`, migrace 090/091, e-maily/ICS/portál/export a administrační čtení nad `ws`.
Výsledek: bez otevřených nálezů.
- Veřejné vstupy zůstávají za stávajícími klíči, CORS allowlistem, rate limity, honeypotem, idempotencí a Zod limity. Služby, pracovník, skupinová lekce i čas se ověřují v účtu/byznysu; zápisy mají vázané SQL parametry a account/business filtry. Při obsazení skupiny se její řádek zamyká; místo se přičte jen po vložení nové přihlášky, takže opakovaný external ID nespotřebuje kapacitu.
- Akce pro vypsání lekce a změnu přihlašování ověřují roli majitele na serveru; ovládání je skryté pracovníkům. Zrušená lekce nepřijme nové potvrzení ani obnovení odmítnutého účastníka. Databázová kolize termínů zůstává autoritativní. GDPR export zahrnuje služby/účastníky; úklid účtů smaže lekce před účtem kvůli FK na službu.
- Admin seznam používá zákaznické/finanční tabulky jen pro agregace a čas poslední aktivity. Detail vrací pouze údaje účtu, byznysů a členů; poznámky a volný obsah auditu se nenačítají. Zbytkové oprávnění vlastníka DB je zaznamenané v DECISIONS #017.
- Návody jsou statický typovaný obsah bez nových routových datových vstupů. CSP, přihlašování, secrets, závislosti a env zůstaly beze změny.
- Během kontroly opravené nálezy: chybějící serverové omezení skupinových akcí jen pro majitele; možná spotřeba dalšího místa při duplicitním external ID; ochrana před potvrzením/obnovením po zrušení lekce.
Ověřeno: `npm test --maxWorkers=2` (582 prošlo, 1 přeskočený), `npx tsc --noEmit`, `npx next build --webpack`, `git diff --check`. `npm run build:check` Turbopacku narazil na sandboxový zákaz vytvoření procesu/vazby na interní port. Přihlášený Preview, skutečná DB/migrace, odeslání e-mailu a fyzické zařízení s perem/dotykem nejsou ověřené.

## 2026-10-19 — migrace 080, 087–091 na produkčním Neonu
Spouštěč: Kryštof výslovně požádal o aplikaci připravených migrací v pořadí `080 → 087 → 088 → 089 → 090 → 091`.
Rozsah: `migrations/080_ws_penize_provoz.sql`, `087_ws_objednavka_pracovnik_a_portal.sql`, `088_ws_faktury_profil_a_zpet.sql`, `089_ws_rucni_zpravy_zakaznikum.sql`, `090_ws_rezervace_vice_sluzeb.sql`, `091_ws_skupinove_lekce.sql`.
Výsledek: bez otevřených nálezů.
- Nové tabulky `request_services`, `sessions` a `session_attendees` procházejí přes `ws.enable_account_rls`; aplikační funkce pro peníze jsou `SECURITY INVOKER`, s pevným `search_path`, `PUBLIC` odňatým EXECUTE a oprávněním `ws_app`.
- `portal_lookup` vrací pouze metadata potřebná portálu, má pevný `search_path` a EXECUTE je omezeno na `ws_app`. `purge_closed_accounts` je `SECURITY DEFINER` s pevným `search_path`, používá plně kvalifikované tabulky, maže jen účty s prošlým `delete_after` a nejprve uklidí navázané lekce; EXECUTE je odňato `PUBLIC` a uděleno `ws_app`.
- Změna migrací 090/091 neuvolňuje RLS ani přístup k `public`; kolizní ochrana zůstává v databázi. Data nebyla mazána ani seedována.
Ověřeno: každá migrace proběhla v samostatné transakci v požadovaném pořadí; z katalogu potvrzeny nové tabulky, sloupce a `ws.money_unpay()`. Lokální skript neměl síťový přístup, migrace byly spuštěny přes připojený Neon konektor. Přihlášené Preview není aktuální (poslední deployment je z `ws/s18`), testovací Neon větev zatím neexistuje.

## 2026-11-11 — review AD02 (jeden byznys, tři zdroje poptávek)
Spouštěč: sloučení inboxů a nový veřejný endpoint pro prvotka.cz, kontrola před commitem; skill `web-security-review`.
Rozsah: `lib/web-leads.ts` (dřív `lib/web-booking.ts`), `lib/lead-origins.ts`, `types/{booking,web-lead}.ts`, routy `app/api/public/{booking,booking/alteno,alteno-leads,prvotka-leads,agent-leads}`, migrace 102, přesměrování v `next.config.mjs` + `lib/legacy-redirects.mjs`, `lib/email.ts` (jedna odesílací schránka).
Výsledek: jeden nález opravený v rámci review, nic otevřeného.
- **Opraveno:** objednávkové schéma nemělo horní délku u `clientName`, `clientEmail` a `projectType` (platilo i před AD02) — s platným klíčem šlo uložit libovolně dlouhý text. Doplněno `max(200)` / `max(254)`; běžná poptávka dál projde (HTTP 200), 5 000 znaků se odmítne 400 `VALIDATION_ERROR`.
- Klíče a limity zůstaly oddělené per zdroj (`<zdroj>_booking`, `<zdroj>_lead`, ověřeno testem na jedinečnost). Živě ověřeno: klíč Altena na `/api/public/prvotka-leads` = 401, špatná `section` = 400. Klíč se nikde neloguje ani nevrací, porovnání dál `timingSafeEqual`.
- Payload, adresy a klíče volané cizími repozitáři (`vizeon.cz`, `alteno.cz`, `vizeon-lead-agent`) se nezměnily; `section: 'alteno'` a `source: 'alteno_web'`/`'web_contact_form'` dál platí. Nový `/api/public/prvotka-leads` má vlastní klíč, ne sdílený.
- Přesměrování starých adres vede jen na vlastní cesty: `/alteno//evil.example.com`, `/alteno/%2F%2Fevil.example.com` a `/alteno/..%2F..%2Fevil` skončí na stejném originu (`/dashboard/…`, resp. `/login`). Žádný otevřený redirect.
- Migrace 102 nic neuvolňuje: trigger `projects_lead_confirmed_sync` je SECURITY INVOKER, `lead_pending` je generovaný sloupec (do INSERTu nejde zapsat — ověřeno testem), nové CHECKy jsou `NOT VALID` a validují se jen nad čistými daty. Žádná nová role, grant ani přístup do jiného schématu.
- CSP, hlavičky, závislosti ani Clerk/Stripe se neměnily. Nová env je jen `PRVOTKA_LEAD_WEBHOOK_SECRET` (server, zapsaná v `.env.example`).
- Nezměněné a vědomě ponechané: `allowedOrigins` booking endpointů obsahují i `http://localhost:3000` a odpověď nemá `Access-Control-Allow-Credentials`; výpis poptávek v inboxu je bez `LIMIT` (stejně jako dřív) — při zahlcení by stránka ztěžkla, listy se předělávají v AD07.
Ověřeno: `npm test` (61 souborů, 739 prošlo, 1 přeskočený), `npx tsc --noEmit`, `npm run build`, živé POSTy ze všech tří zdrojů proti dev serveru a testovací Neon větvi (`rd-test`), přihlášené obrazovky adminu přes podepsanou session (HTTP 200). Produkce ani Preview ověřené nejsou — migrace 102 na produkci neběžela.

## 2026-11-12 — review AD08 (rychlost II, kalendář, PDF)
Spouštěč: nová server action, přepsaná PDF route a uvolněný `Cache-Control`, kontrola před uzavřením sezení; skill `web-security-review`.
Rozsah: `app/calendar-actions.ts` (`loadCalendarMonth`), `lib/admin/{calendar,calendar-window}.ts`, `app/api/invoices/[id]/pdf/route.ts`, `after()` v `app/actions.ts` a `lib/web-leads.ts`, `generateRecurringTransactions` v `app/dashboard/finance/finance-actions.ts`, `useOptimistic` v `components/{LeadCard,LeadsTable}.tsx`.
Výsledek: dva nálezy opravené v rámci review, jeden vědomě přijatý kompromis (DECISIONS #022), nic otevřeného.
- **Opraveno:** `loadCalendarMonth` ověřoval jen **tvar** datumu, takže `2026-99-99` prošlo. Měsíc 99 se v `Date` přetočí do jiného roku a do SQL šlo neplatné datum → odpověď 500 místo vysvětlení. Nový `isCalendarDay` vyžaduje, aby se datum vrátilo zpátky stejné (test včetně `2026-02-30` a pokusu o `DROP TABLE`). Rozsah okna se **nikdy** nebere z prohlížeče — počítá ho server z kotvy (`windowFor`), takže si klient nemůže vyžádat „od roku 2000 do 2100".
- **Opraveno:** PDF route neověřovala, že `id` je UUID — cizí adresa skončila chybou `22P02` a odpovědí 500. Nově 404 **bez jediného dotazu** do databáze. (Stejná třída chyby jako otevřený problém u `/p/<nesmyslný token>`.)
- **Přijato (DECISIONS #022):** `Cache-Control` na `/api/invoices/:id/pdf` se mění z `private, no-store` na `private, max-age=0, must-revalidate` + `ETag`. Faktura s údaji klienta tím smí ležet v cache prohlížeče admina; `private` drží dokument mimo sdílené cache a CDN a `max-age=0, must-revalidate` znamená, že se při každém otevření ověří ETag. `X-Frame-Options: SAMEORIGIN` na téhle cestě se nemění.
- `after()` nikde neposouvá kontrolu přihlášení: v `notifyClientOfProjectChange` i `confirmWebLead` běží `requireAuth()` **před** naplánováním, takže exportovaná akce dál nejde zneužít jako neautentizovaný email-relay. U veřejného příjmu poptávek (`lib/web-leads.ts`) zůstal pořádek kontrola klíče → Zod → zápis → `after()`.
- Pořadí vedlejších efektů se nezměnilo: e-mail se i dřív odesílal před zápisy do financí a před `revalidatePath`, takže `after()` nic nepřeskládalo.
- Všechny nové dotazy jsou parametrizované tagem `q` (`$1`, `$2`), žádné skládání SQL z textu. Okno se do `timestamptz` předává jako okamžik spočítaný v `pragueWallClockToISO`, ne jako interpolovaný text.
- `loadCalendarMonth` vrací stejná data, jaká stránka posílala i dřív (jméno, telefon, e-mail a poznámka kontaktu) — žádné nové zveřejnění; je to akce jen pro přihlášeného admina, bez CORS a bez rate limitu (jeden admin, R-001).
- `generateRecurringTransactions` má `requireAuth()`; `useOptimistic` je čistě v prohlížeči a o oprávnění nerozhoduje — skutečnou změnu dělá dál server action.
- Žádný nový `dangerouslySetInnerHTML`, žádná nová závislost, žádná nová env, CSP ani hlavičky se mimo výše uvedený `Cache-Control` neměnily. ETag je md5 obsahu PDF a vidí ho jen přihlášený admin.
Ověřeno: `npx tsc --noEmit`, `npm test` (73 souborů, 845 prošlo, 1 přeskočený), `npm run build:check`, smoke test přes podepsanou session (22 adres adminu + pět záložek detailu = 200, log serveru bez chyb). 200 → 304 u PDF ověřeno jen unit testem — na testovací databázi žádná faktura `pdf_data` nemá.

## 2026-11-12 — review AD10 (dokončení: karta kontaktu, kalendář, odolnost bez migrace 105)
Spouštěč: dokončení sezení AD10 po ověření v prohlížeči — kontakt na kartě kontaktu, kontakt v detailu kalendářní události a záchrana `updateLead` na databázi bez migrace 105; skill `web-security-review`.
Rozsah: `lib/admin/calendar.ts` (LEFT JOIN na `client_leads`), `components/SmartCalendar.tsx`, `app/dashboard/kontakty/[id]/page.tsx`, `app/calls-actions.ts` (větev `42883`), `components/{ProjectCalculator,admin/project-detail-view}.tsx` (jen třídy), testy.
Výsledek: bez nálezu, nic otevřeného.
- Nový `LEFT JOIN client_leads l ON l.id = e.lead_id` nepřijímá nic z prohlížeče — spojuje se přes vnitřní cizí klíč a hranice okna dál počítá server (`windowFor`, R-093). Dotaz zůstal parametrizovaný tagem `q`, kvalifikace sloupců (`e.`, `l.`) nic nerozšířila.
- Kalendář posílá do prohlížeče telefon a e-mail i u ručně zapsané události. **Není to nová kategorie údajů**: tytéž sloupce `client_leads.phone/email` už nesl pro řádky druhu `call`. Je to obrazovka jen pro přihlášeného admina, bez CORS a bez veřejné cesty.
- Odkazy na kartě kontaktu staví `lib/contacts/href.ts` — telefon jen jako E.164, adresa přes whitelist `MAILTO_SAFE`, předmět i text přes `encodeURIComponent`. Žádný nový `dangerouslySetInnerHTML`.
- Větev `42883` v `updateLead` nic neobchází: `requireAuth()` běží před dávkou a záložní cesta pouští **týž** parametrizovaný UPDATE, jen bez volání funkce z migrace 105. Kolize `23P01` se dál překládá do češtiny. Stejný vzor, jaký má rezervace z portálu.
- CSP, hlavičky, závislosti, env ani role se neměnily. Žádná migrace; 105 zůstává nepuštěná.
Ověřeno: `npx tsc --noEmit`, `npm test` (79 souborů, 915 prošlo, 1 přeskočený), `npm run build:check` a průchod headless Chromem s podepsanou session — osm obrazovek adminu na 390 / 768 / 1280 / 1440 px, v konzoli jen 404 na `/favicon.ico`.

## 2026-11-12 — review AD12 (vystavování faktur, PDF, ARES)
Spouštěč: nové server actions, nový route handler, první odchozí volání na cizí službu z adminu a migrace, která sahá na doklady; skill `web-security-review`.
Rozsah: `migrations/107_fakturace_vystavovani.sql`, `lib/ares.ts`, `lib/admin/invoice-issue.ts`, `lib/admin/invoice-issue-schema.ts`, `lib/invoice-pdf/{render,totals}.ts`, `app/dashboard/finance/invoice-actions.ts` (nové akce), `app/api/invoices/[id]/{pdf,email}/route.ts`, `components/admin/invoices/{issue-form,issuer-form,issued-actions}.tsx`, `lib/email.ts` (`sendInvoiceEmail`), `next.config.mjs`.
Výsledek: jeden nález opravený v rámci review, dva vědomé kompromisy zapsané (DECISIONS #023 a #024), nic otevřeného.
- **Opraveno:** `POST /api/invoices/:id/email` neměl strop. Server actions mají kontrolu původu i frontu vestavěnou, route handler ne — přidán rate limit `invoice-email` (10 požadavků / 10 minut na IP) nad sdílenou `lib/api-rate-limit.ts`. Jedno odeslání = jedno spuštění Chromia a jeden e-mail klientovi, takže to má být shora omezené i pro přihlášeného.
- **CSRF:** ten samý route handler kontroluje `Origin` proti vlastnímu originu (`sameOrigin`) a bez hlavičky požadavek odmítá. Bez toho by cizí stránka uměla session adminu přimět poslat fakturu — GET s PDF je neškodný (prohlížeč subresource cookies `SameSite=Lax` neposílá), odchozí e-mail ne.
- **Vstupy:** `issueNewInvoice`, `saveIssuer` i `cancelIssuedInvoice` běží pod `requireAuth()` a validují Zodem s délkovými stropy (položek 1–50, popis 200, poznámka 2000, částka ≤ 9 999 999 999,99). Tělo e-mailové route má Zod s `.email()` — adresa tak nemůže nést zalomení řádku a podstrčit hlavičku. Text i předmět e-mailu escapuje `buildPlainLayout` v `lib/email.ts`.
- **SQL:** všechno parametrizované; jediný skládaný fragment je konstanta `CONTACT_ROOT` v `lib/admin/invoice-issue.ts`, do které nevstupuje nic z požadavku. Doklad vzniká funkcí `admin_invoice_issue(jsonb)` — `SECURITY INVOKER`, `SET search_path = pg_catalog, pg_temp`, `REVOKE ALL ... FROM PUBLIC`; stejně trigger `admin_invoice_locked` (DECISIONS #024). Částku a DPH počítá databáze z položek a poslanou hodnotu jen ověřuje, takže do daňového základu nejde číslo z prohlížeče.
- **ARES** (DECISIONS #023): volá server, ne prohlížeč → CSP beze změny. IČO se ověří mod 11 **před** voláním, `redirect: 'error'`, timeout 3 s, odpověď přes Zod, do formuláře jde jen text. Požadavek nenese jméno, e-mail ani jiný identifikátor uživatele a nemá vlastní User-Agent.
- **PDF:** vystavená faktura nemá uložené bajty, vyrábí se při otevření. Chromium běží dál s vypnutým JavaScriptem a odmítá vše kromě `data:` URL; admin posílá `logo: null`, takže z téhle cesty není kam udělat SSRF (ochrana proti privátním adresám v `logoData` zůstala pro Workspace). Veškerý text uživatele se do HTML dostává jen escapovaný — hlídá to test `lib/__tests__/invoice-pdf.test.ts`.
- **Nic nového v prohlížeči:** klientský formulář tahá jen čisté výpočty (`lib/invoice-pdf/totals.ts`) a Zod schéma; `lib/admin/invoice-issue.ts` a `lib/ares.ts` jsou `server-only`. Žádná nová závislost, žádná nová env, žádné `NEXT_PUBLIC_`, žádný `dangerouslySetInnerHTML`.
- **Opraveno mimochodem:** sdílený renderer přestal skládat cesty k tokenům za běhu (`['app/tokens-dilky.css', ...].map`), kvůli čemuž build hlásil, že do funkce balí celý projekt. Teď jsou cesty doslovné a varování zmizelo — menší serverless balík, žádná změna chování.
Ověřeno: `npx tsc --noEmit`, `npm run build` (bez varování), `npx vitest run` — **nové testy prošly** (`admin-fakturace` 25, `ares` 9, `invoice-pdf` 8, `pdf-route` 13). Celá sada hlásí jeden nesouvisející červený test: `ws-schema` chce migrace bez mezer a číslo 106 drží souběžné sezení AD11 na vlastní větvi. **V prohlížeči okem neověřeno** a ani migrace 107 nikde neběžela.
