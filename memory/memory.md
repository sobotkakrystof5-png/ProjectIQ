# Paměť projektu — živý stav

> Co se děje, proč je to takhle a co se stalo. Formát a pravidla zápisu: [`pravidla.md`](pravidla.md). Stručné instrukce: [`../AGENTS.md`](../AGENTS.md); technická fakta: [`../docs/AGENTS-REFERENCE.md`](../docs/AGENTS-REFERENCE.md).
>
> **Poslední aktualizace:** 2026-11-26 · **ZakazIQ Voice — VO07, milník 2** (R-148): diktát se učeše modelem
> Claude `fast` podle stylu aplikace a kontrola G6–G9 (+ otočený zápor) vrátí přepis, kdykoli model odpoví,
> přidá, vynechá, změní číslo nebo jméno. Denní strop nákladů s jedním upozorněním do zvonku, zlatá sada
> 69 případů v `npm test`. **Se skutečným modelem zatím neověřeno** (`node scripts/voice-eval.mjs --ano`).
>
> Předchozí: 2026-11-26 · **ZakazIQ Voice — VO01 a VO02** (R-148): migrace 136, zařízení
> s klíčem v `/dashboard/voice` a příjem diktátu `POST /api/public/voice/dictate` (přepis Groq se zálohou
> OpenAI, pojistky G1–G5 a G12, slovník). Naostro ověřené přes OpenAI a testovací Neon, ne na produkci.
> Větev `admin/zakaziq-voice` (worktree `.claude/worktrees/zakaziq-voice`). VO00 čeká na klíč Groq.
>
> Předchozí: 2026-11-25 · **ZakazIQ Voice — VO00** (R-148): plán a prompty VO00–VO12 do repa, rozhodnutí,
> ceny, skript testu přepisu. Text diktátů zůstává natrvalo, dokud ho Kryštof nesmaže.
>
> Předchozí: 2026-11-24 · **Faktury s povinnými údaji a druhem** (R-142, R-143): PDF splňuje
> náležitosti českého dokladu (údaj o zápisu, datum plnění, značka VIZEON, „Vystaveno v systému ZakazIQ" na
> každé stránce) a před vystavením se vybírá druh — za celé dílo, zálohová, částečná, finální — s procentem
> z ceny zakázky a pruhem zaplaceno / čeká / zbývá. **Na produkci od 2026-11-24 (`aaa3215`) i s migracemi
> 131–133**; profil dodavatele přepsaný na skutečné údaje, **chybí IBAN** (bez něj faktura nemá účet ani QR).
> Za přihlášením nikdo neviděl.
>
> Předchozí: 2026-11-24 · **Jeden klient, jedny údaje** (R-141): kontakt je jediný
> zdroj e-mailu a telefonu klienta. Firma od AI asistenta, která řekla ano, dostane kontakt; oprava
> v Kontaktech nebo v Hovorech se propíše do Hovorů, zakázek a budoucích schůzek (i SMS připomínky)
> a okno události má našeptávač z Kontaktů. **Na produkci od 2026-11-24 (`44aa2e4`) i s migrací 130**
> (19 firem se souhlasem propojených s kontaktem, 10 kontaktů nových). V prohlížeči neověřeno. E-mail nadiktovaný v hovoru do ZakazIQ nedojde, dokud se nesplní zadání pro Growth OS
> `new - area of zakaziq/prompty/admin/growth-os-email-z-hovoru.md`.
>
> Předchozí: 2026-11-23 · **Ochrana proti XSS a DDoS v `main`** (R-138): audit
> z 2026-11-20 ležel tři dny necommitnutý ve worktree; teď je převedený na dnešní `main`. Jeden modul
> pro cizí text v HTML a test, který hlídá kopie (hned našel čtyři nové z klientského prostoru), brána
> na IP v `proxy.ts`, předbrány před databázovými limity, semafor na Chromium a strop těla u nahrávek.
> Spolu s ním šablona e-mailu s fakturou (R-139, migrace 129 na produkci). **Na produkci od 2026-11-23
> (`d622689`)**, veřejné adresy a hlavičky v pořádku, bez běhových chyb. **Vercel WAF zapnutý není** (čeká na
> Kryštofa), v prohlížeči nic neověřeno.
>
> Předchozí: 2026-11-23 · **Schůzky z kalendáře s připomínkami** (R-137):
> přepínač „Schůzka přes Google Meet" v okně události, pozvánka s upravitelným textem a `.ics`,
> připomínky den předem (e-mail + SMS), hodinu předem (e-mail) a 10 minut předem (SMS),
> zpráva o přesunu. SMS přes Odorik, spouštěč každou minutu pg_cron v Supabase. Migrace 128.
> **Na produkci od 2026-11-23 (`c23adf5`, spolu s Next.js 16.4.6)**; spouštěč ověřený (200 každou
> minutu), za přihlášením ani se skutečnou schůzkou to zatím nikdo nezkusil.
>
> Předchozí: 2026-11-20 · **E-maily z Hovorů** (R-132): tlačítko „Poslat e-mail"
> se třemi šablonami — Portfolio, Nabídka (cena za zakázku) a Schůzka s Google Meet (termín,
> odkaz na Meet, vizeon.cz; všechno nebo nic). Bez migrace. **Na produkci od 2026-11-20 (`2c0ddb8`);
> naživo s Googlem a Resendem neověřeno.**
>
> Předchozí: 2026-11-18 · **AI asistent jako CRM** (R-120): Přehled, Kontakty
> s filtry a detail klienta (ukázka, všechny hovory s přepisem, e-maily, časová osa),
> kontrakt v2 s Growth OS a zpětný kanál, migrace 119. **Na produkci od 2026-11-18 (`4408221`);**
> Growth OS zatím posílá v1, takže detail ukáže jen poslední hovor, dokud se nesplní zadání
> `new - area of zakaziq/prompty/admin/growth-os-ai-asistent-crm.md`. Za přihlášením nikdo nic neviděl.
>
> Předchozí: 2026-11-17 · **Hovory od AI asistenta z Growth OS jdou do adminu** (R-112).
> Growth OS posílá stav obvolaných firem na `/api/public/outreach`, v Hovorech přibyla záložka
> „Od asistenta" (komu zavolat a proč, převzetí do Hovorů s plánovaným hovorem). Krok 1 a 2
> z `docs/admin/GROWTH-OS-PLAN.md` jsou v kódu na větvi `admin/growth-hovory`, strana Growth OS
> na větvi autopilota `claude/zakaziq-admin-sync`. **Nenasazeno, v prohlížeči neověřeno;**
> Večer přibyla **schůzka s Google Meet a e-mail klientovi z krystof@vizeon.cz** (R-114,
> krok 3 a 4, migrace 115). Čeká na nastavení Google Cloudu a klíčů ve Vercelu.
>
> Předchozí: 2026-11-15 · **Veškeré přihlašování přechází na Supabase** (R-107).
> Fáze F1 je v kódu na větvi `auth/supabase-klient`: klientský prostor `/klient` už nejede
> na vývojové instanci Clerku, ale na Supabase (e-mail a heslo, účet jen z pozvánky vázané
> na e-mail, hook registrace u nás). Workspace `/w` (F2) a úklid Clerku (F3) čekají — plán
> `docs/AUTH-SUPABASE-PLAN.md`. Z auditu portálu přibyla výměna odkazu `/p` a omezení
> rezervace. **Nenasazeno, neověřeno v prohlížeči;** před nasazením migrace 113 a nastavení
> v Supabase (hook HTTPS, tajemství, Confirm email, SMTP).
>
> Předchozí: 2026-11-15 · **Admin se přihlašuje přes Supabase Auth** (R-105).
> E-mail, heslo a dvoufázové ověření ověřovací aplikací; NextAuth, `ADMIN_PASSWORD_HASH`
> a `bcryptjs` z repa odešly. **Jen admin** — Workspace a klientský prostor zůstávají na
> Clerku a **data zůstávají v Neonu**, Supabase je jen poskytovatel identity. Cookie se
> session je zpevněná proti výchozímu stavu `@supabase/ssr` (`httpOnly`, 12 h místo 400 dní)
> a **CSP se nemění**, protože prohlížeč na Supabase nesahá. **Naživo to nikdo nezkusil:**
> projekt má nula uživatelů, takže než se někdo přihlásí, musí Kryštof založit účet, doplnit
> env do Vercelu a zapnout hook, který zavírá registraci (Otevřené problémy). Je to na větvi
> `admin/supabase-auth`, ne na produkci.
>
> Předchozí: 2026-11-14 · **AD18 hotové — modernizace adminu je dojednaná.**
> Stará vizuální vrstva nezbyla: strop zakázaných tříd je **nula** u všech skupin
> (`muted-foreground`, `bg-white`, `rounded-lg|xl|2xl`, duhové i šedé škály Tailwindu,
> `brand-*`), `.brand-gradient` i literální paleta `brand` jsou smazané a gradient zůstal
> jedinému, komu podle Dílků patří — **logu**. Zelená je pryč i z osobní části, škály
> (NPS, náročnost, trychtýř zakázek, hvězdičky) rostou **tmavostí**, a emoji v rozhraní
> vystřídaly ikony Lucide. **Sedm ručně psaných modálů `fixed inset-0` je na Radixu**
> (+ spodní nabídka a ⌘K): focus zůstává uvnitř, `Escape` zavírá a okolí dostane
> `aria-hidden` — dosud se z okna dalo tabulátorem vyjet na stránku pod ním. Celé repo má
> **viditelný focus** a **`prefers-reduced-motion`** (platilo jen pro Workspace, admin
> animoval dál). **Konzole je poprvé úplně čistá** — `/favicon.ico` 404 zmizelo s ikonou
> v kořenovém layoutu. **Měření:** AD18 je na JavaScriptu nula (±0,3 kB); 50–80 kB, které
> admin od AD08 přibral, přinesla sezení AD09–AD17 (R-104).
> **Celá modernizace je na produkci** (2026-11-14, commit `8210f04`): Kryštof pustil migrace
> 110–112, merge `admin/modernizace` → `main` byl fast-forward a build prošel **na první
> pokus** (135 s, `fra1`) — tentokrát žádná potíž s cache. Veřejné adresy se chovají, jak mají;
> **za přihlášením okem nikdo nic neviděl** a to, že 110–112 opravdu běžely, zvenku prokázat
> nejde.
> **Bezpečnost:** týž den proběhl **úplný audit od A do Z** (skilly `web-security-audit`
> a `web-security-review`) — živý sken produkce **30 prošlo / 3 varování / 0 chyb**, code
> review celého stromu, 0 zranitelností v závislostech a čistá historie gitu přes 311
> commitů. Opraveno osm věcí v kódu a v auditním skriptu; **nejvážnější zůstává mimo kód:**
> apex `zakaziq.cz` nemá SPF, DMARC je `p=none` bez reportů, CAA a DNSSEC chybí a HSTS
> `preload` je v hlavičce, ale doména na seznamu není. Detail `.claude/security/AUDIT-LOG.md`
> → 2026-11-14, stav `STATE.md`, rozhodnutí o skriptu DECISIONS #028.
>
> Starší záznamy: changelog `archiv/2026-11.md` a `archiv/2026-10.md`, průběh modernizace
> `docs/admin/MODERNIZACE-ADMIN-PLAN.md` → sekce 6, technický popis `docs/admin/AGENTS-ADMIN.md`.

---

## 1. Aktuální stav

*Snímek — přepisuje se, nedoplňuje. Předchozí podrobný snímek po sezeních: `archiv/2026-10.md`.*

**ZakazIQ Voice (R-148, od 2026-11-25, větev `admin/zakaziq-voice`):** diktování na Macu přes Fn,
zpracování a statistiky v adminu `/dashboard/voice`. Třináct sezení VO00–VO12, plán
`docs/admin/VOICE-PLAN.md` (stav v oddílu 14), prompty `new - area of zakaziq/prompty/voice/`.
VO00 rozpracované (čeká na klíč Groq a nahrávky), **VO01, VO02 a VO07 hotové 2026-11-26**: migrace 136 v repu a na
testovacím Neonu, `/dashboard/voice` se zařízeními, `POST /api/public/voice/dictate` a `GET …/config`, čištění
Claude s kontrolou výstupu a denním stropem (milník 2, bez skutečného modelu neověřené).
Další krok: **VO10** (admin stránka a karta na Dnes, jde hned), **VO08** (učení z logů, po VO07) nebo **VO03**
(kostra aplikace na Macu, potřebuje certifikát).
Worktree má vlastní kopii `node_modules` (odkaz Turbopack při buildu odmítl).

**Admin konzole (produkce):** `/dashboard` a portál `/p/[token]`; deploy z `main`, produkce běží od 2026-11-14 na **`8210f04`** (celá modernizace AD00–AD18 + klientský prostor + Workspace + landing). `/alteno` a `/hub` zanikly a přesměrovávají (R-087, R-088). Popis: `docs/admin/AGENTS-ADMIN.md`. Ověřeno po nasazení (veřejně, bez přihlášení): `/` 200 (landing), `/login` 200, `/h/<token>` 404 (tj. **102 i 106 na produkci jsou**), `/p/<token>` 404, `/dashboard` 307 na `/login`, cron 401, veřejná API 405 na GET, `/w/prihlaseni` a `/klient/prihlaseni` 200. **Za přihlášením okem nikdo nic neviděl.**

**Přihlášení do adminu (R-105, od 2026-11-15, větev `admin/supabase-auth`):** vede **Supabase
Auth** (projekt `zakaziq`, eu-central-1) — e-mail, heslo a TOTP; zapnutí druhého faktoru je
v `/dashboard/profil` → Přihlášení. Dovnitř projde jen session s e-mailem `ADMIN_EMAIL`
(R-001), zapsaný faktor **nelze přeskočit** a zámek na IP po pěti pokusech zůstal. Data se
nepřesouvají: zůstávají v Neonu (R-002), Supabase drží jen `auth.*`. **Na produkci je od 2026-11-15**
a naživo přihlášení zatím nikdo neprošel. **Na produkci od 2026-11-15 (`307ef15`).** Technický popis: `.claude/security/STATE.md`
→ Aplikace, rizika DECISIONS #029.

**Modernizace adminu (R-081–R-104) — hotová 2026-11-14.** Všech devatenáct sezení
**AD00–AD18** je v kódu; větev `admin/modernizace` je sloučená do `main`.
Od 2026-11-14 je **celá na produkci** (`8210f04`). Co která fáze udělala
a s jakými odchylkami, je v `docs/admin/MODERNIZACE-ADMIN-PLAN.md` → sekce 6 (stav) a 11
(měření); jak se admin chová a kam se co píše, v `docs/admin/AGENTS-ADMIN.md`. Rozhodnutí
jsou R-081 až R-104 níž.

Z AD18: **stará vizuální vrstva nezbyla.** Strop zakázaných tříd je **nula** u všech skupin
(jediná výjimka je `@apply border-border` v základní vrstvě `app/globals.css`); zmizely
`.brand-gradient`, paleta `brand` z `tailwind.config.ts`, gradienty `from-violet-*`
a **emoji v rozhraní** (ikony konzultantů a popisky v kalkulačce startupu → Lucide).
Test `components/admin/__tests__/admin-classes.test.ts` od teď hlídá návrat staré třídy,
ručně psaný modál i emoji — a měří **jen admin**: `components/{ws,marketing,ui}` z rozsahu
vypadly, protože `bg-white` v nich je bílá na tmavém, ne nepřepsaná karta (pathspec
`components/*.tsx` je v gitu rekurzivní, což si nikdo od AD04 nevšiml).
**Modální okno se nekreslí ručně**: sedm vlastních vrstev `fixed inset-0` (rezervace
z portálu, přidání i detail události, konzultace, faktura, zpráva kontaktu, asistent) plus
spodní nabídka a ⌘K jede na `components/ui/{dialog,sheet}.tsx`. Focus drží uvnitř, `Escape`
zavírá, okolí má `aria-hidden` včetně `<main>` a `body` je zamčené proti rolování;
`aria-modal` Radix záměrně nenastavuje. Celé repo má **viditelný focus** (`:focus-visible`,
obrys 2 px `navy-700`) a **`prefers-reduced-motion`** — dosud platilo jen uvnitř
`data-app="ws"`, takže admin animoval i tomu, kdo si pohyb vypnul. Drobné popisky mají plný
kontrast (6,6:1 místo ~3,3:1), plochy akcí 44 px i v přihlášení, editoru novinek a u pozvání
klienta, a kořenový layout má konečně ikonu, takže **konzole je čistá** (404 na `/favicon.ico`
byl otevřený problém od AD12).
**Ověřeno v prohlížeči** (headless Chrome s podepsanou session, 390 / 768 / 1280 / 1440 px):
Profil, Projekty, Startup, Oznámení, Kontakty, Novinky, Klienti a `/login` — nikde vodorovné
přetečení, nikde plocha pod 44 px, konzole bez chyby. Průchod klávesnicí: první zastávka je
„Přeskočit na obsah", žádný z dvaceti kroků není bez viditelného prstence. Tři modály
(⌘K, přidání události, faktura) i spodní nabídka na 390 px: focus trap drží, `Escape` zavírá.
S `prefers-reduced-motion: reduce` neběží jediná animace. **Co ověřit nešlo:**
`/dashboard/profil` padá na `column "company" does not exist` — testovací Neon nemá migraci 106,
takže se vykreslila jen kostra, ne obsah. Odchylky: **R-104**.

**Klientský prostor (R-070–R-073), stav po sezení 2026-11-01:** kód KP01–KP07 a KP09 (úroveň 2) je commitnutý (`41c6873`) a od 2026-11-14 na produkci (`8210f04`). Migrace 092–096 jsou **aplikované na produkčním Neonu** (projekt `projectiq`, ověřeno čtecím dotazem), role `portal_app` je tam vytvořená (`scripts/portal-create-role.js`, kontrola skriptu prošla: bez BYPASSRLS, bez přístupu do `public`). Ve Vercelu nastaveno: `DATABASE_URL_PORTAL` (jen Production; Preview míří na testovací DB bez schématu `portal`), `PORTAL_INVITE_PEPPER`, `AGENT_KEY_PEPPER`, `OPENAI_API_KEY`, `OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe`, `CLIENT_REQUEST_AI_MODEL=claude-haiku-5-5` (poslední tři Production i Preview). Preview https://project-iq-git-ws-redesign-app-sobotkakrystof5-pngs-projects.vercel.app vrací 200 na `/`, `/login`, `/w/prihlaseni`, `/klient/prihlaseni`. Ověřeno testy (PGlite oddělení klientů, nav, Dnes, hlášení, aktivita, CSP) a `tsc`/`build:check`; **v prohlížeči nic z toho ověřeno není** (admin lokálně nemá data, přihlášení Clerku na `/klient` nikdo neprošel). Zbývá KP08 (soubory, odloženo), KP10 (audit, GDPR, pilot) a úroveň 3 předání. **Druhá vlna (R-121–R-131) je od 2026-11-21 na produkci** (`fa79603`): KP11 přihlášení přes Supabase a pozvání jedním klikem, KP12 služby a etapy (R-124), KP13 peníze a faktury (R-125), KP14 konzultace z volna (R-126), KP15 chat a rozvržení jako Slack (R-127), KP16 přehled klienta (R-128), KP17 poptávky z webu klienta (R-129, R-130) a KP10 audit a GDPR (R-131). Migrace 113 a 121–127 a práva `portal_app` jsou na produkčním Neonu od 2026-11-20 (Neon MCP, ověřeno md5 těl funkcí, RLS a práva; evidence v `public.schema_migrations`). Supabase je nastavený 2026-11-21 (HTTPS hook, SMTP přes Resend, šablona hesla, bucket `chat-prilohy`), živý audit 0 chyb, oddělení dvou firem ověřené na produkční DB. Naostro prošla jen pozvánka → heslo → e-mail s obnovou hesla. **Zbývá:** pilot s jedním klientem (KP10 krok 7, `docs/klientsky-prostor/PILOT.md`), před ním druhý faktor u adminu (kritérium 5), průchod KP12–KP17 naživo, DPA Neonu, Googlu a OpenAI a souhlas Kryštofa s textem `/klient/soukromi`. Mimo to KP08 (odloženo) a úroveň 3 předání (KP09). Stav sezení: `docs/klientsky-prostor/PLAN.md` sekce 6 a 11.1.

**Workspace + landing:** všechna sezení S00–S18 a redesign RD01–RD14, RD16 jsou v kódu na větvi `ws/redesign-app` (RD15 vizuální audit rozpracovaný). Plán rozsahu `docs/workspace/PLAN.md`, redesign `docs/workspace/REDESIGN-APP-PLAN.md`, technika `docs/AGENTS-REFERENCE.md` část B, spuštění `docs/workspace/LAUNCH.md`. Nic z Workspace není na produkci.

**Landing R-068:** vrácena interaktivní mřížka v hero, zploštěny dekorativní rámečky, přichycené scény omezeny na široké obrazovky a animace respektují reduced motion. Typová kontrola a náhledy 390/768/1440 px hotové; testy/build neprovedeny.

**Databáze:** produkční Neon má migrace 064–096 a role `ws_app`, `portal_app`. Testovací Neon `ZakazIQ RD test` (větev `rd-test`) má totéž, `.env.local` míří na něj (bez admin tabulek → admin lokálně i v Preview padá/je prázdný). Práva `ws_app` doplní `node scripts/ws-create-role.js` (`scripts/ws-grants.sql`); na produkci po dnešním doplnění neověřeno. Migrace 099 (R-077) je připravená, neaplikovaná nikde; 097 a 098 na produkci už na heslo nečekají (`neondb_owner` vyměněné, Production `DATABASE_URL` opravená 2026-11-04), aplikované zatím nejsou; `.env.local` míří na test, pro produkci je potřeba produkční connection string.

**Preview `ws/redesign-app`:** https://project-iq-git-ws-redesign-app-sobotkakrystof5-pngs-projects.vercel.app — testovací DB, vlastní `NEXT_PUBLIC_APP_URL`. Testovací účet `rdtest+clerk_test@example.com` (Clerk testovací kód), byznys `testovaci-salon` (kadeřnictví, ukázková data ze seedu, zapnuté Faktury, fiktivní dodavatel), předplatné `trialing` do 2026-11-14 ve Stripe sandboxu. Ověřeno s přihlášením 2026-10-31: Dnes, Kalendář, Poptávky, Zákazníci, Nastavení › Firma, vystavení faktury a PDF s QR (200, 1 strana), export ZIP, výmaz zákazníka; telefonní rozvržení (614 px). Vzhled PDF okem neověřen.

**Externí služby (ověřeno 2026-11-03):** Clerk: produkční instance `zakaziq.cz` má DNS, SSL i poštu hotové (`clerk deploy status` = `oauth_pending`); chybí vlastní Google OAuth klient, webhook, `force_organization_selection=false` v produkci (neověřeno) a produkční klíče ve Vercelu, aplikace dál běží na dev instanci. Resend: doména ověřená, `WS_EMAIL_FROM` a `RESEND_WEBHOOK_SECRET` ve Vercel Production, webhook vypnutý do nasazení; doručení zatím nikdo nezkusil. Stripe jen sandbox, live mód a produkční webhook chybí. DNS u WEDOS: 5 CNAME Clerku a `_dmarc` (`p=none`, bez `rua`) existují, chybí CAA (už jde přidat, certifikáty Clerku jsou vydané) a SPF apexu.

**Nasazení AD00–AD13 na produkci — hotovo 2026-11-13.** Dohodnuté pořadí bylo: Kryštof pustí
migrace, pak dá vědět a agent udělá merge + push. Proběhlo takhle:

1. **Migrace pustil Kryštof** (aditivní 103, 104, 105, 107, 108, 109 před deployem, nekompatibilní
   102 po něm; 106 už na produkci byla z incidentu 2026-11-12). Jeho slovy „všechno nasazené na
   produkci". Agent produkční připojení nemá, takže **ověřil jen to, na co dosáhne zvenku**:
   `/h/<token>` vrací 404, a ta stránka čte `survey_token` (106) i `lead_pending` (102) — kdyby
   některý sloupec chyběl, vrátí 500. Zbytek stojí na Kryštofově slovu (viz Otevřené problémy).
   Běhoun pro příště: `vercel env pull .env.production.local --environment=production` +
   `node scripts/apply-migration.js <soubor> --env .env.production.local`.
2. **Merge `admin/modernizace` → `main`** byl fast-forward (`d948400` → `7a15ad2`) a push proběhl.
3. **První produkční build spadl** — Turbopack, 12 chyb typu
   `Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'`
   z `next/font/google` (`lib/ws/fonts.ts`). Lokální build téhož commitu přitom procházel; log
   začínal větou „Restored build cache from previous deployment". **Druhý deploy bez cache prošel**
   (log: „Skipping build cache, deployment was triggered without cache"), bez jediné změny v kódu.
4. **Po deployi** zbývají doprovodné kroky, které nikdo neodškrtl: kontrola
   `SELECT … WHERE lead_pending` z hlavičky 102, `WARNING` o nevytvořeném indexu u 109
   a `node scripts/admin-contacts-backfill.mjs` po 104.

Migrace 100 a 101 (`DROP TABLE`, R-089) v tomhle pořadí **nebyly**; později 100 doložily chyby
v runtime logu a 101 potvrdil Kryštof (Otevřené problémy). Skript na export odešel 2026-11-24.

**Nasazení AD14–AD18 na produkci — hotovo 2026-11-14.** Stejné pořadí jako předtím:
1. **Migrace 110, 111 a 112 pustil Kryštof** (všechny aditivní, takže směly jít před deployem).
   Jeho slovy „migrace jsou na produkci". **Zvenku to prokázat nejde** — `ai_suggestions`,
   `project_memory` ani nové sloupce dotazníku a předání nečte žádná veřejná routa; `/h/<token>`
   dokazuje jen 102 a 106. První skutečná zkouška je denní cron `send-reminders` nebo otevření
   adminu. Kontrola na jedno zavolání: `node scripts/admin-stav-produkce.mjs --env .env.production.local`
   (jen čte; agent na produkční připojení nedosáhne), nebo tytéž dotazy jako SQL do konzole Neonu.
2. **Merge `admin/modernizace` → `main`** byl fast-forward (`d58e561` → `8210f04`), push proběhl.
3. **Build prošel na první pokus** (`dpl_H6NV…`, 135 s, region `fra1`, aliasy včetně
   `www.zakaziq.cz`) — potíž s obnovenou cache z 2026-11-13 se neopakovala.
4. **Ověřeno po nasazení** (veřejně, bez přihlášení): `/` 200, `/login` 200, `/podminky`
   a `/ochrana-udaju` 200, `/h/<token>` i `/p/<token>` 404, `/dashboard` a `/dashboard/profil`
   307 na `/login`, cron 401, `/api/public/leads` i `/api/ai-assistant` 405 na GET,
   `/w/prihlaseni` a `/klient/prihlaseni` 200, `robots.txt` a `sitemap.xml` 200,
   **`/ikony/ikona.svg` 200** (nová ikona z AD18). **Za přihlášením okem nikdo nic neviděl.**

**Další krok — ověřit admin na produkci.** Modernizace je nasazená, ale **nikdo ji neviděl
na skutečných datech za přihlášením**. Konkrétně zbývá:
1. **Doprovodné kroky po migracích**, které nikdo neodškrtl ani z 13., ani ze 14. listopadu:
   `node scripts/admin-contacts-backfill.mjs` (bez něj jsou Kontakty prázdné), kontrola
   `lead_pending` z hlavičky 102 a `WARNING` o duplicitních příjmech u 109. Stav ukáže
   `node scripts/admin-stav-produkce.mjs --env .env.production.local` (jen čte) — pouští Kryštof.
2. **Průchod přihlášeným adminem na produkci.** Teprve tam jde ověřit, co testovací Neon
   neumí (nemá 106): `/dashboard/profil`, Finance › Podnikání, skutečný detail zakázky,
   a dál asistent, paměť projektu, dotazník a AI leady naživo včetně prvního skutečného
   dotazu na model. Agent to umí projít headless Chromem, ale potřebuje přihlášení
   k produkci — **zeptat se Kryštofa**, je to ostrá databáze.
3. **p75 per route z produkce** (Vercel runtime logy / Observability) — plán, sekce 11, má
   u p75 pořád „Nic". Poprvé to jde změřit.

**Pak teprve spuštění Workspace** (nemění se): Kryštof — aktivace Stripe live, provozovatel
do Stripe, migrace 097–099 na produkci, Google OAuth klient pro Clerk, pilotní klient
a podpora (D4, D6, D7), Vercel Pro, test obnovy Neonu, DNS CAA, SPF a `rua` v DMARC. Agent —
klientský prostor v prohlížeči, scénáře Stripe sandboxu, zkušební e-maily, telefon 390 px
a RD15. Pořadí v `docs/workspace/LAUNCH-PLAN.md`. Workspace je na produkci spolu s adminem,
ale vypnutý zůstává tím, co mu chybí (Stripe live, produkční Clerk).

**Prostředí agentů:** `AGENTS.md` + `docs/AGENTS-REFERENCE.md` (R-047), skilly a bezpečnost synchronizované do `.agents/` (R-046, `docs/CODEX.md`); řemeslné skilly třetích stran jsou uživatelské mimo repo, dostupnost ověřuj (R-080).

---

## 2. Rozhodnutí

*Číslovaná, nepřečíslovávat. Než v kódu „opravíš" něco, co tu je, zeptej se.*

### R-001 · Osobní nástroj s jedním adminem (2026-06-14)
**Rozhodnutí:** jediný admin účet v env (`ADMIN_EMAIL` + bcrypt hash), NextAuth Credentials, JWT. Žádná registrace, žádné role.
**Proč:** první fáze = nástroj pro vlastní potřebu; multi-user by zdržel.
**Důsledek:** žádné `user_id` v jádře zakázek. Kdyby se z toho dělal SaaS, je to velká migrace.

### R-002 · Neon místo Supabase (2026-06-14)
**Rozhodnutí:** DB je Neon serverless Postgres přes `sql` tag z `lib/db.ts`, bez ORM.
**Důsledek:** `sql` tag neumí skládat fragmenty → sdílené podmínky žijí jako DB funkce (`is_vizeon_pending()`), viz AGENTS.md.

### R-003 · Rebrand ProjectIQ → ZakazIQ (2026-06-15)
**Důsledek:** starší dokumenty (`docs/CLAUDE_BOOKING_PROMPT.md`) a historie mluví o ProjectIQ — je to tentýž projekt.

### R-004 · Emaily přes Gmail SMTP, ne Resend (2026-06-15)
**Rozhodnutí:** veškeré emaily přes nodemailer + Gmail v `lib/email.ts`.
**Výjimka:** hromadné launch emaily na waitlist ve Startupu stále přes Resend (`RESEND_API_KEY`).
**Proč:** odesílání z vlastní schránky, bez ověřování domény u Resendu.

### R-005 · Kolize termínů řeší databáze (2026-06-15, rozšířeno migracemi 043/044)
**Rozhodnutí:** UNIQUE/overlap guard v DB + catch `23505`, nikdy „zkontroluj a pak vlož". Guard platí napříč tabulkami i byznysy.
**Proč:** jeden člověk = jeden diář; race condition při souběžných rezervacích.

### R-006 · Crony maximálně 1× denně (2026-06-25)
**Rozhodnutí:** všechny crony ve `vercel.json` běží denně (tax-news týdně). Hodinový cron pro připomínku „2 h před" byl vrácen.
**Proč:** Vercel Hobby plán nedovolí častější crony.
**Důsledek:** připomínky „2 h před konzultací" nejdou přes Vercel cron — viz Otevřené problémy.

### R-007 · Projekty patří do Hubu, ne do VIZEON dashboardu (2026-06-23)
**Rozhodnutí:** osobní projekty žijí v `/hub/projekty`; odkaz z navigace dashboardu odstraněn.
**Důsledek:** `/dashboard/projekty/**` je legacy — viz Otevřené problémy.

### R-008 · Dva byznysy nad jedním datovým modelem (2026-08-14)
**Rozhodnutí:** VIZEON a ALTENO sdílí kód i tabulky, liší se sloupcem `business`, cestami a brandingem z `lib/business.ts`. ALTENO má záměrně jen jádro (zakázky + inbox).
**Proč:** jeden software místo dvou kopií, které by se rozjely.
**Důsledek:** každý nový dotaz nad `projects`/`calendar_events` filtruje `business`; Hovory, Dokončené, Hodnocení, Náklady a Kalendář jsou jen VIZEON (emaily tam natvrdo `business: 'vizeon'`).

### R-009 · VIZEON má vlastní emailovou schránku (2026-08-18)
**Rozhodnutí:** VIZEON posílá z info@vizeon.cz (vlastní transporter), admin notifikace jdou na `VIZEON_ADMIN_EMAIL`. Chybí-li kompletní dvojice env, fallback na výchozí účet.

### R-010 · Kalendář a Hovory jsou párově propojené (2026-09-03)
**Rozhodnutí:** kalendářní událost automaticky zakládá lead v Hovorech a naopak se mažou spolu. Kalendář z `client_leads` bere jen řádky bez `calendar_event_id`.
**Proč:** jeden termín nesmí být v kalendáři dvakrát.

### R-011 · Finance, faktury a daně (2026-09-11)
**Rozhodnutí:** viz sekce „Zafixovaná rozhodnutí" v `docs/FINANCE_SYSTEM_PLAN.md` — tam je kompletní seznam. Nejdůležitější: dvě linie příjmů (příznak `declared` na transakci, default `false`), rok = datum zaplacení, OSVČ vedlejší činnost + neplátce DPH + 60% paušál, měny se nikdy nesčítají, AI přepis nikdy neblokuje ruční uložení.

### R-012 · Evidence faktur napříč byznysy ve VIZEONu (2026-09-18)
**Rozhodnutí:** `/dashboard/faktury` ukazuje faktury VIZEON i ALTENO; logika zůstává v `app/hub/finance/invoice-actions.ts`.
**Proč:** jedno IČO, jedno daňové přiznání — rozdělený archiv = hledání dokladu na špatném místě.

### R-013 · Paměťový systém projektu (2026-10-08)
**Rozhodnutí:** `CLAUDE.md` (chování) + `AGENTS.md` (technická fakta, přejmenováno z původního `Claude.md`) + `memory/` (index, pravidla, živý stav). Každá dokončená změna se zapisuje do changelogu.
**Proč:** kontinuita mezi sezeními a mezi AI nástroji; aby se znovu neodvozoval kontext ani „neopravovala" záměrná rozhodnutí.

### R-014 · ZakazIQ Workspace jako SaaS ve stejném repu (2026-10-08)
**Rozhodnutí:** vedle admin konzole vzniká Workspace pro malé firmy (`/w/*`, `/api/ws/*`, `/api/public/v1/*`, Clerk, schéma `ws`, jeden tarif 249 Kč/měsíc přes Stripe) a landing page (`app/(marketing)/`). Admin konzole se nemění — co se přebírá, kopíruje se do `lib/ws/` / `components/ws/`. Izolace dat přes `requireWorkspace()` + `account_id`. Pravidla jsou v `CLAUDE.md` → „Workspace — tvrdá pravidla".
**Proč:** produkt pro cizí firmy nesmí rozbít osobní produkční nástroj; R-001 (jeden admin) platí dál pro admin konzoli.
**Důsledek:** paměť zůstává v `memory/` (R-013), původně navržená struktura `.claude/memory/` (STATE, SESSION-LOG, DECISIONS, OPEN-QUESTIONS) se nezavádí. Pravidla Workspace jsou v `AGENTS.md` → Hranice v repu + Část B; při rozporu CLAUDE.md × AGENTS.md platí AGENTS.md.

### R-015 · Git podle oblasti (2026-10-08)
**Rozhodnutí:** Workspace + landing page na větvi `workspace`, commit po každém uceleném kroku, zpráva `ws/oblast: …`. Admin konzole dál na `main`, commit jen na požádání, `feat: …` / `fix: …`. Push na `main` jen se souhlasem.
**Proč:** výstavba SaaS nesmí jít rovnou do produkčního deploye adminu; admin údržba zůstává jako dřív.
**Důsledek:** `AGENTS.md` → Společné → Git; větev `workspace` zatím neexistuje, založí se s prvním kódem Workspace.

### R-016 · Cesty veřejných částí Workspace (2026-10-08)
**Rozhodnutí:** aplikace `/w/*`, objednávací stránka `/r/[slug]`, widget `/embed/[slug].js`, klientský portál Workspace `/z/[token]`, veřejné API `/api/public/v1/*`. Admin portál `/p/[token]` zůstává.
**Proč:** widget pod `/w` by kolidoval s aplikací (Clerk), portál pod `/p` s admin portálem.
**Důsledek:** `AGENTS.md` → Hranice v repu (`app/r/`, `app/embed/`, `app/z/`).

### R-017 · Jedna doména, aplikace na /w (2026-10-08)
**Rozhodnutí:** landing page i aplikace na jedné doméně (`/` a `/w/*`), ne subdoména.
**Proč:** jedna Clerk instance, jeden deploy, jednodušší cookies, CORS a CSP.
**Důsledek:** `NEXT_PUBLIC_APP_URL` je jedna adresa pro landing i aplikaci; `AGENTS.md` → B4.

### R-018 · 249 Kč je konečná cena (2026-10-08)
**Rozhodnutí:** tarif 249 Kč měsíčně je konečná cena bez připočtení DPH.
**Proč:** provozovatel je neplátce DPH (R-011). Až se stane plátcem, řeší se nová cena ve Stripe.
**Důsledek:** ceník na landing page „249 Kč měsíčně", bez „+ DPH"; `AGENTS.md` → B5.

### R-019 · Zkušební doba 14 dní bez karty (2026-10-08)
**Rozhodnutí:** po registraci 14 dní zdarma bez zadání karty, pak výzva k platbě přes Stripe Checkout; bez předplatného režim jen pro čtení (data se nemažou, poptávky se ukládají dál).
**Proč:** nejnižší bariéra pro malé firmy.
**Důsledek:** trial se počítá v `ws` (ne Stripe trial s kartou); `hasActiveSubscription` musí znát i běžící zkušební dobu. `AGENTS.md` → B5.
**Nahrazeno:** R-038 (2026-10-09) — 14 dní zdarma s kartou.

### R-020 · V ceně 1 byznys a neomezeně pracovníků (2026-10-08)
**Rozhodnutí:** jeden účet = jedno předplatné = jeden byznys; pracovníků neomezeně.
**Proč:** jednoduché vysvětlit, drží „jeden tarif".
**Důsledek:** datový model si `business_id` nechává (plán), ale UI nenabízí založení druhého byznysu; S08/S13. `AGENTS.md` → B5.
**Nahrazeno:** R-026 (2026-10-08) — „další byznys = další účet" nebylo rozhodnuto.

### R-026 · Další byznys na účtu zatím vypnutý (2026-10-08)
**Rozhodnutí:** v ceně 249 Kč je 1 byznys a neomezeně pracovníků. Struktura účtu s více byznysy z plánu zůstává (`business_id`, `/w/[byznys]`, přepínač), jen přidání dalšího byznysu je v UI vypnuté.
**Proč:** upřesnění R-020 podle plánu (účet = firma s libovolným počtem byznysů); cena za další byznys není rozhodnutá.
**Důsledek:** S07/S13 stavějí datový model a URL pro víc byznysů, průvodce „Nový byznys" jen pro první. `AGENTS.md` → B5.

### R-021 · Design systém Dílky je závazný (2026-10-08)
**Rozhodnutí:** Workspace, klientský portál, objednávací stránka, e-maily a landing page vypadají podle mockupu LP-D (barvy a dílky z loga, Instrument Sans/Serif, JetBrains Mono). Starší mockupy (A–D, C2–C5, LP-A–A3) platí jen pro rozložení a funkce. Admin si nechává svůj vzhled.
**Proč:** jednotná identita podle loga; převzato ze sady (rozhodl Kryštof).
**Důsledek:** skill `zakaziq-design-dilky`, `AGENTS.md` → B8.

### R-022 · SEO skilly pro landing page (2026-10-08)
**Rozhodnutí:** S05 používá `seo` + `seo-quality-principles`, klíčová slova případně přes `seo-collabim-keyword-loop`.
**Důsledek:** prompt `S05-landing-seo-texty.md` a `00-README.md` upraveny.

### R-023 · Landing bez sekce „Kdo za tím stojí", právní texty zástupně (2026-10-08)
**Rozhodnutí:** sekce „Kdo za tím stojí" se na landing page nedělá (odchylka od řádku 10 v `docs/workspace/PLAN.md`). IČO a právní stránky jsou v S04 jako `[DOPLNIT]`, skutečné texty nejpozději v S19.
**Důsledek:** prompt `S03-landing-brief.md` upraven.
**Nahrazeno:** R-079 (2026-11-03) v části právních textů a údajů provozovatele.

### R-024 · Napojení webů klientů primárně přes Claude Code (2026-10-08)
**Rozhodnutí:** klientské weby se staví v Claude Code; hlavní cesta je skill `zakaziq-napojeni` → serverová akce webu → `POST /api/public/v1/requests` s tajným klíčem. Záložně objednávací stránka (odkaz, QR) a jednořádkový widget pro cizí weby.
**Proč:** převzato ze sady (rozhodl Kryštof) — weby staví Kryštof sám.

### R-025 · Segmenty zákazníků (2026-10-08)
**Rozhodnutí:** segmenty Noví, Stálí, Jednorázoví, Spící, Ukončení; hranice podle oboru, nastavitelné.
**Proč:** převzato ze sady (rozhodl Kryštof). Detail v `docs/workspace/PLAN.md`.

### R-027 · Oddělení Dílků od admin konzole (2026-10-08)
**Rozhodnutí:** tokeny Dílků platí jen uvnitř `[data-app="ws"]` (`app/ws-tokens.css`, importované jen v layoutech `app/w` a `app/(marketing)`); písma přes `next/font` jen tam; Tailwind dostal jen nové klíče (`navy`, `ground`, `surface`…, adminové `brand`/`card`/`muted`/rádiusy/`font-sans` beze změny). Kořen `WsRoot` je i kontejner pro Radix portály, aby dialogy a menu nebyly v `<body>` bez tokenů. Tmavý režim = `data-theme="dark"`, `darkMode` v Tailwindu rozšířen o tenhle selektor (`.dark` zůstal). Toasty Workspace jdou přes adminův `<Toaster>` v `app/layout.tsx` (sonner 1.x neumí víc toasterů) jako `toast.custom` s vlastním `data-app="ws"`. Bez pluginu `tailwindcss-animate`.
**Proč:** admin se nesmí změnit ani o pixel; plugin `tailwindcss-animate` přidával `animation-duration` do existujících tříd `duration-*`/`ease-*` (ověřeno porovnáním zkompilovaného CSS). Kořenový `app/layout.tsx` se neměnil.
**Důsledek:** `AGENTS.md` → B8 (tabulka „Jak je systém v kódu"). Ověřeno: všech 1011 existujících CSS selektorů beze změny, screenshoty `/login`, `/dashboard`, `/hub`, `/alteno` (1280 i 390 px) bajtově shodné.

### R-028 · Závislosti UI kitu (2026-10-08)
**Rozhodnutí:** `@radix-ui/react-{slot,label,select,checkbox,switch,dialog,popover,dropdown-menu,tabs,tooltip,separator}`, `class-variance-authority`, `cmdk` (⌘K), `react-day-picker` 10 (kalendář, česká lokalizace z balíčku). shadcn komponenty psané ručně (bez `shadcn` CLI, které by přepsalo `tailwind.config.ts` a `globals.css`).
**Proč:** standardní základ shadcn/ui, přístupnost (klávesnice, ARIA) zadarmo; Radix je jen v kódu Workspace, admin ho nenačítá.

### R-029 · Bezpečnostní základ celého repa (2026-10-08)
**Rozhodnutí:** jeden `middleware.ts` (admin NextAuth → místo pro Clerk → CSP s nonce a `strict-dynamic`), statické hlavičky v `next.config.mjs`, logika v `lib/security/`. CSP pro admin a vše mimo Workspace jen Report-Only, pro `/w`, `/r`, `/z` vynucená (layout `/w` je proto dynamický). Bezpečnostní stav a kompromisy se vedou v `.claude/security/` (STATE, DECISIONS, CSP-LOG, AUDIT-LOG), do `memory/` jen odkaz.
**Proč:** admin běží v produkci a `/login` je statický (bez nonce) — vynucení by rozbilo přihlášení; nová část se staví rovnou do politiky. Podrobně `.claude/security/DECISIONS.md` #001–#006.
**Důsledek:** `AGENTS.md` → Hranice (řádek Bezpečnost) a B13 (plná pravidla); `CLAUDE.md` → Bezpečnost.

### R-030 · Doména zakaziq.cz a bezpečnostní kontakt (2026-10-08)
**Rozhodnutí:** Workspace i landing poběží na `zakaziq.cz` (rozhodl Kryštof). Kontakt pro hlášení zranitelností v `security.txt` je `info@vizeon.cz`.
**Důsledek:** `public/.well-known/security.txt` (Canonical na `zakaziq.cz`, `Expires` 2027-10-01); DNS doporučení pro `zakaziq.cz` v `.claude/security/STATE.md`.

### R-034 · `/` je landing page, admin přes /login (2026-10-08)
**Rozhodnutí:** `app/page.tsx` (přesměrování na `/hub`/`/login`) smazán (povoleno promptem S04). Přihlášený admin vidí v hlavičce landing „Do administrace“ místo „Přihlásit“ (`useSession` z kořenového SessionProvideru). Komponenty landing page v `components/marketing/`.
**Proč:** dvě stránky pro `/` nejdou; landing nemá importovat NextAuth na serveru.

### R-031 · Sekce landing page: LP-D + Proč to řešit (2026-10-08)
**Rozhodnutí:** landing má pořadí z mockupu LP-D a navíc sekci „Proč to řešit“ (srovnání dnes / se ZakazIQ) hned za pásem oborů: hero · pás oborů · 01 Proč to řešit · 02 Co to umí · 03 Jak to funguje · 04 Funkce · 05 Napojení · 06 Ceník · 07 Dotazy · footer. Ostatní sekce z `docs/workspace/PLAN.md` (Pro koho, Zákazníci se vracejí, Peníze a daně, Kontakt) se nedělají samostatně, pokryje je pás oborů a karty v Co to umí.
**Proč:** rozhodl Kryštof v S03. LP-D je kratší a soustředěnější, srovnání „před a po“ v něm chybělo.
**Důsledek:** `docs/landing/PROJECT-BRIEF.md` § 4, čísla sekcí posunutá oproti mockupu.

### R-032 · Landing bez kontaktního formuláře, místo něj e-mail podpory (2026-10-08)
**Rozhodnutí:** místo „Domluvit hovor“ a formuláře do Hovorů je na landing odkaz „Napište nám“ (`mailto:` na e-mail podpory) v hero, dotazech a footeru. Adresa zatím `[DOPLNIT]`, firemní e-mail se řeší. Kdyby se formulář vrátil: vlastní server action v `app/(marketing)/actions.ts` (Zod, honeypot, rate limit, zápis do `client_leads` přes `lib/db.ts` s vlastním popisem), ne volání `/api/public/leads`.
**Proč:** rozhodl Kryštof v S03, landing má vést na registraci a dotazy na podporu. `/api/public/leads` chce tajný `N8N_API_KEY`, poptávky natvrdo značí „z chatbota“ a rate limit by se počítal na IP serveru.
**Důsledek:** landing nemá žádný veřejný vstup. Odchylka od `PLAN.md` (sekce 11 Kontakt) i od promptu S03. Brief § 5.

### R-033 · Landing dynamická s vynucenou CSP (2026-10-08)
**Rozhodnutí:** `app/(marketing)/layout.tsx` bude `force-dynamic` a `/` + právní stránky dostanou vynucenou CSP (profil `workspace`) jako **přesné cesty**, ne prefix `/`. Statické generování z `PLAN.md` se nepoužije.
**Proč:** rozhodl Kryštof v S03. Nonce dostanou jen dynamické stránky, Report-Only nic nechrání. Cena je o něco horší TTFB a HTML bez cache na CDN.
**Důsledek:** provede S04. `.claude/security/DECISIONS.md` #007, brief § 3.

### R-035 · Schéma ws a oddělení účtů (2026-10-08)
**Rozhodnutí:** 33 tabulek ve schématu `ws` (migrace 064–075). Každá tabulka s daty účtu má `account_id` a RLS politiku `account_id = ws.current_account()` (`set_config('app.account_id')` v transakci). Vazby jsou složené cizí klíče `(account_id, x_id)`. Zákazník patří účtu, skupina (segment) se počítá pro zákazník × byznys (`customer_segments`). Blokace a dovolené jsou termíny `kind = 'block'`, takže je hlídá stejné `EXCLUDE` jako návštěvy. Před známým účtem jen úzké `SECURITY DEFINER` funkce (`ws.account_by_clerk_org`, další přidají S11/S16). Systémové tabulky bez RLS a bez osobních údajů: `stripe_events`, `webhook_events`, `rate_limits`. Aplikace se připojuje rolí `ws_app` založenou **přes SQL** skriptem, nikdy v Neon konzoli. `lib/ws/db.ts` má vlastní tag `q` a ovladač nad Neon HTTP transakcí (neinteraktivní, interaktivní přes Pool přidá S10, pokud bude potřeba).
**Proč:** odsouhlaseno v S06. Kontrola cizího klíče RLS obchází (bez `account_id` v klíči by šlo připojit cizí řádek přes UUID). Role z Neon konzole dostávají `neon_superuser` s BYPASSRLS (ověřeno na `neondb_owner`). Po transakci vrací `current_setting` prázdný řetězec, proto `NULLIF` ve funkci. Hranice skupin má každý byznys vlastní. Jedno `EXCLUDE` je jednodušší než trigger přes dvě tabulky (R-005).
**Důsledek:** `AGENTS.md` → B3 „Jak je to v kódu“, `docs/workspace/SETUP.md`, `.claude/security/DECISIONS.md` #008. Nová tabulka = řádek v `seedAccount()` v testovém helperu.

### R-036 · Testy DB proti PGlite (2026-10-08)
**Rozhodnutí:** vývojová závislost `@electric-sql/pglite` (Postgres 18 ve WASM). Testy Workspace pouští migrace 064+ do čisté DB dvakrát po sobě a ověřují pravidla jako `ws_app`.
**Proč:** Docker neběží, lokální Postgres není a Neon branch by potřebovala přihlašovací údaje a síť. PGlite umí role, RLS, `set_config` i `btree_gist`. Neon běží na PG 18.6, rozdíl verzí je zanedbatelný. Testy jsou součástí běžného `npm test` (asi 2 s).
**Důsledek:** `lib/ws/__tests__/helpers/ws-pglite.ts`, `docs/workspace/SETUP.md` → Testy. Do produkčního bundlu se nedostane.

### R-037 · Clerk jen pod /w, účet zakládá průvodce (2026-10-09)
**Rozhodnutí:** `@clerk/nextjs` 6.39.7 (verze 7 vyžaduje Next 15) + `@clerk/localizations`. Clerk běží jen pro `/w` a `/api/ws` (middleware i `ClerkProvider` v `app/w/layout.tsx`), admin a landing ho nespouští. `clerk init` se nepoužil — přepsal by kořenový layout adminu a `middleware.ts`. Účet (`ws.accounts`) zakládá jen průvodce `/w/novy` spolu s byznysem a šablonou oboru; webhook účty nezakládá, jen drží název a členy. Má-li uživatel organizaci s účtem, nový se nezakládá a průvodce ji jen aktivuje (Clerk po přihlášení aktivní organizaci nevybere). Odhlášení vlastním tlačítkem, ne `UserButton` (správa účtu se vykresluje mimo tokeny Dílků). Nastavení instance Clerku jde přes CLI (`clerk config patch`), ne ručně.
**Proč:** odsouhlaseno v S07. Admin se nesmí změnit; účet bez byznysu nedává smysl; jedno místo založení = jedna transakce bez závodu s webhookem. R-026 (jeden byznys v ceně).
**Důsledek:** `AGENTS.md` → B4 „Jak je to v kódu“, `.claude/security/DECISIONS.md` #009, CSP v3. Krok 2 průvodce (platba) přidá S08 do `app/w/novy`.

### R-038 · 14 dní zdarma s kartou, zkušební doba ve Stripe (2026-10-09)
**Rozhodnutí:** registrace končí krokem 2 průvodce, kde se ve Stripe Checkoutu zadá karta. Prvních 14 dní je zdarma (`trial_period_days` ve Stripe), první platba 249 Kč proběhne po zkušební době. Zkušební doba jen jednou na účet. Účet, který Checkout nedokončil, nemá přístup do aplikace (průvodce ho vrátí na krok 2). Po zrušení nebo nezaplacení jen čtení, data se nemažou. Při nezaplacené platbě (`past_due`) se nový Checkout nezakládá, jen výměna karty v Portalu.
**Proč:** rozhodl Kryštof 2026-10-09 („14 dní zdarma s kartou“). Zkušební doba s kartou plynule přejde v placené předplatné bez další výzvy. Nový Checkout při `past_due` by vedle nezaplaceného předplatného založil druhé a hrozila by dvojí platba.
**Důsledek:** `ws.accounts.trial_ends_at` se nepoužívá. Landing („bez karty“ pryč, nová odpověď v Dotazech s připomínkou 7 dní předem, kterou musí zapnout nastavení Stripe), brief, průvodce. `AGENTS.md` → B5. Odchylka od `docs/workspace/PLAN.md` (export, řádky o zkušební době bez karty), platí tohle rozhodnutí.

### R-039 · Stripe SDK a vývojové prostředí (2026-10-09)
**Rozhodnutí:** závislost `stripe` 22.6.2 (API `2026-08-26.dahlia`, verze se mění jen s upgradem balíčku). Vývoj v samostatném sandboxu „ZakazIQ“, ne ve sdíleném test módu ani v sandboxu jiného projektu. Tajný klíč jako omezený klíč `rk_…` s minimálními právy. Bez `payment_method_types` (metody z dashboardu) a bez Stripe Tax (neplátce, R-018). Předplatné se při každé události znovu načítá ze Stripe, ne z payloadu.
**Proč:** oficiální SDK s typy pro aktuální API, doporučení Stripe pro nové integrace. Načítání ze Stripe odstraní problém s pořadím událostí.
**Důsledek:** `docs/workspace/SETUP.md` → Stripe, `AGENTS.md` → B5 „Jak je to v kódu“, `.claude/security/STATE.md`.

### R-040 · Kostra aplikace: stav v URL, zástupné části (2026-10-09)
**Rozhodnutí:** obrazovky byznysu jsou pod `/w/[byznys]` se společným layoutem (`AppFrame`). Detail čehokoli = pravý panel řízený `?detail=<druh>:<id>` (sdílitelný odkaz, Zpět v prohlížeči ho zavře), výběr karty na Dnes `?zakaznik=`, týden `?tyden=`. Všechno se kreslí na serveru, v prohlížeči jen kostra, panel, ⌘K a menu. Nepostavené části menu řeší jedna dynamická zástupná stránka `[section]` (vypnutá funkce = 404). Poslední byznys si pamatuje HttpOnly cookie `ws_byznys` (jen slug, vždy znovu ověřený). Pevné cesty pod `/w` jsou rezervované slugy, nový byznys s takovým názvem dostane koncovku. Příkaz v ⌘K rozpoznává jen parser s pravidly (bez AI). Na telefonu místo týdenní mřížky seznam termínů do konce týdne. `requireWorkspace`/`requireBusiness` obalené `React.cache`.
**Proč:** prompt S09 a B9 (detail v panelu, 2 kliky, ⌘K); server components kvůli rychlosti bez blokujícího JS. Zástupná stránka drží menu funkční, dokud S10–S14 nepostaví skutečné obrazovky. Bez rezervace by byznys „Nový“ dostal slug `novy` a jeho Dnes by zakryl průvodce.
**Důsledek:** `AGENTS.md` → B9 „Jak je to v kódu (S09)“. Nová obrazovka = `app/w/[business]/<část>/page.tsx` (přebije zástupnou), nový detail = `DetailRef` + větev v `detail-slot.tsx`, nová pevná cesta pod `/w` = `RESERVED_BUSINESS_SLUGS`.

### R-041 · Ukázková data skriptem, jasně označená (2026-10-09)
**Rozhodnutí:** `scripts/ws-seed.mjs <slug> [--smazat] --ano` vloží (nebo smaže) fiktivní zákazníky „Testová, Ukázková…“ s telefony `+420000000xxx` a e-maily `@example.cz`, poptávky, termíny, skupiny, razítka a upozornění kolem dneška pro jeden byznys. Označení: poznámka `[ukázková data]`, `external_id 'ws-seed-*'`, pracovnice „Ukázková pracovnice“, odměna „Ukázková odměna“. Seed vždy nejdřív smaže starou ukázku. Zápis jde rolí `ws_app` pod RLS, byznys se dohledá rolí vlastníka. Bez `--ano` jen vypíše, co by udělal. Skript je `.mjs` (ne `.ts` z promptu): Node 24 spustí `lib/ws/demo-seed.ts` bez překladu, ten proto nemá runtime importy a časy počítá Postgres.
**Proč:** jiná databáze než produkční Neon zatím není; data musí jít bezpečně odstranit a nesmí se plést se skutečnými zákazníky (B10, žádné vymyšlené údaje vydávané za skutečné). `tsx` v projektu není a `.ts` skript s příponami importů by neprošel kontrolou typů Nextu.
**Důsledek:** pouštět jen na vlastním testovacím účtu a se souhlasem. Testy `ws-today.test.ts` používají stejná data.

### R-042 · Popis adminu mimo AGENTS.md, kratší paměť (2026-10-09)
**Rozhodnutí:** popis kódu admin konzole (dřív `AGENTS.md` → Část A) žije v `docs/admin/AGENTS-ADMIN.md` a čte se jen před změnou adminu. V `AGENTS.md` z části A zůstalo shrnutí, příkazy a env proměnné. Changelog v `memory.md` drží jen poslední den práce, starší dny a měsíce jdou do `memory/archiv/` (upřesnění pravidel §4).
**Proč:** rozhodl Kryštof po auditu tokenů 2026-10-09. `CLAUDE.md` s importy měl ~45,8k tokenů a čte se v každém kroku každé relace; popis adminu (~9k) potřebují jen sezení na adminu, ne Workspace. Úprava R-013 (struktura paměti zůstává, mění se jen to, co se importuje).
**Důsledek:** nová admin tabulka, routa nebo API → `docs/admin/AGENTS-ADMIN.md`; env a příkazy dál do `AGENTS.md`. Workspace pravidla beze změny v části B.

### R-043 · Nehotové akce se neukazují (2026-10-09)
**Rozhodnutí:** akce, které kostra umí nabídnout, ale ještě nefungují, jsou vypnuté přepínači `WS_FEATURES` v `lib/ws/features.ts`: odkaz na objednání (`/r/[slug]` vrací 404 do S11), Nová rezervace (ukládání S10), Nová faktura (S14). Vypnutá akce není v „+ Nová“, ⌘K (ani příkaz „rezervace …“), uvítání ani v pravém panelu, ani když přijde sdílený odkaz `?detail=nova-…`. Bez žádné hotové akce chybí tlačítko „+ Nová“ i „+“ ve spodní liště. Zástupné obrazovky v menu zůstávají (R-040). Build při běžícím `next dev` jen přes `npm run build:check` (kopie repa).
**Proč:** rozhodl Kryštof 2026-10-09 — neposílat zákazníkům odkaz na 404 a nenabízet formuláře, které nic neuloží. Menu se zástupnými stránkami ukazuje strukturu aplikace. Build v repu přepsal `.next` běžícímu dev serveru.
**Důsledek:** S10, S11 a S14 zapnou svůj přepínač ve `WS_FEATURES` (test `ws-app-shell.test.ts` hlídá, že dnes jsou všechny vypnuté — při zapnutí ho upravit). `AGENTS.md` → B9 „Jak je to v kódu (S09)“, příkazy, B12.


### R-044 · Poptávky a termíny: jak se potvrzuje a vrací (2026-10-10)
**Rozhodnutí:** (1) „Jiný čas“ = se zákazníkem už domluvený jiný termín, potvrdí se rovnou (stav `rescheduled`), nečeká na souhlas zákazníka — návrh termínu, který zákazník přijme v e-mailu nebo portálu, je až S15/S16. (2) S kalendářem vznikne potvrzením termín, se zakázkami zakázka (s časem v prvním stavu „rozpracováno“, bez času v prvním stavu „nová“). Byznys jen s kalendářem potvrzuje vždy s časem. (3) Byznys bez pracovníků dostane při prvním termínu jednoho se jménem byznysu (`ensureStaff`, zámek na byznys), sloupce a výběr pracovníka se ukazují až od dvou. (4) „Zpět“ (8 s) mají odmítnutí, zrušení, přesun termínu a přesun zakázky; potvrzení ne (termín jde zrušit, zakázka by se musela mazat). (5) Živé obnovení pollingem po 10 s s ETagem, žádný WebSocket. (6) Přetažení termínu jen myší na počítači, na telefonu Přesunout v detailu. (7) Neinteraktivní transakce Neon HTTP stačí: každý zápis je jeden SQL příkaz (CTE), Pool se nepřidával.
**Proč:** prompt S10 a B9 (jeden klik, Zpět místo dialogů, 15 s); e-maily zákazníkům zatím nejsou (S15), tak nejde čekat na jejich odpověď. Návštěva musí mít pracovníka (migrace 068), šablony oborů pracovníky nezakládají a tým je až S13. Pool by znamenal WebSocket na Vercelu a další závislost.
**Důsledek:** `AGENTS.md` → B9 „Jak je to v kódu (S10)“. S13 (tým) přejmenuje nebo nahradí automaticky založeného pracovníka; S15 doplní e-mail zákazníkovi po potvrzení, změně a zrušení.

### R-045 · Příjem poptávek z webů (2026-10-10)
**Rozhodnutí:** (1) Jedna cesta `ingestRequest` pro API s tajným klíčem, widget s veřejným klíčem, objednávací stránku i „Ověřit napojení“. (2) Bez otevírací doby si zákazník čas navrhne sám (den + čas po 30 min, 7–20 h, 60 dní, bez kontroly obsazenosti); s otevírací dobou se nabízí volné časy (21 dní, nejdřív za hodinu, termíny, blokace pracovníka i celého byznysu) a obsazený čas vrátí `SLOT_TAKEN`; bez kalendáře bez času. (3) Neaktivní předplatné: poptávka se uloží, API vrátí `202` s `notice: SUBSCRIPTION_INACTIVE` (ne chybu — web by zákazníkovi ukázal chybu u uložené poptávky). (4) Zkušební poptávky (`requests.is_test`, `test: true`, Ověřit napojení) se uloží, ale nezakládají zákazníka ani upozornění a nejsou v Dnes, Poptávkách, kalendáři ani hledání. (5) Záznam požadavků `ws.intake_log` (bez IP a osobních údajů, 30 dní). (6) „Poslat návod webáři“ otevře e-mail (`mailto:`) s kódem widgetu, bez tajného klíče — e-maily Workspace jsou až S15. (7) Tajný klíč s hlavičkou `Origin` API odmítne. (8) API přijímá i pražské `date` + `time` místo `start` (widget a weby bez časových pásem). (9) Napojení (veřejný klíč) se zakládá otevřením Nastavení › Napojený web; bez něj widget vrací 404, objednávací stránka funguje vždy. (10) Bez captchy, honeypot + rate limit (DECISIONS #010). (11) QR kód přes existující `qrcode.react`, PNG/SVG se skládá v prohlížeči.
**Proč:** odsouhlaseno v S11 (migrace 076, otevírací doba „navrhne si sám“, mailto, 202 + upozornění). B5: poptávky se ukládají vždy. Plán: zkušební poptávka a zelená fajfka. Bez nové závislosti.
**Důsledek:** `AGENTS.md` → B6 „Jak je to v kódu (S11)“, `docs/workspace/API.md`, `.claude/security/DECISIONS.md` #010, CSP-LOG v4. S13 (otevírací doba) přepne byznys z režimu `free` na `slots` automaticky. S15 doplní e-maily v `afterSave` (`lib/ws/intake/intake.ts`). Nový výpis poptávek musí mít `AND NOT r.is_test`.

### R-046 · Společný proces pro Claude Code a Codex (2026-10-10)
**Rozhodnutí:** společná komunikace a protokol sezení jsou v `AGENTS.md`; `CLAUDE.md` přidává importy a specifika Claude Code. `.claude/skills/` a `.claude/security/` jsou společný zdroj, `.agents/` drží identické kopie pro Codex synchronizované přes `scripts/sync-agent-context.mjs`. Paměť zůstává jediná v `memory/`. Projektová konfigurace Codexu má limit instrukcí 96 KiB a lokální setup/akce; setup instaluje závislosti, neklonuje klíče a nemění skutečnou DB.
**Proč:** Kryštof chce používat projekt stejně v obou nástrojích; nezávislé instrukce a bezpečnostní historie by se rozcházely. AGENTS.md přesahuje výchozí limit Codexu 32 KiB.
**Důsledek:** `AGENTS.md` → Komunikace a protokol sezení / Codex, `docs/CODEX.md`, `.codex/`, `memory/pravidla.md`. Globální skilly a připojení služeb se na jiné prostředí automaticky nepřenášejí.

### R-047 · Stručné vstupní instrukce, podrobnosti podle úlohy (2026-10-10)
**Rozhodnutí:** AGENTS.md obsahuje stručné společné instrukce, kritické zásady a povinné čtení podle úlohy. Úplný původní kontext, postupy a katalogy jsou zachované v závazné docs/AGENTS-REFERENCE.md s číslováním A/B1–B13; mění se tam technická fakta. Paměť a pravidla zůstávají společné pro všechny agenty.
**Proč:** Kryštof požaduje co největší zkrácení AGENTS.md bez ztráty účelu a kontextu; katalogy se nemají načítat při každé úloze.
**Důsledek:** aktualizované odkazy v CLAUDE.md, docs/CODEX.md, memory/index.md a pravidla údržby. Rozhodnutí R-046 dál platí; limit 96 KiB je nyní rezerva, podrobnosti se čtou výslovně podle úlohy.

### R-048 · Částková věrnost jen v korunách bez kurzu (2026-10-10)
**Rozhodnutí:** pravidlo „každých X Kč“ a minimální útrata se použijí jen pro návštěvy v CZK. Návštěva v jiné měně může dostat razítko podle pravidla „zaplacená návštěva“, ale ne podle částky.
**Proč:** bez uloženého kurzu by porovnání EUR s Kč vytvářelo nepravdivé nároky na odměnu.
**Důsledek:** `lib/ws/loyalty.ts`; budoucí práce s cizími měnami vyžaduje samostatné rozhodnutí o kurzech.

---

### R-049 · Peníze: atomické doklady a ověřené sazby (2026-10-10)
**Rozhodnutí:** číslo YYYY-NNNNNN za účet a faktura vzniknou ve stejné transakci se zámkem účtu; platba i převzetí stejné platby zakázky jsou atomické pod RLS. PDF používá stávající Puppeteer/Chromium a lokální písma, bez nové závislosti. Sazby 2026 jsou oddělené od adminu a ověřené na oficiálních zdrojích (docs/workspace/MONEY.md); sociální minimum a první pásmo paušální daně berou zpětnou novelu 2026.
**Proč:** souběh nesmí tvořit duplicitní čísla, díry ani dva příjmy za stejnou platbu; admin předpokládá studentovu vedlejší činnost a má historické pravidlo DPH.
**Důsledek:** DPH za kalendářní rok se dvěma hranicemi, posledních 12 měsíců jsou přehled. Příjmy jsou jen vodítko obratu DPH. Odhad skrytý pro jiný rok, EUR bez kurzu a plátce DPH; výjimky a zaměstnání nejsou zahrnuté. Koncept fakturačního e-mailu odešle až S15; ICS připomíná 7 dní předem.

### R-050 · E-maily: fronta bez častého cronu, vlastní šablony (2026-10-10)
**Rozhodnutí:** (1) E-mail se zařadí do `ws.outbound_messages` a odešle hned po akci (limit 2,5 s, akce na něj nečeká déle), při živém obnovení otevřené aplikace a jednou denně cronem `/api/cron/ws-email` (5:00 UTC). Připomínka termínu odchází den předem ráno, ne přesně 24 h. (2) Šablony jsou vlastní tabulkové HTML v TypeScriptu (`lib/ws/email/layout.ts`), ne React Email — bez nové závislosti a stejná funkce dělá náhled v Nastavení i odeslaný e-mail. (3) Web Push až v S18. (4) Odesílá se jen s `WS_EMAIL_FROM` (ověřená doména), do té doby zprávy čekají; prošlé (připomínka po termínu) se zruší. (5) Odmítnutí, zrušení a přesun čekají 60 s, „Zpět“ e-mail zruší. (6) Zákazníkům jen s aktivním předplatným (R-045), majiteli vždy.
**Proč:** rozhodl Kryštof v S15 (Vercel Hobby = cron 1× denně, R-006; doména zatím neověřená). React Email = 2 závislosti pro pár šablon. Toast „Zpět“ by jinak nestihl zastavit e-mail.
**Důsledek:** `docs/AGENTS-REFERENCE.md` → B7 „Jak je to v kódu (S15)“, `.claude/security/DECISIONS.md` #011, `docs/workspace/SETUP.md` → E-maily. Odchylka od plánu (React Email, přesně 24 h). Při přechodu na Vercel Pro nebo externí cron stačí volat `flushAll` častěji.

### R-051 · Klientský portál: trvalý náhodný odkaz a pravidla změn (2026-10-10)
**Rozhodnutí:** Termín i zakázka mají náhodné UUID v DB pro `/z/[token]`. Odkaz platí, dokud existuje záznam a je zapnutý portál. Zákazník smí termín přesunout nebo zrušit jen do nastaveného počtu hodin předem (výchozí 24 h); konečné kolize hlídá DB. Viditelné zprávy jsou pouze v `ws.job_updates`, interní poznámky se nepublikují.
**Proč:** Odkaz bez přihlášení musí fungovat z e-mailu i telefonu a zůstat jednoduchý; oddělená tabulka zpráv brání náhodnému zveřejnění poznámek.
**Důsledek:** migrace 082, `lib/ws/portal.ts`, `/z/[token]`, Nastavení › Funkce a tlačítka v e-mailech. Veřejné akce mají Zod a limity; bezpečnostní kompromis je v `.claude/security/DECISIONS.md` #012.

### R-052 · Admin nad Workspace: pozvání, novinky, „Učesat text“ bez AI (2026-10-10)
**Rozhodnutí:** (1) Admin čte `ws` vlastníkem tabulek (`lib/ws/admin/db.ts`), zapisuje jen novinky, interní poznámky (`ws.account_admin_notes`, `ws_app` bez práv) a audit (`actor = 'admin'`, bez e-mailu); data klienta mění přes `lib/ws` pod RLS. (2) „Pozvat klienta“ založí Clerk organizaci bez vlastníka, účet s byznysem ze šablony a pozvánku `org:admin`; člena zapíše průvodce `/w/novy` (`ensureMember`), takže to funguje i bez webhooku Clerku. Pozvaný klient platí jako každý jiný (R-038). (3) Novinky: koncept → Zveřejnit v aplikaci → Poslat e-mailem všem (jednou, s potvrzeným počtem příjemců, jen `news_emails`, jen účty existující v okamžiku odeslání). Denní cron posílá jen výslovně odeslané novinky — S15 posílal každou zveřejněnou. (4) Obrázek novinky v DB (PNG/JPEG/WebP do 600 kB podle bajtů), servíruje `/z/novinky/[id]/obrazek`. (5) „Učesat text“ = návod a místní tipy podle pravidel `humanize-text-cs` (`newsTextHints`), žádné volání AI. (6) Kromě 2 položek navigace (layout + `MobileNav`) se admin nemění.
**Proč:** prompt S17 (pozvat bez SQL, novinka v aplikaci i e-mailem, „Učesat text“ jen návod — rozhodnout). AI volání by znamenalo náklady, latenci a text, který by stejně musel projít člověk; pravidla stylu jdou zkontrolovat místně. Obrázek z cizí domény by zablokovala CSP aplikace (`img-src 'self'`), úložiště souborů v projektu není. Webhook Clerku zatím není nastavený.
**Důsledek:** `docs/AGENTS-REFERENCE.md` → B3 „Admin nad Workspace (S17, R-052)“, `.claude/security/DECISIONS.md` #013, migrace 083, `docs/workspace/SETUP.md`.

### R-053 · Next.js 16.4 a React 19 (2026-10-17)
**Rozhodnutí:** celé repo (admin, Workspace, landing) je na `next` 16.4.2 s Turbopackem a `react` 19. Kód přešel na async request API, `middleware.ts` na `proxy.ts` (Node runtime). `@clerk/nextjs` zůstal na 6.39.7 a `next-auth` na 4.24 (obojí podporuje Next 16 a React 19), `lucide-react` zůstal na řadě 0.x, `forwardRef` v `components/ui/*` se nepřepisoval.
**Proč:** Kryštof chtěl Next 16.2. Nejnovější patch té řady 16.2.12 ale podle `npm audit` obsahuje známé zranitelnosti (3× critical: `next/og`, Image Optimization, Windows hosting; opravy až od 16.3.8), proto Kryštof schválil 16.4.2. Aplikace `next/image` ani `next/og` nepoužívá a běží na Vercelu, takže reálné riziko bylo nižší, ale CI audit by zůstal červený. Jeden skok 14 → 16 bez mezistupně 15 zvládly codemody.
**Důsledek:** `proxy.ts` je jediné místo pro Clerk + NextAuth + CSP (logika beze změny). `next lint` v Next 16 není (skript smazán; kontrolu dělá `tsc`). `next.config.mjs` má explicitní `turbopack.root`/`outputFileTracingRoot` — bez něj padá Turbopack na cestě s diakritikou a hlásí cizí lockfile. Další velká verze (Next 17, Tailwind 4, Clerk 7, nodemailer 10) je samostatný krok. Odchylka: R-037 psal, že Clerk 7 vyžaduje Next 15 — upgrade Clerku nebyl při přechodu na Next 16 potřeba.

### R-054 · Nastavení: otevírací doba, pracovníci, dovolené, pořadí (2026-10-17)
**Rozhodnutí:** (1) Bez nové migrace: otevírací doba a směny v `ws.opening_hours` (staff NULL = firma), dovolené a „zavřeno“ jako celodenní blokace v `ws.appointments`, přiřazení v `ws.service_staff`. (2) Uložení nahradí celý týden; pracovník bez vlastních směn pracuje podle firmy, prázdná doba firmy = zákazník si čas navrhne sám (R-045). (3) Posledního aktivního pracovníka skrýt nejde (jinak by `ensureStaff` založil nového se jménem firmy); pracovník se nemaže, jen skryje — termíny zůstávají. (4) „Kdo ji dělá“ se ukazuje až od dvou aktivních pracovníků, prázdný výběr = kdokoli. (5) Pořadí se ukládá hned po puštění (bez tlačítka Uložit), při chybě se vrátí. Kratší blokace (hodiny) zůstávají v kalendáři. (6) `build:check` je od Next 16 obyčejný build v repu — kopie repa pod Turbopackem nefungovala (odkaz na `node_modules` mimo `turbopack.root`) a `next dev` má vlastní `.next/dev`.
**Proč:** prompt S13 (směny, dovolené, kdo dělá, přetažení); datový model z S06 to už unesl a kalendář i volné časy blokace i směny čtou. Ověřeno: build v repu při běžícím dev, dev dál vrací 200.
**Důsledek:** `docs/AGENTS-REFERENCE.md` → B9 „Jak je to v kódu (S13, R-054)“, `lib/ws/hours.ts`, `lib/ws/settings.ts`, `components/ws/settings/{sortable-list,week-hours-editor,team-settings,service-settings}.tsx`, test `ws-settings.test.ts`.

### R-054 · GDPR: výmaz zákazníka, lhůty a zrušení účtu (2026-10-17)
**Rozhodnutí:** (1) Výmaz zákazníka na žádost: zákazník, věrnost, hodnocení, zprávy z portálu, upozornění a e-maily s jeho id se smažou; poptávky, termíny a zakázky zůstanou bez osobních údajů („Smazaný zákazník“, bez kontaktů, poznámek a odpovědí z formuláře), částky a příjmy zůstanou. (2) Vystavené faktury zůstanou s povinnými údaji (jméno, adresa, IČO/DIČ, PDF), smaže se jen e-mail odběratele a vazba na zákazníka; koncepty faktur se smažou. Po 10 letech od konce roku vystavení je denní cron anonymizuje úplně. (3) Zrušení účtu: předplatné ve Stripe skončí hned (bez vrácení nevyčerpané části), byznysy se archivují (zavře se objednávací stránka, widget, API, portál), data 30 dní, během nich obnovení, pak cron smaže účet celý i organizaci v Clerku. (4) Export: ZIP s CSV a PDF bez nové závislosti. (5) Vzhled v cookie pro zařízení, ne v DB. (6) S18 staví na `chore/next-16` ve větvi `ws/s18`.
**Proč:** rozhodl Kryštof 2026-10-17 (pravidla výmazu, 10 let, větev). Faktura je daňový doklad (zákon o DPH § 35, zákon o účetnictví § 31), GDPR čl. 17 odst. 3 písm. b výmaz nevyžaduje; e-mail není povinná náležitost a PDF ho netiskne. Čísla v historii drží přehledy a daně.
**Důsledek:** migrace 084, `lib/ws/gdpr.ts`, `docs/AGENTS-REFERENCE.md` → B3 „GDPR, vzhled a PWA (S18)“, `.claude/security/DECISIONS.md` #014. Nový výpis zákazníků nemusí nic filtrovat (vymazaný zákazník neexistuje); nové osobní údaje v jiné tabulce = doplnit do `ws.erase_customer` a do exportu.

### R-055 · Základní SEO landing page bez klíčových slov (2026-10-17)
**Rozhodnutí:** (1) S05 = jen základní technické SEO: metadata, canonical, Open Graph/Twitter, OG obrázek, ikony, `robots.txt`, `sitemap.xml`, JSON-LD `Organization` + `WebSite` + `SoftwareApplication` (249 CZK měsíčně, bez hodnocení). Výzkum klíčových slov a přepis textů kvůli nim se nedělá. (2) Neveřejné cesty (`/w`, `/r`, `/z`, `/embed`, `/api`, admin) mají `X-Robots-Tag: noindex, nofollow`; `robots.txt` zakazuje jen `/api/`. (3) Právní stránky `noindex, follow` a mimo sitemapu, dokud mají `[DOPLNIT]` (od R-079 indexované a v sitemapě). (4) Bez `FAQPage`. (5) Oborové podstránky se nestaví, jen návrh.
**Proč:** rozhodl Kryštof 2026-10-17 („základní SEO, klíčová slova nepotřebujeme“). Zákaz v `robots.txt` by robotovi nedovolil noindex přečíst a adresa z cizího odkazu by mohla skončit ve výsledcích bez obsahu (odchylka od briefu § 11). Bohaté výsledky FAQ Google v roce 2026 zrušil a jedna odpověď má `[DOPLNIT]`.
**Důsledek:** `components/marketing/seo.ts`, `app/{robots,sitemap}.ts`, `app/(marketing)/{opengraph-image,twitter-image}.tsx`, `next.config.mjs`, `.claude/security/STATE.md`. `SITE_URL` bere `NEXT_PUBLIC_APP_URL` — musí to být hlavní produkční host (apex, nebo www). Po vyplnění právních textů odstranit `LEGAL_ROBOTS` a přidat stránky do sitemapy.

### R-056 · Nodemailer 10 přes legacy peer resolver (2026-10-17)
**Rozhodnutí:** `nodemailer` 10.1.2 se používá pro `lib/email.ts`; `.npmrc` nastavuje `legacy-peer-deps=true`, protože NextAuth 4 deklaruje volitelný peer Nodemailer 7 pro EmailProvider. Aplikace používá jen CredentialsProvider.
**Proč:** Nodemailer 7 obsahoval high zranitelnost; Vercel `npm install` bez resolveru odmítl neshodu peer rozsahu.
**Důsledek:** instalace ignoruje peer rozsahy obecně; při změnách auth/e-mailů znovu ověřit kompatibilitu. Tailwind 3 high nálezy zůstávají, Tailwind 4 je samostatná major migrace.

### R-057 · Redesign Landing a Workspace: kalendář, příběh poptávky, produktové kapitoly (2026-10-17)
**Rozhodnutí:** nový vizuální směr kombinuje (1) kalendář jako hlavní produktovou plochu, (2) jednu ovladatelnou příběhovou ukázku poptávky na Landing od přijetí po termín, zákazníka a peníze a (3) několik výrazných produktových kapitol. Rozložení a hierarchie se mění, barvy, logo a vizuální identita Dílky zůstávají. Příběhové ukázky na Landing jdou ovládat scrollováním a kliknutím a nepřehrávají se opakovaně automaticky. Směr 4 (přepínání oborů) a 5 (pracovní nástroj jako samostatný vizuální koncept) nebyly vybrány. Backend, produktová pravidla a neodsouhlasené funkce jsou mimo rozsah.
**Proč:** Kryštof 2026-10-17 schválil kombinaci směrů 1–3, zachování vlastní palety a vizuálů a požádal o implementaci v projektu po předání plného kontextu.
**Důsledek:** `docs/REDESIGN-HANDOFF.md` je startovací kontext pro implementaci. V otázkách layoutu a opakovaného přehrávání ukázek má toto rozhodnutí přednost před staršími pokyny v briefu; pravdivá fakta, obsahové limity a systém Dílky zůstávají v platnosti. Před implementací nejprve prověřit současné komponenty a zachovat cizí neuložené změny.

### R-058 · Redesign aplikace Workspace: rozsah, pořadí a rozhodnutí D-1–D-10 (2026-10-18)
**Rozhodnutí:** redesign aplikace `/w/[byznys]` + objednávky `/r` a widgetu podle `docs/workspace/REDESIGN-APP-PLAN.md`, sezení RD00–RD16 (pořadí v plánu, sekce 5; RD16 doporučeně za RD12, RD09 volitelné). Kryštof odsouhlasil 2026-10-18:
- **D-1 soukromí:** úroveň 1 (admin nečte osobní údaje zákazníků klientů, audit + test; sahá na admin, jen s výslovným souhlasem v RD11) + úroveň 2 (režim soukromí v aplikaci). Šifrování sloupců se nedělá.
- **D-2 Návody:** záložky + malé „?“ v záhlaví obrazovek. **D-3 Dnes:** karta zákazníka z třetího sloupce do pravého panelu.
- **D-4 kapacita:** nejdřív více služeb (RD08); skupinové termíny / souběžní zákazníci až v RD09 a rozhodne se znovu.
- **D-5:** QR platba (SPAYD) na fakturách (potřebuje IBAN v profilu dodavatele) i opakované rezervace jsou v rozsahu.
- **D-6:** region Vercelu `fra1` po ověření v dashboardu; projeví se po deployi, ten jen se souhlasem.
- **D-7:** rozpracované změny na `ws/s18` jdou do tří commitů (bezpečnost + migrace 080 + balíčky · landing + redesign R-057 · paměť a dokumenty), po konkrétních souborech a se schválením Kryštofa.
- **D-8:** redesign se vyvíjí na Neon branch s ukázkovými daty (R-041), ne na produkčním Neonu.
- **D-9:** Nastavení z hlavního menu do Účtu, adresy zůstávají.
- **D-10 kontakt zákazníka:** povinný aspoň jeden údaj (telefon nebo e-mail); zatím `mailto:`, přímé odeslání z ZakazIQ po ověření domény v Resendu; osobní zpráva k obsluze smí odejít vždy, nabídky jen se souhlasem.
**Proč:** zadání Kryštofa 2026-10-18 (rychlost, jednoduchost, rezervace pro všechny obory, fakturace, věrnost, daně a soukromí, nastavení, Návody, kontakt jedním klikem); rozfázování a doporučení v plánu.
**Důsledek:** větev `ws/redesign-app` z `ws/s18` (RD00); migrace od 085 se při implementaci připravují a aplikují až po výslovném souhlasu. Kryštof 2026-10-19 schválil aplikaci 080 a 087–091 na produkci; 085/086 byly už dříve aplikované; 084 aplikoval Kryštof 2026-10-31. Admin se nemění (výjimka jen RD11); stav sezení v plánu, sekce 5. Navazuje na R-057.

### R-059 · Kalendář a Zakázky (RD05, RD06): rady k času, barvy, délka, filtry, historie (2026-10-18)
**Rozhodnutí:** (1) Rady k času (`getSlotAdvice`, `lib/ws/slot-advice.ts`) počítá stejná funkce jako objednávka (`computeSlots`), ale bez předstihu (majitel smí zapsat i hned); hledá kolem zadaného času (2 dny zpět, 14 dní dopředu), nikdy do minulosti. Bez nastavené otevírací doby kolizi ověří, návrhy ne a UI odkáže do Nastavení › Otevírací doba. Mimo otevírací dobu je jen upozornění, zapsat jde. (2) Délku termínu jde změnit tažením za spodní okraj nebo výběrem „Délka“ v detailu: začátek se nemění, kolizi rozhodne DB, „Zpět“ 8 s, 15 min až 12 h; **zákazník o změně délky e-mail nedostane**. (3) Barva pracovníka v kalendáři jen při víc pracovnících: uložená `ws.staff.color`, jinak tokeny `--staff-1…5` (světlé i tmavé); nastavení barvy v UI čeká na RD13. (4) Filtry zakázek: *Čeká na mě* = otevřená zakázka v prvním stavu „nová“; *Po termínu* = otevřená zakázka, jejíž poslední termín proběhl a žádný další není; *Bez termínu* = otevřená zakázka bez jediného termínu; otevřená = není uzavřená ani hotovo/zaplaceno/zrušeno. Pohled a filtr jsou v URL (`?pohled=`, `?filtr=`), na telefonu je bez volby výchozí seznam. (5) Historie stavů zakázky se zapisuje do `ws.audit_log` (`job.stage_changed`, názvy stavů opsané) **bez migrace**; starší změny nejsou zaznamenané, zakázka má v historii aspoň den vzniku.
**Proč:** zadání RD05 a RD06 nechalo pojmy otevřené („nová, nepřiřazená“, „po termínu“, „historie stavů beze změny datového modelu“); zvolil jsem nejmenší výklad, který jde ověřit testy a vrátit. E-mail při změně délky by zákazníka rušil bez nové informace (čas začátku je stejný).
**Důsledek:** `docs/AGENTS-REFERENCE.md` → B9 „Jak je to v kódu (RD05, RD06)“. Kdyby se mělo posílat upozornění o prodloužení, doplnit `notify` v `resizeAppointment` (`app/w/[business]/poptavky/actions.ts`). Když se začne psát historie i jinými cestami (potvrzení poptávky, portál), použít stejnou akci `job.stage_changed`.

### R-060 · Objednávka RD07, výběr pracovníka a portál poptávky (2026-10-18)
**Rozhodnutí:** `/r` a widget sdílejí `OrderFlow`; widget vkládá `/r/<slug>?embed=1` přes sandboxovaný iframe. U objednávky lze vybrat „Kdokoli“ (sjednocení volných časů způsobilých pracovníků) nebo konkrétního pracovníka; volba se ukládá do `requests.requested_staff_id` a při potvrzení se předvolí, pokud je pracovník stále aktivní a službu nabízí. `GET /api/public/v1/schema` přidává nepovinné `booking.staff` a `staffId` pro filtrování časů; `POST /requests` přijímá volitelné `staffId`. Poptávka dostane `public_token`; dokud čeká, portál ukáže pouze stav, službu a požadovaný čas bez kontaktních údajů. Jakmile vznikne termín, stejný token ukáže běžný portál termínu. Předběžný soubor ICS z objednávky má `STATUS:TENTATIVE` a neblokuje kalendář.
**Proč:** čas od zákazníka je poptávka, nikoli potvrzený termín; stejný formulář ve stránce i widgetu omezuje rozdíly v pravidlech, přístupnosti a dalších úpravách.
**Důsledek:** migrace `087_ws_objednavka_pracovnik_a_portal.sql` je připravená, na Neonu se nespouštěla. RD10 následně obsadilo číslo 088; pro RD08 je nově 089 (R-061).

### R-061 · Fakturace RD10: profil účtu, bezpečné vrácení platby a pořadí migrací (2026-10-18)
**Rozhodnutí:** profil dodavatele ukládá jedno `ws.accounts.invoice_profile` pro celý účet; vystavená faktura dál nese neměnný snímek údajů. Migrace 088 přidává `invoices.payment_origin` a SECURITY INVOKER `money_unpay`. „Zpět“ smaže jen příjem vytvořený platbou faktury, pokud jej mezitím nepoužila návštěva; převzatou platbu zakázky nebo příjem navázaný na termín od faktury odpojí a zachová. UI nabízí „Zpět“ 8 sekund, databáze odmítne platbu starší než 60 sekund. SPAYD QR se generuje jen pro nezaplacenou vystavenou fakturu v CZK s validním IBANem. Migrace 088 je před RD08; RD08 se posouvá na 089.
**Proč:** dodavatel i faktura jsou společné účtu, ale účetní doklady musí zachovat údaje platné při vystavení. Převzaté/kalendářem využité platby jsou skutečné příjmy a nesmějí se při vrácení omylem smazat.
**Důsledek:** profil mění pouze vlastník přes Nastavení › Firma a fakturace. `scripts/ws-grants.sql` uděluje `ws_app` spouštění obou platebních funkcí; migrace 088 je připravená, neaplikovaná. Rozsah a stav RD10: plán redesignu sekce 5 a `docs/workspace/MONEY.md`.

### R-062 · Kontakt zákazníka (RD16) a pět částí Nastavení (RD13) (2026-10-18)
**Rozhodnutí:** RD16 zachovává D-10: při nové poptávce stačí telefon nebo e-mail; zákaznickou kartu lze doplnit později. Duplicitní kontakt nikdy nepřepisuje jiné záznamy potichu, nabídne sloučení. Ruční zprávy mají pět typů; osobní zpráva k obsluze není blokována odhlášením z nabídek, marketingová nabídka vyžaduje souhlas a při čekání ve frontě se pravidla ověří znovu těsně před odesláním. Odeslání do fronty předchází 60s možnost „Zpět“; bez připraveného Resend transportu se otevře `mailto:` a nic se nevykáže jako odeslané. RD13 seskupuje nastavení do Firma, Nabídka, Objednávky, Zákazníci a Komunikace; původní adresy zůstávají přes přesměrování.
**Proč:** kontakt musí jít doplnit u zákazníka bez ztráty jeho vazeb a nabídka musí respektovat odhlášení; pět sekcí snižuje počet samostatných voleb, aniž by rozbilo uložené odkazy.
**Důsledek:** migrace 089 rozšiřuje pouze `message_settings_type_check`; je připravená, na Neonu neaplikovaná. Vložení RD16 přesunulo budoucí migraci RD08 z 089 na 090 (předchozí odhad v R-061 už neplatí). RD13 nemá migraci. Bezpečnostní review opravilo kódování adresy `mailto:` proti vložení parametrů a skončilo bez otevřených nálezů. Plán a technické podrobnosti jsou v `docs/workspace/REDESIGN-APP-PLAN.md` a `docs/AGENTS-REFERENCE.md`.

### R-063 · Skupinové lekce a soukromí v adminu (2026-10-18)
**Rozhodnutí:** Kryštof schválil RD09: majitel vypisuje jednotlivé budoucí lekce z kalendáře, každá má jednu službu, jednoho pracovníka a kapacitu 2–30 míst. Přihlášky sdílejí jediný blok pracovníka a místo se rezervuje atomicky už při podání; majitel může registraci zavřít/otevřít a každého účastníka potvrdit/odmítnout. Odmítnutí místo uvolní. Čekací listina ani souběžné termíny více zákazníků u pracovníka nejsou v rozsahu. Tím se upřesňuje D-4 z R-058. RD11 zároveň omezuje kód adminu: přestává číst poznámky, volný obsah auditu a osobní/finanční obsah zákaznických tabulek; agregace a údaje účtu, byznysů a členů týmu zůstávají. Vlastník tabulek má stále širší technický přístup.
**Proč:** skupinová lekce dostává pevnou kapacitu bez dvojího blokování pracovníka; omezení adminu naplňuje D-1 bez změny databázové role a její správy.
**Důsledek:** migrace 090/091 jsou aplikované na produkci i testovací DB; RD11 migraci nemá. Technické podrobnosti a omezení ověření jsou v redesign plánu a referenci B9; bezpečnostní rozhodnutí #017.

### R-064 · QR platba v PDF přes balíček qrcode (2026-10-31)
**Rozhodnutí:** SPAYD QR v PDF faktury kreslí `qrcode` 1.5.4 (`QRCode.toString(…, {type:'svg'})`), ne `qrcode.react`. `qrcode.react` zůstává jen pro QR v prohlížeči (Nastavení › Napojený web).
**Proč:** route handlery a server actions běží s React serverovým buildem bez hooků; `QRCodeSVG` volá `useMemo` a PDF s QR na Vercelu padalo (`Cannot read properties of null (reading 'useMemo')`). Vitest to nezachytil, běží s běžným Reactem. Kryštof vybral balíček (MIT) před vložením generátoru do repa.
**Důsledek:** `lib/ws/money/pdf.ts`; v kódu pro server nepoužívat React komponenty s hooky přes `renderToStaticMarkup`.

### R-065 · Kontaktní formulář na landing page (2026-10-31)
**Rozhodnutí:** Kryštof vrací na landing formulář, který zapíše dotaz do Hovorů (`client_leads`) s úkolem odpovědět e-mailem do 24 hodin. Podpora používá adresu `info@vizeon.cz`; hero i footer vedou na formulář a e-mail zůstává jako přímá záloha. Vstup chrání serverová Zod validace, honeypot, časový filtr a rate limit `landing_contact`; `/api/public/leads` se nepoužije.
**Proč:** návštěvník může poslat dotaz bez otevření e-mailového klienta a dotaz se objeví v existujícím pracovním seznamu.
**Důsledek:** implementace v `app/(marketing)/actions.ts` a `components/marketing/`; admin soubory se nemění. Rozhodnutí nahrazuje část R-032, která formulář odkládala. Retence kontaktů a právní popis zůstávají součástí právní přípravy spuštění.

### R-066 · Bezplatný pilotní klient (2026-10-31)
**Rozhodnutí:** první pilotní klient ZakazIQ nebude platit.
**Proč:** Kryštof to potvrdil při přípravě launch plánu.
**Důsledek:** délku pilotu a způsob nastavení ve Stripe je nutné doplnit před vytvořením live nabídky; konkrétní pilotní firmu určit samostatně.

### R-067 · Výraznější rozložení při zachování Dílků (2026-10-31)
**Rozhodnutí:** Kryštof požádal o výraznou změnu kompozice, hierarchie a hustoty Landing i Workspace při zachování identity Dílky. Příběh v úvodu má otevřený kalendář s detailem a střídmé pole dílků; na Dnes je kalendář na široké obrazovce hlavní plochou vedle věcí k vyřízení, na telefonu je časově řazená agenda. Široký postranní panel používá popisky vedle ikon.
**Proč:** původní celoplošné pole dílků a velká ukázka s rovnocennými pilulkami působily podle Kryštofa šablonovitě a překrývaly hierarchii obsahu.
**Důsledek:** pravidla a rozměry jsou v `DESIGN.md`, scéně `components/marketing/live-demo.tsx` a sdílené kostře `components/ws/app/`; produktová fakta a stavová pravidla R-057 se nemění.

### R-068 · Interaktivní pole a otevřenější Landing (2026-10-31)
**Rozhodnutí:** R-068 upřesňuje pouze Landing z R-067: v hero zůstává plná interaktivní mřížka Dílků v původních barvách; mohou ji doplnit jemné perspektivní, světelné a stavové pohyby. Odstranit dekorativní rámečky, které neukazují skutečné rozhraní. CTA pravdivě uvádí 14 dní zdarma, kartu při registraci, potom 249 Kč měsíčně a možnost zrušit.
**Proč:** Kryštof chce zachovat živý motiv a produktovou osobitost, ale omezit opakované AI šablonové panely. Přesvědčivý dojem má vycházet z konkrétních ukázek a jasných podmínek.
**Důsledek:** výjimka platí jen pro Landing; Workspace a barvy Dílků se nemění. Pohyb respektuje `prefers-reduced-motion`; bez nové závislosti. Podrobnosti v `docs/landing/PROJECT-BRIEF.md`.

### R-069 · Požadavky klientů z portálu, zadání vkládá člověk (2026-11-01)
**Rozhodnutí:** Kryštof schválil první krok většího nápadu: klient na stávajícím portálu `/p/[token]` (bez přihlášení) napíše nebo nadiktuje požadavek; systém z něj udělá shrnutí a návrh zadání pro Claude Code, upozorní Kryštofa (zvonek, e-mail) a ten zadání zkontroluje a vloží do projektu sám. Hlas se přepisuje přes OpenAI (výchozí `gpt-4o-transcribe`, název modelu v env), audio se neukládá, ukládá se jen text. Automatické spuštění Claude Code z klientova textu (Channels, Routines API) se nedělá. Odloženo a nerozhodnuto: přihlášený klientský prostor, automatické hlášení práce z Claude Code do systému, redesign adminu.
**Proč:** inbox s ručním vložením je nejbezpečnější varianta (text klienta je nedůvěryhodný vstup pro agenta s přístupem k počítači) a nejlevnější; hlas stojí asi 0,07–0,14 Kč za minutu podle agregátorů, ceník OpenAI jsem neověřil. Přihlášený prostor a hlášení z Claude Code potřebují samostatné rozhodnutí o umístění (rozšířit Workspace, nebo samostatný modul) a Workspace ještě nemá produkční Clerk, Stripe live ani ověřený Resend.
**Důsledek:** migrace 092 je připravená, neaplikovaná. Funkce běží na větvi `ws/redesign-app`, na produkci půjde až s jejím sloučením. Poskytovatel přepisu je zpracovatel osobních údajů: doplnit do právních textů a ověřit DPA a evropskou rezidenci. `.claude/security/DECISIONS.md` #018.

### R-070 · Klientský prostor, hlášení práce a nový admin: rozsah a rozhodnutí D-K1–D-K11 (2026-11-01)
**Rozhodnutí:** Kryštof zadal „implementuj veškeré kroky“ plánu `docs/klientsky-prostor/PLAN.md`; tím jsem přijal **doporučení z plánu** u všech D-K1–D-K11 (každé zvlášť nepotvrzoval, napravit lze kdykoli): D-K1 `/klient` s Clerkem a schématem `portal`; D-K2 `/p/[token]` zůstává jako čtení; D-K3 víc členů na klienta; D-K4 součást zakázky (zdarma); D-K5 hlášení se vždy schvalují (automatické publikování nezavedeno); D-K6 layout + Dnes + detail zakázky, Hub stranou; D-K7 úroveň 1 a 2, úroveň 3 ne; D-K8 soubory odloženy (KP08 nezačato); D-K9 práce na `ws/redesign-app`; D-K10 retence 3 roky (nezavedeno, patří do KP10); D-K11 firma klienta je `portal.clients`. Platí zásada: cokoli zvenku je koncept ke schválení, nic se nespustí ani nepublikuje samo.
**Proč:** zadání Kryštofa 2026-11-01; plán počítal s těmito doporučeními.
**Důsledek:** `docs/klientsky-prostor/PLAN.md` (stav sezení v sekci 6), R-071–R-073, `.claude/security/DECISIONS.md` #019–#020. Navazuje na R-069.

### R-071 · Kostra administrace na Dílky, obsah beze změny (2026-11-01)
**Rozhodnutí:** `/dashboard` a `/alteno` mají společnou kostru (`components/admin/admin-shell.tsx`): postranní menu, spodní lišta na telefonu, hledání ⌘K. Kostra používá barevné tokeny Dílků v samostatném rozsahu `data-app="admin"` (`app/admin-tokens.css`, bez přepsání proměnných shadcn); obsah stránek zůstává na původním vzhledu (Inter, `brand-*`) a přepíná se po stránkách. Hub si nechává vlastní postranní panel. `/dashboard` je nově Dnes, seznam zakázek je `/dashboard/zakazky` (obě firmy), detail zakázky má záložky. Starý `MobileNav` smazán.
**Proč:** zadání „admin je škaredý a roztříštěný“ (KP01/KP02) při minimálním riziku pro produkční admin: žádná stránka neztratila funkci, staré adresy fungují.
**Důsledek:** upřesňuje R-027 (admin se vzhledově mění jen v kostře). `docs/admin/AGENTS-ADMIN.md` → Kostra administrace. Nová stránka adminu = položka v `lib/admin-nav.ts`.
**Nepřevedeno:** změna stavu a fáze jedním klikem se „Zpět“ (`updateProject` posílá klientovi e-mail, „Zpět“ by ho poslal podruhé).

### R-072 · Aktivita zakázky a hlášení z Claude Code (2026-11-01)
**Rozhodnutí:** zprávy „co se udělalo“ jsou v `project_activity` (migrace 093) jako koncept → schválit → klient je vidí na `/p` i `/klient`. Souhrnný e-mail klientovi max. 1× za 24 h. Klíč projektu pro Claude Code (`project_agent_keys`, migrace 094, vlastní `AGENT_KEY_PEPPER`) umí jen uložit koncept; server zakrývá klíče, tokeny, connection stringy, `.env` řádky a cesty v domovské složce a takový koncept nejde schválit bez úpravy. Skript `scripts/zakaziq-report.mjs`, skill `zakaziq-hlaseni`, návod `docs/klientsky-prostor/NAPOJENI-CLAUDE-CODE.md`.
**Proč:** KP03/KP04; klíč leží v cizím projektu a může uniknout, proto nejmenší možná síla (DECISIONS #019).
**Důsledek:** hlášení dělá člověk po člověku schválením. Automatické publikování (D-K5) až po důvěře. Hook v návodu je jen připomenutí na konci sezení (`SessionEnd`); pole vstupu hooků jsem nečetl celá.

### R-073 · Klientský prostor: schéma portal, pozvánky, Clerk bez organizací (2026-11-01)
**Rozhodnutí:** `/klient` pro přihlášené klienty (Clerk, bez organizací), data ve schématu `portal` a role `portal_app` bez práv do `public` (migrace 095, 096; `scripts/portal-create-role.js`, `DATABASE_URL_PORTAL`). Do `portal` jde jen schválené triggerem (vybrané sloupce zakázky, aktivita `published`). Klient zapisuje požadavek, zprávu a hodnocení jen funkcemi `portal.submit_*` (členství, limity, zápis i do interních tabulek admina). Vstup přes jednorázovou pozvánku (HMAC hash, 14 dní, volitelně vázaná na ověřený e-mail, uplatnění tlačítkem). Hodnocení se nabídne samo, když je zakázka hotová nebo zaplacená (jednou na člena). Správa v adminu `/dashboard/klientsky-prostor`. Předání do Claude Code úroveň 2: tlačítko „Příkaz pro terminál“ (text v souboru přes heredoc, ne v `$(…)`; první verze s `$(…)` se při zkoušce v bash 3.2 dala zneužít řádkem `)"` v textu).
**Proč:** KP05–KP07, KP09; oddělení klientů nesmí záviset na jedné podmínce v kódu (DECISIONS #020).
**Důsledek:** `proxy.ts` má pro `/klient` a `/api/klient` vlastní Clerk middleware, CSP `workspace` s Clerkem i na `/klient` (CSP-LOG v6), `microphone=(self)` i na `/klient/*`. Odchylka od plánu: formulář požadavku v prostoru je společná komponenta `ClientRequestBlock` v původním vzhledu (`brand-*`), ne přepsaná do Dílků.

### R-074 · Zrušení účtu ke konci zaplaceného období (2026-11-01)
**Rozhodnutí:** (D5) po zrušení účtu doběhne předplatné do konce zaplaceného období (`cancel_at_period_end` ve Stripe, i během zkušební doby), nic se nevrací ani nedoplácí. Až předplatné skončí, účet se zavře (archivace byznysů) a teprve pak běží 30denní lhůta do výmazu. Nezaplacené předplatné (`past_due`, `unpaid`…) končí hned. Před koncem období jde zrušení vzít zpět („Nechat účet“), obnovení předplatného v Portalu naplánování zruší.
**Proč:** rozhodl Kryštof 2026-11-01 (doporučená varianta): zákazník nepřijde o zaplacené dny a odpadá spor o vrácení i poplatky za refundace.
**Důsledek:** migrace 097 (`accounts.close_scheduled_at`, `ws.schedule_close_account`, `unschedule_close_account`, `finish_scheduled_close`, `scheduled_closings`), dokončení z webhooku Stripe a záložně z cronu `ws-gdpr`. Customer Portal ve Stripe live nastavit na zrušení ke konci období. Upravuje R-054 bod 3. Reference B3 „Zrušení účtu“, `/podminky`.

### R-075 · Hlavní host www.zakaziq.cz (2026-11-01)
**Rozhodnutí:** (D1) hlavní adresa je `https://www.zakaziq.cz`, apex přesměrovává na www. `NEXT_PUBLIC_APP_URL`, webhooky Stripe a Clerku, canonical, sitemap a `security.txt` míří na www.
**Proč:** rozhodl Kryštof 2026-11-01; Stripe webhook nenásleduje přesměrování, Vercel už www používá.
**Důsledek:** `.env.example`, výchozí `SITE_URL`, kód widgetu na landing a `security.txt` přepnuté na www. `NEXT_PUBLIC_APP_URL` ve Vercelu Production se mění až s nasazením Workspace (dnes ho používá starý admin build).

### R-076 · Retence dat klientů: 3 roky od posledního pohybu dokončené zakázky (2026-11-01)
**Rozhodnutí:** (D-K10) dokončená zakázka (`done`/`paid`), na které se 3 roky nic nestalo (změna zakázky, aktivita, požadavek ani zpráva), přijde o aktivitu, požadavky (`client_requests`, `portal.requests`), zprávy a slovní hodnocení. Zakázka, cena, platby a číselné hodnocení zůstávají. Pozvánky do klientského prostoru se mažou 90 dní po použití, zrušení nebo vypršení. Rozpracované zakázky se nemažou. Žádost GDPR se řeší okamžitě ručně.
**Proč:** Kryštof 2026-11-01 odsouhlasil návrh („pojďme do toho“) k D-K10 z R-070. Lhůta od posledního pohybu chrání klienta, který se ke staré zakázce vrátí.
**Důsledek:** migrace 098 (`public.purge_client_retention`, jen vlastník tabulek), cron `/api/cron/client-retention` denně 3:30 UTC, `lib/client-retention.ts`, test `lib/__tests__/client-retention.test.ts`. Zmínit v právních textech (KP10).


### R-077 · Objednávací stránka jen po dokončené registraci (2026-11-03)
**Rozhodnutí:** `/r/[slug]` a widget podle slugu fungují jen pro účet, který aspoň jednou dokončil Stripe Checkout (má řádek ve `ws.subscriptions`). Po skončeném nebo nezaplaceném předplatném se poptávky přijímají dál (R-045, B5). Nedokončené registrace se nemažou (AGENTS.md: účty ani data se kvůli neplacení nemažou); případný úklid je samostatné rozhodnutí.
**Proč:** review před spuštěním 2026-11-03, opravu Kryštof zadal („oprav vše“). Účet s byznysem vzniká před Checkoutem (R-038). Kdokoli by tak dostal zdarma veřejnou objednávku na zakaziq.cz pod libovolným názvem firmy a poptávky skutečných lidí by nikdo nečetl.
**Důsledek:** migrace 099 (`ws.business_by_public_slug`), test v `ws-intake.test.ts`. Klíče webu (API, widget s klíčem) se nemění. Pozvaný klient (S17) má objednávací stránku až po dokončení Checkoutu. `.claude/security/STATE.md` → Aplikace.
### R-078 · Nadpisy landing page bez vzhledu AI šablony (2026-11-03)
**Rozhodnutí:** nadpis na landing page je jedna obyčejná věta jedním písmem (Instrument Sans). Nemá kurzívu Instrument Serif v druhé půlce ani štítek nebo číslo sekce nad sebou („01 — Proč to řešit“, „01 / 04“). Popisek „Ukázka“ je malým textovým písmem, ne verzálkami v JetBrains Mono. Hero zůstává „Každá poptávka na svém místě.“ (bez kurzívy). Nové nadpisy: „Den, kdy máte plné ruce.“, „Co vám zůstane po návštěvě.“, „Od objednávky po zaplacení.“, „Zapněte si jen to, co použijete.“, „Web vám postavím a rovnou napojím.“, „Všechny funkce za jednu cenu.“, „Než se zaregistrujete.“, „Máte ještě nějaký dotaz?“, v patičce „První poptávku můžete přijmout ještě dnes.“
**Proč:** Kryštof 2026-11-03 chtěl, aby landing nepůsobila jako vygenerovaná. Kontrola skillem `design-taste-frontend` našla kurzívu ve 12 nadpisech, 64 drobných štítků verzálkami a stejný vzorec „Věta. Druhá věta.“ v každé sekci.
**Důsledek:** upravuje R-021 (serifová kurzíva se na nadpisech landing page nepoužívá, ve Workspace zůstává) a R-031 (pořadí sekcí platí, čísla se nezobrazují). Mono jen pro časy, data a částky. `SectionHead` nemá `number`, `label` ani `accent`. Upraveno v `docs/landing/PROJECT-BRIEF.md`, `DESIGN.md` a `.impeccable/design.json`.

### R-079 · Právní texty připravil agent, schvaluje Kryštof (2026-11-03)
**Rozhodnutí:** obchodní podmínky, ochrana údajů a zpracovatelská smlouva (čl. 28 GDPR) jsou na webu v plném znění. Napsal je agent podle skutečného chování aplikace a zákona, na zadání Kryštofa („pojďme to vyřešit“). Provozovatel podle ARES: Kryštof Sobotka, Kamenice 64, 294 04 Dobšín, IČO 29977231, živnostenský úřad Magistrát města Mladá Boleslav, neplátce DPH. Volby, které agent zvolil a Kryštof 2026-11-03 potvrdil: služba jen pro podnikatele (ne spotřebitele); odpovědnost omezená na zaplacené za 12 měsíců (ne úmysl, hrubá nedbalost, přirozená práva); změna podmínek, ceny i odebrání funkce oznámení 30 dní předem; nový zpracovatel 14 dní předem s možností ukončit; porušení zabezpečení oznámit do 48 h; audit 1× ročně na náklady správce; ukončení služby z naší strany s výpovědí 3 měsíce a vrácením předplaceného; dotazy z kontaktního formuláře nejdéle 3 roky od poslední komunikace; ze záloh databáze data zmizí nejpozději do 30 dní (maximum historie Neonu).
**Proč:** blokovalo spuštění (LAUNCH-PLAN stopa A). Fakta ověřená v kódu (lhůta po nezaplacení 7 dní, zrušení R-074, výmaz R-054, IP u formuláře 1 den, otisk IP u poptávek, odhlášení v nabídkách) a v ARES; region Neonu podle záznamu RD00 (eu-central-1).
**Důsledek:** nahrazuje R-023 v části „právní texty se negenerují“. Údaje provozovatele a seznam zpracovatelů jen v `components/marketing/legal.ts` (patička, tři stránky, záznam o zpracování v Účtu); nový zpracovatel nebo změna chování = upravit text a `LEGAL_VERSION` a oznámit e-mailem. Souhlas s podmínkami pod tlačítkem „Pokračovat k platbě“. Stránky jsou indexované a v sitemapě (konec `LEGAL_ROBOTS` z R-055). Neon nesmí držet historii, snímky ani větve s produkčními daty déle než 30 dní, jinak upravit text. Kontrolu právníkem Kryštof nechce (2026-11-03), texty platí tak, jak jsou.

### R-080 · Řemeslné skilly třetích stran: co se vzalo, co ne a čím jsou omezené (2026-11-10)
**Rozhodnutí:** (1) `impeccable` zůstává v repu (4.8.2, engine 0.1.22) a synchronizuje se do `.agents/`. (2) Ostatní řemeslné skilly jsou **uživatelské** (`~/.claude/skills/`, `~/.agents/skills/`), nejsou součástí repa a nepřenesou se na jiný počítač ani do worktree; `design-taste-frontend` (tasteskill 2.5.1) tím z repa odešel. (3) Nainstalováno 9 skillů z `emilkowalski/skills` (pohyb, telefon, odolnost UI, sonner), 4 z `vercel-labs/agent-skills`, 5 z `affaan-m/ecc` a `grill-me` + `grilling` z `mattpocock/skills`. (4) Žádný z nich nepřebíjí pravidla projektu; kdy co a čím je to omezené je v referenci → Skills. (5) tasteskill má ze `SKILL.md` odstraněný Stop hook, gate (`scripts/gate.mjs`) se pouští ručně.
**Proč:** Kryštof 2026-11-10 vybral „vybraná sada + pár z ECC“, „upgrady v repu, nové uživatelsky“ a „bez Stop hooku“. 37 MB assetů tasteskill by se synchronizací do `.agents/` zdvojilo a zůstalo natrvalo v git historii, a jeho hlavní hodnota je stavba nových webů (weby klientů), ne hotová landing page ZakazIQ s Dílky. Harness `affaan-m/ecc` (314 skillů, 71 agentů, 98 příkazů, 7 hooků, vlastní `CLAUDE.md` a `AGENTS.md`) se nebral celý: šel by do křížku s R-013, R-046 a R-047 a popisky všech skillů se načítají do každého sezení. Stop hook tasteskill by pouštěl Node a Chrome po každém zastavení (timeout 600 s) i v sezeních, kde se landing neřeší.
**Důsledek:** záměrně **nenainstalováno** — `deploy-to-vercel` a `vercel-cli-with-tokens` (deploy jen se souhlasem, B12), `writing-guidelines` a `copy-lint` tasteskill jako pravidlo (pravidla anglické prózy; na české texty platí `zakaziq-ux-texty-cs` a `humanize-text-cs`), `conventional-commit-review` (commity jsou `ws/oblast: …`, R-015), `architecture-decision-records` a `design-system` z ECC (rozhodnutí patří do `memory/memory.md` jako `R-xxx`, vzhled do `DESIGN.md` a Dílků), `security-review` z ECC (překrývá B13 a `web-security-review`), `react-performance` z ECC (je to kopie `react-best-practices`), `animate-expo`, `write-swift`, `react-native-skills`, `react-view-transitions`. `e2e-testing` **není** schválení Playwrightu — nová závislost potřebuje vlastní rozhodnutí. Po reinstalaci počítače je nutné uživatelské skilly nainstalovat znovu. Zdroje: `leonxlnx/taste-skill`, `emilkowalski/skills`, `vercel-labs/agent-skills`, `affaan-m/ecc`, `mattpocock/skills` (MIT), `pbakaus/impeccable` (Apache-2.0).

### R-081 · Dílky jsou vizuální systém i v admin konzoli (2026-11-10)
**Rozhodnutí:** design systém Dílky platí pro celé repo včetně admin konzole (VIZEON, ALTENO, Hub). Paleta Dílků se přesouvá na `:root` (nový `app/tokens-dilky.css`), Inter z Google Fonts se ruší, admin dědí Instrument Sans a `components/ui/*` se v adminu odemkne (`PortalContainerProvider`, shadcn proměnné v rozsahu `[data-app="admin"]`). Admin **nemá** tmavý režim. Rozsah: mechanické sjednocení všude (`brand-*` → `navy-*`, odznaky, rádiusy, písmo) + ruční překreslení denně používaných obrazovek. Hub je v rozsahu.
**Proč:** Kryštof 2026-11-10: „je to moc retro, škaredé CRM oproti tomu SaaS, nechci se za to stydět." Dva vizuální systémy v jednom repu zdražují každou změnu. Hodnoty `brand-50…950` jsou shodné s `--navy-*` ve všech 11 odstínech (ověřeno), takže přejmenování je opticky neutrální.
**Důsledek:** **přepisuje R-027** („admin se nesmí změnit ani o pixel") a **rozšiřuje R-071** (dosud jen kostra). Ruší zákaz v `DESIGN.md` i obě výjimky `inter` v `.impeccable/config.json`. Past: `navy-*` je `var(--navy-…)` jen v `[data-app]`, zatímco `brand-*` je pevný hex — bez palety v `:root` by přejmenování rozbilo barvy klientům v portálu `/p`, `/h` (importuje `StatusBadge`, `FeedbackBlock`, `SurveyForm`, `BookingCTA`, `ClientRequestBlock`). Plán: `docs/admin/MODERNIZACE-ADMIN-PLAN.md` sekce 4.

### R-082 · Modernizace adminu paralelně se spuštěním Workspace (2026-11-10)
**Rozhodnutí:** admin se modernizuje na vlastní větvi `admin/modernizace` a **neblokuje** spuštění Workspace. Rozfázováno do sezení AD00–AD18 (`docs/admin/MODERNIZACE-ADMIN-PLAN.md`, prompty `new - area of zakaziq/prompty/admin/`). Migrace se jen připraví, aplikuje je Kryštof, číslování od 100. Žádný nový npm balíček. Testovací data: admin migrace na testovací Neon + `scripts/admin-seed.mjs` po vzoru `ws-seed.mjs`.
**Proč:** Kryštof 2026-11-10 vybral „paralelně"; zbývající kroky launche jsou hlavně na jeho straně (Stripe live, Google OAuth, migrace 097–099, Vercel Pro).
**Důsledek:** **otevřené:** nová kostra adminu (R-071) leží jen na `ws/redesign-app` (92 commitů před `main`, opačně 0 → sloučení je fast-forward), takže admin se na produkci dostane až s jejím sloučením. Varianty a doporučení jsou v plánu, sekce 8 (otázka A) — rozhodnutí o nasazení Kryštof ještě neudělal. Soubory `app/globals.css`, `tailwind.config.ts`, `next.config.mjs`, `lib/security/csp.ts` a `app/layout.tsx` mění jen admin větev, Workspace si je bere rebasem.

### R-083 · Faktury se budou vystavovat v adminu (2026-11-10)
**Rozhodnutí:** admin bude faktury vystavovat, ne jen archivovat cizí PDF. Rozšíří se tabulka `invoices` (`kind` s `DEFAULT 'archived'`, `items jsonb`, `issuer jsonb`), ne nová evidence; číslo přidělí atomická funkce `admin_invoice_issue` se zámkem po vzoru `ws.money_issue`; profil dodavatele v `admin_settings`, na dokladu snímek. PDF se **sdílí** s Workspace (`lib/invoice-pdf/render.ts` vytažený z `lib/ws/money/pdf.ts`), QR přes už přítomný `qrcode`. Archiv cizích PDF a dnešní `syncInvoiceTransaction` zůstávají funkční.
**Proč:** Kryštof 2026-11-10: „zjednodušit fakturaci, nemuset furt něco opisovat." Dnes dělá fakturu v jiném nástroji a do adminu nahrává PDF; číslo, splatnost, IČO a odběratel vypisuje ručně u každé faktury znovu, IČO/DIČ klienta v DB vůbec není.
**Důsledek:** migrace 103 a 104; `DEFAULT 'archived'` nechá každý existující řádek archivem, takže dnešní obrazovky se nemění. Opraví se i to, že **EUR faktura se v ledgeru sčítá s korunami** (`finance_transactions` bez `currency`). Vědomě se nechává: `updateProject` přepisující `declared`, dvě sady daňových sazeb, `pdf_data bytea` v řádku. ARES lookup potřebuje vlastní rozhodnutí (R-086 v AD12).

### R-084 · AI v adminu navrhuje, člověk potvrzuje; kontakt odkazy, ne VoIP (2026-11-10)
**Rozhodnutí:** (1) AI asistent z věty udělá **strukturovaný návrh akce** (Zod + `messages.parse`, ne tools), uloží ho jako koncept do `ai_suggestions` a provede ho až server action po kliknutí; nikdy nezapíše, neodešle ani nesmaže nic sám. (2) Modely na jednom místě (`lib/ai/models.ts`): haiku na odvozování a čtení PDF **místo dnešního `claude-opus-5`** (~50× dražší na tutéž práci), sonnet na asistenta. (3) Kontakt jedním klikem přes `tel:`, `mailto:`, `sms:` a WhatsApp + šablony zpráv, které plní odkaz a neposílají samy. **VoIP se nedělá.**
**Proč:** Kryštof 2026-11-10 vybral „navrhne, potvrdím klikem" a „jedním klikem přes telefon/Mac". Text od klienta je nedůvěryhodný vstup (R-069), takže AI nesmí konat; strukturovaný výstup navíc obchází to, že vynucené `tool_choice` na opus-5-5 a sonnet-5-5 vrací 400.
**Důsledek:** migrace 105. Povinná součást: oprava `app/api/ai-assistant/route.ts`, který dnes přijímá `systemPrompt` i `messages` z prohlížeče bez validace (jediná ochrana je přihlášení) — zápis do `.claude/security/`. Seznam „co asistent nesmí" je v plánu, sekce 5 (AD14).

### R-085 · Paměť projektu: předvyplnění z historie a AI shrnutí odděleně (2026-11-10)
**Rozhodnutí:** dvě oddělené vrstvy. (1) **Deterministické předvyplnění** (`lib/admin/memory/facts.ts`) — čistě SQL nad historií, bez AI, nikdy se neukládá jako text; **jen tohle plní formuláře.** (2) **AI shrnutí kontextu** (`project_memory`, scope projekt/kontakt/globální) — zapisuje se na kliknutí, nebo cronem jako „Návrh paměti" s `confirmed_by IS NULL`; nepotvrzené je označené a vyprší za 90 dnů. Do paměti se nesmí dostat klíče ani connection stringy — každý text projde `redact()` z `lib/project-activity.ts`.
**Proč:** Kryštof 2026-11-10 vybral „paměť + shrnutí od AI". Do předvyplněného pole ale nesmí vstoupit text, který napsal model — jinak by se vymyšlený údaj tvářil jako historický fakt (B10).
**Důsledek:** migrace 105 společně s R-084. Retence 3 roky od posledního pohybu podle R-076, smazání kontaktu maže i jeho paměť (`ref_id` je polymorfní, FK to neudělá), řádky paměti patří do exportu údajů.

### R-087 · Hub se ruší, admin má jednu navigaci (2026-11-10)
**Rozhodnutí:** `/hub` zaniká. Finance a daně, Projekty a Startup se přesouvají do hlavní navigace (`/dashboard/finance`, `/dashboard/projekty`, `/dashboard/startup`), `/hub/*` trvale přesměrovává. Admin má jedno menu se čtyřmi skupinami: Přehled, Práce, Peníze, Osobní. `components/HubSidebarNav.tsx`, `app/hub/layout.tsx` i `app/hub/page.tsx` se mažou; maže se i mrtvé `app/dashboard/projekty/**` (559 ř., duplikát po R-007). Dnes dostane sloupec „Jak se daří tenhle měsíc" z existujících `getBusinessIncome`, `calculateTax` a `getInvoices`.
**Proč:** Kryštof 2026-11-10 večer: „pro celou appku platí jeden přehled". Dvě navigace a tři layouty znamenaly dva světy a žádné společné číslo. Zrušený Hub se navíc nemusí překreslovat do Dílků, takže to ubírá práci v AD05 i AD17.
**Důsledek:** **mění R-081** v části „Hub je v rozsahu modernizace" — modernizuje se celý admin, ale Hub se místo překreslení ruší. Provádí AD03; plán `docs/admin/MODERNIZACE-ADMIN-PLAN.md`.
**Provedeno 2026-11-11 (AD03), se třemi upřesněními:** (1) kalkulačka **Výkonnost podnikání** z `/hub/byznys` se nemazala, přesunula se do Finance › Podnikání — rozcestník s dlaždicemi byl duplicitní s menu, ale kalkulačka počítá z reálných dat. (2) **Kontakty v menu zatím nejsou**: obrazovku staví AD09 a menu nemá slibovat, co neexistuje; Dokončené a Hodnocení v Práci zůstávají do AD11/AD16 (R-090). (3) Skupin je nakonec **pět** (SaaS část Klienti zůstala zvlášť) a na spodní liště telefonu je místo Požadavků klientů hlavní inbox **Poptávky z webů**.

### R-088 · Alteno není byznys, ale zdroj poptávky (2026-11-10)
**Rozhodnutí:** VIZEON a ALTENO přestávají být dva byznysy. Zůstává jeden byznys se třemi zdroji poptávek: **vizeon.cz, alteno.cz, prvotka.cz** (estetik.cz má být jeden řádek konfigurace). Sloupec `business` se **přejmenuje na `lead_origin`** (nezahazuje se — ruční zakázka z `/alteno` má `source='manual'` a informace o původu je jen tam). Funkce `is_vizeon_pending()` a `is_alteno_pending()` nahradí generovaný sloupec `lead_pending`. Sekce `/alteno/**` zaniká a přesměrovává; `lib/business.ts` se mění na `lib/lead-origins.ts`. Veřejná API `/api/public/booking/alteno` a `/api/public/alteno-leads`, jejich payload i klíče `ALTENO_API_KEY` a `ALTENO_LEAD_WEBHOOK_SECRET` **zůstávají beze změny** — volá je cizí repozitář.
**Proč:** Kryštof 2026-11-10: „Alteno neruším, poptávka furt přijít může, jen to chci dát jako součást Vizeonu." Kryštof dnes dělá weby, e-shopy, design i automatizace — je to jeden byznys. Dvojí model stál sedm míst s natvrdo zapsaným `business: 'vizeon'` (tabulky `completed_projects`, `project_surveys` a `client_leads` sloupec nikdy neměly) a ALTENO zakázky kvůli němu neměly fakturaci ani dokončení.
**Důsledek:** **mění R-008.** Staré ALTENO zakázky získají fakturaci, dokončení i poznámky schůzek; historická ALTENO data se objeví v kalendáři a Hovorech, odkud byla dosud filtrovaná. Rate limit zůstává per zdroj. Migrace 102, provádí AD02.
**Provedeno 2026-11-11 (AD02), s dvěma upřesněními:** (1) místo slití `alteno_confirmed` do `vizeon_confirmed` vznikl **jeden nový příznak** `lead_confirmed` + `lead_confirmed_at`; staré příznaky zůstávají a drží je v souladu trigger, takže se zahodí samostatnou migrací až po provozu. (2) Přejmenování sloupce je nekompatibilní se starým buildem adminu, proto se **migrace 102 aplikuje na produkci jen spolu s nasazením větve** `admin/modernizace`, ne dřív. Názvy env proměnných s klíči jsou v `LEAD_ORIGIN_KEYS` odděleně od `LEAD_ORIGINS`, protože ten se importuje i do klientských komponent.

### R-089 · Škola, Sport a zdraví, Plány a Šablony webu se mažou (2026-11-10)
**Rozhodnutí:** z adminu mizí celé sekce Škola (`/hub/school`), Sport a zdraví (`/hub/sport`), Plány (`/hub/plany`) a Šablony webu (knihovna i bloky u zakázek) — kód i **tabulky**: 23 tabulek `school_*`, `nutrition_logs`, `workout_logs`, `health_scores`, `weight_logs`, `plan_*`, `plans_legacy_archived` (migrace 100) a `project_blocks` + `block_templates` (migrace 101). Odchází i cron `scrape-school`, `lib/lernsax.ts`, `lib/besteschule.ts` a `lib/fatsecret.ts`. **Před spuštěním migrací se obsah vyexportuje do CSV mimo repo.**
**Upřesněno 2026-11-11 (AD01):** závislost `@dnd-kit/*` **zůstává** — používá ji `components/ws/settings/sortable-list.tsx` (pořadí služeb, stavů, kolonek a pracovníků v Nastavení Workspace, R-054). Odstranění by rozbilo Workspace.
**Proč:** Kryštof 2026-11-10: „to už nemá absolutně žádný smysl". Nepoužívané moduly by jinak v AD04 vstoupily do codemodu přes 143 souborů a v AD17 do překreslování.
**Důsledek:** `puppeteer-core` a `@sparticuz/chromium` **zůstávají** — scraper školy byl jejich jediný dnešní konzument, ale PDF faktur v AD12 je potřebuje. `DROP TABLE` je jediná nevratná věc celého plánu, proto až po potvrzeném exportu. Provádí AD01.

### R-090 · Dokončené se slučují do zakázky, hodnocení chodí samo (2026-11-10)
**Rozhodnutí:** zakázka ve stavu `done` nebo `paid` **je** dokončená. `completed_projects` (dnes plná kopie zakázky s vlastní cenou) se přejmenuje na `completed_projects_archiv`, hodnocení se přepojí na `project_id`, zakázka dostane `closed_at` a `project_type`. Stránky Dokončené a Hodnocení mizí z menu — obojí je v zakázce a na kartě kontaktu. Dotazník odejde **automaticky** při uzavření zakázky, jedna připomínka po sedmi dnech, pak už nic; z hodnocení se souhlasem jde jedním klikem vzít text reference pro web (ke zkopírování, ne automatická publikace). Přibývá **předávací dokument** pro klienta („co bylo dodané") generovaný stejnou cestou jako PDF faktury.
**Proč:** Kryštof 2026-11-10. `createCompletedProject` umí založit příjem znovu nezávisle na zakázce — odtud riziko dvojího započtení; Dokončené a Hodnocení přitom čtou týž dataset a liší se jen filtrem. Dotazník se dnes posílá jen při ručním kliknutí a při nereagujícím klientovi se odkaz kopíruje ručně.
**Důsledek:** migrace 106 a 110. **Součet příjmů za 2026 a 2025 musí po migraci sedět na korunu**, jinak se migrace vrací; `completed_projects_archiv` se nemaže, dokud to neplatí. Odpadá dluh z `AGENTS-ADMIN.md:355` (změna stavu jedním klikem) — e-mail klientovi jde přes `after()` s 60s odkladem a „Zpět" ho zruší. Provádí AD11 a AD16.

### R-091 · Tón odznaku nese naléhavost, ne druh (2026-11-11)
**Rozhodnutí:** admin má pět tónů odznaků (`lib/admin-status.ts`): `neutral` (nic se neděje, kategorie), `info` (běží), `signal` (čeká na vás), `success` (uzavřeno), `danger` (konec bez výsledku). Vykresluje je `components/ui/badge.tsx`. Stav zakázky: `new` a `review` = `signal`, `in_progress` a `done` = `info`, `paid` = `success`. **Kategorie** (typ akce v Hovorech, druh změny, oblast života, kategorie nákladu, zdroj daňové novinky) jsou vždy `neutral`. Škála (náročnost 1–10) roste tmavostí, ne odstínem. Obrazovka si vlastní barvu odznaku nedefinuje.
**Proč:** pět stavů zakázky se na pět tónů 1:1 namapovat nedá, takže tón musí znamenat něco obecnějšího než konkrétní stav. Deset vlastních palet ve 40 kombinacích znamenalo, že stejný odstín říkal na dvou obrazovkách něco jiného, a barvy u kategorií z nich dělaly stavy, kterými nejsou. Dílky mají jednu paletu a jedinou teplou barvu (`signal`) vyhrazenou pro „čeká na vás“.
**Důsledek:** nový stav = řádek v `lib/admin-status.ts`, ne nová třída v komponentě. Ztratilo se rozlišení „hotovo“ × „běží“ barvou (rozlišuje je popisek) — kdyby to vadilo, přidá se šestý tón, ne vlastní paleta. Barvy událostí ve `SmartCalendar` (`CHANNEL_COLORS`, `KIND_COLORS`) stojí mimo: nejsou to odznaky stavu, řeší je AD08. `docs/admin/AGENTS-ADMIN.md` → Kostra administrace.


### R-092 · Admin čte z databáze v dávkách; kolo = požadavek, ne dotaz (2026-11-11)
**Rozhodnutí:** obrazovky adminu čtou přes `lib/admin/db.ts` — `adminDb.batch([...])` pošle víc
dotazů jedním požadavkem (Neon HTTP transakce). `lib/db.ts` zůstává pro zápisy a zhruba padesát
starších souborů; **nové a přepisované čtení jde přes `adminDb`**. Chybějící tabulku snese
`batchTolerant` (transakce padá celá, tak se dotazy zkusí jednotlivě). Měřítko rychlosti je
od teď **počet požadavků**, ne počet dotazů: osm dotazů v jedné dávce je po síti jedno volání.
`pg_trgm` a trigramové indexy v migraci 103 se zakládají dřív, než je kdo použije (hledání
v databázi staví AD07).
**Proč:** admin byl jediná datová vrstva v repu bez dávkování — `lib/ws/db.ts`, `lib/ws/admin/db.ts`
i `lib/portal/db.ts` ji mají. Každý dotaz byl samostatný HTTPS požadavek, takže detail zakázky
stál dvanáct cest tam a zpět v pěti vlnách za sebou. Počítat dotazy by po dávkování mátlo:
číslo by kleslo, i kdyby se nic nezrychlilo, nebo naopak.
**Důsledek:** `docs/admin/AGENTS-ADMIN.md` → „Jak admin čte z databáze"; strop drží
`lib/__tests__/admin-db-rounds.test.ts`, naměřené hodnoty plán modernizace sekce 11. Čísla kol
z AD00 nejsou s pozdějšími přímo porovnatelná. Nezaměňovat `lib/admin/db.ts` (tabulky adminu
ve schématu `public`) s `lib/ws/admin/db.ts` (admin nad schématem `ws`, R-052).

### R-093 · Kalendář čte okno, zobrazení zůstává v prohlížeči (2026-11-12)
**Rozhodnutí:** `/dashboard/calendar` stáhne jen **měsíc kotvy ± 7 dní** (`windowFor`); proklik mimo
načtené okno dotáhne server action `loadCalendarMonth` a `replaceRange` vymění, co do okna padá.
Rozsah si počítá server z kotvy `'YYYY-MM-DD'`, nikdy nepřijde z prohlížeče. Který měsíc a jaké
zobrazení je vidět, zůstává ve **stavu komponenty**, ne v adrese. Dotazy nad `timestamptz`
porovnávají okamžiky (`starts_at >= $1`), ne `AT TIME ZONE … ::date`. Vykreslování počítá v pražské
zóně nad `'YYYY-MM-DD'` a minutách (`pragueDayOf`, `pragueMinutesOf`, `isoWeekday`), ne nad `Date`.
**Proč:** do prohlížeče šla celá historie `calendar_events`, `consultation_slots`, deadlinů
a plánovaných hovorů a objem rostl s délkou provozu (tři roky dat = 4 380 řádků, okno 176).
Stav v adrese — jak to po AD07 má zbytek adminu — by při každém kroku o měsíc problikl
kostlivcem z `loading.tsx`, protože změna searchParams je navigace. `AT TIME ZONE` v podmínce
zahodí index z migrace 103. `getHours()` zahazuje minuty i zónu (jedna ze tří chyb z AD08).
**Důsledek:** nový dotaz kalendáře **musí** mít podmínku okna, hlídá to `admin-bundle-guard.test.ts`.
Zobrazený měsíc nejde poslat odkazem (dřív to taky nešlo). Kdyby byl stav v adrese potřeba,
musí se nejdřív vyřešit kostlivec. `docs/admin/AGENTS-ADMIN.md` → `/dashboard/calendar`.

### R-094 · `next/dynamic` v adminu ne, Framer Motion líně přes `LazyMotion` (2026-11-12)
**Rozhodnutí:** admin animuje výhradně přes `m` a balíček Framer Motion se načítá líně
z `AdminRoot` (`LazyMotion` + `lib/admin/motion-features.ts`), stejně jako Workspace od RD03.
`next/dynamic` se **nepoužívá**. Výjimka z `m` je `BookingModal` na portálu `/p`, který kořen
adminu nemá.
**Proč:** plán AD08 chtěl `next/dynamic` na šest míst. Zkusil jsem to a změřil: nic to neušetřilo,
protože komponenta se vykresluje na serveru a její chunk zůstane v HTML — na Financích to
přidalo 1,4 kB. `LazyMotion` naopak sebrala 28,3 kB z Hovorů a 28,4 kB z Kalendáře (jen tyhle
dvě trasy balíček nesly), za cenu +0,4 kB na ostatních.
**Důsledek:** `components/admin/__tests__/admin-bundle-guard.test.ts` zakazuje `motion` mimo
zapsané výjimky a hlídá, že `loadMotionFeatures` zůstane u `domAnimation` (`domMax` by balíček
zdvojnásobil). Kdo bude chtít `next/dynamic` znovu, musí přinést měření — a kontrolu, že žádný
skript z HTML na disku nechybí (bez ní vyšlo první měření falešně o 18–27 % lépe).

### R-095 · Sloučení kontaktů nepřesměrovává, jen ukazuje kam patří (2026-11-12)
**Rozhodnutí:** sloučení dvou kontaktů nastaví `contacts.merged_into` a **nic víc** — `contact_id`
v zakázkách, hovorech, dokončených, konzultacích a poptávkách zůstává, kde je. Čtení vede na cíl
přes `COALESCE(merged_into, id)` a dotazy počítají s *rodinou* kontaktu (on sám + co je do něj
sloučené). „Zpět" je smazání té jedné hodnoty. Řetěz je vždy plochý (A → B, nikdy A → B → C) —
kdo slučuje do už sloučeného kontaktu, dostane jeho kořen; drží to trigger `contacts_before_write`.
Unique na telefon a e-mail je **částečný** (`WHERE merged_into IS NULL`), takže sloučený kontakt
své údaje uvolní.
**Proč:** zadání AD09 chtělo obojí — „přesměruje `contact_id`" a „Zpět = smazat `merged_into`
(nic se nemazalo, takže sloučení nepotřebuje zálohu)". To dohromady nejde: po přesměrování by
smazání `merged_into` sloučení nevrátilo a bylo by potřeba evidovat, které řádky se přesměrovaly.
Vyhrála reverzibilita — spojení dvou lidí do jednoho je omyl, který se pozná až později, a vrátit
ho musí jít beze zbytku.
**Důsledek:** hotové dotazy jsou v `lib/admin/contacts.ts`, nové čtení kontaktu musí počítat
s rodinou, ne jen s `contact_id = $1`. Odchylka od plánu, zapsaná i v `docs/admin/MODERNIZACE-ADMIN-PLAN.md`
→ AD09. Fyzické přesměrování se nikdy nedělá; kdyby bylo potřeba (výkon při tisících sloučení),
je to samostatné rozhodnutí včetně toho, čím se nahradí „Zpět".


### R-096 · Rezervace se zrcadlí do Hovorů, Hovory nečtou kalendář (2026-11-12)
**Rozhodnutí:** rezervace z portálu dostane v téže transakci **kalendářní událost a zrcadlený
kontakt v `client_leads`** — stejnou dvojici, jakou od migrace 051 zakládá ruční termín. Dotaz
Hovorů se nemění a `calendar_events` nečte. Dvojice má obě strany
(`consultation_slots.calendar_event_id` i `calendar_events.consultation_slot_id`) a křížový
překryvový guard z migrace 044 ji pozná podle odkazu na vkládaném řádku. V kalendáři se dvojník
vynechává v TypeScriptu podle zakázky a okamžiku, ne podmínkou nad novým sloupcem. Blokace se
do Hovorů dál nezrcadlí.
**Proč:** zadání AD10 chtělo „rozšířit dotaz Hovorů, aby četl `calendar_events` podle typu".
Hovory jsou ale po AD07 sdílená tabulka s řazením, stránkováním, poznámkami a akcemi nad
`client_leads`; druhý druh řádku by to všechno musel umět taky. Zrcadlení naopak nestojí nic
navíc a drží jediné pravidlo (R-010). Obě strany dvojice musí existovat proto, že guard
rozhoduje **v okamžiku vkládání události**, kdy rezervace ještě na nic neukazuje — odkaz proto
nese vkládaný řádek. Dvojník se zahazuje v TypeScriptu, aby kalendář fungoval i na databázi
bez migrace 105 (aplikuje ji Kryštof, může to být až po nasazení větve).
**Důsledek:** nová časová tabulka v adminu se zrcadlí přes `calendar_events`, ne přidáním
dalšího druhu řádku do Hovorů. Kdo bude chtít v Hovorech i blokace, musí nejdřív rozhodnout,
co s tím, že blokace je soukromá nedostupnost bez kontaktu (AD08). `docs/admin/AGENTS-ADMIN.md`
→ `consultation_slots` a `calendar_events`; plán modernizace → AD10.

### R-086 · Odběratel z ARES: ověřený endpoint, překlep se do sítě nedostane (2026-11-12)
**Rozhodnutí:** `lib/ares.ts` se ptá **ze serveru** na
`https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/{ico}` (ověřeno živým
požadavkem 2026-11-12, ne odhadnuto) a bere z odpovědi jen jméno, adresu sídla a DIČ. IČO se
nejdřív ověří kontrolní číslicí mod 11, takže překlep neodejde do sítě; `redirect: 'error'`,
timeout 3 s, odpověď přes Zod se stropy délek, výsledek 24 h v paměti procesu (nedostupnost se
nepamatuje), nikdy se nevykresluje jako HTML. **Selhání nikdy neblokuje vystavení faktury** —
uživatel odběratele vyplní ručně. CSP se nemění, protože prohlížeč na ares.gov.cz nesahá.
**Proč:** jediná nová vnější závislost celé modernizace adminu (plán AD12). Bez ní se IČO, jméno
a adresa opisují do každé faktury znovu.
**Důsledek:** `.claude/security/DECISIONS.md` #023, test `lib/__tests__/ares.test.ts`. Kdyby se
odpovědi měly ukládat do databáze, je to nové rozhodnutí (firemní údaje v cizí tabulce).
### R-097 · Dokončenost je stav zakázky; odklad e-mailu místo zámku v paměti (2026-11-12)
**Rozhodnutí:** zakázka ve stavu `done`/`paid` s `closed_at` **je** dokončená; `completed_projects`
se přejmenovala na `completed_projects_archiv` a nečte se z ní. Pět odchylek od zadání AD11:
(1) **Osobní projekty z Dokončených se převádějí na zakázky** s `project_type='personal'`
a ve výpisu je schovává výchozí filtr „Pro klienty" (rozhodl Kryštof) — jinak by z aplikace
zmizely i s příjmem a hodnocením. (2) **Přehled výkonnosti a souhrn hodnocení jsou na
`/dashboard/profil`**, ne na Dnes (rozhodl Kryštof). (3) **Odklad e-mailu u změny stavu je 15 s,
ne 60 s**, a „Zpět" ho ruší tím, že se stav před odesláním přečte z databáze znovu. (4) Hodnoty
`project_type` jsou `client`/`personal`, ne `client`/`vlastni` z plánu. (5) Karta kontaktu přišla
o řádek „Dokončená práce".
**Proč:** Dnes má zůstat „co dnes udělat" a od AD03 už jeden blok čísel má; Profil je obrazovka
čísel a sám Dokončené četl. Příznak v paměti by „Zpět" neuhlídal — undo může doletět na jinou
instanci funkce, sdílenou paměť mezi nimi nemáme, ale databázi ano; a minuta spícího `after()`
je na Hobby plánu na hraně limitu doby běhu. Hodnoty `client`/`personal` už v archivu leží
a jsou v `lib/types.ts`. Kontakt by po slití ukazoval tytéž zakázky dvakrát.
**Důsledek:** `app/closed-actions.ts` nahradil `app/completed-actions.ts`; nová cesta, která by
uměla založit druhý příjem k téže zakázce, neexistuje a hlídá to test
(`lib/__tests__/admin-pruvodka.test.ts` → „příjem ke stejné zakázce může vzniknout jen jednou").
**Migrace 106 je jako 102 nekompatibilní se starým buildem** — pořadí je nasadit větev, pak 102,
pak 106; a **103 musí jít před 106**, protože zakládá index nad `completed_projects`.
`docs/admin/AGENTS-ADMIN.md` → „Zakázka je jediná pravda (AD11)" a „Průvodka zakázky (AD11)".

### R-098 · Vystavená faktura je neměnná, číslo `YYYYNNN`, PDF se nevyrábí dopředu (2026-11-12)
**Rozhodnutí:** (1) Doklad vystavený v adminu pozná databáze podle `number_seq IS NOT NULL`;
trigger `admin_invoice_locked` (migrace 107) na něm odmítne změnu čísla, částky, DPH, měny, dat,
položek, dodavatele i odběratele a nedovolí vzít zpět storno. Měnit jde zaplacení, storno,
poznámku, odeslání a vazby. Oprava = storno a nová faktura, číslo se nerecykluje. (2) Číslo má
formát **`YYYYNNN`** (`2026001`), ne `YYYY-NNNNNN` — variabilní symbol smí být jen z číslic a
nejvýš deset znaků, takže tohle jde do VS přímo (Workspace si kvůli pomlčce musí nečíslice
odstraňovat). 999 faktur ročně stačí. (3) Částku a DPH počítá `admin_invoice_issue` z položek
a poslanou hodnotu jen ověří (`admin_invoice_amount_mismatch`), aby se do daňového základu
nedostalo číslo z prohlížeče. (4) **PDF se neukládá** — vyrábí se při otevření z položek
a snímku dodavatele; opakované otevření drží ETag z obsahu dokladu, takže Chromium neběží
zbytečně. (5) Vystavení **nezakládá příjem**; ten vzniká až zaplacením přes nezměněnou
`syncInvoiceTransaction` (R-011, hotovostní princip). (6) Archiv cizích PDF, AI přepis
a `/api/public/invoices` se nemění: všechny staré řádky jsou `direction='issued'`,
`number_seq IS NULL` a trigger se jich netýká.
**Proč:** AD12. Vystavenou fakturu dnes přepíše cokoli — formulář archivu i AI přepis z PDF;
doklad, který odešel klientovi, se ale opravuje stornem. Kontrola v aplikaci nestačí (migrace 046
přidala UNIQUE právě proto, že kontrola v kódu byla TOCTOU).
**Důsledek:** `.claude/security/DECISIONS.md` #024, `docs/admin/AGENTS-ADMIN.md` → Fakturace,
testy `lib/__tests__/admin-fakturace.test.ts`. Upřesňuje R-083 (tam ještě `kind`, `YYYY-NNNNNN`
a migrace 103/104 — platí tenhle zápis). Admin běží rolí vlastníka tabulek, takže si trigger může
vypnout; je to pojistka proti omylu, ne proti záměru.

### R-099 · Index proti dvojímu příjmu jen na zakázku; migrace na duplicitách nepadá (2026-11-13)
**Rozhodnutí:** šest odchylek od zadání AD13.
(1) Migrace má číslo **109** (prompt psal 104, to zabraly Kontakty), takže **AD14/AD15 jdou
na 110 a AD16 na 111**.
(2) Částečný unikátní index proti dvojímu příjmu platí **jen pro `income_origin = 'project'`**
(zakázka si zapíše nejvýš jeden zálohový a jeden doplatkový příjem) a vedle něj stojí index
„jeden příjem na doklad". Příjmů z faktur se netýká.
(3) `CREATE UNIQUE INDEX` běží v `DO` bloku, který `unique_violation` odchytí a vypíše `WARNING`;
migrace na existujících duplicitách **nepadá**.
(4) Převzetí příjmu zůstává automatické, ale jen když je **jednoznačné** (jeden kandidát, stejná
částka i měna). Jinak se zeptá člověka.
(5) Konstanta sloupců se jmenuje `invoiceColumns(L)`, ne `invoiceSelect`.
(6) Opakované náklady nemají nový cron, volá je týž denní `send-reminders`.
**Proč:** (2) Zadání chtělo index přes **všechny** příjmy zakázky. To by zablokovalo zakázku
fakturovanou po etapách: druhá zaplacená faktura by si nemohla zapsat příjem a peníze by
v ledgeru **chyběly** — horší chyba než ta, kterou index řeší. Dvojí započtení u faktur řeší
vazba na doklad a výslovné „Je tohle ta platba?". (3) Kdyby na duplicitách padla celá migrace,
nedoběhla by ani měna v ledgeru, což je nejdůležitější oprava celého plánu. (4) „Zaplaceno" je
od AD08 akce na jeden klik ve výpisu; ptát se u každé faktury by ji rozbilo. (5) Je to funkce,
protože `payment_reviewed_at` existuje až po migraci 109.
**Důsledek:** `docs/admin/AGENTS-ADMIN.md` → „Náprava financí (AD13, R-099)", plán modernizace
→ AD13 (seznam odchylek). Nový součet nad `finance_transactions` **musí** mít `L.czkOnly()`
(`lib/admin/ledger.ts`), jinak se vrátí sčítání měn. Nová cesta k příjmu musí nastavit
`income_origin`, jinak ji index nehlídá. Duplicity v datech najde
`node scripts/admin-prijmy-duplicity.mjs` (jen čte); po úklidu se migrace 109 pustí znovu.

### R-100 · Asistent navrhuje, nekoná; migrace 110 je jen pro AD14 (2026-11-13)
**Rozhodnutí:** pět odchylek od zadání AD14.
(1) Migrace má číslo **110** (prompt psal 105, to zabralo AD10) a je **jen pro AD14** — plán
chtěl jednu společnou s AD15. **AD15 tím jede na 111 a AD16 na 112.**
(2) Tělo požadavku na `/api/ai-assistant` nese kromě `mode`, `text` a `contextRef` i **krátkou
historii hovoru** (role jen `user`/`assistant`, text do 2000 znaků, nejvýš 20 replik, všechno
přes `redactSensitive()`).
(3) `create_invoice_draft` a `send_message` **nic nezapisují ani neodesílají** — vracejí odkaz
(předvyplněný formulář faktury, `mailto:`/`sms:`/`wa.me`).
(4) Sjednocení návrhů je **zanořené v objektu** (`{ proposal, confidence, assumptions, missing }`),
ne v kořeni odpovědi.
(5) Expirace nevyřízených návrhů **nedostala vlastní cron** — volá ji denní `send-reminders`.
**Proč:** (1) Společná migrace je past: běhoun vede `public.schema_migrations` podle názvu souboru,
takže kdyby Kryštof pustil 110 po AD14 a AD15 do téhož souboru dopsalo další DDL, nikdy by
neproběhlo. (2) Konzultanti u startupového projektu jsou rozhovor, ne jedna otázka; bez historie
by každá další zpráva začínala od nuly. Díra, kterou AD14 zavírá, byl **systémový prompt** a tělo
bez jakýchkoli mezí, ne existence historie. (3) Admin žádný koncept faktury nemá a vystavený
doklad je neměnný (R-098) — jediný bezpečný „koncept" je rozepsaný formulář; odeslání zprávy je
na seznamu „asistent nesmí" (R-084). (4) Strukturovaný výstup si s `anyOf` na nejvyšší úrovni
nerozumí všude stejně. (5) Vercel Hobby dovolí cron jednou denně (R-006) a stejně to v AD13
vyřešily opakované náklady.
**Důsledek:** `docs/admin/AGENTS-ADMIN.md` → „AI asistent: navrhne, člověk potvrdí (AD14)",
plán modernizace → AD14 (seznam odchylek), `.claude/security/DECISIONS.md` #025. **Název modelu
se od teď nikde v repu nepíše** mimo `lib/ai/models.ts` — hlídá to test, který prochází `app`,
`lib`, `components` a `scripts`. Nový druh návrhu = nová větev v `z.discriminatedUnion` **a**
executor v `lib/admin/suggestion-apply.ts`; bez executoru se návrh neprovede. Retenci
`ai_suggestions` doplní AD15 spolu s pamětí projektu.

### R-101 · Paměť se neuloží děravá a mazání hlídá databáze (2026-11-13)
**Rozhodnutí:** šest odchylek od zadání AD15.
(1) Do paměti se **neuloží text, ve kterém `redactSensitive()` cokoli našlo** — ne jen text
se značkou `[skryto]`.
(2) Smazání zakázky i kontaktu bere paměť s sebou **triggerem v databázi**
(`trg_projects_forget_memory`, `trg_contacts_forget_memory`), ne úklidem v akci mazání.
(3) `valid_until` se **zapisuje** (90 dnů návrh, 3 roky potvrzené) a potvrzeným řádkům ho pak
**prodlužuje** denní úklid podle posledního pohybu; nepočítá se při čtení.
(4) Úklid visí na cronu **`client-retention`**, ne na „`/api/cron/admin-denne` z AD08" — ten
nikdy nevznikl.
(5) Návrhy paměti dělá denní **`send-reminders`**, taky bez vlastního cronu.
(6) **Řádky paměti nejsou v exportu údajů** — admin žádný export údajů kontaktu nemá.
**Proč:** (1) Zprávu o práci jde před schválením ještě ručně opravit; paměť se čte **potichu**
do promptu asistenta, takže je bezpečnější ji nemít než mít ji s dírou po zakrytém úseku.
(2) Cest ke smazání je víc než jedna a **výmaz kontaktu v adminu zatím vůbec neexistuje**
(otevřený problém z AD09) — trigger platí i pro ruční SQL při žádosti GDPR, což je dnes jediná
skutečná cesta. Cizí klíč to neumí: `ref_id` míří podle `scope` do dvou různých tabulek.
(3) Počítat „poslední pohyb" při každém čtení paměti by znamenalo stejný dotaz jako v migraci
098 na každé otevření obrazovky. (4) a (5) Vercel Hobby dovolí jeden běh cronu denně (R-006)
a obojí patří k běhu, který už existuje. (6) Všechen kód GDPR exportu je ve Workspace
(`lib/ws/gdpr.ts`); postavit ho pro admin je samostatná práce (AD16/KP10), **výmaz** pokrytý je.
**Důsledek:** `docs/admin/AGENTS-ADMIN.md` → „Paměť projektu: fakta a věty zvlášť (AD15)",
plán modernizace → AD15 (seznam odchylek), `.claude/security/DECISIONS.md` #026. **Nové
předvyplnění formuláře smí brát hodnotu jen z `lib/admin/memory/facts.ts`** — nikdy
z `project_memory`; jinak se vymyšlený údaj od modelu začne tvářit jako historický fakt (B10).
Nová tabulka s osobními údaji navázaná polymorfně = trigger, ne spoléhání na akci mazání.
Při AD16 (migrace 112) nezapomenout, že `project_memory` do retence patří a `purge_client_retention`
z migrace 098 o ní **neví** — úklid paměti dělá `purge_memory_retention` z migrace 111.

### R-102 · Dotazník má razítka na zakázce a souhlas je dobrovolný (2026-11-13)
**Rozhodnutí:** osm odchylek od zadání AD16.
(1) `survey_requested_at` a `survey_reminded_at` jsou na **`projects`**, ne na `project_surveys`
(prompt nechal volbu na sezení).
(2) Dotazník posílá i `setProjectStatus` na `done`/`paid` a v tu chvíli **nahrazuje** obvyklou
zprávu o změně stavu.
(3) **Souhlas se zveřejněním je nově dobrovolný** — veřejný formulář `/h/[token]` ho už
nevyžaduje k odeslání.
(4) Migrace 112 nese i `agent_leads.handled_at`, `client_lead_id` a `project_id`, ne jen dotazník.
(5) Zakázka z AI leadu vzniká **přes Hovory** (`convertAgentLeadToCall` → stávající
`convertLeadToProject`), ne vlastní cestou.
(6) PDF předávacího dokumentu chodí na **`POST`** se shodným `Origin`, ne na GET.
(7) Reference zůstává na `/dashboard/profil`, kam hodnocení přesunulo AD11.
(8) Předávací dokument má vlastní obsah (`projects.handover`, jsonb), ne jen složení z položek
zakázky.
**Proč:** (1) `project_surveys` je **odpověď** klienta — hvězdičky `NOT NULL` a od migrace 106
nejvýš jedna na zakázku. Dokud klient nevyplnil, žádný řádek neexistuje, a právě tehdy je
potřeba vědět, kdy se kdo zeptal; prázdný řádek dopředu by si vyžádal NULL u hodnocení, nebo
nuly v průměrech. (2) Jinak by díra zůstala otevřená právě tam, kde ji zadání popisuje; dvě
zprávy klientovi během patnácti vteřin jsou hluk. (3) Bez toho by „se souhlasem" z bodu 3
zadání neznamenalo nic — formulář si souhlas vynutil u každého, kdo chtěl odeslat hodnocení.
(4) Bez stopy po vyřízení by pruh AI leadů rostl donekonečna. (5) Zadání chtělo „stejnou cestu
jako z ostatních"; druhá cesta do `projects` by měla vlastní pravidla o kontaktu, poznámkách
a uvítacím e-mailu. (6) Vystavení **zapisuje** `handover_issued_at` a zápis na GET by šel
vyvolat obrázkem na cizí stránce (nález bezpečnostního review, DECISIONS #027) — AD08 tutéž
třídu rušila ve Financích. (7) Hodnocení je po AD11 na Profilu a detail zakázky žádné
neukazuje. (8) Přístupy ani dvě strany údržby se z položek faktury odvodit nedají.
**Důsledek:** `docs/admin/AGENTS-ADMIN.md` → „Hodnocení, reference a předání (AD16)", plán
modernizace → AD16 (seznam odchylek), `.claude/security/DECISIONS.md` #027. **Nové předvyplnění
předávacího dokumentu smí brát hodnotu jen z toho, co v databázi je** — nikdy z modelu (B10).
Nová cesta, která zakázku uzavře, musí zavolat `sendSurveyRequest`, jinak dotazník neodejde.

### R-103 · Barva v adminu něco znamená, jinak tam není (2026-11-13)
**Rozhodnutí:** šest odchylek od zadání AD17.
(1) **`/hub` a `/hub/finance` z promptu neexistují** — Hub zanikl v AD03 (R-087), překreslilo
se `/dashboard/finance`, obě záložky.
(2) Kategorie událostí v kalendáři dostaly **tóny termínů `--staff-1…5`** z Dílků, ne vlastní
paletu; R-091 je nechalo otevřené.
(3) **Příjem a výdaj se rozlišují tvarem** (příjem plná plocha, výdaj obrys), ne zelenou
a červenou. Červená zůstává jen pro chybu — bilance v minusu, ztráta, daň k doplacení.
(4) **`SectionLabel` z `components/ws/brand` se nerozšiřoval.** Volitelné `as` v něm rozbilo
hydrataci (server `p`, prohlížeč `h3`); admin má místo toho třídu `SECTION_LABEL`
v `components/admin/card.tsx` a element si volí sám. **Popisek pole je `label` psaný větou**,
ne mono verzálky.
(5) **Detail v pravém panelu se nedělal** a **`Money` ani `TimeRange` se nepoužily.**
(6) **Tři vědomé výjimky z pravidla 44 px:** bloky v kalendáři, odkazy na e-mail a číslo
faktury uvnitř řádku a skrytý „Přeskočit na obsah".
**Proč:** (2) DESIGN.md u tónů termínů říká přesně to, co je tu potřeba — rozlišují vlastníky
termínů a **nikdy** nenesou naléhavost ani chybu; druh události je kategorie, ne stav.
Devět vlastních odstínů od zelené po fialovou dělalo z kategorií stavy. (3) Dílky zelenou
nemají a červená je v nich chyba; `components/ws/money/chart.tsx` řeší totéž tvarem od S14.
(4) Hydratace se rozcházela na každé obrazovce s formulářem zakázky; mono verzálky přes celý
formulář navíc vypadají jako terminál, zatímco DESIGN.md je vyhrazuje pro data a značky sekcí.
(5) Detail zakázky je po AD11 celá obrazovka s průvodkou a pěti záložkami — přestavět ji do
panelu je jiné zadání než překreslení vzhledu; `Money` a `TimeRange` berou měny a čas
Workspace (`lib/ws/money`, `lib/ws/time`), admin má vlastní `lib/money-currency.ts` a pražský
čas, takže se použilo `font-num` (totéž písmo). (6) Výška bloku v kalendáři **je** údaj (čas)
a DESIGN.md hustému rozvrhu vlastní odsazení povoluje; e-mail a číslo faktury v řádku jsou
texty, ne akce, a vedle nich stojí 44px tlačítka.
**Důsledek:** `docs/admin/AGENTS-ADMIN.md` → „Denní obrazovky v Dílkách (AD17)", plán
modernizace → AD17. **Nový panel adminu se kreslí přes `Card`/`CardHead`
z `components/admin/card.tsx`**, ne vlastním řetězcem tříd; stín do klidového stavu nepatří.
**Nová barva se nebere z duhy** — stav má tón v `lib/admin-status.ts`, kategorie v kalendáři
tón termínu, chyba `danger`. Zbývající duhové třídy jsou v osobní části adminu a na `/p`
a `/h`; uklízí je AD18.

### R-104 · Modál se nekreslí ručně; ukazatel měří jen admin (2026-11-14)
**Rozhodnutí:** sedm odchylek od zadání AD18.
(1) **Z devíti vyjmenovaných modálů existovalo sedm** — `app/hub/school/{AddGradeModal,AddDeadlineModal}.tsx`
smazal AD01 s modulem Školy. Místo nich se převedly dva překryvy kostry, které v zadání
nebyly: spodní nabídka „Více" na telefonu (`Sheet`) a ⌘K hledání (`Dialog`).
(2) **`aria-modal` Radix nenastavuje** a nebude. Místo něj dává `aria-hidden` celému okolí
(ověřeno: s otevřeným ⌘K je `aria-hidden` i `<main>`) a zamyká rolování — nehledat ho tedy
v testech ani v review.
(3) **Rozsah ukazatele tříd se zúžil** o `components/{ws,marketing,ui}`. Komentář u testu je
z rozsahu vylučoval od AD04, pathspec `components/*.tsx` je ale v gitu rekurzivní, takže se
počítaly taky — a `bg-white` v nich je **správně** (bílé tlačítko v hero, dílky loga, razítko
věrnostní karty, palec přepínače).
(4) **`muted-foreground` se počítá jen jako třída** (`text-`, `bg-`, …), ne jako výskyt
řetězce. Proměnná `--muted-foreground` v `app/globals.css` je shadcn téma, které komponenty
`components/ui/*` potřebují.
(5) **Strop `border-border` je 1, ne 0** — `@apply border-border` v základní vrstvě je
výchozí barva okraje pro celé repo a řídí se motivem (AD04 ji tam nechal záměrně).
(6) **Gradient v adminu zůstal logu.** `.brand-gradient` (44×) se smazala, ale přihlášení,
portál `/p`, dotazník `/h` a avatar kreslí čtvereček loga dál gradientem — tentokrát tím
z Dílků (`from-navy-600 to-navy-800`). Tlačítka a ukazatele postupu dostaly plnou `navy-700`.
(7) **Měřil se i stav před AD18.** Commit `cabe01c` se kvůli tomu samostatně přeložil
a změřil, protože mezi AD08 a AD17 nikdo neměřil a bez toho by se růst balíčku připsal AD18.
**Proč:** (1) a (2) jsou fakta, na která zadání nemohlo vědět; zbytek je o tom, aby ukazatel
měřil to, co měřit má. Nula dosažená zahrnutím cizích souborů by znamenala přepsat ve
Workspace bílou na `bg-surface`, tedy **rozbít** vzhled kvůli číslu v testu.
**Důsledek:** `docs/admin/AGENTS-ADMIN.md` → „Dokončení sjednocení: modály a přístupnost (AD18)",
plán modernizace → AD18 a sekce 11. **Nové modální okno jde přes `components/ui/{dialog,sheet}.tsx}`**
— `DialogTitle` je povinný, `DialogDescription` jedna věta (klidně `sr-only`), vlastní „×"
do záhlaví nepatří. Nová barva, třída ani emoji z duhy se do adminu nevejdou: hlídá to
`components/admin/__tests__/admin-classes.test.ts` se stropem nula.

### R-105 · Přihlášení do adminu vede Supabase Auth, data zůstávají v Neonu (2026-11-15)
**Rozhodnutí:** admin konzole se přihlašuje přes **Supabase Auth** (projekt `zakaziq`,
eu-central-1) — e-mail, heslo a dvoufázové ověření ověřovací aplikací (TOTP). NextAuth,
`ADMIN_PASSWORD_HASH` i závislosti `next-auth` a `bcryptjs` z repa odešly. Kryštof 2026-11-15
vybral: **jen admin** (Workspace `/w` a klientský prostor `/klient` zůstávají na Clerku),
**Neon zůstává databází** (Supabase je jen poskytovatel identity, do jeho databáze se nic
nečte ani nepíše) a **heslo + TOTP** (ne magic link ani Google). Pravidlo jednoho admina
(R-001) drží `ADMIN_EMAIL`: dovnitř projde jen session, jejíž e-mail se mu rovná, a prázdná
hodnota nepustí nikoho. Kdo má zapsaný faktor, nemůže ho přeskočit — session s `aal1` se do
adminu nedostane. Přihlášení i nastavení TOTP běží **výhradně v server actions**, takže
prohlížeč na Supabase vůbec nesahá, browser klient v repu není a **CSP se nemění**.
**Proč:** zadání Kryštofa. Zavírá otevřený problém „admin bez dvoufázového ověření" (od
2026-11-03) bez nové závislosti na TOTP knihovnu a bez správy sdíleného tajemství v naší
databázi. Admin čte data všech klientů rolí vlastníka tabulek, takže druhý faktor je tam
potřebnější než kdekoli jinde.
**Důsledek:** nové `lib/supabase/{config,cookies,server,proxy}.ts`, přepsané `lib/auth.ts`
(`getAdminSession`, `adminActorEmail`, `requireAuth`, `loadAdminSession`), `app/(auth)/login/`
se dvěma kroky, `app/totp-actions.ts` + `components/admin/totp-card.tsx` v Profilu, admin část
`proxy.ts` a 30 upravených call sites. **Dvě pasti, na které se při čtení kódu naráží:**
(1) `@supabase/ssr` dává cookie ve výchozím stavu `httpOnly: false` a platnost **400 dní** —
obojí je u konzole s daty klientů krok zpět proti NextAuthu, proto je v `lib/supabase/cookies.ts`
zpevnění na `httpOnly`, `secure` a 12 h; kdo bude chtít browser klienta Supabase, musí
`httpOnly` zrušit a přidat `connect-src` do CSP, tedy politiku oslabit. (2) Session se ověřuje
`getClaims()` (podpis ES256 lokálně, bez volání Supabase), **nikdy `getSession()`** — ten jen
přečte obsah cookie. Env se čte **ve funkci, ne do konstanty při načtení modulu** (jinak záleží
na tom, kdy se modul poprvé naimportoval — odhalil to test). `NEXTAUTH_URL` v repu zůstává,
ale už jen jako záložní adresa aplikace pro odkazy v e-mailech. Rozhodnutí **mění R-001** jen
v tom, čím se admin přihlašuje; jeden admin a žádné role platí dál. Bezpečnostní podrobnosti
a přijatá rizika: `.claude/security/DECISIONS.md` #029.

### R-106 · Co je v Supabase placené, řeší kód a hook (2026-11-15)
**Rozhodnutí:** dvě věci, které R-105 nechalo jako „nastavit v dashboardu", jsou v Supabase
**placené funkce** (Pro) a náš projekt je na Free — Kryštof na to upozornil. Řeší se tedy jinak,
bez placení:
1. **Veřejná registrace** se nezavírá přepínačem „Allow new users to sign up", ale **hookem
   `before_user_created_jen_admin`** (Postgres funkce v Supabase). Běží *před* vložením do
   `auth.users`, takže cizí účet vůbec nevznikne, a vrací `403 Registrace není povolená`.
   Zdroj je v repu jako **generátor** `scripts/supabase-auth-sql.mjs`, který SQL vypíše
   s e-mailem z `ADMIN_EMAIL` — aby e-mail nemusel být natvrdo v gitu.
2. **Délka session** se nedrží přes „Time-box user sessions", ale v kódu
   (`lib/supabase/session-age.ts`): strop **12 h od přihlášení** se počítá z `amr`
   v podepsaných claims a uplatňuje se v `getAdminSession()` i v `proxy.ts`.
**Proč:** Free plán ty volby nenabízí a platit Pro kvůli dvěma nastavením nemá smysl, když je
obojí v naší moci. `amr` je pro strop lepší než `iat`: **při obnovení tokenu se nemění**, takže
nese skutečný čas přihlášení. Cookie (R-105) má taky 12 h, ale ta se každým obnovením
prodlouží — je to klouzavé okno, zatímco tohle je pevný strop od přihlášení.
**Důsledek:** hook **v databázi je a je ověřený** proti živé DB (cizí e-mail odmítnut,
`ADMIN_EMAIL` i velkými písmeny povolen, `security definer` vypnuté podle doporučení Supabase,
spouštět smí jen `supabase_auth_admin`), ale **musí se ještě zapnout** v Authentication → Hooks
→ Before User Created; dokud to nikdo neudělá, je to nepoužité SQL a registrace je otevřená.
Hook je dostupný i na Free (tabulka dostupnosti: „Free, Pro"). Past do budoucna: strop session
stojí na tom, že Supabase posílá v `amr` čas metody — kdyby to přestal, platí jen klouzavá
cookie; hlídá to test, ale jen na vymyšlených claims. Změna `ADMIN_EMAIL` znamená pustit
generátor znovu a SQL nahrát — hook si e-mail drží sám. Navazuje na R-105,
`.claude/security/DECISIONS.md` #029 (doplnění).

### R-107 · Veškeré přihlašování přes Supabase, klienti e-mailem a heslem (2026-11-15)
**Rozhodnutí:** z Clerku na Supabase Auth přechází **všechno** — po adminu (R-105) klientský
prostor `/klient` (F1) a pak Workspace `/w` (F2), nakonec se Clerk z repa odstraní (F3).
Kryštof 2026-11-15 vybral rozsah „i Workspace" a přihlášení klientů **e-mailem a heslem**.
Všichni jsou v jednom projektu `zakaziq` (Free plán dovolí dva aktivní projekty a oba jsou
obsazené); do adminu dál pustí jen `ADMIN_EMAIL` a TOTP. Účet vzniká **jen přes náš hook**
„Before User Created" (HTTPS `/api/auth/supabase-hook`), který chce otisk platné pozvánky
a shodný e-mail; pozvánka do `/klient` je proto **vždy vázaná na e-mail** a nesmí znít na
`ADMIN_EMAIL`. Confirm email se vypíná — důkazem e-mailu je pozvánka. Data zůstávají v Neonu.
**Proč:** zadání Kryštofa; `/klient` na produkci běžel na vývojové instanci Clerku (audit
2026-11-15). HTTP hook nechává pravdu o pozvánkách v Neonu a nepotřebuje `service_role` klíč.
**Důsledek:** mění R-073 (klientský prostor už není na Clerku) a R-105 v části „jen admin";
R-106 v části hooku — Postgres hook `before_user_created_jen_admin` nahrazuje HTTPS hook
a zapnutý smí být jen jeden. Migrace 113 (sloupec `portal.members.clerk_user_id` nese id ze
Supabase, název zůstal kvůli opakovanému běhu migrace 095). Plán a kroky v dashboardu
`docs/AUTH-SUPABASE-PLAN.md`, bezpečnost `.claude/security/DECISIONS.md` #031.

### R-109 · Dokončené zakázky mají vlastní položku menu (2026-11-15)
**Rozhodnutí:** Zakázky (`/dashboard/zakazky`) ukazují jen rozpracovanou práci (Nová,
V řešení, Čeká na schválení). Hotové a zaplacené zakázky jsou v nové položce menu
**Dokončené** (`/dashboard/zakazky/dokoncene`) v Práci hned pod Zakázkami. Dokončená =
`closed_at IS NOT NULL OR status IN ('done','paid')`, stejně jako u dotazníku.
**Proč:** Kryštof 2026-11-15: zaplacené zakázky se mu míchaly s aktuálními.
**Důsledek:** mění R-090/R-097 v části „Dokončené mizí z menu" — dokončenost dál je stav
zakázky (žádná nová tabulka), jen má vlastní výpis. Adresa je pod `/zakazky`, ne
`/dashboard/dokoncene`: ta měla trvalé přesměrování na `?status=uzavrene`, které si
prohlížeč mohl uložit; teď vede do Dokončených a Zakázky staré `?status=uzavrene|done|paid`
přesměrují samy. „Hotovo" bez zaplacení je v Dokončených, souhrn nahoře ukazuje „Nezaplaceno".

### R-110 · Víc záloh na zakázku, ruční příjmy v Podnikání, kalendář na Dnes a v Hovorech (2026-11-15)
**Rozhodnutí:** (1) Ve Finance › Podnikání jde zapsat **zálohu k zakázce** (libovolně mnoho na
jednu zakázku) nebo **jednorázový příjem** bez zakázky. Záloha je řádek `finance_transactions`
s `category = 'záloha'`, `source_project_id`, `deposit_transaction = true`, `area = 'byznys'`,
`income_origin = 'manual'`; linie (přiznané/nepřiznané) se bere ze zakázky (`invoiced_on_ico`).
Jednorázový příjem má `category = 'jednorázový příjem'` a linii z formuláře. (2) Zbývá doplatit
= cena − vlastní záloha zakázky (je-li zaplacená) − ruční zálohy, **všude stejně**
(`lib/admin/project-payments.ts`): doplatek při „Peníze dorazily", Nezaplacené zakázky
v Podnikání, souhrn ve výpisu zakázek, částka nové faktury. Linie v Podnikání ukazuje „Z toho
zálohy". (3) Na Dnes je pod úkoly týdenní kalendář, v Hovorech záložka `?pohled=kalendar`;
je to tentýž `SmartCalendar` (prop `defaultView`). Rozhodl Kryštof 2026-11-15 (obě doporučené
varianty).
**Proč:** klient platí po částech a jediná záloha na zakázce to neuměla; příjem bez zakázky
nešel v Podnikání zapsat vůbec.
**Důsledek:** bez migrace — ruční záloha se pozná podle kategorie, ne podle `income_origin`
(funguje i bez 109). Záloha vyšší než zbývá se neuloží (`INSERT … SELECT … WHERE`). Kontrola
„má zakázka už vlastní zálohu" v `updateProject` ruční zálohy vynechává, jinak by vlastní zálohu
zablokovaly. Ruční záloha je kandidát pro „Je tohle ta platba?" u faktury zakázky. Smazat jde
jen ruční příjem, který si nepřevzala faktura. Nová cesta, která počítá doplatek, musí použít
`remainingSql`/`remainingToPay`. Opakované příjmy z podnikání se nedělaly (`recurring_cash_flow`
nemá linii přiznané/nepřiznané).

### R-111 · Asistent akce provádí sám, člověk je vrací (2026-11-16)
**Rozhodnutí:** asistent v adminu přestává jen navrhovat a **provádí vratné akce sám** (kontakt, termín, poznámka, stav zakázky, zakázka, záloha a platba, náklad, „faktura zaplacena") s tlačítkem **Zpět** a historií. **Jedno klepnutí** zůstává u odeslání zprávy klientovi, vystavení faktury a mazání. Vystavenou fakturu nelze upravit (R-098), oprava je storno + nová. Je-li v kontextu text napsaný klientem, auto-provedení se vypne. Přibude hlas a plovoucí tlačítko. Plán `docs/admin/ASISTENT-PLAN.md`.
**Proč:** Kryštof 2026-11-16: „aby to dělal všechno on za mě, jenom mu to řeknu textem". Třídy akcí jsou výchozí návrh k potvrzení.
**Důsledek:** **mění R-084 a R-100** v části „asistent nekoná". Náklady odhadem 50–600 Kč měsíčně (ceník neověřený u přepisu hlasu). **Model nevrací strukturovaný výstup se schématem** — API ho odmítlo jako moc složité (ověřeno živě 2026-11-16); vrací JSON podle popisu v promptu a jedinou bránou je `lib/ai/plan-format.ts`. Pojistka proti cizímu textu platí pro každý kontext záznamu (na detailu zakázky/kontaktu nic samo). Bezpečnost DECISIONS #032, technika `docs/admin/AGENTS-ADMIN.md` → „AI asistent koná sám".

### R-112 · Hovory od AI asistenta z Growth OS patří do adminu (2026-11-17)
**Rozhodnutí:** výsledky hovorů z Growth OS (`vizeon-autopilot`: ElevenLabs, ukázkové weby,
Resend) se vyřizují v **adminu**, ne ve Workspace. Growth OS posílá snímky stavu firem na
`POST /api/public/outreach`, admin z nich staví frontu Hovory › Od asistenta. **D1 v Growth OS
zůstává pravdou o tom, komu volá robot**; admin drží kopii a to, co s firmou udělal Kryštof.
Další kroky (Google Meet, e-mail jedním klikem, asistent, zpětný kanál) podle
`docs/admin/GROWTH-OS-PLAN.md`.
**Proč:** Kryštof 2026-11-17: „vše chci propojit a postavit v admin" — admin je jeho CRM
s Hovory, kalendářem a kontakty; Workspace je produkt pro klienty. Snímek místo událostí:
opakované poslání nic nezdvojí a dorazí i změny, které hovor nespouští.
**Důsledek:** migrace 114 (`outreach_leads`); 113 drží větev `auth/supabase-klient`, takže test
číslování `ws-schema` je na téhle větvi červený, dokud se obě nesloučí. Nová cesta k zakázce
z Growth OS se nepíše — firma se převezme do Hovorů a dál jede stávající `convertLeadToProject`.
Rezervace termínů přes Workspace API (D-055 v Growth OS) se nemění. Bezpečnost DECISIONS #033.

### R-113 · Asistent je chat s přehledem firmy, umí upravovat a ptá se dřív, než něco udělá (2026-11-17)
**Rozhodnutí:** (1) Asistent v adminu vede **rozhovor**: každé otevření panelu po 15 minutách bez práce (nebo „Nový chat") je nová session, uvnitř si pamatuje předchozí repliky. (2) Ke každé větě dostane **přehled firmy** — rozpracované zakázky, kontakty, termíny na 14 dní a obecnou paměť (`lib/ai/workspace-snapshot.ts`). (3) Umí **upravit** kontakt, zakázku a termín a **zapamatovat si** větu do `project_memory` (vše se „Zpět"). (4) **Než cokoli udělá, má mít všechno potřebné** — u termínu den a přesný čas, u kontaktu telefon nebo e-mail, u zakázky druh práce, cenu a kontakt, u platby částku; jinak se zeptá a nic neprovede (`lib/ai/action-requirements.ts` zadrží celý plán). (5) Hlavní model je `smart` (Sonnet), `fast` je jen záchrana. (6) **Čas:** ke každé větě blok `<cas>` (`lib/ai/time-context.ts`) — kolik je teď v Praze, část dne, tabulka dnů na 14 dní, začátek příštího týdne a předpočítané „za hodinu“ (model to sám počítal špatně). Prompt: „ráno/odpoledne“ není čas, dnešní čas, který proběhl → otázka, kolize s termínem v přehledu → otázka s nabídkou volna, mimo 8–18 jen upozornění. Termín nebo další krok v minulosti se nikdy neprovede sám (`pastActions`), jen klepnutím.
**Proč:** Kryštof 2026-11-17: „dodej mu paměť a souvislosti o projektu, každý chat jako nová session s kontextem, ať může vše upravovat, rozumněji, na čas a číslo se vždy zeptej dřív, než něco uděláš".
**Důsledek:** rozšiřuje R-111. Shrnutí kola (co se provedlo, s id záznamů) jde do prohlížeče a zpět jako historie; údaje pro „Zpět" zůstávají v DB. Přehled nese jen strukturované údaje, takže samostatné provádění nevypíná; kontext záznamu a dotazy na data ho vypínají pro celý chat (`tainted`). Nový druh akce = schéma, `actionGaps`, řádky, executor a undo token. Cena ~0,3–0,5 Kč za větu místo ~0,07. Bezpečnost `.claude/security/DECISIONS.md` #034, plán `docs/admin/ASISTENT-PLAN.md` oddíl 8.

### R-114 · Schůzka s Google Meet a e-mail klientovi z vizeon.cz přes Resend (2026-11-17)
**Rozhodnutí:** „Domluvit schůzku" u firmy od AI asistenta založí událost s Google Meet v Google
Kalendáři Kryštofa (Workspace vizeon.cz, OAuth „Internal", scope jen `calendar.events`),
událost v kalendáři adminu s odkazem a pošle klientovi e-mail **z krystof@vizeon.cz přes Resend**
(vlastní klíč `VIZEON_RESEND_API_KEY`). **Pozvánku od Googlu klient nedostává** — událost
v Googlu nemá hosty; klient se připojí rovnou z našeho e-mailu. E-mail čeká 15 s na „Zpět".
**Proč:** Kryštof 2026-11-17: „poslat z krystof@vizeon.cz, resend z vizeon.cz", „je to
workspace", „můj e-mail s odkazem na Meet … klient se rovnou připojí z e-mailu".
**Důsledek:** **mění R-004** pro e-maily klientům VIZEONu ze schůzek — jdou přes Resend, ne Gmail
SMTP (ten od 2026-08 stejně neposílá). Migrace 115 (`calendar_events.meet_url`, `invite_*`,
`admin_settings.google_oauth`). Odkaz na Meet je v e-mailu, v Google Kalendáři a v detailu
události v adminu („Připojit se"). Nová cesta, která zakládá schůzku s klientem, má jít přes
`lib/admin/meetings.ts` (pořadí Google → admin → e-mail). Bezpečnost DECISIONS #035.

### R-115 · Playwright CLI jako vývojová závislost (2026-11-17)
**Rozhodnutí:** `@playwright/cli` **0.1.23** (Microsoft, `microsoft/playwright-cli`) je vývojová
závislost s přesně připnutou verzí. Slouží agentům k ovládání prohlížeče z terminálu (`npx
playwright-cli …`) — nastavení služeb v prohlížeči a kontrola obrazovek. Agent ho pouští mimo repo
(scratchpad), ať se snímky stránek (`.playwright-cli/`) neukládají do gitu; `.gitignore` je pro
jistotu má taky. Hesla, kódy a tajné klíče do stránek nezadává agent, ale Kryštof.
**Proč:** Kryštof 2026-11-17: „dáme Playwright CLI, nainstaluj do projektu", když se rozšíření
Claude pro Chrome nepřipojilo. Verze 0.1.24 vyšla před týdnem, proto o jednu starší (víc než
dva týdny stará). `npm audit` nepřibyl žádný nález (11 vysokých je dál řetězec picomatch).
**Důsledek:** upřesňuje R-080 — tohle **je** schválení Playwrightu, ale jen CLI pro agenty, ne
testovací sady (`@playwright/test` a e2e testy v CI by byly nové rozhodnutí). Do produkčního
balíčku se nedostane (devDependency, nikde se neimportuje). Upgrade jen vědomě, ne podle hlášky
„Update available".

### R-116 · Všechna pošta adminu přes Resend z vizeon.cz (2026-11-17)
**Rozhodnutí:** `lib/email.ts` posílá přes `sendVizeonMail` (Resend, klíč
`VIZEON_RESEND_API_KEY`, jen odesílání z vizeon.cz). Upozornění jdou od `ZakazIQ <info@vizeon.cz>`,
osobní zprávy a faktury od `krystof@vizeon.cz`, odpovědi na krystof@vizeon.cz. Gmail SMTP zůstává
jen jako záloha, když klíč chybí.
**Proč:** Kryštof 2026-11-17 hlásil „Nepodařilo se odeslat email" v Hovorech; Gmail od 2026-08
odmítal heslo aplikace (535) a z adminu neodcházelo nic. Resend s ověřenou vizeon.cz už běží pro
schůzky (R-114).
**Důsledek:** **nahrazuje R-004** (Gmail SMTP). Nová cesta pro e-mail adminu jde přes `deliver()`
v `lib/email.ts`; test `lib/__tests__/email-resend.test.ts`.

### R-117 · Koncepty faktur ke schválení a „Schválit a poslat" jedním kliknutím (2026-11-17)
**Rozhodnutí:** faktura se připraví sama jako **koncept** do Faktur › Ke schválení: (1) když zakázku přepnete na Hotovo nebo ji uzavřete (doplatek = cena − zálohy, e-mail ze zakázky; jen pro klienta, jen když k zakázce není platná faktura, jen jednou — ani zahozený se nevrátí), (2) tlačítkem „Uložit jako koncept" ve formuláři, (3) od asistenta („vyfakturuj…" je teď vratná akce `auto` se Zpět), (4) z **pravidelné faktury** jednou měsíčně (denní cron `send-reminders`, den 1–28). Koncept nemá číslo; „Schválit a poslat" ho po 10 s na „Zpět" vystaví (teprve teď číslo z řady) a pošle s PDF z krystof@vizeon.cz. Odběratel má na faktuře nově e-mail (`invoices.client_email`), formulář ho předvyplní ze zakázky.
**Proč:** Kryštof 2026-11-17: „dashboard faktur, kam se mi exportne a po mém souhlasu se jedním klikem odešle klientovi", spouštěče vybral všechny čtyři, „Vystavit + poslat" jedním klikem. Číslo až při schválení, aby zahozený koncept nenechal v řadě díru (R-098).
**Důsledek:** migrace 117 (`invoice_drafts`, `invoice_recurring`, `invoices.client_email`), `lib/admin/{invoice-drafts,invoice-draft-schema,invoice-send}.ts`, `app/api/invoices/drafts/[id]/send`, `app/dashboard/faktury/{koncepty-actions.ts,pravidelne/}`, `components/admin/invoices/{drafts-panel,recurring-manager}.tsx`. **Mění R-100/R-111** v části `issue_invoice`: asistent fakturu nevystavuje, připraví koncept. Nová cesta, která zakázku uzavře, má volat `prepareProjectDoneDraftLater`. Bez migrace 117 se Faktury chovají jako dřív (panel se neukáže). Bezpečnost DECISIONS #037.

### R-118 · Sekce AI asistent: kontakty od robota, denní reporty a analýza (2026-11-17)
**Rozhodnutí:** v adminu je nová sekce **AI asistent** (`/dashboard/ai-asistent`) se záložkami Kontakty,
Reporty a Analýza. (1) Firma, která robotovi odsouhlasí ukázku, je v ZakazIQ **hned** (autopilot
pouští synchronizaci po souhlasu, D-105) s předvyplněným e-mailem: ukázka, den hovoru, vizeon.cz,
termín a Meet; jedním klikem odejde a zapíše se do kalendáře a Hovorů (R-114). Do kalendáře se
termín **nezapisuje sám** — až odesláním. (2) Growth OS posílá report po každém kole a souhrn dne
na `POST /api/public/outreach/reports` (migrace 116), historii dotáhne `zakaziq:report`.
(3) **Přepisy** spojených hovorů se ukládají na **90 dní**, hovory 12 měsíců, telefony a e-maily
v kontraktu nejsou. (4) **Prompt pro Claude Code** skládá šablona z čísel a přepisů — žádný model
v adminu; rozbor a návrh oprav dělá Claude Code v repu autopilota a implementuje až po souhlasu.
**Proč:** Kryštof 2026-11-17: „chci novou sekci… ať se to hned migruje do ZakazIQ a vznikne
automaticky šablona", „reporty z konkrétních dní, úspěšnost a analýza, kde hovory váznou,
automaticky připravíš prompt pro Claude Code". Volby (šablona, přepisy 90 dní) vybral sám.
**Důsledek:** Hovory › Od asistenta zůstává (tatáž fronta). „Kde hovory váznou" ukazuje jako
hlavní problém jen krok, který ovlivní agent (úvod, slyšitelnost, nabídka, námitky); „nezvedli"
je dosah. Bezpečnost DECISIONS #036, technika `docs/admin/AGENTS-ADMIN.md` → „AI asistent".

### R-119 · Dotazník spokojenosti na jednu minutu, z krystof@vizeon.cz (2026-11-17)
**Rozhodnutí:** (1) Dotazník má jednu povinnou otázku „Doporučili byste mě známému?" (0–10, NPS)
a čtyři nepovinné oblasti hvězdičkami: **Výsledek, Komunikace, Termín, Cena**. Šest starých
povinných hvězdiček zůstává jen v historii. (2) **První otázka je přímo v e-mailu**: řada 0–10,
každé číslo otevře formulář s vybranou známkou. Známka se uloží hned, i když klient zbytek
nevyplní, ale **ukládá ji až prohlížeč, ne otevření odkazu**. (3) Další otázka podle známky:
9–10 reference s návodnými otázkami, souhlas ve třech úrovních (se jménem a firmou / bez jména /
nezveřejňovat) a po odeslání „Napsat recenzi na Googlu" (text se zkopíruje); 7–8 „Co by z toho
udělalo desítku?"; 0–6 „Co jsem měl udělat jinak?" a Kryštofovi přijde upozornění do zvonku
i e-mailem, **jednou**. (4) E-mail klientovi jde **z krystof@vizeon.cz přes Resend** (`sendVizeonMail`),
bez záložního Gmailu. (5) Dotazník odchází sám po dokončení zakázky všemi cestami: uzavření,
rychlá změna stavu i **úprava zakázky formulářem** (ta dosud posílala jen „projekt byl aktualizován").
(6) V Hodnocení je NPS za období (Letos / 12 měsíců / Vše), průměr čtyř oblastí s nejslabší
oblastí a seznam nespokojených s „Ozval jsem se" (se Zpět). Odkaz na Google recenzi je pole v Profilu.
**Proč:** Kryštof 2026-11-17 schválil návrh „takto to přesně udělej", s automatickým odesláním po
dokončení zakázky z krystof@vizeon.cz. Šest otázek se překrývalo a nesedělo na e-shop ani
automatizaci; bez NPS nešlo poznat spokojené od nespokojených a nic se podle toho nedělo.
Ukládání při otevření odkazu by známky vyráběly roboty, které odkazy v e-mailech procházejí
(firemní filtry pošty), a falešná upozornění na nespokojené klienty.
**Důsledek:** migrace 118 (aditivní, **před** nasazením — bez ní nový dotazník odpověď neuloží).
Model a výpočty `lib/admin/survey-model.ts` (čte se přes `to_jsonb`, admin tedy běží i bez 118),
zápisy `lib/admin/survey-answers.ts`, e-mail `lib/admin/survey-email.ts`. Server sám drží větvení:
reference a souhlas jen u 9–10. Druhý dotaz po 2–3 měsících („přinesl web poptávky?") se nestavěl.
Zakázka zapsaná rovnou jako hotová (`createProject`) dotazník neposílá, často jde o starou práci.
Upravuje R-102 bod 3 (souhlas má tři úrovně). Bezpečnost `.claude/security/DECISIONS.md` #038.


### R-120 · AI asistent jako CRM: detail klienta a kontrakt v2 s Growth OS (2026-11-18)
**Rozhodnutí:** (1) Sekce AI asistent má čtyři pohledy: **Přehled** (výchozí), Kontakty, Reporty,
Analýza, a **detail klienta** `/dashboard/ai-asistent/kontakt/[id]` se vším z Growth OS. (2) Growth OS
posílá **kontrakt v2**: ke snímku firmy všechny hovory (s `conversation_id`, cenou, daty z hovoru
a kritérii), e-maily s textem, historii stavů a rešerši; **hned po každém hovoru** jednu firmu
s přepisem, hodinově bez přepisu. Chybějící hodnota v ZakazIQ nic nepřepíše. (3) **Nahrávky ne,
stačí přepis** (Kryštof 2026-11-18: „nepotřebuji nahrávky, stačí mi přepis hovoru") — ZakazIQ do
ElevenLabs nesahá, `conversation_id` je jen pro dohledání. (4) **Náhled ukázky** jen z `navrhy.vizeon.cz`, přes náš server.
(5) **Zpětný kanál je pull:** Growth OS se ptá `GET /api/public/outreach/handled`, koho Kryštof
převzal nebo odložil; ZakazIQ nikam nevolá. Odložení „nemá zájem" robot bere **vratně**, ne jako
nevratné „nevolat". (6) Odorik je jen SIP linka; skutečnou cenu a kredit má dodat Growth OS z API
Odoriku, ZakazIQ jen ukazuje (`cost_source` odorik/odhad).
**Proč:** Kryštof 2026-11-18: „kontakty, kam jsem poslal ukázku, se okamžitě propíšou do admina;
když kliknu na klienta, uvidím ukázku, všechny údaje a detail hovoru… kompletní dashboard". Snímek
v1 nesl jen poslední hovor a hovory chodily až po kole, takže detail nešel složit. Náhled ukázky
přes proxy drží CSP beze změny. Přehrávání nahrávek bylo připravené, ale vypuštěné — bez potřeby by
přineslo další tajemství a další přístup k hlasu lidí, kterým se volalo nevyžádaně. Pull je jednodušší než push: ZakazIQ nemusí
držet adresu a klíč autopilota a výpadek se dožene sám.
**Důsledek:** migrace 119 (aditivní; bez ní v2 uloží jako v1). Hovory se ukládají jedinou cestou
`lib/admin/outreach-calls.ts` pro snímek i report. Nové čtení dat z Growth OS přes `to_jsonb(řádek)`,
ať admin běží i bez nových sloupců. Odkaz na ukázku z adminu nese `?od=admin` (Growth OS ho nemá
počítat). Strana Growth OS je zadání `new - area of zakaziq/prompty/admin/growth-os-ai-asistent-crm.md`,
tam rozhodnutí D-106. Bezpečnost `.claude/security/DECISIONS.md` #039. Rozšiřuje R-112 a R-118.

### R-121 · Klientský prostor 2: heslo z pozvánky, etapy ze šablon, konzultace z volna, peníze (2026-11-18)
**Rozhodnutí:** (1) Klient si heslo nastaví sám z pozvánky vázané na jeho e-mail (F1, R-107).
Hesla nevymýšlí Kryštof ani agent; pozvání je jedno tlačítko u zakázky. (2) Etapy zakázky vycházejí
ze šablony podle druhu služby. Obsah šablon píše Kryštof, u nové zakázky se předvyplní a jdou upravit.
(3) Konzultaci si klient rezervuje **jen v časech, které Kryštof v kalendáři ZakazIQ označí jako volno
pro klienty**; pevné hodiny `getHourSlots` končí. (4) Každý klient ve svém prostoru vidí u svých zakázek
cenu, co zaplatil, co zbývá, faktury a co bylo uděláno, bez přepínače u zakázky. Online platba se nedělá.
**Proč:** Kryštof 2026-11-18 („vlastní e-mail a heslo… přehled faktur, co bylo zaplacené… rozfázované,
deadline… kdykoli si se mnou rezervovat konzultaci" a odpovědi na doplňující otázky). Heslo, které zná
ještě někdo jiný a přišlo e-mailem, není klientovo. Volno místo pevných hodin drží kalendář v Kryštofových rukou.
**Důsledek:** **mění R-070 a plán** v tom, že klient vidí cenu a faktury (KP06 „žádná cena", plán
sekce 10). Sezení KP11–KP17 a D-K12–D-K18 v `docs/klientsky-prostor/PLAN.md` (4.7, 6, 7), prompty
KP11–KP16. Volno pro klienty je vlastní tabulka, ne `calendar_events` — guard z 008/044 bere každou
událost jako obsazený čas. Interní údaje (poznámky, `invoiced_on_ico`, koncepty faktur) do `portal`
nikdy. Otevřené: délka a lhůty konzultace (D-K13, KP14), postup v % z etap (D-K14, KP12), co je
„analýza" (D-K16).

### R-122 · Chat s klientem jako přes WhatsApp pro veškerou zpětnou vazbu (2026-11-18)
**Rozhodnutí:** v klientském prostoru je u každé zakázky chat mezi Kryštofem a klientem, kde se
probírá web a návrh a klient tam dává veškerou zpětnou vazbu (co upravit a co ne). Kryštof má
v adminu jednu schránku přes všechny klienty. Chat má živé obnovení, přečteno, e-mailová upozornění
na nepřečtené, hlasové zprávy, obrázky a PDF, odpověď na zprávu, „Ke schválení" a v adminu „Udělat
z toho zadání" (AI shrnutí a prompt pro Claude Code, R-069).
**Proč:** Kryštof 2026-11-18: „chatový prostor mezi mnou a klientem, kde probíráme věci jako přes
WhatsApp… klient mi zde bude dávat veškerou zpětnou vazbu k projektu". Dnešní „Zprávy" (`portal.messages`,
migrace 096) jsou jen formulář bez upozornění klientovi, bez obnovení a bez příloh.
**Důsledek:** sezení KP15, přehled klienta se posouvá na KP16, analýza na KP17. Zadání z chatu se nikdy
nespustí samo, Kryštof ho zkontroluje a vloží (R-069, R-070). Obnovení dotazováním, ne WebSocket (R-044).
Otevřené: sloučit sekci Požadavky do chatu (D-K17, doporučeno) a úložiště příloh (D-K18, nová závislost
a CSP jen se souhlasem; nahrazuje D-K8 pro přílohy v chatu).

### R-123 · Klientský prostor rozvržený jako Slack, přečteno jako WhatsApp (2026-11-18)
**Rozhodnutí:** celý klientský prostor je jedna aplikace ve stylu Slacku, jen jednodušší: vlevo firma,
Přehled, zakázky jako kanály s nepřečtenými, Faktury a Konzultace; uprostřed chat zakázky; vpravo panel
O zakázce. Na telefonu se chová jako WhatsApp (seznam → chat → detail). U zpráv je odesláno a přečteno
jako ve WhatsAppu a Messengeru (jedna a dvě fajfky, „Přečteno 14:32 · jméno", čára „Nové zprávy").
Schránka Zprávy v adminu má stejné rozvržení. Vzhled podle Dílků, ne podle Slacku.
**Proč:** Kryštof 2026-11-18: „v podobném stylu jako Slack, kompletní klientský dashboard… přečtené
i nepřečtené zprávy jako na WhatsApp a Messenger… v podobném stylu, ale jednodušší v rámci mého systému".
**Důsledek:** KP15 staví kostru prostoru i chat, KP16 do ní doplní Přehled, panel O zakázce, Faktury
a Konzultace. Ze Slacku záměrně ne: vlákna v odpovědích, reakce, vlastní kanály, přímé zprávy mezi
členy klienta, „píše…", hovory, stavy. Krok „doručeno" není. Náčrt v `docs/klientsky-prostor/PLAN.md` 4.7.
Otevřené: zda klient vidí Kryštofovu aktivitu (D-K19, doporučeno ne).

### R-124 · Postup zakázky v % z hotových etap; čtyři prázdné služby (2026-11-18)
**Rozhodnutí:** (1) Zakázka s etapami má postup v % = hotové etapy / všechny etapy, počítá ho
databáze (trigger nad `project_phases`) a ruční posuvník u ní zmizí. Zakázka bez etap si nechá
ruční % jako dřív (D-K14). (2) Prázdný stav Nastavení › Služby nabídne jedním kliknutím prázdné
služby Web, E-shop, Design a Automatizace; etapy do nich píše Kryštof. (3) Etapy jdou do
klientského prostoru hned, bez schvalování (DECISIONS #041).
**Proč:** Kryštof 2026-11-18 vybral obě doporučené varianty. Ruční % vedle etap by si odporovalo.
**Důsledek:** `updateProject` u zakázky s etapami `progress` nepřepisuje; nová cesta, která mění
stav etapy, nemusí počítat % sama. Migrace 121, `docs/admin/AGENTS-ADMIN.md` → „Služby a etapy
zakázky (KP12)". Upřesňuje R-121 a uzavírá D-K14.

### R-125 · Zaplacená faktura snižuje „zbývá doplatit"; klient vidí tatáž čísla (2026-11-18)
**Rozhodnutí:** (1) Společný výpočet doplatku (`lib/admin/project-payments.ts`) odečítá kromě vlastní
zálohy a ručních záloh i **zaplacené korunové faktury zakázky** — jen příjem, který faktura v ledgeru
sama založila (`source_invoice_id`); faktura, která převzala už zapsanou zálohu, se nepočítá dvakrát.
Zaplacená zakázka („Peníze dorazily") nezbývá nic. (2) Klient v prostoru vidí u svých zakázek cenu,
zaplaceno (= cena − zbývá) a zbývá v Kč, tímtéž výpočtem v databázi (`portal.refresh_project_money`,
migrace 122), a seznam faktur s PDF a QR platbou. Eurové faktury jsou v seznamu, do součtu ne.
**Proč:** Kryštof 2026-11-18 vybral „započítat faktury". Dřív zaplacená faktura „zbývá" nesnížila
(nulovalo ho jen „Peníze dorazily"), zatímco průvodka ji už brala jako zaplacenou — klient by po
zaplacení faktury dál viděl dluh.
**Důsledek:** **mění chování adminu** (upřesňuje R-110): nižší „Nezaplaceno" ve výpisu zakázek
a v Podnikání, předvyplněná částka druhé faktury, horní mez ruční zálohy a odpovědi asistenta.
Výpočet je ve dvou kopiích (TypeScript `remainingSql` a SQL v migraci 122) — změna jedné = změna
druhé, porovnává je `lib/__tests__/kp13-penize-faktury.test.ts`. Bezpečnost DECISIONS #042.

### R-126 · Konzultace jen ve volnu: 30 minut, předstih 2 h, změna do 24 h, bez limitu počtu (2026-11-20)
**Rozhodnutí:** (1) Volno pro klienty je **vlastní tabulka** `client_availability` v pražském nástěnném
čase (den, od–do, délka konzultace, týdenní opakování do data, vynechané dny), ne událost v kalendáři.
(2) Výchozí konzultace **30 minut** (u volna jde změnit 15–120), nejdřív **2 hodiny** předem, klient ji
sám přesune nebo zruší do **24 hodin** před začátkem, **počet budoucích konzultací se neomezuje**
(technicky jen 10 rezervací za hodinu na člena a 5 přesunů jedné konzultace proti zneužití).
(3) Volné časy = volno − události − konzultace − plánované hovory (30 min), po délce konzultace —
jediná funkce `consultation_free_slots`, ze které čte `/klient` i `/p`; pevné hodiny `getHourSlots`
na `/p` skončily. (4) Rezervace z prostoru je vždy Google Meet; potvrzení jde z krystof@vizeon.cz
na e-mail člena, u `/p` dál jen na e-mail ze zakázky. Meet ani pošta rezervaci neruší.
**Proč:** Kryštof 2026-11-20 zvolil 30 minut, předstih 2 h, změnu do 24 h a „kolik bude klient chtít
konzultací". Vlastní tabulka proto, že překryvový guard (008/044/105) by rezervaci ve volnu bral jako
kolizi s volnem samotným; nástěnný čas proto, aby opakování drželo „čtvrtek 14:00" přes změnu času.
**Důsledek:** migrace 123 (aplikována: ne), `lib/admin/{availability,consultations,consultation-email}.ts`,
`lib/portal/consultations.ts`, `lib/consultations/rules.ts` (čísla jsou i v migraci — změna jedné =
změna druhé). Nová cesta k rezervaci jde přes `consultation_book`, ne přímým INSERT. Smazání volna
existující rezervace neruší. Bezpečnost DECISIONS #043.

### R-127 · Chat s klientem: Požadavky v chatu, přílohy v Supabase Storage, aktivitu vidí jen Kryštof (2026-11-20)
**Rozhodnutí:** (1) **D-K17:** sekce Požadavky v klientském prostoru zmizela, klient dává veškerou
zpětnou vazbu do chatu u zakázky (text, hlas, obrázek, PDF); zadání pro Claude Code dělá Kryštof
ve schránce Zprávy z vybraných zpráv. Staré požadavky zůstaly ve vlákně. (2) **D-K18:** přílohy
v soukromém bucketu `chat-prilohy` v Supabase Storage (projekt `zakaziq`), soubory jen přes náš
server; 4 MB na odeslání (limit Vercelu), větší fotky prohlížeč zmenší. (3) **D-K19:** přečteno
(dvě fajfky) vidí obě strany, kdy byl klient naposledy v prostoru vidí jen Kryštof, Kryštofovu
aktivitu klient ne. (4) Stav zadání u zprávy má tři hodnoty (Přijato, Hotovo, Uzavřeno) podle
`client_requests.status` — „Dělám na tom" ze zadání KP15 by potřeboval nový stav, nedělal se.
**Proč:** Kryštof 2026-11-20 vybral doporučené varianty všech tří. Supabase Storage proto, že projekt
už existuje a klíč je ve Vercelu, Neon by rostl soubory a Vercel Blob na Hobby nejde komerčně.
**Důsledek:** migrace 124 (aplikována: ne), `lib/chat/`, `lib/{portal,admin}/chat.ts`,
`components/chat/`, `components/portal/client-shell.tsx`, schránka `/dashboard/zpravy`. Před
nasazením založit bucket a ověřit `SUPABASE_SERVICE_ROLE_KEY` ve Vercelu. Nová zpráva jde jen přes
`portal.post_message` / `portal_admin_post`. Schválení zatím nesplní úkol etapy (KP12) a smazání
vlastní zprávy do 10 minut se nedělalo. Bezpečnost DECISIONS #044.

### R-128 · Přehled klienta: „Čeká na vás" nahoře, hodnocení přes dotazník R-119, e-mail o hotové etapě (2026-11-20)
**Rozhodnutí:** (1) Přehled v `/klient` začíná jedinou kartou „Čeká na vás" v pořadí: schválení
návrhu, úkol z nehotové etapy (s „Mám hotovo" přímo v řádku), nepřečtené zprávy, faktura **po
splatnosti**, hodnocení hotové zakázky; když nic, klidná věta. Faktura před splatností se ukáže jen
na kartě zakázky. Úkoly hotové etapy už nečekají. (2) Po přihlášení bez `next` vede `/klient/start`
do chatu s nejnovější nepřečtenou zprávou, jinak na Přehled; položka Přehled v menu vede vždy na
Přehled. (3) Hodnocení jde přes dotazník R-119 (stejný token jako v e-mailu, `portal.client_surveys`),
jedna odpověď na zakázku, kterýkoli člen klienta; stará `FeedbackCard` a `sendFeedback` (do
`client_feedback`, kterou Hodnocení v adminu nečte) zmizely. (4) E-mail klientovi jen když etapa
přejde na **Hotovo** (ne při změně termínu ani při startu etapy), 15 s po kliknutí kvůli „Zpět",
všem aktivním členům, nejvýš 1× za 24 h na zakázku; co se nevešlo, pošle ranní cron. Etapy hotové
před migrací se nehlásí. (5) Faktury a Konzultace v levém sloupci jsou souhrn přes všechny
zakázky; u konzultace si klient vybere zakázku, `?zakazka=` z panelu ji předvybere.
**Proč:** zadání KP16 (klient má do 5 s vědět, jestli po něm něco chcete). Otázky nebyly — agent
zvolil výklad, který jde ověřit testy a vrátit. Faktura před splatností jako „čeká na vás" by
klienta zbytečně honila; e-mail při každé změně termínu by byl hluk.
**Důsledek:** migrace 125 (aplikována: ne), `lib/portal/{overview,survey,format}.ts`,
`lib/admin/phase-email.ts`, `components/portal/{overview,project-aside,aside-sheet,survey-card}.tsx`,
`app/klient/{page,start,faktury,konzultace}`. Nová cesta, která etapu dokončí jinak než
`setPhaseStatusAction`, e-mail spustí až ranní cron. Bezpečnost DECISIONS #045.

### R-129 · Analýza pro klienta = poptávky z jeho webu (D-K16, 2026-11-20)
**Rozhodnutí:** KP17 ukáže klientovi, kolik lidí napsalo nebo se objednalo přes jeho web, po
měsících. Návštěvnost webu se teď nedělá; kolik práce a peněz projekt stál, ukazují KP13 a KP16.
**Proč:** vybral Kryštof 2026-11-20 (otázka D-K16 v jiném sezení, předané sem).
**Důsledek:** weby klientů se **nesmí** napojit na `lib/web-leads.ts` ani `LEAD_ORIGINS` — ten příjem
zakládá zakázky v Kryštofově schránce Poptávky, zákazníci klienta by se tvářili jako jeho poptávky.
Jak se poptávka z webu klienta do ZakazIQ dostane, je otevřené rozhodnutí **D-K20**
(`docs/klientsky-prostor/PLAN.md` oddíl 7; doporučení: jen počet bez osobních údajů s klíčem
zakázky). Prompt `new - area of zakaziq/prompty/klientsky-prostor/KP17-poptavky-z-webu-klienta.md`.

### R-130 · Poptávky z webu klienta jen jako počet, klíč webu na zakázku (D-K20, 2026-11-20)
**Rozhodnutí:** (1) **D-K20 = (a) jen počet** (vybral Kryštof 2026-11-20): server webu klienta po
odeslání formuláře pošle `POST /api/public/web-udalost` s klíčem webu zakázky a druhem `poptavka`
nebo `objednavka`; jméno, kontakt ani text do ZakazIQ nejdou, poptávka jde klientovi e-mailem jako
dřív. (2) Ukládají se jednotlivé události (`project_web_events`: zakázka, klíč, druh, čas, příznak
zkoušky), ne měsíční součty v projekci; měsíce počítá při čtení funkce `portal.web_lead_months`
a admin. Události žijí se zakázkou, vlastní retenci nemají. (3) Klíč `zk_web_…` hashuje stejný
`AGENT_KEY_PEPPER` jako klíče pro Claude Code — žádná nová proměnná ve Vercelu. (4) Graf je jedna
řada (oba druhy dohromady), rozdělení na poptávky a objednávky je textem. (5) Sekci má jen zakázka
s platným klíčem nebo událostí za 12 měsíců; zkušební událost (`test: true`) se uloží, ale nepočítá.
**Proč:** zadání KP17 a doporučení v plánu. Jednotlivé události s `key_id` dovolí po úniku klíče
smazat přesně to, co přes něj přišlo; projekce by k tomu potřebovala trigger a přepočet a čísla
jsou malá. Dva odstíny navy pro dva druhy neprošly validátorem barev (stejný odstín, slabá sytost).
**Důsledek:** odchylka od promptu KP17 (projekce `portal.web_lead_months` jako tabulka, retence
13 měsíců). Migrace 126, `lib/client-web/`, `lib/portal/web-leads.ts`, `app/api/public/web-udalost/`,
karta v detailu zakázky, návod `docs/klientsky-prostor/NAPOJENI-WEBU-KLIENTA.md`. Nový zdroj
událostí jde jen přes `recordWebEvent`. Bezpečnost `.claude/security/DECISIONS.md` #046.

### R-131 · GDPR v klientském prostoru: výmaz a export skriptem, retence i pro nová data (2026-11-20)
**Rozhodnutí:** (1) Žádost člena klienta o kopii nebo výmaz vyřizuje Kryštof skriptem
`scripts/portal-gdpr.mjs` (`--export`, `--vymaz`, `--ano`, `--ponechat-zpravy`) nad funkcemi
`portal_export_member` a `portal_erase_member` z migrace 127; tlačítko v adminu není. (2) Výmaz
standardně maže i zprávy člena s přílohami a jeho účet v Supabase; faktury, dotazník za firmu
a události v Google Kalendáři ne (postup `docs/klientsky-prostor/GDPR.md`). (3) Retence R-076 nově
maže téma konzultací, slovní části dotazníku a stav čtení vláken. (4) Klient má stránku
`/klient/soukromi`. (5) Kritéria spuštění pilotu a prostoru pro všechny jsou v plánu, oddíl 11.1.
**Proč:** zadání KP10. Do teď neexistovala žádná cesta k výmazu člena a retence neznala data
z KP14–KP16. Agent zvolil výklad, který jde vrátit; text stránky a výklad ověří Kryštof (R-079).
**Důsledek:** nová tabulka s údaji člena = doplnit `portal_export_member`, `portal_erase_member`
a `purge_client_retention` (zvažovat i v testu `kp10-gdpr`). Bezpečnost DECISIONS #047.

### R-132 · E-maily z Hovorů: tři šablony a schůzka s Meetem bez odkladu (2026-11-20)
*Na `main` vzniklo jako R-121 (a DECISIONS #040); obě čísla už měl klientský prostor, přečíslováno při sloučení 2026-11-20.*
**Rozhodnutí:** v Hovorech tlačítko „Poslat e-mail" otevře okno se třemi šablonami — **Portfolio**
(dosavadní text), **Nabídka** (cena za tuhle zakázku) a **Schůzka s Google Meet** (termín, tlačítko
Připojit se, vizeon.cz). Výběr šablony → text se načte a jde přepsat → Odeslat, jeden krok. Schůzka
vytvoří skutečný odkaz na Meet, přepíše příští akci kontaktu na „Schůzka přes Google Meet", posune
propojenou událost v kalendáři a pošle e-mail z krystof@vizeon.cz **hned**, bez 15s odkladu a „Zpět"
(na rozdíl od firem od asistenta, R-114): text vidí Kryštof v okně. Postup je všechno nebo nic —
selže-li Google nebo e-mail, termín se vrátí a Meet se smaže. Adresát je vždy e-mail uloženého
kontaktu.
**Proč:** zadání Kryštofa 2026-11-20 („mít možnost poslat e-mail s nabídkou a e-mail s datem,
vizeonem a odkazem na Google Meet, celkem tři šablony, vyberu a odešlu"). Třetí šablonu zadání
nejmenovalo — zvolil jsem dosavadní Portfolio, ať nic z toho, co Kryštof používal, nezmizelo.
Cena v nabídce se **nebere z ceníku na webu** (Kryštof 2026-11-20: ceník je jen rozmezí, u každé zakázky
říká cenu jinak): píše se do pole u každé nabídky, výchozí je odhadovaná hodnota kontaktu.
**Rozšíření téhož dne:** okno je nejen v Hovorech, ale i v **Kontaktech** (seznam a karta kontaktu)
a v **AI asistentu** (fronta Od asistenta, detail klienta); Zakázky zatím ne. Adresát je kontakt z Hovorů,
kontakt z `contacts` nebo firma od asistenta. Obyčejný e-mail nic nezakládá; schůzka adresáta bez řádku
v Hovorech v Hovorech založí (a při neúspěchu zahodí), firmu od asistenta převezme z fronty až po úspěchu.
**Důsledek:** zanikla rychlá akce „Poslat portfolio (odešle ihned)" a okno „Napsat jinou zprávu"
(`sendPortfolioEmail`, `sendCustomLeadEmail`, `PortfolioEmailModal`). Nabídka bez ceny nejde
odeslat. Schůzka z Hovorů nepotřebuje migraci
(použije 105 a 115, které na produkci jsou), ale bez propojeného Googlu a `VIZEON_RESEND_API_KEY`
je karta schůzky vypnutá. Bezpečnost `.claude/security/DECISIONS.md` #048, technika
`docs/admin/AGENTS-ADMIN.md` → „Poslat e-mail z Hovorů".
### R-133 · Vercel zůstává na plánu Hobby, bez Pro (2026-11-21)
**Rozhodnutí:** Kryštof 2026-11-21: Vercel Pro platit nebude, projekt zůstává na Hobby.
**Proč:** náklad není ospravedlněný; rozhodl Kryštof.
**Důsledek:** DPA Vercelu platí podle jeho podmínek jen pro Pro a Enterprise, takže zpracování u Vercelu (provoz, logy požadavků) **nemá smlouvu o zpracování** — kritérium 8 v `docs/klientsky-prostor/PLAN.md` 11.1 je u Vercelu vědomě přijaté riziko, ne splněné. Hobby je podle podmínek Vercelu jen pro nekomerční použití; riziko přijal Kryštof (otevřený bod výše). Vypadne i to, co Pro přinášelo: častější crony (R-006, R-050) a Observability. Kdyby se rozhodnutí měnilo (první placení klienti, tlak klienta na DPA), vrátit se k tomu přes nový R-xxx.
**Upřesněno:** R-135 (2026-11-21) — při prvním platícím klientovi přesun na Cloudflare.

### R-134 · Klienti webu do Workspace osobně, nabídka bez nátlaku (2026-11-21)
**Rozhodnutí:** Kryštof prošel D-KV1–D-KV9 z `docs/klientsky-prostor/KONVERZE-PLAN.md`:
(1) prvních 5 klientů webu převádí osobně — připraví jim Workspace přes „Pozvat klienta" a projde
ho s nimi na 20minutové konzultaci, samoobsluha z prostoru až s daty (D-KV1);
(2) **Workspace se spustí až na Supabase** (R-107, F2), produkční Clerk se nedělá; do té doby vede
hlavní akce landing page na formulář „Chci to vyzkoušet", ne do registrace (D-KV2);
(3) klienti webu dostanou **30 dní** zkušební doby místo 14 a nastavení s Kryštofem, cena 249 Kč
beze slevy (D-KV3); (4) karta hned na začátku zůstává (R-038) s poctivou připomínkou před první
platbou (D-KV4); (5) nabídka Workspace **jen v prostoru a osobně**, e-mailem jen výsledky webu bez
nabídky (D-KV5); (6) aktivně jen klientům označeným v adminu jako vhodný obor a bez hodnocení 0–6
(D-KV6); (7) weby se na Workspace napojují **až na přání klienta**, ne předem (D-KV7);
(8) ZakazIQ je Kryštofův produkt, VIZEON jeho studio, nabídka jde od Kryštofa osobně (D-KV9).
**Proč:** klientů webu je málo a Kryštofovi věří; osobní rozhovor je převede líp než automat
a nepoškodí vztah (doporučení, údržba). Produkční Clerk by byla práce, kterou F2 zahodí, a F2 dá
klientovi jeden účet na prostor i Workspace. 14 dní je pro malou firmu málo poptávek na aktivaci.
**Důsledek:** upřesňuje R-038 (delší zkušební doba jen pro pozvané klienty webu, nastaví se
v Checkoutu podle zdroje účtu) a R-107 (F2 je předpoklad spuštění Workspace). KV07 se nedělá jako
výchozí stav webů. Pořadí sezení a prvky v plánu, oddíl 8.

### R-135 · Při prvním platícím klientovi z Vercelu na Cloudflare (2026-11-21)
**Rozhodnutí:** až přijde první platící klient Workspace, provoz se přesune z Vercelu na Cloudflare.
Přesun se **dopředu nepřipravuje**, řeší se až v tu chvíli (D-KV8).
**Proč:** rozhodl Kryštof místo přechodu na Vercel Pro; Hobby je podle podmínek Vercelu jen pro
nekomerční provoz.
**Důsledek:** upřesňuje R-133. Do dokončení přesunu běží placený provoz na Hobby (riziko přijal
Kryštof). Přesun není na jeden den: PDF faktur a předávacích dokumentů vyrábí `puppeteer-core`
s `@sparticuz/chromium`, které na Cloudflare Workers neběží; šest cronů z `vercel.json`, `after()`,
`proxy.ts`, regiony a DPA Cloudflare je potřeba ověřit samostatným plánem. Detail plán konverze,

### R-136 · Poptávky z formuláře vizeon.cz chodí do adminu vlastním vstupem (2026-11-22)
**Rozhodnutí:** kontaktní formulář vizeon.cz posílá poptávky do **adminu**, ne do Workspace: `POST
https://www.zakaziq.cz/api/public/vizeon-leads` (`webLeadPostHandler('vizeon')`) s vlastním klíčem
`VIZEON_LEAD_WEBHOOK_SECRET` v hlavičce `x-vizeon-lead-signature`; ve webu se jmenuje `ZAKAZIQ_LEAD_SECRET`.
VIZEON žádný byznys ve Workspace nemá (na produkci je jen testovací „ahoj“). Rozhodl Kryštof 2026-11-22
(„ne na admin“, „Nový vstup v adminu“) místo tajného klíče `sk_live_…` do Workspace i místo návratu přes
`vizeon-lead-agent`.
**Proč:** R-088 — vizeon.cz je zdroj poptávek adminu, Workspace je produkt pro klienty. Rozpracovaná úprava
webu posílala do Workspace API v1, kde VIZEON nemá účet. Vlastní klíč místo `VIZEON_API_KEY`, protože ten
zakládá termíny v kalendáři.
**Důsledek:** admin u kontaktní poptávky neposílá e-mail zákazníkovi ani majiteli, jen oznámení do zvonku;
web posílá e-mail jen jako zálohu při chybě. Vstup nemá idempotenci (opakovaný pokus webu může založit
poptávku dvakrát). Web musí volat **www** — apex přesměrovává 308 a `fetch` hlavičku s klíčem zahodí;
web má `redirect: "error"`, takže chybná adresa skončí záložním e-mailem. Mimo produkci web nic neposílá.
Bezpečnost `.claude/security/AUDIT-LOG.md` 2026-11-22.
oddíl 10.

### R-137 · Schůzky z kalendáře s připomínkami e-mailem a SMS (2026-11-23)
**Rozhodnutí:** (1) Událost v kalendáři jde přepínačem označit jako **schůzku přes Google Meet**:
klient hned dostane pozvánku z krystof@vizeon.cz (text Kryštof před odesláním upraví, 15 s na
„Zpět", příloha `.ics`). (2) **Připomínky**: den předem e-mail a SMS, hodinu předem e-mail,
10 minut předem SMS; připomínka do 6 h po pozvánce se vynechá. (3) Po přesunu se připomínky
přepočítají a klient dostane **zprávu o změně** (volba v okně, výchozí zapnutá; asistent ji
neposílá). (4) **SMS přes Odorik** (účet už je kvůli Growth OS), text bez diakritiky do jedné
SMS, odesílatel jen „Odorik.cz"/„smsinfo"/„5517". (5) **Spouštěč každou minutu je pg_cron v Supabase**
(úloha `zakaziq-meeting-reminders`, pg_net, klíč `MEETING_REMINDERS_SECRET` z Vault), Vercel Pro ne. (6) Smazaná schůzka zmizí i z
Google Kalendáře. Potvrzení účasti klientem (stránka schůzky) je další krok, zatím nepostavený.
**Proč:** Kryštof 2026-11-23: „aby klienti nezapomínali a opravdu jednali", 24 h, hodinu
a 10 minut předem SMS i e-mailem, zprávu upravit a odeslat; „Vercel Pro není třeba". Kanály
rozložené tak, aby nepřišlo sedm zpráv (návrh přijat „pojďme na to"). Odložené SMS Odoriku nejdou
zrušit a naplánované e-maily Resendu by SMS nepokryly — jedna fronta pro obojí. cron-job.org bez účtu Kryštofa
nešlo nastavit z terminálu, Supabase už běží pro přihlášení.
**Důsledek:** migrace 128 (`meeting_reminders`, `calendar_events.meeting_phone`, `reminders_on`,
`admin_settings.reminders_tick_at`). **Každá změna času události musí jít přes `updateCalendarEvent`**,
jinak se Google ani připomínky nepřesunou. Nová zpráva klientovi ke schůzce = nový `kind`
ve frontě a text v `lib/admin/meeting-email.ts`, ne vlastní odesílání. Mění R-114 v části
„schůzka jen z AI asistenta" a zavírá jeho přijaté riziko (smazaná schůzka v Googlu). Technika
`docs/admin/AGENTS-ADMIN.md` → „Schůzky přes Google Meet z kalendáře", bezpečnost DECISIONS #049.

### R-138 · Ochrana proti XSS a DDoS: vrstvy místo jedné pojistky (2026-11-20, v `main` 2026-11-23)
*Na větvi vzniklo jako R-121 a DECISIONS #040; obě čísla už měl klientský prostor, přečíslováno při sloučení.*
**Rozhodnutí:** (1) Cizí text do HTML jen přes `lib/security/html.ts`; test `xss-guard.test.ts` hlídá zdroják a nová výjimka je nové rozhodnutí. (2) DDoS se řeší ve vrstvách: Vercel WAF (zatím nenastavený) → brána v `proxy.ts` → paměťová předbrána před databázovými limity → limity vstupů; Chromium přes semafor, těla nahrávek a formulářů se stropem i bez `content-length`.
**Proč:** zadání Kryštofa 2026-11-20 („zohledňovat XSS a postavit ochranu proti DDoS"). Aplikace sama útok, který stojí funkce už tím, že se spouštějí, nezastaví (landing je dynamická kvůli nonce, R-033) — proto WAF; to, co zastavit umí, je zahlcení databáze a paměti.
**Důsledek:** `.claude/security/STATE.md` → „Ochrana proti XSS a DDoS", `docs/AGENTS-REFERENCE.md` → B13, DECISIONS #050. Nový endpoint na IP limit používá `isApiRateLimited`/`hitLimit` (předbrána je v nich), nová drahá operace semafor, nové tělo `readJsonLimited`/`readFormDataLimited`. Nový `href` z cizího zdroje `safeHttpUrl`. Nový e-mail **nesmí mít vlastní `escapeHtml`** — test spadne. Vypínač brány `FRONT_GATE=off`.

### R-139 · Text e-mailu s fakturou je šablona z Údajů dodavatele (2026-11-20, v `main` 2026-11-23)
*Na větvi vzniklo jako R-121 s migrací 120; obě čísla už byla obsazená, přečíslováno při sloučení.*
**Rozhodnutí:** předmět a text e-mailu, kterým faktura odchází klientovi, jsou šablona uložená v
`admin_settings.invoice_email_template` (migrace 129), upravuje se v Faktury › Údaje dodavatele s náhledem na
ukázkových údajích. Proměnné `{cislo}`, `{castka}`, `{splatnost}`, `{odberatel}`, `{dodavatel}`; překlep v proměnné
se neuloží. Bez uložené šablony, bez migrace i s poškozeným záznamem se použije **přesně dosavadní text** (čtení
nikdy nespadne). Platí pro „Poslat e-mailem" i „Schválit a poslat" (obojí jde přes `sendIssuedInvoice`);
`subject`/`text` zadané přímo v požadavku mají přednost. Zůstává prostý text bez brandové hlavičky.
**Proč:** Kryštof 2026-11-20 („Ano, udělat") chtěl mít obecný text od VIZEONu bez zásahu do kódu; 2026-11-23
„Dokončit a sloučit". Prostý text: faktura má dorazit jako osobní e-mail, ne jako notifikace (R-116). Dosazuje se
jedním průchodem, takže `{cislo}` ve jménu odběratele se nerozbalí; předmět je vždy jeden řádek.
**Důsledek:** `lib/admin/invoice-email-template.ts` (schéma, dosazení, náhled, formát částky),
`lib/admin/invoice-email-settings.ts` (čtení/zápis), `components/admin/invoices/email-template-form.tsx`,
`app/dashboard/finance/invoice-actions.ts` (`getInvoiceEmailTemplate`, `saveInvoiceEmail`). Nový text e-mailu
s fakturou se píše tam, ne v `invoice-send.ts`. Neřešeno: úprava textu pro jednu fakturu před odesláním. Upřesňuje R-117.

### R-140 · Schůzka přes Google Meet je v kalendáři vždy fialová (2026-11-23)
*Vzniklo lokálně jako R-138; to číslo mezitím dostala ochrana XSS a DDoS v `main`, přečíslováno 2026-11-24.*
**Rozhodnutí:** (1) V okně „Událost / schůzka" je hned pod výběrem typu otázka „Schůzka přes
Google Meet?" s volbami Ne / Ano (dřív přepínač až pod kontaktem). (2) Každá schůzka přes
Google Meet je v kalendáři fialová (`--staff-3`): ruční událost s odkazem na Meet i konzultace
přes Meet. Fialovou nemá nic jiného, konzultace přes Teams přešla na růžovou (`--staff-4`).
**Proč:** Kryštof 2026-11-23: „chci určit, zda se jedná o Google Meet, a schůze budou vždy fialové".
**Důsledek:** upřesňuje R-103 (kategorie v kalendáři berou tóny termínů): fialová je vyhrazená
schůzkám. Nový druh události nedostane `MEETING_TONE`. Ostatní události bez Meetu zůstávají
olivové. Bez migrace.

### R-141 · Jeden klient, jedny údaje: kontakt je zdroj e-mailu a telefonu (2026-11-24)
**Rozhodnutí:** (1) E-mail a telefon klienta drží **kontakt** (`contacts`); Hovory, zakázka a budoucí
schůzka (`invite_to`, `meeting_phone`) z něj berou údaje. (2) Jedno pravidlo propisu všemi směry:
nová hodnota nahradí **prázdné místo nebo starou hodnotu**, jinou ručně zadanou nechá být. (3) Odkud
změna přijde: oprava v Kontaktech → všude; úprava e-mailu či telefonu v Hovorech → do kontaktu (když
tam byla stará hodnota nebo nic) a dál; Growth OS → do kontaktu, jen když ho kontakt pořád drží z minula
(Kryštofova oprava má přednost); e-mail zadaný v okně schůzky → do kontaktu, když žádný neměl.
(4) **Firma od AI asistenta, která řekla ano** (stavy `ACCEPTED_STATUSES`, hotová ukázka, nebo převzatá),
dostane kontakt sama při příjmu snímku (`source = 'growth-os'`); firma bez souhlasu do Kontaktů nejde.
Fronta i detail firmy pak ukazují e-mail a telefon z kontaktu. (5) Nový i upravený řádek Hovorů se na
kontakt napojí (`createLead`, `updateLead`). (6) Okno události v kalendáři má našeptávač z Kontaktů.
(7) Doklady se nemění, nesou údaje z doby vystavení; `projects.client_email` a `client_phone` doklad
nejsou a propisují se.
**Proč:** Kryštof 2026-11-24: „ten systém zná údaje toho konkrétního klienta… chci, aby se přepsaly úplně
všude… abych to nemusel furt kopírovat". Údaj žil na pěti místech zvlášť: e-mail z Growth OS se do okna
schůzky nedostal, `ensureContact` existujícímu kontaktu nic nedoplnil a schůzky neměly telefon pro SMS
(changelog 2026-11-24). Přepsat i jinou ručně zadanou adresu by smazalo vědomou výjimku (kancelářský
e-mail u jedné zakázky), proto jen prázdné místo nebo stará hodnota.
**Důsledek:** migrace 130 (`outreach_leads.contact_id`, jednorázové doplnění prázdných míst). Upřesňuje
pravidlo z migrace 104 („`contact_id` = kdo to je, text = co bylo tehdy napsáno") — u Hovorů, zakázek
a schůzek už text sleduje kontakt, u dokladů dál ne. Nová cesta, která mění e-mail nebo telefon klienta,
volá `propagateContact` nebo `absorbIntoContact` z `lib/admin/contact-sync.ts`; nové zobrazení firmy od
asistenta čte údaje přes `outreachContactOverlay`. Sloučení kontaktů propisuje jen do prázdných míst
(sloučení jde vrátit, propis ne). Uzavírá otevřený problém „Nový kontakt v Hovorech se na `contacts`
nenapojuje". Strana Growth OS: nadiktovaný e-mail (`email_jiny`) musí jít do `leads.email`, jinak ho ZakazIQ
nedostane — zadání `new - area of zakaziq/prompty/admin/growth-os-email-z-hovoru.md`. Bezpečnost DECISIONS #051.

### R-142 · Faktura splňuje povinné náležitosti, nese značku VIZEON a vždy „Vystaveno v systému ZakazIQ" (2026-11-24)
**Rozhodnutí:** (1) Každá faktura z ZakazIQ (admin, Workspace, klientský prostor) obsahuje všechny povinné
údaje dokladu: číslo a druh, dodavatele s právním jménem, adresou, IČO (DIČ, má-li) a **údajem o zápisu do
rejstříku nebo jiné evidence** (§ 435 OZ), odběratele, datum vystavení, **datum uskutečnění plnění vždy**,
předmět, množství, cenu za kus a částku; u plátce DPH „daňový doklad", sazbu a rekapitulaci po sazbách,
u neplátce „Dodavatel není plátcem DPH." (2) Dodavatel má **obchodní značku** (VIZEON) velkou v hlavičce,
právní jméno (Kryštof Sobotka) zůstává u dodavatele. (3) Na **každé stránce** je patička „Vystaveno
v systému ZakazIQ · zakaziq.cz" a „Faktura <číslo> · strana X z Y". (4) Zaplacená a stornovaná faktura to
mají napsané nahoře i v souhrnu a nenabízejí platbu. (5) Profil dodavatele bez údaje o zápisu nejde uložit.
**Proč:** Kryštof 2026-11-24: „chci, aby moje faktury splňovaly všechny body, co každá faktura v Česku povinně
musí splňovat… doplň moji firmu VIZEON… profesionální, důvěryhodné… vydáno systémem ZakazIQ vždy uváděj".
Údaj o zápisu u podnikatele zapsaného v jiné evidenci (živnostenský rejstřík) vyžaduje § 435 odst. 1 OZ.
**Důsledek:** `lib/invoice-pdf/render.ts`, nová pole profilu `tradeName`, `registry`, `phone`, `web`
(`lib/admin/invoice-issue-schema.ts`, `.default('')` kvůli starým profilům), migrace 131 (do klientského
prostoru jde značka, zápis a web, ne e-mail a telefon — DECISIONS #042). Technika `docs/admin/AGENTS-ADMIN.md`
→ „Vzhled a povinné údaje faktury (R-142)". Workspace profil pole `registry` zatím nemá (Otevřené problémy).

### R-143 · Před fakturou se vybírá druh, faktury jdou po procentech z ceny zakázky (2026-11-24)
**Rozhodnutí:** (1) Před každou fakturou v adminu se vybere druh: **Za celé dílo**, **Zálohová** (výchozí 30 %),
**Částečná** (další část, třeba 30 / 30 / 40) nebo **Finální** (doplatek všeho, co zbývá). Nic se nepředvyplní,
bez volby faktura nevznikne. (2) Procento je z ceny zakázky, částku počítá server z databáze a nikdy nepustí víc,
než zbývá vyfakturovat; po záloze už nejde „za celé dílo", finální až když je co odečíst. (3) Pruh „zaplaceno /
čeká na zaplacení / zbývá vyfakturovat" je ve formuláři i v detailu zakázky (Fakturace › Platby za zakázku,
tlačítka pro každý druh). (4) Na PDF nadpis podle druhu (Zálohová / Částečná / Konečná faktura), u zálohové bez
data plnění a s větou, že není daňový doklad, a „Rozpis ceny zakázky" s předchozími fakturami. (5) Jedna číselná
řada pro všechny druhy (VS = číslo). (6) Hotová zakázka se zálohou připraví koncept **finální** faktury na zbytek.
**Proč:** Kryštof 2026-11-24: „chci vždy rozhodnout, zda se jedná o zálohovou, finální, nebo fakturu za dílo…
systém zbývá doplatit… přímka… vystav mi fakturu na zbývajících 30 %… 30, 30, 40". Vlastní řada pro zálohy by
rozbila VS (jen číslice) a pro neplátce nemá oporu v zákoně. Zbytek pod 1 Kč se dorovná, ať 30/30/40 z lichých
korun sedí na cenu.
**Důsledek:** migrace 132 (`invoices.invoice_kind`, `share_percent`, `settlement` + koncepty, nová těla
`admin_invoice_issue` a `admin_invoice_locked`) a 133 (`portal.invoices.document`). `lib/admin/invoice-kinds.ts`
(čisté výpočty), `project-billing.ts`, `prepareKindIssue`. **Mění R-117** v části „k zakázce s fakturou se koncept
nepřipravuje" — s migrací 132 vznikne finální koncept na zbytek. Nová cesta k vystavení faktury musí projít
`prepareKindIssue`, jinak se druh neuloží. Technika `docs/admin/AGENTS-ADMIN.md` → „Druh faktury a rozpis ceny
zakázky (R-143)", DECISIONS #042 doplnění.

### R-148 · ZakazIQ Voice: diktování z Macu, zpracování v adminu, text natrvalo (2026-11-25)
**Rozhodnutí:** vlastní diktování jako Wispr Flow podle `docs/admin/VOICE-PLAN.md` (oddíl 2, D-V1–D-V13).
Kryštof potvrdil: (1) zpracování na **serveru ZakazIQ** (admin), Mac jen nahrává, ukazuje lištu a vkládá
(D-V2); (2) aplikace pro Mac ve **Swiftu bez cizích balíčků ve složce `voice-mac/` v repu** (D-V5);
(3) **text diktátů na serveru natrvalo, dokud ho sám nesmaže** — jeden diktát, období, vše; automatická
lhůta jen volitelná, výchozí vypnutá; zvuk se neukládá nikdy (D-V7, změna proti doporučeným 90 dnům);
(4) slovo se naučí **samo** po 3 stejných opravách, pravidla stylu a blokované fráze **jen po schválení**
(D-V8). Ostatní body oddílu 2 podle doporučení (Groq `whisper-large-v3-turbo`, čištění rolí `fast`,
Fn ≥ 0,3 s, offline fronta bez pozdního vkládání, limity, Dílky). Je to **výslovné zadání změny adminu**
v rozsahu, který jmenují sezení VO01–VO12.
**Proč:** Kryštof 2026-11-25 („vlastní Wispr Flow v barvách ZakazIQ, učí se z logů, statistiky v adminu");
u textu chce celou historii k dohledání. Klíče poskytovatelů jen na serveru a jedno místo pro logy,
učení a statistiky. Čísla R-144–R-147 mají rozdělané větve (doručení pozvánek, Wispr Flow, navrhovač
nabídek).
**Důsledek:** migrace 136 (VO01) bude mít `text_retention_days` výchozí NULL a `voice_corrections`
navázané na diktát kaskádou, bez vlastní lhůty. Admin musí umět diktáty mazat a hledat v nich (VO10),
jinak žádost GDPR o výmaz zmínky o klientovi nejde splnit. Nová pojistka **G12** (ozvěna nápovědy):
test VO00 ukázal, že přepis s nápovědou slovníku na tichu vrátí celou nápovědu. Názvy modelů Claude jen
v `lib/ai/models.ts`, ceny v `lib/admin/voice/costs.ts`. Zpracovatel Groq do `.claude/security/DECISIONS.md`
ve VO02. Žádný nový npm balíček.

---

## 3. Otevřené problémy

- [ ] **ZakazIQ Voice — dokončit VO00:** (1) `GROQ_API_KEY` z console.groq.com vložit do `.env.local`
  hlavní složky (worktree na něj odkazuje) a v Groq Data Controls zapnout Zero Data Retention,
  (2) nahrát ~10 vět vlastním hlasem jako `*.m4a` + `*.txt` s přesným textem do `~/ZakazIQ-voice-test/`
  (e-mail klientovi, Slack, zadání pro Claude s anglickými slovy, čísla a data, „ZakazIQ", „Prvotka",
  „VIZEON") a pustit `node scripts/voice-stt-test.mjs ~/ZakazIQ-voice-test` bez nápovědy i s `--napoveda`,
  (3) před VO03 certifikát pro podpis: Přístup ke klíčence → Asistent certifikátů → Vytvořit certifikát,
  název „ZakazIQ Voice vývoj", typ identity Self Signed Root, typ certifikátu **Code Signing**
  (dnes 0 identit pro podpis). Zatím otestováno jen OpenAI na syntetickém hlasu (plán 12a) · Kryštof · od 2026-11-25
- [ ] **ZakazIQ Voice — čištění se skutečným modelem neověřené (VO07):** zlatá sada běží s podvrženými odpověďmi.
  Pustit `node scripts/voice-eval.mjs --ano` (volá Claude, stojí pod 1 Kč) a výsledek zapsat do plánu oddíl 14;
  po VO06 navíc 10 skutečných diktátů v Mailu, Slacku a Claude (kolik skončilo `raw` a proč) · Kryštof · od 2026-11-26
- [ ] **ZakazIQ Voice — denní strop nezastaví přepis:** nad `daily_cost_cap_usd` se jen přeskočí čištění (D-V11),
  přepis běží dál až do limitu 400 diktátů za hodinu na zařízení; ukradený klíč tak do zneplatnění stojí jednotky USD
  za hodinu. Návrh pro VO12: nad násobkem stropu odmítnout i přepis (429) — rozhodne Kryštof · DECISIONS #055 (g) · od 2026-11-26
- [ ] **ZakazIQ Voice — `AGENT_KEY_PEPPER` chybí v lokálním `.env.local`:** bez něj lokálně nejde přidat zařízení
  a `/api/public/voice/*` vrací 503. Doplnit libovolný náhodný řetězec aspoň 32 znaků, jen pro vývoj;
  produkce má vlastní ve Vercelu · Kryštof · od 2026-11-26
- [ ] **ZakazIQ Voice — test číslování migrací na větvi `admin/zakaziq-voice` padá:** migrace 136 je za 133,
  čísla 134 (zrušení schůzek) a 135 (doručení pozvánek) jsou na jiných větvích. Spraví se rebasem po jejich
  sloučení do `main`; čísla neměnit · `lib/ws/__tests__/ws-schema.test.ts` · od 2026-11-26
- [ ] **ZakazIQ Voice — `/dashboard/voice` za přihlášením neověřené:** vzhled ověřen jen na dočasné stránce
  s vymyšlenými zařízeními (1280 a 390 px, bez přetečení, plochy ≥ 44 px, konzole bez chyb). Projít
  s přihlášením: Přidat zařízení → klíč ukázaný jednou, po obnovení stránky už ne → Zneplatnit → Zpět.
  Blok s klíčem okem nikdo neviděl (stejné třídy jako klíč webu, KP17) · od 2026-11-26
- [ ] **Profil dodavatele bez IBANu:** produkční `admin_settings.issuer_profile` je od 2026-11-24 přepsaný na
  skutečné údaje (Kryštof Sobotka, VIZEON, IČO 29977231, neplátce, údaj o zápisu, vizeon.cz; SQL na souhlas
  Kryštofa). Chybí **IBAN** (bez něj faktura nemá účet ani QR) a případně DIČ. Doplnit v Faktury › Údaje
  dodavatele · Kryštof · od 2026-11-24
- [ ] **Faktury R-142 a R-143 — projít naživo:** na produkci od 2026-11-24 (`aaa3215`, migrace 131–133).
  Formulář a pruh ověřené jen na dočasné stránce s vymyšlenými daty (1280 a 390 px), logika testy nad PGlite.
  Projít za přihlášením: Údaje dodavatele (doplnit IBAN), zakázka s cenou → Zálohová 30 % → zaplatit →
  Částečná → Finální, PDF všech tří, karta Platby za zakázku, koncept po přepnutí zakázky na Hotovo
  · od 2026-11-24
- [ ] **Workspace: údaj o zápisu na faktuře chybí:** profil Workspace (`ws.accounts.invoice_profile`, Nastavení ›
  Firma a fakturace) pole `registry` nemá, faktury firem z Workspace proto § 435 OZ nesplní. Doplnit pole
  a povinnost jako v adminu · `lib/ws/money/{schema,data}.ts` · od 2026-11-24
- [ ] **Plátce DPH a faktura v eurech:** zákon o DPH chce daň na dokladu v Kč; renderer ji u EUR faktury tiskne
  v eurech a kurz neukládáme. Admin (Kryštof je neplátce) se netýká, Workspace ano — zakázat EUR plátci, nebo
  ukládat kurz ČNB · od 2026-11-24

- [ ] **Jeden klient, jedny údaje (R-141) — projít naživo:** kód i migrace 130 jsou na produkci od 2026-11-24.
  Projít: firma od asistenta se souhlasem má v detailu
  „Upravit telefon a e-mail", oprava e-mailu v Kontaktech se objeví v Hovorech, v okně schůzky a u budoucí
  schůzky; okno události v kalendáři našeptá kontakt a vyplní telefon i e-mail (390 a 1280 px, Escape zavře
  jen našeptávač). Ověřeno jen testy nad PGlite, `tsc` a buildem · od 2026-11-24
- [ ] **Growth OS neposílá e-mail nadiktovaný v hovoru:** `email_jiny` jde do e-mailu s ukázkou, ale ne do
  `leads.email`, a v datech z hovoru je zakrytý. Zadání pro autopilota
  `new - area of zakaziq/prompty/admin/growth-os-email-z-hovoru.md` · od 2026-11-24
- [ ] **Kontakty z Growth OS bez retence:** firma, která řekla ano, má od R-141 kontakt (`source = 'growth-os'`);
  `contacts` žádnou retenci nemá (viz výmaz kontaktu níž). Rozhodnout spolu s retencí `outreach_leads` · DECISIONS #051 · od 2026-11-24

- [ ] **Text e-mailu s fakturou (R-139) — projít naživo:** migrace 129 je na produkci od 2026-11-23. Projít Faktury › Údaje dodavatele (uložit, náhled,
  překlep v proměnné) a odeslat fakturu na vlastní e-mail. **Uložení ani odeslání přes Resend naživo neověřené** · od 2026-11-23

- [ ] **Ochrana proti DDoS (R-138) — zapnout WAF a projít:** (1) Vercel WAF pravidla z `.claude/security/STATE.md`
  (strop `/api/public`, přihlášení, celý web; nejdřív v režimu `log`) — MCP pro firewall vrací 404, nastaví Kryštof
  z dashboardu nebo CLI, (2) po nasazení hlídat, že brána nezastaví legitimní provoz (429 v runtime logách,
  `FRONT_GATE=off` jako záchrana), (3) zkušební stažení PDF při souběhu, (4) e-maily s odkazem a tlačítkem vizuálně
  v Gmailu a Apple Mailu. **Ověřeno jen testy, `tsc` a buildem** · od 2026-11-20

- [ ] **Připomínky schůzek (R-137) — projít naživo:** ~~migrace 128 a 120~~, ~~klíče ve Vercelu~~
  (`MEETING_REMINDERS_SECRET`, `ODORIK_API_USER`, `ODORIK_API_PASSWORD` — nasazení `dpl_5TCi…`
  vzniklo až po nich), ~~spouštěč~~ (pg_cron v Supabase, 200 každou minutu, `reminders_tick_at` se
  zapisuje), ~~nasazení~~ (`c23adf5`, 2026-11-23, bez běhových chyb), ~~fronta a e-mail přes Resend
  na produkci~~ (2026-11-23, 17 zkušebních schůzek, viz changelog). Zbývá, co jde jen přes
  přihlášený admin a skutečný telefon: **zkušební schůzka** na vlastní e-mail a telefon za ~70 minut
  — pozvánka s `.ics` (Google Meet), SMS 10 minut předem (ověří údaje Odoriku), přesun (čas
  v Googlu), smazání (zmizí z Googlu). Cenu SMS Odoriku zjistit v jeho ceníku · Kryštof · od 2026-11-23
- [ ] **Potvrzení účasti na schůzce (R-137, další krok):** stránka schůzky s „Potvrdit účast /
  Potřebuji jiný termín" a upozorněním „nepotvrdil, zavolej mu". Nepostaveno; v pozvánce je zatím
  „odpovězte na e-mail" · od 2026-11-23
- [ ] **„Direktor" v textu pozvánky:** Kryštof chtěl v pozvánce doporučit „mít otevřený direktor",
  nevíme, co tím myslí; do výchozího textu se nedalo · od 2026-11-23


- [ ] **Landing vede do registrace, která nejde dokončit naostro:** „Vyzkoušet 14 dní zdarma" na
  www.zakaziq.cz otevře registraci vývojové instance Clerku (nápis *Development mode*, ověřeno
  2026-11-21). Rozhodnuto (R-134): do spuštění Workspace na Supabase vede hlavní akce na formulář
  „Chci to vyzkoušet" — **na produkci od 2026-11-21 (`1e3c993`)**, ověřeno na www.zakaziq.cz
  (odkazy, předvyplnění, konzole bez chyb); skutečné odeslání formuláře nezkoušeno. Po spuštění F2 přepnout
  `SIGNUP_OPEN` v `components/marketing/content.ts` na `true`. Ověřit, jestli Vercel Production nemá testovací klíč
  Stripe — pak by si kdokoli s testovací kartou založil na produkci předplatné zdarma · od 2026-11-21

- [ ] **E-maily z Hovorů (R-132) — projít naživo:** v prohlížeči ověřené jen okno na fiktivním
  kontaktu (390 a 800 px) a logika testy nad PGlite s podstrčeným Googlem a Resendem. Zbývá po
  nasazení: (1) Profil → Propojit Google účet, pokud ještě není (jinak je karta schůzky vypnutá),
  (2) Hovory → u kontaktu s vlastním e-mailem pošli Nabídku a Schůzku na vlastní adresu: v e-mailu
  má být termín, tlačítko Připojit se, odkaz na vizeon.cz, v Google Kalendáři událost s Meetem,
  v Hovorech příští akce „Schůzka přes Google Meet" a poznámka s odkazem, (3) kontakt s propojenou
  událostí v kalendáři: událost se posune a dostane „Připojit se", (4) Nabídka: pole Cena se
  předvyplní z odhadované hodnoty kontaktu. **Doručení a skutečný Meet nikdo nezkusil** · Kryštof · od 2026-11-20

- [ ] **AI asistent jako CRM (R-120) — propojit s Growth OS:** ~~migrace 119~~ na produkci
  (Kryštof 2026-11-18), ~~merge a deploy~~ (`4408221`, 2026-11-18). Zbývá:
  (3) zadání
  `new - area of zakaziq/prompty/admin/growth-os-ai-asistent-crm.md` v Claude Code v repu autopilota
  (kontrakt v2, odeslání hned po hovoru, Resend webhook, měření ukázky, náhled, Odorik, zpětný kanál),
  (4) projít na produkci Přehled, Kontakty a detail na 390 a 1280 px. **Nic z toho nikdo neviděl
  na skutečných datech** · od 2026-11-18

- [ ] **Koncepty faktur (R-117) — nasadit a projít naživo:** kód na větvi `admin/faktury-koncepty` (worktree `../ZakazIQ-faktury`), na produkci není. Migrace 117 je podle Kryštofa na produkci, merge do `main` 2026-11-17. Zbývá průchod: zakázka → Hotovo → do 15 s koncept v Ke schválení → doplnit adresu → Schválit a poslat na vlastní e-mail → PDF v příloze, číslo v řadě; Zpět během 10 s nic nepošle; pravidelná faktura se dnem = dnešek se objeví až po běhu cronu. **Odeslání přes Resend s PDF nikdo nezkusil naživo** · od 2026-11-17
- [ ] **Dotazník R-119 — projít naživo:** migrace 118 je na produkci (pustil Kryštof 2026-11-18)
  a kód taky (`70abbed`). Zbývá: (1) vložit odkaz na recenzi z Google profilu firmy do Profilu
  → Recenze na Googlu, (2) zkušební zakázka s vlastním e-mailem → Hotovo → po 15 s e-mail
  z krystof@vizeon.cz, klik na číslo → známka uložená, dokončit formulář pro 10, 7 a 3
  (u 3 upozornění do zvonku i e-mailem), (3) e-mail v Gmailu, Seznamu a Apple Mailu na
  telefonu. **Doručení ani formulář nad skutečnou databází nikdo nezkusil** · Kryštof · od 2026-11-17
- [ ] **Asistent jako chat (R-113) neověřený naživo ani v prohlížeči:** ověřeno testy, `tsc`, buildem a živě se Sonnetem nad smyšleným přehledem (4 ze 4), ale ne v prohlížeči nad skutečnými daty. Projít: věta bez času → otázka → odpověď „ve tři" → zapsáno jednou; „posuň to na čtvrtou" v témže chatu; „oprav Novákovi telefon"; „zapamatuj si…" a že se paměť objeví v dalším chatu; nový chat po „Nový chat". Hlídat, jestli se neptá zbytečně (otravné) a jestli Sonnet nestojí víc, než je odhad · od 2026-11-17
- [ ] **Hovory od asistenta (R-112) — spustit a projít:** ZakazIQ strana je na produkci
  (`2cf1447`, `POST /api/public/outreach` bez klíče vrací 401), klíč ve Vercelu i v GitHub
  Secrets, migrace 114 podle Kryštofa venku. Zbývá: (1) push `claude/zakaziq-admin-sync`
  v autopilotu (commit `91c286d`), (2) jednou workflow „Synchronizace do ZakazIQ" s volbou
  „všechny", (3) projít Hovory › Od asistenta na 390 a 1280 px, převzetí do Hovorů (hovor
  v kalendáři ve správný čas) a „Nemá zájem" se Zpět
  · `docs/admin/GROWTH-OS-PLAN.md` oddíl 6 · Kryštof · od 2026-11-17
- [ ] **Schůzky s Google Meet (R-114) — projít naživo:** kód na produkci od `2cf1447`; nastavení je hotové 2026-11-17
  (Google Cloud projekt `zakaziq-admin` pod organizací vizeon.cz, Calendar API, souhlas
  Internal se scope `calendar.events`, klient „ZakazIQ admin web"; ve Vercelu Production
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_KEY`, `VIZEON_RESEND_API_KEY` —
  klíč Resendu jen pro odesílání z vizeon.cz; migrace 114 a 115 podle Kryštofa na produkci).
  Zbývá Profil → Propojit Google účet a zkušební schůzka na vlastní e-mail. **Naživo nic nezkoušeno** —
  Google ani Resend jen s podstrčenými odpověďmi v testech · `docs/admin/GROWTH-OS-PLAN.md`
  oddíl 6 · Kryštof · od 2026-11-17
- [ ] **AI asistent (R-118) — nasadit a projít:** (1) migrace 116 na produkci, (2) deploy ZakazIQ,
  (3) push `claude/zakaziq-admin-sync` v autopilotu, (4) jednou `npm run zakaziq:report -- --od 2026-11-10`
  a workflow „Synchronizace do ZakazIQ" s „všechny", (5) projít `/dashboard/ai-asistent` na 390
  a 1280 px: Kontakty → Poslat pozvánku (termín a úvod s dnem hovoru), Reporty a detail dne,
  Analýza a zkopírování promptu. Bez migrace 116 endpoint vrací 503 a autopilot po každém reportu
  pošle notifikaci · Kryštof · od 2026-11-17
- [ ] **`outreach_leads` bez retence:** drží jména a telefony lidí, kterým se volalo nevyžádaně,
  i když zájem nemají. Návrh 12 měsíců od posledního snímku · DECISIONS #033 · od 2026-11-17
- [ ] **Growth OS neeviduje otevření ukázky ani e-mailu:** `demos.views` a `emails.opened_at`
  v D1 nikdo neplní, takže fronta „otevřel ukázku" zatím nenastane · práce v autopilotu
  (plán krok 7) · od 2026-11-17

- [ ] **Asistent (R-111) na produkci, ale v prohlížeči neověřený:** projít s přihlášením na produkci na 390 a 1280 px — diktování (povolení mikrofonu, Safari `audio/mp4`), věta se dvěma akcemi, toast „Zpět", „Vrátit" u kroku, faktura na klepnutí, věta na detailu zakázky (nesmí se provést sama). Dotazy na data (A4) projít na produkčních datech — testovací Neon nemá tabulky adminu, takže živě běžely jen nad podstrčenými daty · `docs/admin/ASISTENT-PLAN.md` · od 2026-11-16

- [ ] **KP12 projít naživo:** na produkci od 2026-11-21 (`fa79603`), migrace 121 od 2026-11-20. Projít:
  Nastavení › Služby (založit čtyři služby, napsat etapy Webu, přetáhnout pořadí, smazat a Zpět), nová
  zakázka se službou Web (termíny od začátku, úprava etapy), detail (stav jedním klikem se Zpět, termín,
  procenta v hlavičce i formuláři), `/klient` (osa, „Mám hotovo", Vrátit, zvonek). Ověřeno jen PGlite
  a dočasnou stránkou s vymyšlenými daty na 390 a 1280 px · od 2026-11-18
- [ ] **KP10 — zbývá krok 7, pilot s jedním klientem:** kroky 6 (nasazení, Supabase) a 8 (živý audit,
  0 chyb) hotové 2026-11-21. Pilot podle `docs/klientsky-prostor/PILOT.md` smí začít, až bude mít admin
  druhý faktor (kritérium 5, samostatný bod níž). Pro prostor pro všechny dál: DPA Neonu, Googlu a OpenAI
  v účtech neověřené (`GDPR.md`, Vercel bez DPA přijato v R-133), kontrola textu `/klient/soukromi`
  Kryštofem a zpracovatelé ve smlouvě s klientem. Kritéria v plánu, oddíl 11.1 · od 2026-11-20
- [ ] **KP17 projít naživo:** na produkci od 2026-11-21 (`fa79603`), migrace 126 od 2026-11-20, nová env
  není. Projít: zakázka → Poptávky z webu → Vytvořit klíč → klíč do env webu klienta → zkušební příkaz
  (`{"ok":true}`, v kartě „Zkušební událost dorazila") → skutečné odeslání formuláře → číslo v adminu
  i v `/klient` (Přehled, panel O zakázce, detail projektu). **Žádný web klienta zatím napojený** —
  napojení podle `docs/klientsky-prostor/NAPOJENI-WEBU-KLIENTA.md` je práce v repozitáři webu klienta.
  Vzhled ověřen jen na dočasné stránce s vymyšlenými daty · od 2026-11-20
- [ ] **KP16 projít naživo:** na produkci od 2026-11-21 (`fa79603`), migrace 125 od 2026-11-20. Projít
  na 390 / 768 / 1280 / 1440 px: přihlášení s nepřečtenou zprávou otevře chat, bez ní Přehled; „Čeká
  na vás" (schválení, „Mám hotovo", faktura po splatnosti, hodnocení); panel O zakázce u chatu a na
  telefonu z tlačítka (i); Faktury a Konzultace přes víc zakázek; hodnocení hotové zakázky se objeví
  v Hodnocení adminu; etapa na Hotovo → za 15 s e-mail klientovi z krystof@vizeon.cz, druhá do 24 h
  nepřijde; odkaz „Přihlásit se do vašeho prostoru" na `/p`. **Resend ani skutečná data nikdo
  nezkusil** · od 2026-11-20
- [ ] **KP15 projít naživo:** na produkci od 2026-11-21 (`fa79603`), migrace 124 od 2026-11-20, bucket
  `chat-prilohy` založen 2026-11-21. Projít na 390 / 768 / 1280 / 1440 px: klient napíše, nadiktuje
  a pošle screenshot → do 10 s ve Zprávách adminu, zvonek; odpověď z telefonu; dvě fajfky po přečtení;
  e-mail klientovi jen když chat nemá otevřený; „Ke schválení" → Schvaluji / Chci změny; „Udělat
  z toho zadání" → Požadavky klientů; foto z telefonu nad 4 MB se zmenší. **Supabase Storage, Resend
  ani přepis hlasu v chatu nikdo nezkusil naživo** · od 2026-11-20
- [ ] **KP14 projít naživo:** na produkci od 2026-11-21 (`fa79603`), migrace 123 od 2026-11-20. Projít:
  Kalendář › Přidat › Volno pro klienty (jednou i každý týden), plocha v Týdnu a Dni, detail volna
  a smazání jen dne i celé řady se Zpět; `/klient` › projekt › Domluvit konzultaci (den, čas, popis)
  → do minuty odkaz na Meet v e-mailu z krystof@vizeon.cz, v kalendáři adminu i v Hovorech; Přesunout
  a Zrušit (+ Vrátit); `/p` rezervace jen ve volnu, bez volna věta „Volný termín teď nemám". **Google
  Meet ani Resend nikdo nezkusil naživo** (jen testy s podstrčenými odpověďmi); vzhled ověřen na
  dočasné stránce s vymyšlenými daty na 375 a 1280 px · od 2026-11-20
- [ ] **KP13 projít naživo:** na produkci od 2026-11-21 (`fa79603`), migrace 122 od 2026-11-20. Projít:
  zakázka propojená s klientem → `/klient` › projekt ukáže Cenu, Zaplaceno, Zbývá; vystavit fakturu →
  objeví se „Čeká na zaplacení", Stáhnout PDF (shodné s PDF v adminu), Zaplatit QR kódem v bance (jen
  s IBANem v profilu dodavatele); označit zaplaceno → Zbývá klesne v adminu i u klienta; storno;
  archivní faktura s nahraným PDF. **Změna adminu (R-125):** zkontrolovat „Nezaplaceno" ve výpisu
  zakázek a v Podnikání — u zakázek se zaplacenou fakturou bez „Peníze dorazily" teď klesne. Ověřeno
  jen PGlite a dočasnou stránkou na 390 a 1280 px · od 2026-11-18
- [ ] **KP11 — zbytek průchodu:** naostro 2026-11-21 prošla pozvánka → nastavení hesla → e-mail
  s obnovou hesla (z Resendu, česky). Neověřené zůstává: pozvání z detailu zakázky (Pozvat do prostoru
  → e-mail z krystof@vizeon.cz), „Zpět" do 10 s nic nepošle, druhá zakázka stejného klienta se zeptá
  na prostor, „Zkopírovat odkaz", klient po přihlášení vidí svou zakázku, odhlášení a přihlášení na
  390 a 1280 px · od 2026-11-18
- [x] ~~**Admin v Supabase nemá druhý faktor:** účet adminu má 0 ověřených TOTP faktorů (zjištěno
  2026-11-18), přihlášení do adminu tedy stojí jen na hesle. Zapnout v `/dashboard/profil` →
  Přihlášení · Kryštof · od 2026-11-18~~ — zapnuto 2026-11-21 (viz changelog).
- [ ] **Člověk ve dvou prostorech vidí jen ten první:** `portal.member_lookup` vrací členství podle data
  vzniku a `/klient` bere první. Pozvání proto stejný e-mail drží v jednom prostoru (s potvrzením); kdyby
  měl někdo pracovat pro dvě firmy, chce to výběr prostoru v `/klient` · `lib/portal/context.ts` · od 2026-11-18
- [ ] **Workspace a úklid Clerku (R-107, F2 + F3):** nezačato. Před F2 rozhodnout, jestli
  placený Workspace může běžet na Free projektu Supabase (uspání po týdnu bez provozu,
  limity e-mailů, sdílený projekt s adminem) · `docs/AUTH-SUPABASE-PLAN.md` · od 2026-11-15
- [ ] **Pošta adminu přes Resend (R-116) naživo neověřená:** Gmail SMTP odmítal heslo
  (535 BadCredentials, od 2026-08-18 do 2026-11-17 neodešlo z adminu nic — připomínky, zprávy
  klientům, faktury, dotazníky). Od R-116 jde všechno přes Resend z vizeon.cz. Ověřit první
  skutečné odeslání z Hovorů a faktury s PDF; Gmail proměnné ve Vercelu můžou po ověření pryč
  · od 2026-11-17
- [ ] **Admin od AD08 přibral třetinu JavaScriptu a nikdo si toho nevšiml:** Hovory
  263,8 → 344,5 kB gzip (+31 %), Kalendář 260,6 → 339,4 (+30 %), Poptávky 250,6 → 331,0
  (+32 %), Dnes 245,7 → 297,5 (+21 %). Měřeno 2026-11-14 proti commitu `cabe01c`
  (plán, sekce 11). **Není to AD18** (ten je na nule) ani regrese ve vzhledu — jsou to
  funkce z AD09–AD17 (kontakty, fakturace, asistent, paměť, předání, AI leady). Chybí
  rozpad, která z nich kolik stojí, a strop v testu, aby se to nedělo potichu. Měření
  patří do „Hotovo, když" u každého dalšího sezení, které přidá klientskou komponentu
  · od 2026-11-14
- [ ] **p75 z produkce nikdo neměřil:** admin je na produkci od 2026-11-13, takže to
  **poprvé jde** (Vercel runtime logy / Observability). Plán, sekce 11, má u p75 „Nic".
  Agent na produkční projekt nedosáhne · Kryštof · od 2026-11-14
- [ ] **Co prohlížeč ověřit nemohl (AD17, AD18):** denní obrazovky i osobní část jsou
  proklikané na 390 / 768 / 1280 / 1440 px, ale **Finance › Podnikání, skutečný detail
  zakázky a `/dashboard/profil`** padají na chybějící migraci 106 na testovacím Neonu
  (`column "closed_at"/"company" does not exist`) — vykreslí se kostra, ne obsah. Naživo
  taky nikdo nezkusil **tisk** a chování `mailto:`/`sms:` odkazů na skutečném telefonu
  (dluh z AD10) · od 2026-11-13
- [ ] **AD16 — co prohlížeč ověřit nemohl:** **tvar pruhu AI leadů a karty předávacího
  dokumentu ověřený je** (dočasná stránka s fiktivními daty, 390–1440 px, po opravě popisku
  u odebrání řádku bez nálezu). Zbývá všechno, co od 2026-11-14 jde ověřit **na produkci** (112 je podle Kryštofa venku):
  uzavření zkušební zakázky (dotazník má odejít až po 15 s a „Zpět" ho musí zrušit), věta
  o dotazníku u zakázky a na `/dashboard/profil`, blok **Reference na web** u hodnocení se
  souhlasem, **uložení** dokumentu včetně odmítnutí textu s heslem, **Otevřít PDF** z karty
  a příloha u e-mailu s fakturou. Naostro nikdo nezkusil ani připomínku z denního cronu —
  chce to zakázku s odeslaným dotazníkem starším sedmi dnů · od 2026-11-13
- [ ] **AI leady nikdo neviděl na skutečných datech (AD16):** `agent_leads` je na testovacím
  Neonu prázdná a na produkci do ní posílá `vizeon-lead-agent`. Až se větev nasadí, zkontrolovat,
  jestli se pruh naplní a jestli `communication_strategy` ze skutečného payloadu sedí na schéma
  (tón, styl, focus, avoid) · od 2026-11-13
- [ ] **Předávací dokument nemá vlastní retenci (AD16):** `projects.handover` drží jména
  a adresy administrací, dokud existuje zakázka — `purge_client_retention` (R-076) o něm neví.
  Doplnit spolu s výmazem a exportem údajů kontaktu · DECISIONS #027 · od 2026-11-13
- [ ] **AD15 v prohlížeči neověřený:** 111 je od 2026-11-14 na produkci (na testu ne), takže paměť nikdo neviděl.
  Projít na 390 / 768 / 1280 / 1440 px: karta kontaktu (blok „Co víme z historie", Uložit do
  paměti, odmítnutí textu s klíčem), detail zakázky (sekce Paměť, „O klientovi", Potvrdit
  i Zahodit u návrhu), **`/dashboard/new?kontakt=<id>`** (předvyplněné jméno, telefon, druh práce
  a cena) a **nová faktura ze zakázky** (předvyplněný **popis položky** z minula). Naživo nikdo
  nezkusil ani návrhy paměti z denního cronu (`lib/admin/memory/drafts.ts`) — ty chtějí klíč
  k modelu, zprávy o práci u otevřené zakázky a běh `send-reminders` · od 2026-11-13
- [ ] **Řádky paměti nejsou v žádném exportu údajů (AD15):** admin export údajů kontaktu vůbec
  nemá (všechen kód GDPR exportu je ve Workspace, `lib/ws/gdpr.ts`). Výmaz pokrytý je — triggery
  `trg_projects_forget_memory` a `trg_contacts_forget_memory` plus denní úklid. Doplnit spolu
  s výmazem kontaktu na žádost (AD16/KP10) · DECISIONS #026 · od 2026-11-13
- [ ] **Doprovodné kroky po migracích nikdo neodškrtl (nasazení 2026-11-13):** (1) po 102
  kontrola `SELECT … WHERE lead_pending` z hlavičky migrace — stará nikdy nepotvrzená poptávka
  se má potvrdit nebo smazat, (2) u 109 `WARNING` o nevytvořeném indexu
  `finance_transactions_project_income_unique` = duplicitní příjmy v datech, najde je
  `node scripts/admin-prijmy-duplicity.mjs` a po úklidu se 109 pustí znovu, (3) po 104
  `node scripts/admin-contacts-backfill.mjs` (nejdřív bez `--ano`) — bez něj je obrazovka
  Kontakty prázdná. Agent na produkční DB nedosáhne, dělá Kryštof · od 2026-11-13
- [ ] **Které migrace na produkci opravdu běžely — část je prokázaná z runtime chyb Vercelu
  (2026-11-14):** **100, 102 a 106 na produkci jsou**, a to z chyb, které tam nechal *starý* kód,
  než se nasadila větev: `relation "weight_logs"/"nutrition_logs" does not exist` na `/hub`
  (11.–12. 11. → **100 proběhla**, tedy `DROP TABLE` z R-089 je nevratně za námi),
  `column "business" does not exist` na `/dashboard/calendar` (11. 11. → **102**) a 430×
  `relation "completed_projects" does not exist` na `/h/[token]` (12. 11. 20:20 – 13. 11. 19:15
  → **106**). Od 13. 11. 19:15 **žádná chyba schématu**, takže nový kód a databáze si nikde
  neodporují. **110–112 prokázané nejsou:** denní cron je volá s `.catch(…)`
  (`app/api/cron/send-reminders/route.ts:208–212`), takže chybějící tabulku **spolkne** a do logu
  nedá nic — čistý log tedy nic nedokazuje. **Kryštof 2026-11-14 potvrdil, že „vše je nasazené"**,
  tedy i **110–112**, **101** a **097–099** z Workspace; ty tím stojí na jeho slovu, ne na měření.
  Pozor: u **101** (`DROP TABLE project_blocks`, `block_templates`) chtěl R-089 napřed
  `node scripts/export-before-drop.mjs --ano` — pokud neproběhl, obsah už zpátky nejde.
  Hotová kontrola je
  **`node scripts/admin-stav-produkce.mjs --env .env.production.local`** (jen čte): vypíše evidenci
  migrací, co z 109 v databázi opravdu je, příjmy po letech a měnách (tedy i to, o kolik se
  daňový základ lišil starým kódem) a doprovodné kroky. Agent produkční připojení nemá — stažení
  `vercel env pull` prostředí zamítlo, pouští to Kryštof · od 2026-11-13
- [ ] **Produkční build spadne na obnovené build cache (zjištěno 2026-11-13):** první deploy
  commitu `7a15ad2` skončil 12 chybami `Module not found: Can't resolve
  '@vercel/turbopack-next/internal/font/google/font'` z `next/font/google`, přestože lokální build
  téhož commitu prošel; log začínal „Restored build cache from previous deployment". Deploy
  **bez cache** prošel beze změny kódu. **Hned následující build (jen dokumentace) prošel zase
  s cache**, takže to vypadá na jednorázově poškozenou cache po starém buildu `d948400`, ne na
  trvalou vadu. Kdyby se to opakovalo: ve Vercelu Redeploy s vypnutou cache, nebo
  `VERCEL_FORCE_NO_BUILD_CACHE=1` · od 2026-11-13
- [ ] **AD13 v prohlížeči neověřené:** migrace 109 je od 2026-11-13 na produkci, takže to jde projít rovnou tam (opatrně, jsou to ostrá data). Projít na
  390 / 768 / 1280 / 1440 px: Finance › Podnikání (řádek cizí měny u příjmů i u výkonnosti),
  Dnes (řádek „mimo součet"), detail faktury s **„Je tohle ta platba?"** (přiřazení, „Ne, byly
  to jiné peníze", potvrzení u platby z loňska), formulář zakázky s „Peníze dorazily"
  a „Záloha dorazila", Náklady (ukončení fixního nákladu s historií a hláška „Náklad ukončený,
  historie zůstala") a tlačítko „Doplnit opakované" · od 2026-11-13
- [ ] **AD11 — co prohlížeč ověřit nemohl:** **průvodka a formulář uzavření ověřené jsou**
  (dočasná stránka s fiktivními daty, 390–1440 px, bez nálezu po dvou opravách). Zbývá to,
  co potřebuje migraci 106 na testovacím Neonu: skutečný detail zakázky, „Zpět" u změny stavu
  na datech, `/dashboard/zakazky` s filtry „Uzavřené" a „Vlastní projekty", `/dashboard/profil`
  s přehledem výkonnosti a hodnocením a veřejný `/h/[token]`. Pustit 106 na `rd-test`
  a projít · od 2026-11-12
- [ ] **Migrace 106 na testovacím Neonu chybí:** admin lokálně nepoběží, dokud tam nebude
  (chybí `projects.closed_at`, `project_type`, `survey_token` a archiv). Aplikuje Kryštof
  · od 2026-11-12
- [ ] **AD12 — tlačítko „Načíst z rejstříku" nikdo neklikl naživo.** Endpoint ARES je ověřený
  skutečným požadavkem a akce má testy s podstrčeným `fetch`, ale v prohlížeči se IČO vyplňovalo
  ručně. Zkusit s existujícím i neexistujícím IČO a při vypnuté síti (nesmí zablokovat formulář)
  · od 2026-11-12
- [ ] **Odeslání faktury e-mailem nikdo nezkusil naživo (AD12):** `POST /api/invoices/[id]/email`
  posílá přes Gmail SMTP (`lib/email.ts`, R-004) s PDF v příloze. Ověřit skutečné doručení,
  velikost přílohy a jak to vypadá v Gmailu a Apple Mailu · od 2026-11-12
- [ ] **AD10 — co prohlížeč ověřit nemohl:** headless Chrome potvrdil tvar odkazů, plochy 44 px
  i šířky, ale ne chování **operačního systému**: jestli `mailto:` otevře skutečně předvyplněnou
  zprávu v poštovním klientovi a jestli `sms:+420…?&body=` sedí na iPhonu i Androidu (tvar
  s `?&` je záměrný, `lib/contacts/href.ts`). To jde jen na skutečném telefonu a v Mail.app.
  Neověřené zůstaly i kontaktní akce na **detailu faktury** (ukazují se jen u faktury navázané
  na zakázku a žádná ukázková navázaná není) a u **členů účtu v Klientech** (testovací DB
  nemá ws účet) · od 2026-11-12
- [ ] **Rezervaci z portálu nikdo neposlal naživo (AD10):** párování rezervace → událost →
  kontakt v Hovorech je ověřené jen v PGlite. Projít `/p/[token]` → rezervace → zkontrolovat,
  že je v kalendáři **jednou** a v Hovorech jednou. Jde to až na databázi s migrací 105; spuštění
  105 i na testovacím Neonu bylo 2026-11-12 zamítnuté, pouští ji Kryštof. Co ověřené je: nový
  build **nespadne** na databázi bez 105 — portál i `updateLead` odchytí `42883` a uloží aspoň
  svoje (test „uložení hovoru přežije databázi bez migrace 105") · od 2026-11-12
- [ ] **Výmaz kontaktu na žádost GDPR neexistuje (AD09):** `contacts` drží jméno, telefon, e-mail a poznámku, ale `public.purge_client_retention` (R-076) o tabulce neví a admin žádnou cestu výmazu nemá. Při žádosti je od teď potřeba smazat i kontakt. Není to nová kategorie údajů (kontakt je odvozený z leadů a zakázek), ale patří to k AD16/KP10. **Od AD15 platí:** smazání kontaktu si paměť uklidí samo (trigger z migrace 111), chybí dál jen samotná cesta k výmazu a export · `.claude/security/AUDIT-LOG.md` 2026-11-12 · od 2026-11-12
- [ ] **AD09 v prohlížeči neověřený:** projít na 390 / 768 / 1280 / 1440 px `/dashboard/kontakty` — tři pohledy (Kontakty, Možné duplicity, Sloučené), hledání podle telefonu zapsaného jinak, **karty místo tabulky pod 640 px** — a kartu kontaktu: uložení údajů (hlavně hláška u telefonu, kterému nejde rozumět, a kolize e-mailu), **Sloučit sem** a jeho „Zpět" v toastu, „Rozdělit zpět" u sloučeného kontaktu. Dál převod kontaktu na zakázku z Hovorů: musí skončit na nové zakázce, mít v ní poznámky z hovorů a navázaný termín v kalendáři · od 2026-11-12
- [ ] **`notFound()` v adminu vrací 200, ne 404 (zjištěno 2026-11-12):** `/dashboard/<neexistující id>`, `/dashboard/faktury/<id>`, `/dashboard/kontakty/<id>` i neexistující stránka **vykreslí 404 obrazovku, ale se stavem 200**. Je to důsledek streamování kostry (AD06): hlavička odejde dřív, než stránka zjistí, že záznam není. Pro uživatele je to v pořádku (vidí „nenalezeno"), pro monitoring a roboty ne — `/dashboard` je sice `noindex`. Platí pro celý admin, ne jen pro nové obrazovky; opravit s AD18 (přístupnost a kvalita) · od 2026-11-12
- [ ] **`npm run build:check` při běžícím `next dev` není neškodný (zjištěno 2026-11-12):** `scripts/build-check.sh` tvrdí, že od Next 16 má dev vlastní výstup a `next build` mu ho nepřepíše. V AD08 se ukázalo, že build **přepíše `.next/static`** pod už běžícím `next start` — ten pak servíroval chunky, které na disku nejsou (HTML na ně odkazuje, server vrací 500), a měření balíčku kvůli tomu jednou vyšlo falešně o 18–27 % lépe. Pro měření proto platí: po buildu server **restartovat** a zkontrolovat, že žádný skript z HTML na disku nechybí. `next dev` build **přežije** (ověřeno v AD09: po `build:check` vracel dev server dál 200 na 15 adresách); zbývá tedy jen případ `next start` · `scripts/build-check.sh` · od 2026-11-12
- [ ] **PDF faktury 200 → 304 ověřené jen unit testem (AD08):** na testovací databázi žádná faktura PDF nemá (`demo-seed` ho nepřikládá, route správně vrací 404), takže skutečné 304 v DevTools nikdo neviděl. Ověřit s fakturou, která `pdf_data` má · `app/api/invoices/[id]/pdf/route.ts` · od 2026-11-12
- [ ] **Ostatní `void createNotification(…)` zůstávají plovoucí:** AD08 opravil `app/actions.ts` a `lib/web-leads.ts`, ale `app/portal-actions.ts` (4×), `app/klient/projekt/[id]/actions.ts` (3×) a `app/api/cron/send-reminders/route.ts` (4×) dál spouštějí zápis bez `await` i bez `after()`. U cronu to nehrozí (čeká na `Promise.allSettled`), u portálu se oznámení může ztratit · od 2026-11-12
- [ ] **AD06 v prohlížeči neověřený:** 22 adresářů adminu, pět záložek detailu zakázky a `?strana=2` u Klientů vracejí 200 přes podepsanou session a obsah v HTML sedí, ale okem to nikdo neviděl. Projít hlavně: **kostlivce** (`loading.tsx` — nesmí se po načtení nic přeskládat), **odznaky v menu**, které teď doskakují až po kostře, **stránkování Klientů** a **landing bez NextAuth** (přihlášený admin musí v hlavičce `/` pořád vidět „Do administrace") · od 2026-11-11
- [ ] **Trigramové indexy zatím nic nezrychlují (AD06):** `pg_trgm` a čtyři GIN indexy v migraci 103 jsou příprava pro hledání v databázi (AD07). ⌘K dnes prochází jen názvy stránek v prohlížeči. Kdyby se AD07 rozhodlo hledat jinak (full-text), indexy zrušit — nesou cenu při každém zápisu · od 2026-11-11
- [ ] **Finance jsou nejdražší obrazovka adminu (AD06):** Osobní 9 kol do DB, Podnikání 7, a dva zápisové generátory běží při **každém GET** před čtením. Zápisy do cronu ruší AD08, sloučení jedenácti čtecích funkcí patří k nápravě financí v AD13 · `app/dashboard/finance/` · od 2026-11-11
- [ ] **`PRVOTKA_LEAD_WEBHOOK_SECRET` do Vercelu (AD02):** endpoint `/api/public/prvotka-leads` bez klíče odmítá vše (fail-closed). Vygenerovat, nastavit v Production i Preview a tutéž hodnotu dát do repozitáře webu Prvotky · Kryštof · od 2026-11-11
- [ ] **Napojení webu prvotka.cz:** formulář musí posílat `POST /api/public/prvotka-leads` s `section: 'prvotka'`, `source: 'web_contact_form'` a hlavičkou `x-prvotka-lead-signature`. **Je to práce v repozitáři Prvotky, ne tady.** Prvotka je zatím SaaS ve vývoji, proto má výchozí typ služby obecné „Poptávka z webu" — až bude nabídka hotová, změnit jeden řádek v `lib/lead-origins.ts` · od 2026-11-11
- [ ] **Kalendář a Hovory po AD02 ukazují i historická ALTENO data:** dřív je filtrovala podmínka `business = 'vizeon'`, teď tam jsou. Je to záměr (jeden byznys, jeden diář), ale při prvním otevření to bude vypadat, že přibyly záznamy · od 2026-11-11
- [ ] **Admin v prohlížeči okem neověřený (AD00, AD02, AD03):** stránky vracejí 200 s ukázkovými daty, ale jen přes HTTP (session podepsaná klíčem z `.env.local`, heslo adminu agent nemá; Chrome není připojený). Projít `/dashboard` (**nový pravý sloupec s měsíčními čísly**), `/dashboard/poptavky` s filtrem zdroje a potvrzením poptávky, detail zakázky (včetně Fakturace u staré ALTENO zakázky), kalendář, Hovory, faktury a **přesunuté obrazovky `/dashboard/{finance,projekty,startup}`** (graf TradingView, kalkulačka Výkonnost podnikání) v prohlížeči na 390 / 768 / 1280 / 1440 px — stačí `npm run dev` a přihlášení · od 2026-11-11
- [ ] **AD07 v prohlížeči neověřený:** 23 adres vrací přes podepsanou session 200 a server nehlásí chybu, ale okem je nikdo neviděl. Projít na 390 / 768 / 1280 / 1440 px: řazení kliknutím do hlavičky (šipka, aria-sort), stránkování, **karty místo tabulky pod 640 px**, nové dialogy u Dokončených a Nákladů (dřív se upravovalo v řádku), hledání ve Fakturách (Enter odešle formulář), waitlist u startupového projektu a Hovory — hlavně rozbalení kontaktu, kde se poznámky teprve dotahují. Drobnost k ověření: na `?page=2` bez řádků se ukáže prázdný stav obrazovky, ne „na téhle stránce nic není" · od 2026-11-11
- [ ] **AD05 v prohlížeči neověřený:** stránky vracejí 200 přes podepsanou session, ale okem je nikdo neviděl. Projít na 390 / 768 / 1280 / 1440 px: nové šířky (Dokončené a Hovory bez vodorovného posuvníku, Dnes a Kalendář na 1440), hlavičku `PageHeader` (28 px na telefonu, 36 px výš) a nové odznaky — hlavně jestli „Hotovo" a „V řešení" ve stejném tónu `info` nejsou v seznamu zakázek matoucí a jestli `signal` (amber) u „Nová" a „Čeká na schválení" neruší · od 2026-11-11
- [ ] **AD04 v prohlížeči neověřený:** vzhled sedí podle zkompilovaného CSS a hlaviček, ale okem ho nikdo neviděl (agent nemá heslo adminu, Chrome není připojený). Projít `/dashboard`, `/login` a `/p/[token]` na 390 / 768 / 1280 / 1440 px: ⌘K, zvonek, menu, **toasty a dialogy** (nově se portálují do `AdminRoot`, ne do `<body>`) a konzoli — nesmí hlásit blokaci CSP. Stačí `npm run dev` a přihlášení · od 2026-11-11
- [x] ~~**`/p/<nesmyslný token>` vrací lokálně 500 místo 404**~~ — vyřešeno auditem
  2026-11-14. Tvar tokenu se ověří `publicToken()` (`lib/public-token.ts`), než se dostane
  do dotazu, takže na typu sloupce už to nestojí; platí pro `/p`, `/h` i obě místa
  v `app/portal-actions.ts`. Ověřeno na dev serveru (404 pro nesmysl i pro `abc' OR '1'='1`).
- [ ] **Výpadek 2026-11-04 — dohledat:** ověřit, jestli během výpadku (nejpozději 10:38–14:35) nepropadla poptávka z vizeon.cz nebo alteno.cz (veřejné endpointy vracely chybu); přihlášený `/hub` po opravě ověřit okem · `.claude/security/AUDIT-LOG.md` · od 2026-11-04
- [ ] **Landing — zbytek auditu R-078:** (1) na telefonu 390 px je v Jak to funguje úsek asi 3 100 px skoro bez obsahu (velké mezery mezi kroky), (2) žádná fotka, (3) ozdoby: tenké a čárkované čáry, stíny v klidu, modrá záře v hero, plovoucí navigace ve tvaru pilulky, (4) 21 velikostí písma a texty pod 13 px, (5) karty Funkce se stejným rámečkem · `components/marketing/` · od 2026-11-03
- [ ] **Vercel Hobby a komerční provoz (R-133, R-135):** podle podmínek Vercelu je Hobby jen pro nekomerční osobní použití. Při prvním platícím klientovi se jde na Cloudflare, přesun se dopředu nepřipravuje; do jeho dokončení běží placený provoz na Hobby. Pozor na PDF přes Chromium, crony a `after()` (R-135) · Kryštof · od 2026-11-03
- [ ] **Přihlášení přes Supabase nikdo nezkusil naživo (R-105):** projekt `zakaziq` má
  **nula uživatelů**, takže se do adminu nepřihlásí nikdo, dokud účet nevznikne. Zbývá:
  (1) Kryštof založí účet v Supabase (Authentication → Users → Add user, e-mail musí být
  shodný s `ADMIN_EMAIL`, heslo zná jen on), (2) ~~env ve Vercelu~~ **hotovo 2026-11-15**:
  `SUPABASE_URL` i `SUPABASE_PUBLISHABLE_KEY` jsou pro Production (z integrace Supabase,
  ověřeno že míří na `awcgvgkeuwgspybwvvpn` a klíč sedí na ten lokální) i pro Preview
  (doplněno ručně). **Pozor:** `ADMIN_EMAIL` v Production je typu `sensitive`, takže jeho
  hodnotu **nejde přečíst** — jestli se rovná e-mailu účtu v Supabase, se pozná až prvním
  přihlášením na produkci; neshoda se projeví jako „Nesprávný e-mail nebo heslo". Devět
  proměnných `SUPABASE_*` včetně `SUPABASE_SERVICE_ROLE_KEY` spravuje **integrace**
  (`configurationId`), takže je nemá smysl mazat ručně — buď se nechají, nebo se odpojí celá
  integrace a URL i klíč se doplní ručně. `ADMIN_PASSWORD_HASH` a `NEXTAUTH_SECRET`
  **nechat, dokud na produkci běží starý build** — bez nich by se dnešní admin nepřihlásil,
  (3) **zapnout hook** `before_user_created_jen_admin`
  v Authentication → Hooks → Before User Created (funkce v databázi už je a je ověřená, R-106;
  dokud se nezapne, je registrace otevřená), (4) pak projít na 390 / 768 / 1280 / 1440 px: přihlášení, zapnutí ověřovací aplikace
  v Profilu (QR i ruční klíč), druhý krok s kódem, špatný kód, odhlášení a zámek po pěti
  pokusech. `ADMIN_PASSWORD_HASH` a `NEXTAUTH_SECRET` se po ověření můžou z Vercelu odebrat
  · DECISIONS #029 · od 2026-11-15
- [ ] **Prázdná kopie schématu adminu v Supabase (R-105):** projekt `zakaziq` nese 56 tabulek
  staršího schématu adminu (ještě se `school_*` a `plan_*`) s **0 řádky** (ověřeno skutečným
  počítáním, ne odhadem). Svádí k domněnce, že se někde čte odsud; pokus o odstranění byl
  2026-11-15 zamítnut, takže zůstává · od 2026-11-15
- [ ] **Monitoring chyb:** žádný (Sentry, Vercel Observability); chybové stránky už jsou, ale o chybě se nikdo nedozví. Sentry potřebuje závislost a záznam v CSP-LOG; výpadek 2026-11-04 se zjistil jen ze screenshotu · od 2026-11-03
- [ ] **Admin běží rolí vlastníka DB:** `DATABASE_URL` = `neondb_owner` s BYPASSRLS; samostatná role pro běh adminu bez DDL, vlastník jen na migrace · `lib/db.ts`, `lib/ws/admin/db.ts` · od 2026-11-03
- [ ] **Testy s pevnými daty:** 16 testových souborů míchá pevná data z listopadu 2026 se skutečnými hodinami (`now()`); jak dny projdou, můžou padat jako `ws-email.test.ts` 2026-11-03. Převést na `vi.setSystemTime` nebo data od dneška · `lib/ws/__tests__`, `lib/__tests__` · od 2026-11-03

- [ ] **Požadavky klientů (R-069) — před nasazením:** (1) ~~migrace 092~~ aplikovaná na produkci, (2) ~~`OPENAI_API_KEY`~~ ve Vercelu (Production i Preview), (3) ověřit v prohlížeči mikrofon a nahrávání (Chrome, Safari iOS `audio/mp4`) a že hlavička `Permissions-Policy` na `/p/*` má `microphone=(self)`, (4) ~~ověřit rezidenci a DPA~~ ověřeno 2026-11-01 (`docs/klientsky-prostor/PLAN.md` 8.1: OpenAI i Anthropic zpracovávají v USA na SCC; EU přepis jen s žádostí u OpenAI; zda je DPA OpenAI přijaté automaticky, ověřit v nastavení organizace), zbývá doplnit zpracovatele do právních textů, (5) nahrávku klienta zatím nikdo nevyzkoušel s češtinou · od 2026-11-01
- [ ] **Klientský prostor první vlny (R-070–R-073) — projít naživo:** migrace 092–096, role `portal_app`
  i env jsou na produkci a přihlášení je od R-107 na Supabase (Clerk v `/klient` už není). Zbývá průchod
  na skutečných datech: kostra adminu, Dnes, záložky detailu, schvalování hlášení a klíč projektu, test
  hlášení ze skriptu `zakaziq-report.mjs` proti produkci a první souhrnný e-mail o aktivitě naostro;
  telefon 390 px · od 2026-11-01
- [ ] **KP08:** soubory a podklady od klienta jsou odložené (D-K8). Obrázky a PDF v chatu už řeší KP15
  (D-K18); samostatné úložiště podkladů jen, kdyby bylo potřeba · od 2026-11-01
- [ ] **Předání do Claude Code úroveň 3** (Routines API) se nedělá, dokud nebude experiment a samostatné rozhodnutí (D-K7) · od 2026-11-01
- [ ] **Nestabilní testy nad PGlite:** `ws-intake` a `admin-calendar` padaly při plném běhu na časový limit v `beforeAll` (samostatně jsou hotové za 7 s). AD09 zvedl `hookTimeout` ve `vitest.config.ts` na 60 s — databází ve WASM startuje najednou víc a 30 s nestačilo. Kdyby to padalo dál, příčina je někde jinde · `vitest.config.ts`, `lib/ws/__tests__` · od 2026-11-01
- [ ] **Nestabilní test limitu veřejných poptávek:** opakovaná plná sada jednou vrátila 400 místo očekávaného 429; samostatný test prošel. Limit používá pevná minutová okna, přechod mezi okny během 21 požadavků je možná příčina, zatím neprokázaná. Upravit test tak, aby nezávisel na hranici minuty · `lib/ws/__tests__/ws-intake.test.ts` · od 2026-10-31
- [ ] **Průchod Preview 2026-10-31 — zbývá:** (1) služby ze šablon oboru nemají cenu (formulář faktury teď upozorní na cenu 0, ceny šablon nedoplněny); (2) ukázková data: `customer_segments` bez počtu a data návštěv, dokud je nepřepočítá cron `ws-segments` nebo Nastavení › Skupiny; (3) šířka 390 px neověřena (okno Chrome nejde zúžit, rámování blokuje CSP); (4) nové úpravy z 2026-10-31 (štítek času v kalendáři, skrytá šablona „Informace k zakázce“, upozornění ve formuláři faktury) ověřené jen testy a `tsc`, ne na Preview · od 2026-10-31
- [ ] **Landing — oborové podstránky (návrh R-055, nestavět bez rozhodnutí):** `/pro/kadernictvi`, `/pro/kosmetika`, `/pro/remeslnici` (zámečnictví, studnařství, stavba), `/pro/autoservis`, `/pro/uklid`; likvidace azbestu spíš jako sekce u řemeslníků. Každá jen s obsahem, který je opravdu jiný: služby a kolonky ze šablony oboru (`lib/ws/templates/`), ukázka objednávky pro obor, vlastní dotazy. Bez skutečných zákazníků z oboru hrozí tenké stránky, proto začít 1–2 obory, kde budou první reference. `/cenik` samostatně nedává smysl (jedna cena, kotva stačí) · od 2026-10-17
- [ ] **Landing — po nasazení na `zakaziq.cz`:** ověřit `curl` canonical/robots/sitemap na produkčním hostu (apex vs. www podle `NEXT_PUBLIC_APP_URL`), schéma v Rich Results Test, odeslat sitemapu do Google Search Console a Bing Webmaster Tools · od 2026-10-17
- [ ] **Landing — kontrast drobných popisků:** Lighthouse přístupnost 96: popisky `text-navy-400` 11 px na bílé a texty v živé ukázce během animace (`opacity-75`, nájezd) nemají 4,5:1. Design Dílků, řešit s mockupem · `components/marketing/{live-demo,features}.tsx` · od 2026-10-17

- [ ] **RD02 — záložní postup po migraci 085:** 085 je aplikovaná (2026-10-18). `loadBusinessScopeSeparately` v `lib/ws/scope.ts` a test „před migrací 085“ smazat, až bude jisté, že 085 běží na každé databázi, kterou aplikace používá (včetně Preview, pokud má jinou) · od 2026-10-18
- [ ] **RD03 — měření na Neonu:** migrace 086 je aplikovaná (2026-10-18). Znovu `EXPLAIN` se skutečnějšími daty a změřit čas po kliknutí; PGlite čísla (plán oddíl 9) jsou jen poměr · od 2026-10-18
- [ ] **Optimistické akce nejsou:** potvrzení poptávky, zaplacení faktury a razítko čekají na odpověď serveru. RD04 je neřešilo (zadání RD04 je nemá); dělat s přihlášením (kolize termínu musí vrátit stav zpět), nejspíš až s RD05/RD06 · od 2026-10-18
- [ ] **Začátek server actions má 3 dotazy za sebou** (`requireWorkspace` → `requireBusiness` → `assertWritable`, ~25 míst). `loadBusinessScope` by to srazil na jeden (kontext + `canWrite(billing)`), ale po přesunu do `fra1` jde o jednotky ms; udělat, až měření ukáže potřebu · od 2026-10-18
- [ ] **RD04 naostro:** Dnes s hlavní věcí, panel s kartou zákazníka po kliku na termín, přesměrování `?zakaznik=` a hlavička v Poptávkách a Zákaznících jsou ověřené jen na dočasné stránce s fiktivními daty a testy; s přihlášením na skutečných datech (včetně telefonu a zadokovaného panelu od 1280 px) ne · od 2026-10-18
- [ ] **RD05 + RD06 naostro:** rychlé zadání z mřížky (klik i tažení), rady k času a kolize, tři nejbližší volné časy u poptávky, změna délky tažením i v detailu, barvy pracovníků, mezery a stínování mimo otevírací dobu, skok na datum, přejetí mezi dny, Najít volný čas (⌘K i menu), filtry a seznam zakázek, historie stavů a stav v panelu jsou ověřené jen na dočasné stránce s fiktivními daty (390/768/1280/1440 px, světle i tmavě; dočasná stránka smazána) a testy v PGlite; s přihlášením na skutečných datech ne (server actions `slotAdvice`, `searchCustomers`, `resizeAppointment`, `createManualBooking` s délkou) · od 2026-10-18
- [ ] **RD07 naostro:** objednávkový tok, výběr služby/pracovníka/času i kontakt ověřeny lokálně s fiktivními daty v úzkém (614 px) a širokém (1228 px) zobrazení. Přesné šířky 390/768/1280/1440 px, widget na cizí doméně, živé odeslání na Preview a chování po migraci 087 ještě ověřit · od 2026-10-18
- [ ] **RD10/S14 naostro:** na Preview ověřeno profil dodavatele, vystavení a PDF s QR (2026-10-31). Zbývá: předvyplnění z karty/zakázky, vzhled PDF okem, přijaté PDF s AI přepisem, e-mail faktury (až s Resendem) · od 2026-10-10
- [ ] **RD12 naostro:** projít věrnostní nastavení, přidání/vrácení razítka a uplatnění/vrácení odměny na přihlášeném Preview a šířkách 390/768/1280/1440 px; lokální prohlížeč skončil na přihlášení, testovací účet ani Neon branch nejsou připravené · od 2026-10-18
- [ ] **RD13 + RD16 naostro:** přihlášený průchod pěti sekcí Nastavení, checklistu na Dnes, doplnění kontaktu, návrhu sloučení a zrušení zprávy v 60s okně; ověřit přímé odeslání po nastavení Resendu. Migrace 089 a její závislosti 080/087/088 byly na Neonu aplikovány 2026-10-19 · od 2026-10-18
- [ ] **Kalendář — přímé tažení perem/dotykem a čára „teď“:** Kryštof 2026-10-18 označil oboje jako dosud zbývající. HTML5 přetažení bloku podporuje myš; na dotykovém displeji se termín přesouvá formulářem Přesunout v detailu. B9 a stav RD05 už ale popisují čáru „teď“ jako přítomnou; při navazujícím kalendářním kroku porovnat očekávaný výsledek se stávajícím kódem, nic nepřepisovat odhadem · `components/ws/app/calendar/time-grid.tsx`, `components/ws/app/calendar/now-indicator.tsx`, `components/ws/app/booking/appointment-actions.tsx` · od 2026-10-18
- [ ] **Zakázky — historie jen od RD06:** změny stavu před 2026-10-18 nejsou v `ws.audit_log`; potvrzení poptávky ani portál záznam stavu nezapisují (jen přesun v aplikaci) · `lib/ws/bookings.ts` (`setJobStage`) · od 2026-10-18
- [ ] **RD02 — region a měření:** `vercel.json` má `regions: ["fra1"]`, ale projeví se až po deployi (nasazení jen se souhlasem). Po deployi ověřit `regions` v nasazení (Vercel MCP `get_deployment`) a změřit čas po kliknutí před/po s přihlášením (plán oddíl 9). Clerk `auth()` v tom neměřený · od 2026-10-18
- [ ] **RD02 — streamování s přihlášením neověřeno:** kostra s `chrome` jako Promise a `loading.tsx` ověřené jen na dočasné stránce bez přihlášení (první bajt 60 ms, bez chyb hydratace); s přihlášením na skutečných datech, na telefonu a při pomalém připojení ne. `DetailSlot` ukazuje panel až po načtení (bez kostry, aby se neotevíral dvakrát), případně dodělat v RD04 · od 2026-10-18
- [ ] **S18 naostro:** obrazovky s přihlášením na telefonu (390 px) a v tmavém režimu, export a výmaz na skutečné DB, zrušení a obnovení testovacího účtu, cron `ws-gdpr` na Vercelu, instalace PWA (Android i iPhone), test „člověk, který aplikaci neviděl“ · od 2026-10-17
- [ ] **Právní texty — Stripe a výmaz dotazů:** texty jsou na webu a potvrzené (R-079), kontrola právníkem se nedělá. Provozovatel chybí ve Stripe (Public details, šablona faktury). Volitelně `consent_collection.terms_of_service` v Checkoutu. Kontaktní dotazy v Hovorech nemají automatický výmaz po 3 letech (slib v ochraně údajů, zatím ručně) · od 2026-10-17
- [ ] **Výmaz a odeslané e-maily majiteli:** přehledy dne/týdne v `ws.outbound_messages.payload` můžou nést jméno vymazaného zákazníka (výmaz maže jen zprávy s jeho id nebo klíčem). Zvážit čištění payloadu odeslaných zpráv po 90 dnech · od 2026-10-17
- [ ] **Tmavý režim — nové třídy:** přemapování v `app/ws-tokens.css` pokrývá třídy použité k 2026-10-17; nová světlá třída (např. `bg-navy-200/50`) potřebuje vlastní `dark:` nebo řádek v tokenech. `/r`, `/z` a landing zůstávají světlé (rozhodnout, jestli i ony) · od 2026-10-17
- [ ] **Upgrade Next 16 — admin s přihlášením:** Workspace (Clerk) a PDF ověřeny na Preview 2026-10-31; zbývá admin NextAuth na datech (Preview má testovací DB bez admin tabulek) · od 2026-10-17
- [ ] **Připomínky 2 h před konzultací:** po R-006 není jasné, jestli běží externí hodinový cron (commit 2026-06-20 zmiňuje „externí hodinový cron"). Ověřit u uživatele · od 2026-06-25
- [ ] **Workspace — env ve Vercelu:** Production i Preview mají `DATABASE_URL_WS`, klíče Clerku, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (2026-10-10). Zbývá: `STRIPE_WEBHOOK_SECRET` v Production je od Kryštofa a nemusí patřit produkčnímu endpointu (ten ještě neexistuje) — přepsat podpisovým klíčem endpointu `https://www.zakaziq.cz/api/stripe/webhook` při nasazení `/w`; `NEXT_PUBLIC_APP_URL` v Preview míří na produkční adresu (pro větev `ws/redesign-app` přepsáno 2026-10-31, ostatní větve dál vrací Checkout na produkci) · od 2026-10-08
- [ ] **Clerk — webhook:** v Clerk dashboardu založit endpoint `https://<doména>/api/clerk/webhook` (události `organization.updated`, `organizationMembership.*`) a jeho podpisový klíč dát do `CLERK_WEBHOOK_SECRET` (`.env.local` i Vercel). Do té doby route vrací 503 a členové se nesynchronizují (vlastníka zapíše průvodce) · od 2026-10-09
- [ ] **Clerk — produkční instance:** založená, DNS, SSL a pošta hotové (2026-11-03). Zbývá vlastní Google OAuth klient (consent screen „In production“, jinak limit 100 testovacích uživatelů), `force_organization_selection=false`, produkční klíče jen do Vercel Production. Dev instance nesmí do produkce · od 2026-10-09
- [ ] **Clerk — limit 5 členů na organizaci** (výchozí v Clerku). R-020 slibuje neomezeně pracovníků — pracovníci ve `ws.staff` se přihlašovat nemusí, ale přihlašovací účty pro tým (S13?) limit narazí. Ověřit, jestli jde zvednout na našem plánu Clerku · od 2026-10-09
- [ ] **Clerk — e-maily s kódem** chodí z Clerku (šablona a jazyk podle nastavení instance). Ověřit při první registraci, že jsou česky a jménem ZakazIQ; jinak nastavit v dashboardu Clerku (Customization → Emails) · od 2026-10-09
- [ ] **Clerk — `user.updated`** (změna jména/e-mailu) se do `ws.members` nepropisuje — webhook ho nezpracovává, payload nemá organizace. Řešit, až se jména členů budou někde zobrazovat (S13) · od 2026-10-09
- [ ] **Stripe — lokální webhook:** pro `stripe listen` chybí CLI profil ZakazIQ (`stripe login --project-name zakaziq`), omezený klíč na listen nestačí (403); po přihlášení dát jeho `whsec_` do `.env.local`. Potřeba jen při lokálním testu plateb · od 2026-10-09
- [ ] **Stripe — live mód** (produkt, cena, Portal, e-maily, šablona faktury s IČO a „Nejsem plátce DPH“, webhook endpoint, live klíče jen do Vercelu Production) · před S19 · od 2026-10-09
- [ ] **`ws.accounts.trial_ends_at`** se po R-038 nepoužívá. Nechat, nebo odstranit migrací (data se tím nemažou)? Neblokuje · od 2026-10-09
- [ ] **Evidence migrací na produkci je neúplná:** ověřeno 2026-11-20 přes Neon MCP — `public.schema_migrations` na produkci do té doby **neexistovala**, takže migrace 097–119 šly ručně (SQL editor), ne běhounem. Teď ji agent založil a obsahuje jen 113 a 121–127. Starší migrace v ní chybí; `scripts/apply-migration.js` by je pustil znovu (jsou idempotentní, ale 100 a 101 mažou tabulky — nepouštět naslepo). Doplnit evidenci starších migrací po ověření, co na produkci opravdu je · od 2026-11-11
- [ ] **Resend jen kvůli waitlistu:** závislost `resend` slouží jedné funkci (`sendLaunchEmailBlast`). Zvážit převod na `lib/email.ts` (R-004) · od 2026-10-08
- [ ] **Workspace — SMS poskytovatel** pro připomínky a „Komu napsat". Blokuje S12/S15 (lze odložit) · od 2026-10-08
- [ ] **Workspace — zálohy online přes Stripe Connect** teď, nebo až po spuštění? Neblokuje · od 2026-10-08
- [ ] **Workspace — admin přihlášení:** nechat NextAuth natrvalo, nebo později převést na Clerk? Neblokuje · od 2026-10-08
- [ ] **S16 naostro:** ověřit skutečný termín, zakázku, fakturu a hodnocení v `/z/[token]` (migrace 082 na Neonu) · od 2026-10-10
- [ ] **S17 — pozvaní klienti a platba:** pozvaný klient prochází stejným Checkoutem (14 dní s kartou, R-038). Rozhodnout, jestli klienti, kterým Kryštof staví web, mají mít Workspace zdarma nebo se slevou (kupón ve Stripe) · od 2026-10-10
- [ ] **S17 naostro:** pozvánka Clerku (e-mail, registrace s `__clerk_ticket` na `/w/registrace`, aktivace organizace, `ensureMember`) a obě admin stránky s přihlášením neověřené · od 2026-10-10
- [ ] **S15 — odesílání e-mailů:** ~~doména v Resendu, `WS_EMAIL_FROM`, webhook + `RESEND_WEBHOOK_SECRET`~~ hotovo 2026-11-01 pro Production (webhook vypnutý do nasazení, pak zapnout). Zbývá doplnit `rua` do DMARC (záznam `_dmarc` existuje, `p=none` bez reportů, ověřeno 2026-11-03) a klíč jen pro odesílání. Postup `docs/workspace/SETUP.md` → E-maily · od 2026-10-10
- [ ] **S15 — naostro neověřeno:** Nastavení › E-maily (náhled, zkušební e-mail) s přihlášením, skutečné doručení a vzhled v Gmailu/Outlooku/Apple Mailu, odkaz Potvrdit z telefonu, cron na Vercelu · od 2026-10-10
- [ ] **Workspace — cena za další byznys na účtu** a kdy ho zapnout (R-026). Neblokuje · od 2026-10-08
- [ ] **Workspace — toasty přes adminův `<Toaster>`** (R-027): pozice a délka jsou společné s adminem (vpravo nahoře). Až bude potřeba vlastní toaster (např. spodní lišta na mobilu v S09/S18), řešit upgradem sonneru na 2.x (víc toasterů) nebo úpravou `app/layout.tsx` — obojí sahá na admin, chce souhlas · od 2026-10-08
- [ ] **Workspace — Inter se stahuje i na stránkách Dílků:** `@import` Google Fonts v `app/globals.css` (admin) se načte všude; Instrument Sans ho přebije, jen zbytečný request CSS. Od S02 ho na `/w` a od S04 i na landing page blokuje vynucená CSP — žádný request, ale chyba v konzoli i na veřejné stránce (Lighthouse Best Practices). Řešit, až se bude sahat na admin · od 2026-10-08
- [ ] **Bezpečnost — otevřené položky** (produkční CSP/COOP/CORP, DNS/e-mailové záznamy, Preview auth, security.txt, záloha/obnova): vedené v `.claude/security/STATE.md` → Otevřené položky · od 2026-10-08
- [x] **Landing — e-mail podpory:** `info@vizeon.cz` potvrdil Kryštof 2026-10-31; kontaktní formulář R-065 ukládá dotaz do Hovorů, přímý e-mail zůstává jako záloha.
- [ ] **Workspace — Dnes, Poptávky, Kalendář, Zakázky naostro:** S09 a S10 ověřené jen na náhledu s fiktivními daty. Projít s přihlášením (desktop i telefon): potvrzení jedním klikem, Jiný čas, Odmítnout + Zpět, přetažení termínu, blokace, živé obnovení (poptávka vložená jinde se ukáže do 15 s). Případně s ukázkovými daty (`scripts/ws-seed.mjs`, R-041) · od 2026-10-09
- [ ] **Kalendář — blokace celého byznysu:** bez pracovníka ji DB omezení nehlídá (R-035), ruční rezervace a potvrzení přes ni projdou (tip v detailu poptávky ji ukáže). Volné časy pro web ji od S11 vynechávají; zvážit kontrolu i v ruční rezervaci · `lib/ws/bookings.ts` · od 2026-10-10
- [ ] **Napojený web — naostro s přihlášením a z cizí https domény:** Nastavení › Napojený web, Ověřit napojení, QR PNG/SVG, widget na skutečném cizím webu (Chrome blokuje veřejný web → localhost, ověřit na Preview) · od 2026-10-10
- [ ] **Data cache Nextu i v adminu:** `lib/db.ts` (admin) volá Neon HTTP bez `cache: 'no-store'` — ve Workspace to vracelo stará data v route handlerech (opraveno v `lib/ws/db.ts`). Admin se nemění; ověřit, jestli se ho to týká (např. veřejné booking API), až se bude sahat na admin · od 2026-10-10
- [ ] **Workspace — `/w/ucet` mimo kostru:** stránka účtu (S08) má vlastní rozložení s odkazem zpět, kostra na ni vede z „Účet“. Zasadit do kostry, až bude jasné, jestli má být pod `/w/[byznys]` nebo nad ním · od 2026-10-09
- [ ] **`npm run lint` není nastavený** (`next lint` jen nabídne průvodce ESLintem). Kontrolu dělá `tsc` a build · od 2026-10-09
- [ ] **`N8N_API_KEY`** není v lokálním `.env.local` — lokálně `/api/public/leads` vše odmítne (fail-closed). Na produkci ověřit ve Vercelu · od 2026-10-08

---

## 4. Changelog

*Nejnovější nahoře. Starší měsíce → `archiv/YYYY-MM.md` (viz pravidla §4).*

### 2026-11-26 (ZakazIQ Voice — VO07, milník 2, R-148)
- **feat** Čištění diktátu modelem role `fast` (`lib/admin/voice/cleanup.ts`): prompt podle stylu kategorie
  (Spisovně, Přirozeně, Volně, Přesně), slovník do 30 výrazů, schválená pravidla a 5 posledních oprav; přepis jako data
  v `<prepis>`, výstup jen z `<text>`; bez přemýšlení, `effort: low`, **bez `temperature`** (Haiku 5.5 jinou než
  výchozí odmítne 400 — odchylka od promptu VO07), limit 6 s bez opakování. Diktát do 3 slov se nečistí.
- **feat** Kontrola výstupu `checkCleanup` (G6 odpověď asistenta, G7 délka, G8 nová slova, pozdrav/podpis, nové jméno,
  otočený zápor, G9 čísla přes `lib/admin/voice/numbers.ts` — česká čísla slovy, pořadová čísla, měsíce, odpoledne,
  telefony po číslicích, samoopravy). Neprojde-li, vloží se přepis po slovníku se stavem `raw` a kódem pojistky.
- **feat** Denní strop nákladů (G11): útrata za pražský den v téže dávce jako nastavení, nad stropem bez čištění
  a upozornění `voice_cost_cap` nejvýš jednou denně (zámek v `voice_settings`). Ceny čištění v `costs.ts`
  (Haiku 5.5 $0,10 / $0,50, ověřeno v referenci Claude API). Zápis diktátu nově plní `words_corrected`, `llm_*`,
  `tokens_*`. „Nový řádek", „nový odstavec" a výplňová slova (ehm, eee, hm) bez modelu, vždy.
- **fix** G3 slučovala čísla („sedm sedm sedm" → „sedm", rozbité telefonní číslo); čísla se už neslučují.
- **chore** Zlatá sada `lib/admin/voice/__tests__/golden/` (69 případů včetně útoků) v `npm test`, testy
  `voice-cleanup.test.ts` (skutečné SDK s podvrženým `fetch`, časový limit, strop), route test se stropem
  a upozorněním. `scripts/voice-eval.mjs` se skutečným modelem jen na vyžádání. Ověřeno: `tsc`, `npm test` (jen 4
  známá selhání), `build:check`. Se skutečným modelem ani na Macu neověřeno. Bez migrace. Bezpečnost DECISIONS #055
  doplnění (zpracovatel Anthropic, útok pokynem v diktátu, strop nezastaví přepis), STATE, AUDIT-LOG.

### 2026-11-26 (ZakazIQ Voice — VO02, R-148)
- **feat** Příjem diktátu `POST /api/public/voice/dictate` a `GET /api/public/voice/config`: ověření klíče zařízení,
  `Origin` → 403, limity po IP a zařízení, tělo do 4 MB + 64 kB, zvuk m4a/wav ověřený podle prvních bajtů, idempotentní
  `id`, `cancelled` jen čísla. Moduly `lib/admin/voice/{http,stt,pipeline,store,guards,dictionary,categories,text,costs}.ts`:
  přepis Groq `verbose_json` se zálohou OpenAI (20 s), pojistky G1–G5 a G12, slovník bez ohledu na diakritiku, zkratky,
  „jen čísla“, ceny na jednom místě. Bez migrace (používá 136).
- **fix** Během testů: HTTP 503 od poskytovatele se pletl s „chybí klíč“ — pokus přepisu má příznak `skipped`.
- **fix** Diktát, jehož přepis selhal (502), se při opakovaném odeslání z fronty se stejným `id` zpracuje znovu
  (dřív by se vrátil uložený neúspěch a fronta na Macu by diktát nikdy nepřepsala).
- **chore** Testy `voice-guards`, `voice-pipeline` (podvržený `fetch`, ukázková odpověď Groq) a route `dictate.test.ts`
  nad PGlite — Voice dohromady 70 testů. Naostro: lokální server, testovací Neon, OpenAI, syntetický hlas — 0,9–1,9 s,
  G1 a G12 zasáhly, slovník opravil jména; zkušební zařízení, diktáty i slova po zkoušce smazané. Bezpečnost DECISIONS
  #055 doplnění, STATE, AUDIT-LOG.

### 2026-11-26 (ZakazIQ Voice — VO01, R-148)
- **db** Migrace 136 `zakaziq_voice`: `voice_devices`, `voice_dictations`, `voice_terms`, `voice_rules` (13 vestavěných
  blokovaných frází), `voice_corrections` (kaskáda s diktátem), `voice_suggestions`, `voice_settings` (7 výchozích,
  `text_retention_days` NULL = natrvalo, `store_text`, `daily_cost_cap_usd`), trigger `voice_dictations_forget`
  (smazaný diktát zmizí i z příkladů návrhů). Aplikována: **testovací Neon ano** (ZakazIQ RD test, ověřeno přes
  Neon, 7 tabulek, druhý běh přeskočen), **produkce ne** (až VO12).
- **feat** Klíč zařízení `zk_voice_…` (`lib/admin/voice/keys.ts`, HMAC s `AGENT_KEY_PEPPER` a doménou `voice:`)
  a zařízení (`lib/admin/voice/devices.ts`: strop 10 platných, Zpět do 2 min). Admin `/dashboard/voice` (menu
  Osobní › ZakazIQ Voice, ikona `Mic`) s kartou Zařízení, akce `app/voice-actions.ts`, tón `VOICE_DEVICE_TONE`.
- **chore** Testy `voice-schema` a `voice-keys` (23 nových, PGlite). Ověřeno: `tsc` čisté, `npm test` 1820 prošlo,
  4 známá selhání (číslování migrací 134/135, `ws-email` s pevným datem, dva časové limity, samostatně 22/22),
  `npm run build:check` prošel. Vzhled na dočasné stránce 1280 a 390 px. Bezpečnost DECISIONS #055, STATE,
  AUDIT-LOG 2026-11-26. Worktree dostal vlastní `node_modules` (klon), odkaz Turbopack odmítl.

### 2026-11-25 (ZakazIQ Voice — VO00, R-148)
- **docs** Plán `docs/admin/VOICE-PLAN.md` a prompty `new - area of zakaziq/prompty/voice/` (VO00–VO12,
  podklady s neověřeným návrhem serveru) z `~/Desktop/zakaziq-voice-plan` na novou větev
  `admin/zakaziq-voice` z `main` (`ab6ffc3`), ve vlastním worktree `.claude/worktrees/zakaziq-voice`
  (`node_modules` a `.env.local` jsou odkazy na hlavní složku). Číslo rozhodnutí R-147 → R-148 všude.
- **decision** **R-148**: D-V2, D-V5, D-V8 podle doporučení, D-V7 text natrvalo (plán oddíl 2 a 6,
  prompty VO01, VO08, VO10 a návrh migrace upravené).
- **docs** Ceník ověřený 2026-11-25 (plán oddíl 12): Groq turbo $0,04/h, v3 $0,111/h, nejkratší účtovaná
  délka 10 s, nápověda do 224 tokenů, `verbose_json` se segmenty, data se ve výchozím stavu neuchovávají
  (přepis až 30 dní kvůli zneužití, ZDR jde zapnout), DPA s SCC, servery v USA; OpenAI `gpt-4o-transcribe`
  $0,006/min, mini $0,003/min; Haiku 5.5 $0,10/$0,50, Sonnet 5.5 $2/$10 za 1M tokenů. Odhad pro 3 000 slov
  denně ~$1,5 měsíčně.
- **feat** `scripts/voice-stt-test.mjs`: Groq turbo, Groq v3 a OpenAI na složce nahrávek, WER, ticho,
  výsledek po G2, p50/p95, odhad ceny, `--napoveda`, `--jen`, `--podrobne`, `--selftest`; bez balíčků,
  klíče nevypisuje, nahrávky nikam neukládá.
- **docs** Test přepisu (plán 12a), jen OpenAI `gpt-4o-mini-transcribe` na syntetickém hlasu: bez nápovědy
  WER 11,6 %, s nápovědou 5,5 %, ale na 5 s ticha s nápovědou **opsal celou nápovědu** → nová pojistka G12.
  Groq neměřený (chybí klíč). Mac: macOS 15.7.4, Swift 6.1.2, jen Command Line Tools, 0 identit pro podpis.
- **chore** Nové env `GROQ_API_KEY`, `VOICE_STT_PROVIDER`, `VOICE_GROQ_STT_MODEL`, `VOICE_OPENAI_STT_MODEL`
  v `.env.example` a `docs/AGENTS-REFERENCE.md` → Env proměnné.

### 2026-11-24 (druh faktury a zbývá doplatit — R-143)
- **feat** Před vystavením se vybírá druh faktury: za celé dílo, zálohová (30 %), částečná (procento z ceny),
  finální (všechno, co zbývá). Pruh zaplaceno / čeká na zaplacení / zbývá vyfakturovat ve formuláři a nová karta
  „Platby za zakázku" v detailu zakázky s tlačítky pro každý druh. Server částku počítá z databáze a nepustí víc,
  než je cena. PDF: nadpis podle druhu, zálohová bez data plnění, „Rozpis ceny zakázky" s předchozími fakturami.
  Koncepty si pamatují druh a částku přepočítají při schválení; hotová zakázka se zálohou připraví finální koncept.
  Detail faktury a panel Ke schválení ukazují druh. Soubory: `lib/admin/{invoice-kinds,project-billing,invoice-issue,
  invoice-drafts,invoice-draft-schema}.ts`, `lib/invoice-pdf/render.ts`, `lib/portal/{money,overview}.ts`,
  `components/admin/invoices/{issue-form,billing-bar,drafts-panel}.tsx`, `components/admin/project-detail-view.tsx`,
  `app/dashboard/faktury/{nova,[id]}/page.tsx`, `app/dashboard/finance/invoice-actions.ts`.
- **db** Migrace 132 `faktura_druh` a 133 `portal_druh_faktury` — spolu se 131 **aplikované na produkci**
  2026-11-24 (Neon MCP po transakcích na souhlas Kryštofa, zapsané v `public.schema_migrations` s otiskem souboru;
  md5 těl `admin_invoice_issue`, `admin_invoice_locked` a `portal.put_invoice` sedí na soubory, `portal_app` čte
  `document`, `put_invoice` ani `public.invoices` ne). Testovací Neon ne.
- **chore** Produkční profil dodavatele přepsaný SQL na souhlas Kryštofa (bez IBANu a DIČ). Ověřeno: `tsc`, nový
  `admin-faktury-druhy.test.ts` (23 testů), testy faktur, prostoru a hlídání XSS/tříd 37 souborů / 494 testů,
  tři PDF prohlédnuté okem, formulář na dočasné stránce 1280 a 390 px (stránka smazaná). Celá sada 1797 prošlo /
  4 selhaly: `ws-email` (pevné datum, známé) a tři časové limity či limit požadavků pod zátěží, samostatně 60/60.
  `npm run build` prošel. Bezpečnostní review bez nálezu (AUDIT-LOG).
- **chore** **Na produkci** 2026-11-24: commit `aaa3215`, nasazení `dpl_26Ns…` Ready (`fra1`), `www.zakaziq.cz`
  na něm. Ověřeno veřejně: `/`, `/login`, `/w/prihlaseni`, `/klient/prihlaseni` 200, `/dashboard` a
  `/dashboard/faktury/nova` 307, `/p/<nesmysl>` 404, cron 401; 30 min bez běhových chyb. Za přihlášením neověřeno.
- **decision** **R-143**, DECISIONS #042 doplnění.

### 2026-11-24 (faktura s povinnými údaji a značkou VIZEON — R-142)
- **feat** Nový vzhled PDF faktury (`lib/invoice-pdf/render.ts`, sdílí admin, Workspace i klientský prostor):
  značka dodavatele v hlavičce, „Faktura – daňový doklad" u plátce, dodavatel s údajem o zápisu a kontaktem,
  řádek dat (vystavení, DUZP vždy, splatnost, VS), položky s čísly vpravo, rekapitulace DPH po sazbách, tmavé
  pole „Celkem k úhradě", platební údaje s tuzemským číslem účtu z IBANu a QR, patička „Vystaveno v systému
  ZakazIQ" a „Faktura X · strana N z M" na každé stránce. Opraveno: storno ukazovalo k úhradě i účet,
  zaplacená faktura „Celkem k úhradě", neplátce nadpis „Cena bez DPH", nadpis „Celkem" nebyl zarovnaný
  a e-mail dodavatele z profilu se na fakturu netiskl. Workspace posílá do PDF i storno.
- **feat** Profil dodavatele v adminu: obchodní značka, kde jste zapsaní (povinné při uložení), telefon, web
  (`lib/admin/invoice-issue-schema.ts`, `components/admin/invoices/issuer-form.tsx`, `invoice-actions.ts`,
  `lib/admin/invoice-issue.ts`); do klientského prostoru jde značka, zápis a web (`lib/portal/money.ts`).
- **db** Migrace 131 `faktura_udaje_dodavatele` — `portal.put_invoice` s novými klíči dodavatele a přepočet
  projekce (aplikována na produkci 2026-11-24, viz R-143 výš).
- **chore** Ověřeno: `tsc`, 19 souborů testů faktur (272 testů) včetně vykreslení v Chromu (`PDF_SMOKE`,
  `WS_PDF_SMOKE`), nové testy povinných údajů, patičky, storna, zaplacené faktury, účtu z IBANu, DPH po sazbách,
  starého profilu a escapování. Šest variant PDF prohlédnuto okem (neplátce s QR, zaplacená, storno, EUR,
  plátce se dvěma sazbami, 34 položek na 3 stránkách). Za přihlášením v adminu neověřeno, necommitnuto.
- **decision** **R-142**, doplnění DECISIONS #042.

### 2026-11-24 (komu pozvánka na schůzku odešla — značky v kalendáři)
- **feat** Kalendář adminu u každé události s klientem ukazuje, jestli dostal pozvánku: fajfka
  „Pozvánka odešla", hodiny „se odesílá", červená obálka „neodešla", oranžová „Bez pozvánky"
  (nadcházející událost s kontaktem nebo Meetem bez odeslané pozvánky). Nad kalendářem souhrn
  za nadcházející schůzky zobrazeného období, v detailu kdy a kam pozvánka odešla a u „Bez
  pozvánky" tlačítko „Poslat pozvánku" (úprava s předvoleným Meetem). Stejně v Dnes a Hovorech
  (tentýž `SmartCalendar`). Bez migrace, čte `invite_status` z 115. „Odešla" = převzal Resend,
  doručení do schránky se nesleduje. Soubory: `lib/admin/invite-mark.ts`,
  `components/SmartCalendar.tsx`, `components/AdminEventModal.tsx`, `docs/admin/AGENTS-ADMIN.md`,
  test `lib/__tests__/admin-pozvanka-znacka.test.ts` (8).
- **chore** Ověřeno: `npx tsc --noEmit`, testy kalendáře, připomínek a tříd adminu 56/56, `npm run build`,
  dočasná stránka s vymyšlenými schůzkami (Playwright CLI) na 1280 px — Měsíc, Týden, Den, oba
  detaily — a 390 px bez vodorovného přetečení; stránka smazaná. Za přihlášením na skutečných datech
  neověřeno. Na produkci v tu chvíli 5 nadcházejících schůzek s odeslanou pozvánkou a 9 událostí
  bez Meetu. **Na produkci od 2026-11-24 (`22682a0`)**, s ním i úklidový commit `04941fe`; build Ready
  (`dpl_EiVw…`, `fra1`), `/`, `/login`, `/w/prihlaseni`, `/klient/prihlaseni` 200, `/dashboard` 307,
  `/p/<nesmysl>` 404, bez běhových chyb.

### 2026-11-24 (úklid repa podle ponytail-audit)
- **chore** Kontrola celého repa postupem `ponytail-audit` (github.com/DietrichGebert/ponytail, jen jako
  návod, nic se neinstalovalo). Graf importů přes všechny sledované soubory: bez odkazu byly jen tři
  komponenty, všechny závislosti v `package.json` se používají. Smazáno (Kryštof vybral všechny skupiny):
  `components/ProjectCardSkeleton.tsx`, `components/portal/{message-thread,portal-frame}.tsx` (po KP15),
  jednorázové `scripts/{apply-034-waitlist,apply-042-plans-archive,apply-migrations}.js`,
  `scripts/{admin-106-zpet.sql,export-before-drop.mjs,admin-income-check.mjs}` (migrace 100, 101 a 106 jsou za námi),
  `Dockerfile` (zavírá otevřený problém), zastaralé `.env.local.example`, `clerk-zakaziq.cz.zone`,
  `docs/{CLAUDE_BOOKING_PROMPT,POZNAMKY_NAKLADY_SABLONY_PLAN}.md`, stará kopie Impeccable 0.1.18 pro Copilot
  (`.github/{skills,agents,hooks}`, 19 MB), staré kopie `new - area of zakaziq/{README.md,docs/workspace/plan.md}`
  a 70 promptů hotových sezení (zůstaly S19, RD15, KP08, KP10, zadání pro Growth OS a rozcestníky s poznámkou,
  jak smazaný prompt vrátit: `git show fdb8a63:'<cesta>'`). Mimo git: worktree `xss-ddos-protection` (1,1 GB,
  bez změn, celé v `main`) a `../ZakazIQ-dotaznik` s lokální větví `admin/dotaznik-bez-google`; větev na GitHubu
  zůstala. Odkazy opravené v `CLAUDE.md`, `docs/AGENTS-REFERENCE.md`, `docs/workspace/LAUNCH-PLAN.md`,
  `memory/index.md`, testu `portal-supabase-auth` (hlídá teď `client-shell.tsx`) a `.gitignore`.
  Otevřený problém „Migrace 100 a 101 na produkci“ smazaný (100 doložená z logů, 101 potvrdil Kryštof).
- **chore** Ověřeno: `npx tsc --noEmit` bez chyby, `sync-agent-context --check` shodné, plná sada 1753 prošlo /
  3 selhaly: `ws-email` (pevné datum, známé) a dva soubory na časový limit pod zátěží (`admin-ai-asistent-crm`,
  `ws-intake`), samostatně 51/51. Build se nespouštěl.

### 2026-11-24 (jeden klient, jedny údaje — R-141)
- **feat** Kontakt je jediný zdroj e-mailu a telefonu klienta. `lib/admin/contact-sync.ts`: `propagateContact`
  (kontakt → Hovory, zakázky, budoucí schůzky; přidaný telefon přeplánuje SMS připomínky), `absorbIntoContact`
  (údaj odjinud → kontakt, jen místo prázdna nebo staré hodnoty), `syncOutreachContact` a `outreachContactOverlay`
  (firma od asistenta ↔ kontakt). Napojeno: příjem snímků z Growth OS (firma se souhlasem dostane kontakt,
  nejvýš 40 propisů na dávku), fronta a detail asistenta, převzetí do Hovorů, schůzka od asistenta (e-mail
  z pozvánky si kontakt zapamatuje), okno „Poslat e-mail" (adresát z Hovorů bere chybějící e-mail z kontaktu),
  Hovory (`createLead`, `updateLead` napojí kontakt a propíšou změnu), uložení a sloučení v Kontaktech.
  `ensureContact` existujícímu kontaktu doplní chybějící e-mail a telefon. Soubory: `lib/admin/{contact-sync,
  contacts,outreach,outreach-crm,outreach-crm-view,outreach-view,meetings,lead-mail-target}.ts`,
  `app/{contacts,outreach,calls}-actions.ts`, `app/dashboard/kontakty/[id]/page.tsx`.
- **feat** Okno události v kalendáři: pole Jméno je našeptávač z Kontaktů (jméno, firma, e-mail, telefon),
  výběr vyplní telefon i e-mail; Escape zavře jen našeptávač. Detail firmy v AI asistentovi: „Upravit telefon
  a e-mail" vede na kartu kontaktu, firma bez kontaktu má „Uložit do Kontaktů"; karta kontaktu ukazuje
  „Od AI asistenta". Soubory: `components/admin/contact-picker.tsx`, `components/AdminEventModal.tsx`,
  `components/admin/ai-asistent/{contact-detail,open-contact-button}.tsx`.
- **db** Migrace 130 `kontakt_jeden_zdroj` — `outreach_leads.contact_id`, kontakty firmám se souhlasem,
  doplnění prázdných e-mailů a telefonů (aplikována: ne, nikde).
- **docs** Zadání pro Growth OS `new - area of zakaziq/prompty/admin/growth-os-email-z-hovoru.md`
  (nadiktovaný e-mail do `leads.email`).
- **chore** Rozdělaná „fialová schůzka" přenesená z `admin/schuzky-pripominky` na aktuální `main` (stash,
  bez ztráty) a přečíslovaná z R-138 na **R-140** (R-138 je v `main` ochrana XSS a DDoS).
- **chore** Ověřeno: `npx tsc --noEmit`, nový `lib/__tests__/admin-kontakt-jeden-zdroj.test.ts` (17 testů:
  příjem snímku, přednost ruční opravy, propis do Hovorů/zakázky/schůzky, telefon zapsaný jinak, SMS po
  doplnění telefonu, kolize e-mailu, sloučený kontakt, našeptávač, migrace 130 nad daty a dvakrát po sobě).
  Plná sada 1753 prošlo / 3 selhaly: `ws-email` (pevné datum, známé) a dva časové limity pod zátěží
  (`admin-ai-asistent-crm`, `admin-hovory-asistent` — samostatně 22/22). **V prohlížeči neověřeno.**
- **decision** **R-141**, DECISIONS #051.
- **db** Migrace 130 **aplikovaná na produkci** 2026-11-24 (agent přes Neon CLI a `scripts/apply-migration.js`
  na souhlas Kryštofa, zapsaná v `public.schema_migrations`). Před ní jen čtením: 312 firem od asistenta, 19 se
  souhlasem, z nich 9 se shodou s existujícím kontaktem; Hovory ani zakázky prázdná místa k doplnění neměly.
  Po ní: 19 firem s kontaktem, žádná se souhlasem bez kontaktu, kontaktů 15 → 25, všechny kontakty firem
  s e-mailem i telefonem, index `outreach_leads_contact_idx` je. Testovací Neon ne.
- **chore** **Na produkci** (2026-11-24): commit `44aa2e4` (všechny tři změny, commitnulo a pushnulo souběžné
  sezení), build `project-q9qla1at8` Ready. Ověřeno veřejně: `/`, `/login`, `/w/prihlaseni`, `/klient/prihlaseni`
  200; `/dashboard`, `/dashboard/kontakty`, `/dashboard/ai-asistent` 307; `/p/<nesmysl>` 404; `/api/public/outreach`
  405 na GET a 401 bez klíče; v logu nasazení žádná chyba. Migrace 130 zatím neběžela. Bezpečnostní review
  a riziko #051 (d) v `bdfd99d`. **Za přihlášením nikdo nic neviděl.**

### 2026-11-24 (proč nechodí SMS připomínky)
- **chore** Kontrola fronty na produkci: e-mailové připomínky odcházejí (hodinová ke schůzce
  24. 11. 16:00 odešla v 15:00:00), SMS nešla žádná, protože žádná z pěti schůzek neměla
  telefon (ani schůzka, ani kontakt v Hovorech). Ke schůzce 26. 11. 17:00 doplněn telefon
  z `outreach_leads` (shoda podle e-mailu, jeden záznam, `+420…`) a naplánované SMS den předem
  (25. 11. 17:00) a 10 minut předem, přímo SQL na Kryštofovo zadání. U dalších tří schůzek
  telefon v systému není.
- **feat** Okno události v kalendáři dohledá telefon podle napsaného e-mailu (při psaní i při
  otevření události bez telefonu): kořen kontaktu, Hovory, AI asistent, zakázka, AI lead (pořadí
  sladěné s R-141). Ručně napsané číslo nepřepíše, smazané nevrátí, pod polem ukáže zdroj
  a upozorní na jiné číslo u téhož e-mailu. Soubory: `lib/admin/contact-phone.ts`,
  `app/meeting-actions.ts` (`findClientPhone`), `components/AdminEventModal.tsx`, test
  `lib/__tests__/admin-telefon-podle-emailu.test.ts` (7). Ověřeno: test, `tsc`, dotazy jen
  pro čtení na produkčním schématu. **Na produkci od 2026-11-24 (`44aa2e4`)** spolu s R-140
  a R-141; v prohlížeči neověřeno. Den předem ke schůzce 25. 11. v 17:00 odešel e-mail v čas;
  první SMS přes Odorik vůbec půjde 25. 11. v 17:00 (schůzka 26. 11.).

### 2026-11-23 (schůzky přes Google Meet fialově — R-140)
- **feat** Okno „Událost / schůzka": volba „Schůzka přes Google Meet? Ne / Ano" hned pod typem
  místo přepínače pod kontaktem; když Meet nejde založit, „Ano" je zamčené s vysvětlením (dřív
  přepínač zmizel). Údaje pozvánky se ukážou až po „Ano". V kalendáři je každá schůzka přes Meet
  fialová (ruční i konzultace), Teams přešly na růžovou, legenda má „Schůzka přes Google Meet".
  Soubory: `components/AdminEventModal.tsx`, `components/SmartCalendar.tsx`,
  `docs/admin/AGENTS-ADMIN.md`. Bez migrace.
- **chore** Ověřeno: `npx tsc --noEmit`, testy `components/admin/__tests__` a
  `admin-pripominky` (46/46), okno na dočasné stránce bez přihlášení na 1280 a 390 px (volby
  44 px, bez vodorovného přetečení; stránka smazaná). Stav „Ano" s pozvánkou a fialová v kalendáři
  za přihlášením neověřené.

### 2026-11-23 (nasazení R-138 a R-139)
- **chore** **Na produkci** (2026-11-23): fast-forward `main` `6e6f9d0` → `d622689`, build Ready (`dpl_BmXV…`, `fra1`).
  Ověřeno veřejně: `/`, `/login`, `/podminky`, `/w/prihlaseni`, `/klient/prihlaseni`, `/robots.txt` 200; `/dashboard`
  a `/dashboard/faktury/dodavatel` 307; `/p/<nesmysl>` 404; cron 401; `POST /api/public/leads` a `vizeon-leads` bez klíče
  401; CSP, HSTS a `X-Frame-Options` na `/`. 20 min po nasazení žádná běhová chyba. Brána proti zahlcení se na produkci
  nezkoušela (stovky požadavků). Build v čistém worktree bez `.env.local` padá na předvykreslení `/dashboard/faktury/nova`
  (bez Supabase env stránka nesáhne na cookies) — s env i na Vercelu prochází. **Za přihlášením nikdo nic neviděl.**

### 2026-11-23 (úklid stavu, větví a worktree)
- **docs** Převzaté rozdělané srovnání stavu z 2026-11-21 (worktree `claude/k-incomplete-phases-537efe`): tabulka
  KP a kritéria 11.1 v `docs/klientsky-prostor/PLAN.md` (kritérium 5 — druhý faktor — opravené na hotové),
  řádek F1 v `docs/AUTH-SUPABASE-PLAN.md`, Aktuální stav a body „nasadit" u KP11–KP17 přepsané na „projít naživo".
- **fix** Otevřené problémy: zmizely dva body o červeném testu `ws-schema` — číslování migrací je od migrace 120
  na `main` souvislé a test prochází.
- **chore** Úklid: odstraněné worktree a lokální větve, jejichž práce je celá v `main` a kde se nepracovalo, a na
  přání Kryštofa i staré pokusy z 7.–10. 11. (landing 4 bloky, opora pro hovor, šablony oborů), `auth/supabase-klient`,
  `downloads-snapshot`, `ws/redesign` a záloha `backup/kp10-pred-prepisem`. Zůstaly pokusy s přechodem Workspace na
  Supabase (`ws/supabase`, dva worktree `migrate-*-supabase`) jako podklad pro F2 a worktree `ZakazIQ-dotaznik`;
  větev `admin/dotaznik-bez-google` zahozená (Kryštof 2026-11-23: recenze na Googlu v dotazníku zůstává, R-119).
  Na GitHubu se nic nemazalo.

### 2026-11-23 (text e-mailu s fakturou do `main` — R-139)
- **feat** Předmět a text e-mailu, kterým faktura odchází klientovi, jde upravit v Faktury › Údaje dodavatele:
  proměnné `{cislo}`, `{castka}`, `{splatnost}`, `{odberatel}`, `{dodavatel}` tlačítkem na místo kurzoru, náhled ze
  stejných funkcí jako skutečný e-mail, překlep se neuloží, „Vrátit výchozí text". Platí pro „Poslat e-mailem"
  i „Schválit a poslat". Hotové na větvi `claude/invoice-automation-templates-b0cd18` z 2026-11-20, převedené na
  `main`; úprava `escapeHtml` v `lib/email.ts` z větve odpadla, uvozovky escapuje od R-138 sdílený modul.
  Soubory: `lib/admin/{invoice-email-template,invoice-email-settings,invoice-send}.ts`,
  `components/admin/invoices/{email-template-form,issued-actions}.tsx`, `app/dashboard/faktury/dodavatel/page.tsx`,
  `app/dashboard/finance/invoice-actions.ts`.
- **db** Migrace 129 `faktury_sablona_emailu` (na větvi 120, to číslo má oprava kalendáře) — sloupec
  `admin_settings.invoice_email_template` (aplikována: produkce 2026-11-23 přes Neon MCP na souhlas Kryštofa,
  zapsaná v `public.schema_migrations`, ověřený sloupec `jsonb`; testovací Neon ne). Aditivní.
- **chore** Ověřeno: `npx tsc --noEmit`, `admin-faktury-sablona-emailu` (PGlite bez migrace, po ní a po dvojím běhu),
  `email-route`, `email-resend`, `ws-schema` (číslování bez mezer) — 209 prošlo. Formulář v prohlížeči ověřený
  2026-11-20 na dočasné stránce (1280 a 375 px). **Uložení do databáze a skutečné odeslání neověřené.**
- **decision** **R-139** (přečíslováno z R-121).

### 2026-11-23 (ochrana proti XSS a DDoS do `main` — R-138)
- **feat** Audit z 2026-11-20 (necommitnutý ve worktree `claude/xss-ddos-protection-75bcd7`) převedený na dnešní `main`.
  **Jeden modul pro cizí text v HTML** `lib/security/html.ts` (`escapeHtml` s uvozovkami, `safeHttpUrl`, `linkifyHtml`,
  `jsonForScript`, `stripControlChars`); kopie `escapeHtml` pryč z `lib/email.ts`, `lib/ws/email/layout.ts`,
  `meeting-email`, `survey-email`, `invoice-pdf/render.ts` a nově i z `consultation-email`, `phase-email`,
  `portal/invite-email` a `admin/chat.ts` (ty přibyly s klientským prostorem po auditu, správné, ale duplicitní;
  v chatu chyběl apostrof, zneužít to nešlo).
- **fix** XSS/HTML injekce: uvozovka v textu e-mailu vložila do odkazu další atribut (`lib/email.ts`, Workspace
  `layout.ts`); `live_url` z databáze v `href` hromadného e-mailu; odkaz z cizího RSS daňových novinek; adresa ukázky
  na `/p/[token]` a `/klient/projekt` jen http(s); ICS bez osamělého `\r`.
- **feat** DDoS v aplikaci: brána na IP v `proxy.ts` (`lib/security/front-gate.ts`, 240 stránek / 120 API za 10 s,
  IPv6 po /64, jen produkce, `FRONT_GATE=off`), paměťová předbrána před `isApiRateLimited` a `hitLimit`, `DELETE`
  v `recordApiRequest` jen 2 %, semafor na Chromium (2 souběžně, čekání 25 s), `readFormDataLimited` u přepisu hlasu
  a `invoices/parse`, jedna `clientIpFromHeaders` ověřená jako IP. Semafor navíc uvolní místo i při synchronní
  výjimce úlohy (nový test).
- **test** `lib/security/__tests__/xss-guard.test.ts` hlídá zdroják (vlastní `escapeHtml`, `dangerouslySetInnerHTML`,
  `innerHTML`, `eval`, `srcDoc` bez `sandbox=""`, `href="${…}"` bez escapování).
- **chore** Ověřeno: `npx tsc --noEmit`, plná sada 1685 prošlo / 3 selhaly — `ws-email` (pevné datum, známé)
  a dva časové limity pod zátěží (`admin-ai-asistent-crm`, `admin-hovory-asistent`) + dva soubory na `hookTimeout`
  (`ws-customers`, `ws-today`); samostatně všechny 4 soubory 48/48. **Vercel WAF nenastavený, v prohlížeči nic neověřeno.**
- **decision** **R-138**, DECISIONS #050 (přečíslováno z R-121 / #040).

### 2026-11-23 (zkouška připomínek schůzek na produkci)
- **chore** Ověřena fronta `meeting_reminders` naostro: 17 zkušebních schůzek v produkční DB s adresou
  `delivered@resend.dev` (testovací schránka Resendu), bez telefonu, pak smazané i s frontou a upozorněním.
  Výsledek: e-mail hodinu předem, den předem a zpráva o přesunu s `.ics` odešly do 1 s od běhu spouštěče
  (id od Resendu); pozdní přeskočena, vypnuté připomínky a SMS bez čísla zrušené, předčasná se posunula
  na správný čas; pět spuštění naráz poslalo každou zprávu jednou (1 pokus, různá id); neplatná adresa
  tři pokusy po minutě, pak „neodešlo" s důvodem a upozornění do zvonku. Vercel bez běhových chyb.
  Automatické testy připomínek a kalendáře 5× po sobě 45/45. Neověřeno: SMS přes Odorik, Google Meet
  (vytvoření, přesun, smazání) a pozvánka — jdou jen přes přihlášený admin.

### 2026-11-23 (schůzky a Next.js 16.4.6 na produkci)
- **chore** Nasazeno: `main` → `c23adf5` (push Kryštof), nasazení `dpl_5TCifpK4ihePTZmWiyHyJWsn4eTe`
  Ready. Před ním migrace 120 a 128 na produkčním Neonu (agent přes Neon, zapsané v
  `schema_migrations`; 120 doplnila `lead_id` u 3 událostí) a ve Vercelu `MEETING_REMINDERS_SECRET`
  (agent), `ODORIK_API_USER` a `ODORIK_API_PASSWORD` (Kryštof). Ověřeno: spouštěč pg_cron dostává
  každou minutu 200 a produkce zapisuje `admin_settings.reminders_tick_at`; `/`, `/login`,
  `/w/prihlaseni`, `/klient/prihlaseni` 200, admin 307, `/p/<nesmysl>` 404, endpoint připomínek bez
  klíče i se špatným klíčem 401; 20 minut po nasazení žádná běhová chyba. Za přihlášením okem nikdo
  nic neviděl.

### 2026-11-23 (Next.js 16.4.6 — bezpečnostní upgrade)
- **chore** `next` 16.4.2 → **16.4.6**: zavírá sedm středně závažných nálezů v Next 16.0.0–16.4.4
  (HttpOnly cookie na Edge, SVG v optimalizaci obrázků, úniky z `'use cache'`/`unstable_cache`,
  self-hosted přeposílání odpovědí). Opravná verze řady 16.4, ne hlavní (R-053). Udělané ve
  worktree `../ZakazIQ-next-security` (větev `chore/next-security`, commit `1c57ec1`) a přenesené na
  `admin/schuzky-pripominky`, ať jde na produkci jedním pushem. Ověřeno: `npm audit` 0 nálezů,
  `tsc`, plná sada testů (padají jen známé nestabilní a `ws-email`/`ws-schema`), `next build`
  bez `SecurityFatalError`, `next start` a regresní adresy. Uzavírá otevřený problém z 2026-11-17.
  `.claude/security/AUDIT-LOG.md` 2026-11-23.

### 2026-11-23 (schůzky z kalendáře a připomínky klientovi — R-137)
- **feat** V okně události v kalendáři přepínač **Schůzka přes Google Meet**: odkaz na Meet,
  pozvánka z krystof@vizeon.cz s upravitelným textem za 15 s se „Zpět" a soubor `schuzka.ics`
  v příloze. Jde i u existující události. Pak **připomínky**: den předem e-mail a SMS, hodinu
  předem e-mail, 10 minut předem SMS. Po přesunu se připomínky přepočítají a klient dostane
  zprávu o změně (zaškrtávátko v okně), událost se posune i v Google Kalendáři. Smazaná schůzka
  zmizí i z Google Kalendáře (dřív zůstávala). Detail události ukazuje stav připomínek.
  „Domluvit schůzku" u AI asistenta má připomínky taky. Soubory: `lib/admin/{meeting-reminders,sms,meeting-ics}.ts`,
  `lib/admin/{meetings,meeting-email,calendar}.ts`, `lib/admin/google/calendar.ts` (`moveGoogleEvent`),
  `app/{calendar-actions,meeting-actions}.ts`, `app/api/cron/meeting-reminders/route.ts`,
  `app/api/cron/send-reminders/route.ts` (pojistka a hlídání spouštěče), `components/AdminEventModal.tsx`,
  `components/SmartCalendar.tsx`, `components/admin/schedule-meeting-dialog.tsx`, migrace 128 (aplikována: ne).
- **feat** SMS přes Odorik (`POST /api/v1/sms`, ověřeno v jeho dokumentaci 2026-11-23): text bez
  diakritiky do 160 znaků, odesílatel do ČR jen Odorik.cz / smsinfo / 5517. Odložené SMS Odoriku
  se nepoužívají (nejdou zrušit). Spouštěč každou minutu = pg_cron `zakaziq-meeting-reminders`
  v Supabase (pg_net, klíč `MEETING_REMINDERS_SECRET` z Vault); Vercel Pro Kryštof nechce.
- **chore** Ověřeno: `npx tsc --noEmit`, nový `lib/__tests__/admin-pripominky.test.ts` (29 testů
  nad PGlite se SQL 114, 115, 128), všechny testy adminu (473), `npm run build:check` (napoprvé ho
  shodily staré typy v `.next/dev/types` po smazané dočasné stránce `app/ukazka-schuzka-tmp`;
  složka smazána, podruhé prošel). Plná sada: selhávají jen známé `ws-email`, `ws-schema` (mezera
  po 113) a nestabilní testy pod zátěží. **V prohlížeči, se skutečným Googlem, Resendem ani
  Odorikem neověřeno.** Necommitnuto.
- **decision** **R-137**, DECISIONS #049.

### 2026-11-22 (poptávky z vizeon.cz do adminu)
- **feat** Nový vstup `POST /api/public/vizeon-leads` pro kontaktní formulář vizeon.cz (R-136): stejný
  handler jako Prvotka, vlastní klíč `VIZEON_LEAD_WEBHOOK_SECRET`, okno limitu `vizeon_lead`. Soubory:
  `app/api/public/vizeon-leads/route.ts` (+ test, 10 případů), `lib/lead-origins.ts`, `.env.example`,
  `docs/AGENTS-REFERENCE.md`, `docs/admin/AGENTS-ADMIN.md`, `.claude/security/{STATE,AUDIT-LOG}.md`.
  Bez migrace. Klíč vygenerován a uložen přes stdin do Vercelu ZakazIQ i webu VIZEON (Production,
  sensitive). Ve webu VIZEON (jeho repo, necommitnuto) přepsaný `lib/zakaziq.ts` na nový vstup s www.
- **chore** Zjištěno: produkční proměnné ZakazIQ jsou typu sensitive (58 ze 70) a `vercel env pull` vrací
  prázdné hodnoty, i když `vercel env ls` ukazuje „Encrypted“. Klíče s pepřem (`sk_live_…`) proto nejde
  vyrobit skriptem z počítače, jen běžící aplikací.
- **chore** **Na produkci od 2026-11-22 (`7d2e821`)**, build Ready. Ověřeno na www.zakaziq.cz: bez klíče 401,
  se správným klíčem a cizím `section` 400 (klíč přijat, nic nezapsáno), zkušební poptávka 201 — v produkční
  DB řádek s `lead_origin = vizeon`, `source = vizeon_web`, `lead_pending = true` a oznámení do zvonku.
- **chore** Web VIZEON nasazený přes Vercel CLI (`vercel deploy --prod`, deploy `dod9trs23`, aliasy vizeon.cz
  a www): build prošel lokálně i na Vercelu, `/`, `/kontakt`, `/sluzby`, `/zakaziq` 200. Formulář `/api/contact`
  odeslaný naostro dorazil do adminu (telefon `+420…`, zájem a stránka v popisu). Obě zkušební poptávky smazány
  stejně jako tlačítko v Poptávkách (`DELETE … AND lead_pending`), jejich oznámení označena jako přečtená.
  `ZAKAZIQ_API_KEY` z Vercelu webu odstraněn (nic ho nečetlo).
- **chore** Změny webu VIZEON commitnuté v jeho repu (`7150c17`) a pushnuté; deploy z gitu `n05dmp40a` je na
  vizeon.cz, `/api/contact` odpovídá. Produkce webu teď odpovídá gitu.

### 2026-11-21 (analýza a plán konverze klientů na Workspace)
- **feat** Landing do spuštění Workspace (R-134, D-KV2, KV01a): přepínač `SIGNUP_OPEN = false`
  v `components/marketing/content.ts`. Pět tlačítek „Vyzkoušet 14 dní zdarma" (hlavička, úvod, funkce,
  ceník, patička) je teď „Chci to vyzkoušet" → `/#vyzkouset`, kde formulář předvyplní „Chci vyzkoušet
  ZakazIQ. Moje firma: " (dotaz jde do Hovorů, R-065). „Přihlásit" vede do `/klient/prihlaseni`
  (jediní, kdo se dnes přihlašují, jsou klienti webu), sekce kontaktu má nadpis „Chcete to vyzkoušet?",
  patička „Přístup vám nastavím osobně.". Soubory: `components/marketing/{content,header,hero,modules,pricing,footer,contact-section,contact-form}.tsx|ts`,
  test `components/marketing/__tests__/trial-cta.test.ts`, poznámka v `docs/landing/PROJECT-BRIEF.md`.
  Ověřeno: `tsc`, testy landing page 9/9, lokálně v prohlížeči 1280 a 390 px (odkazy, předvyplnění,
  posun ke formuláři, bez vodorovného přetečení, konzole čistá). Odeslání formuláře nezkoušeno
  (worktree nemá `.env.local`). **Na produkci od 2026-11-21 (`1e3c993`, fast-forward `main`
  `0b50024` → `1e3c993` po přeskládání na commit s TOTP):** build za ~40 s, na www.zakaziq.cz
  šest odkazů na `/#vyzkouset`, žádný na `/w/registrace`, „Přihlásit" vede do `/klient/prihlaseni`,
  zpráva se předvyplní, konzole bez chyb; `/`, `/login`, `/klient/prihlaseni`, `/w/prihlaseni`,
  `/podminky` 200.
- **docs** Analýza od A do Z a plán, jak z klienta webu s klientským prostorem udělat platícího uživatele
  Workspace: psychologie klienta, „zrcadlo" (co klient zažil v prostoru, dostanou jeho zákazníci od něj),
  žebřík malých ano, okamžiky nabídky, vracecí smyčky, prvky P1–P7, W1–W5, A1–A4, mantinely proti
  temným vzorům, sezení KV00–KV09 a rozhodnutí D-KV1–D-KV9 (čekají na Kryštofa). Soubor
  `docs/klientsky-prostor/KONVERZE-PLAN.md`, řádek v `memory/index.md`. Bez změny kódu.
- **decision** **R-134** (D-KV1–D-KV7, D-KV9: osobně prvních 5, Workspace až na Supabase a landing
  do té doby na formulář, 30 dní pro klienty webu, karta zůstává, nabídka jen v prostoru a osobně,
  jen vhodný obor, weby na Workspace až na přání, ZakazIQ jako Kryštofův produkt) a **R-135**
  (při prvním platícím klientovi z Vercelu na Cloudflare, dopředu se nepřipravuje). Plán upravený.
- **chore** Ověřeno při analýze: `npx tsc --noEmit` čisté; `npx vitest run` 1572 prošlo, 3 selhaly
  (známé: `ws-schema` mezera po 120, `ws-email` pevné datum, `admin-ai-asistent-crm` časový limit);
  `zakaziq.cz` → 308 na www, canonical www; `/w/registrace` 200, ale Clerk v režimu *Development mode*.

### 2026-11-21 (nasazení klientského prostoru KP11–KP17 a KP10 na produkci)
- **chore** KP10 kritérium 5: **TOTP u admina zapnuté** 2026-11-21 (produkční `/dashboard/profil` → Přihlášení, ověřovací aplikace). Kryštof naskenoval QR a zadal kód sám, agent kód ani heslo nezadával; QR se nefotil. Po novém načtení stránky ukazuje „Dvoufázové ověření je zapnuté“. Zkoušky přes Playwright CLI v samostatném okně selhaly (okno nebylo vidět, přihlášení proběhlo jinde), použil se přihlášený Chrome přes rozšíření. Dál zbývá: pilot, Google CDPA, OpenAI.
- **docs** Stav sezení KP srovnaný s nasazením: tabulka a kritéria 11.1 v `docs/klientsky-prostor/PLAN.md`, řádek F1 v `docs/AUTH-SUPABASE-PLAN.md`, obnova hesla jako ověřená v `.claude/security/STATE.md` (+ `.agents/`), Aktuální stav a Otevřené problémy (body „nasadit" u KP11–KP17 přepsané na „projít naživo", hotové nastavení Supabase smazané). Při tom zjištěno: `ws-schema` test je po sloučení červený i na `main` (chybí migrace 120).
- **docs** Kontrolní seznam pilotu `docs/klientsky-prostor/PILOT.md` (příprava, 14 kroků průchodu, kritéria hotovo, tabulka zjištění), řádek v `memory/index.md`.
- **decision** **R-133**: Vercel zůstává na Hobby, Pro se platit nebude (Kryštof). DPA Vercelu tím u klientských dat zůstává nepokryté, přijaté riziko; v `GDPR.md` označeno.
- **chore** KP10 kritérium 8: v dashboardu Vercelu potvrzeno, že tým je na plánu **Hobby** (DPA Vercelu platí jen pro Pro a Enterprise). Do vyřešení přechodu na Pro zůstává Vercel bez smlouvy o zpracování. Text `/klient/soukromi` přečten ze zdroje a předán Kryštofovi ke kontrole (bod 9 čeká na jeho schválení).
- **chore** KP10 kritérium 8, částečně: v dashboardu Supabase potvrzeno (Organization → Legal Documents), že DPA je součástí Terms of Service a nic se nepodepisuje. Google Admin (vyžaduje přístupový klíč) a OpenAI (odhlášený) agent neověřil, Vercel MCP plán neukazuje. Zbývá Google CDPA, OpenAI, Vercel plán a body 5 (TOTP), 6 (pilot), 9 (text soukromí).
- **chore** KP10 kritérium 7: oddělení dvou firem ověřené na produkční databázi (Neon, větev `production`). Dva testovací klienti a zakázky založené v jedné transakci a vrácené `RAISE EXCEPTION` (rollback ověřen: 0 testovacích řádků, žádné zůstatkové členství v roli). V roli `portal_app` s `app.client_id` A a B: každý vidí jen svoji zakázku a aktivitu, na id druhé firmy nevidí nic, bez kontextu 0 řádků ve všech 14 čitelných tabulkách, `public.projects`, `portal.invites` a zápis do projekcí zakázané, koncept aktivity A klient nevidí, `portal_app` bez BYPASSRLS. Pozn.: `neondb_owner` měl v roli členství bez práva SET, test si ho dal `GRANT … WITH SET TRUE` jen uvnitř vratné transakce. Na produkci zůstal klient „dobry den" z 2026-11-17 (nedotčen, kdo ho založil, nevíme).
- **docs** DPA zpracovatelů v `docs/klientsky-prostor/GDPR.md` doplněno z veřejných podmínek (ověřeno 2026-11-21): Resend má DPA předpodepsané, ale zpracovává v USA (SCC + DPF); Vercel DPA platí podle podmínek jen pro Pro/Enterprise, projekt je na Hobby, takže smlouva zpracování nemusí pokrývat; Supabase, Neon a Google beze změny — přijetí v účtech nikdo neověřil. Zbývá ověřit v dashboardech (Supabase Organization → Legal, Google Admin → Legal and compliance, OpenAI) a vyřešit Vercel Pro.
- **chore** `main` `d3380ce` → `fa79603` (fast-forward, 14 commitů: KP11–KP17, KP10, merge e-mailů z Hovorů).
  První push zablokoval GitHub push protection (testovací Stripe klíč v `f01c08e`); Kryštof
  výslovně souhlasil s přepisem nepushnuté historie, klíč se odstranil `git filter-branch`
  z celého rozsahu `origin/main..HEAD` (výsledný strom shodný, záloha ve větvi
  `backup/kp10-pred-prepisem`). Hashe KP commitů se tím změnily.
- **chore** Vercel `dpl_9XSm7yLWPFbETb2NxgpDac1KiaxM` READY za ~100 s, `fra1`, aliasy `www.zakaziq.cz`
  a `zakaziq.cz`. Ověřeno veřejně: `/`, `/login`, `/klient/prihlaseni`, `/w/prihlaseni`, `/podminky`
  200; `/dashboard` a `/klient/soukromi` 307 na přihlášení; cron 401; `POST /api/public/web-udalost`
  bez klíče 401, s hlavičkou `Origin` 403. **Za přihlášením nikdo nic neviděl.**
- **chore** Po nasazení (téhož dne): soukromý bucket `chat-prilohy` založen v Supabase `zakaziq`
  SQL vložením do `storage.buckets` (`public = false`, limit 4 MB, jen PNG/JPEG/WebP/PDF; stejné
  hodnoty jako `lib/chat/storage.ts`). Ověřeno čtením: 1 uživatel v `auth.users`, **0 ověřených
  faktorů MFA**, bucket existuje.
- **chore** KP10 krok 6 hotový (2026-11-21): hook Before User Created přepnutý na HTTPS
  (`https://www.zakaziq.cz/api/auth/supabase-hook`, Postgres hook smazán), tajemství ve Vercelu
  jako `SUPABASE_AUTH_HOOK_SECRET` + redeploy (nepodepsaný požadavek teď vrací 401, předtím 403),
  vlastní SMTP přes Resend (`info@zakaziq.cz`), česká šablona Reset Password
  (`docs/klientsky-prostor/supabase-sablona-reset-hesla.html`, diakritika jako HTML entity — vložení
  přes schránku rozbilo kódování). Hook, tajemství a heslo SMTP zadal Kryštof, agent v Chrome vyplnil
  jen název proměnné, bucket a šablonu.
- **chore** KP10 krok 8: `web-security-audit` na živé adrese, **0 skutečných chyb** (skript 28/4/1,
  vše zbylé jsou falešné poplachy, detail `.claude/security/AUDIT-LOG.md` 2026-11-21). DNS apexu
  (CAA, SPF, `rua`) dál chybí, beze změny od 2026-11-14.
- **chore** Průchod naostro (2026-11-21): admin v Chrome založil testovacího klienta „Test KP10
  (smazat)“ a pozvánku na alias `+test`; Kryštof ji v anonymním okně uplatnil a nastavil heslo (hook
  pozvaného propustil, `auth.users` získal účet), požádal o obnovu hesla a **e-mail z Resendu přišel**,
  česky, správný odesílatel i odkaz (potvrdil Kryštof). Pozvánka při přihlášeném adminu správně
  odmítla uplatnění pod cizím účtem. Zjištění: admin se přes `/klient/zapomenute-heslo` záměrně
  neobnovuje (`app/klient/actions.ts`), test šel jen s ne-adminským účtem; `recovery_sent_at`
  v `auth.users` zůstalo prázdné i po doručení e-mailu, takže se na něj nedá spoléhat jako na důkaz.
  Úklid: smazán testovací klient, člen a pozvánka (Neon `portal.*`) i uživatel `+test` (Supabase),
  zůstal jen admin; ostatní data nedotčena.
- **chore** `ADMIN_USER_ID` je ve Vercelu Production (ověřeno 2026-11-21 výpisem proměnných; hodnota je
  šifrovaná, takže přímé porovnání s id admina nejde — nepřímo ho potvrzuje úspěšné přihlášení admina po
  posledním redeployi).
- **fix** **Preview četl produkční databázi** — `DATABASE_URL` pro Preview (všechny větve) mířil na
  Neon „Projectiq". Opraveno: Kryštof přes Vercel CLI nastavil testovací connection string z `.env.local`
  („ZakazIQ RD test"); ověřeno v Preview `preview/test` (Dnes ukazuje ukázková data, Klienti Workspace
  2 testovací účty). Detail `.claude/security/AUDIT-LOG.md` 2026-11-21.
- **db** Testovací Neon „ZakazIQ RD test" (větev `rd-test`): migrace 103, 105, 106, 108–119, 121–127
  aplikované `scripts/apply-migration.js` (22 souborů, 0 chyb). Produkce beze změny.
- **chore** Preview: admin se přihlásí přes Supabase `zakaziq` (jen identita; `SUPABASE_URL`,
  `SUPABASE_PUBLISHABLE_KEY`, `ADMIN_EMAIL`, `ADMIN_USER_ID` pro Preview), data z testovací DB.
  Klientský prostor v Preview přihlásit nejde — druhý Supabase projekt nejde založit (limit 2 free
  projektů), Kryštof zvolil „bez Supabase v Preview". Kontrolní větev `preview/test` (prázdné commity
  kvůli novému sestavení; `main` beze změny).
- **chore** Zbývá: TOTP u admina, krok 7 pilot s jedním
  klientem, DPA v `GDPR.md`, kontrola `/klient/soukromi` Kryštofem, DNS apexu (CAA, SPF, `rua`).

### 2026-11-20 (migrace klientského prostoru na produkci)
- **db** Migrace 121, 122, 123, 124, 125, 126 a 127 **aplikované na produkčním Neonu** (projekt
  Projectiq, větev `production`), každá v jedné transakci přes Neon MCP; 113 už tam byla (ověřeno
  komentářem sloupce), jen se zapsala do evidence. Práva `scripts/portal-grants.sql` pro `portal_app`.
  Evidence `public.schema_migrations` na produkci dosud neexistovala — založená, 8 řádků s hashi
  souborů jako u `scripts/apply-migration.js`. Ověřeno: md5 těl všech 42 funkcí z migrací = soubory
  v repu, RLS zapnutá na všech tabulkách `portal` (16 politik), `portal_app` bez BYPASSRLS, bez přístupu
  k `project_web_events`, `public.projects`, `storage_path` a `portal_erase_member`. Prostor zatím
  nemá žádnou zakázku ani člena. Kód KP11–KP17 a KP10 na produkci není.

### 2026-11-20 (KP10 — audit, GDPR a příprava spuštění)
- **decision** **R-131**: výmaz a export člena skriptem, retence i pro témata konzultací, dotazník
  a stav čtení, stránka `/klient/soukromi`, kritéria spuštění.
- **fix** `/api/public/web-udalost` a `/api/agent/…/reports` utnou tělo po stropu i bez
  `Content-Length` (`readJsonLimited`). Soubory: obě `route.ts`, test hlášení.
- **db** Migrace 127 `gdpr_klientsky_prostor` (aplikována: ne, nikde): `portal_export_member`,
  `portal_erase_member`, doplněná `purge_client_retention`.
- **feat** Skript `scripts/portal-gdpr.mjs`, stránka `app/klient/soukromi/`, odkaz „Vaše údaje"
  v `components/portal/client-shell.tsx` a na Přehledu.
- **docs** `docs/klientsky-prostor/GDPR.md` (zpracovatelé, inventura, postup), plán oddíl 5 (hrozby
  se stavem ověření) a 11.1 (kritéria spuštění).
- **chore** Ověřeno: `npx tsc --noEmit`; nový `lib/__tests__/kp10-gdpr.test.ts` (7 testů nad PGlite);
  v testu hlášení pokus o únik a tělo přes 32 kB; v `kp17` otočení a zneplatnění klíče hlášení.
  Bezpečnostní kontrola celého prostoru: 4 drobnosti opravené, 0 zneužitelných (AUDIT-LOG).
  **Nic nenasazené, nic naživo.**

### 2026-11-20 (KP17 — poptávky z webu klienta)
- **decision** **R-130**: D-K20 = jen počet (Kryštof), události místo projekce, pepř `AGENT_KEY_PEPPER`.
- **feat** Veřejný vstup `POST /api/public/web-udalost`: server webu klienta pošle druh `poptavka`
  nebo `objednavka` s klíčem webu zakázky; jen ze serveru (`Origin` = 403), tělo do 1 kB, limity
  60/h na klíč a 300/h na IP, zkušební událost se nepočítá. Soubory: `app/api/public/web-udalost/route.ts`,
  `lib/client-web/{keys,stats,setup}.ts`, `lib/agent-keys.ts` (export `randomToken`).
- **feat** Admin: karta „Poptávky z webu" v Přehledu detailu zakázky (graf 12 měsíců, klíč vytvořit,
  otočit, zneplatnit, návod pro web a zkušební příkaz). Soubory: `components/admin/web-key-panel.tsx`,
  `app/project-web-key-actions.ts`, `components/admin/project-detail-view.tsx`.
- **feat** Klientský prostor: řádek „Poptávky z webu" na kartě zakázky v Přehledu, graf v panelu
  O zakázce a v detailu projektu. Soubory: `components/client-web/web-leads-chart.tsx`,
  `lib/portal/{web-leads,overview}.ts`, `components/portal/{overview,project-aside}.tsx`,
  `app/klient/{zpravy,projekt}/[id]/page.tsx`.
- **db** Migrace 126 `poptavky_z_webu` (aplikována: ne, nikde), grant v `scripts/portal-grants.sql`.
- **docs** Návod `docs/klientsky-prostor/NAPOJENI-WEBU-KLIENTA.md`, D-K20 v plánu, reference, index.
- **chore** Ověřeno: `npx tsc --noEmit`; nový `lib/__tests__/kp17-poptavky-webu.test.ts` (18 testů nad
  PGlite přes skutečný route handler: migrace dvakrát, klíče, `Origin`, limity, velké tělo, oddělení
  klientů, pražské měsíce, zkušební událost); testy KP12–KP16 a oddělení klientů s migrací 126.
  Vzhled na dočasné stránce s vymyšlenými daty (nula, jeden měsíc, rok, velká čísla) na 375 a 800 px:
  bez vodorovného posouvání, plochy ≥ 44 px; stránka smazaná. Bezpečnostní kontrola bez nálezu
  (AUDIT-LOG). **Naživo s databází a webem klienta neověřeno.**

### 2026-11-20 (D-K16 a příprava KP17, KP10)
- **decision** **R-129**: analýza pro klienta = poptávky z jeho webu po měsících (D-K16). Otevřená
  otázka D-K20 (jak se poptávka z webu klienta dostane do ZakazIQ) v plánu, oddíl 7.
- **docs** Prompt `KP17-poptavky-z-webu-klienta.md` (varianta a, odbočky b a c), prompt KP10
  aktualizovaný na stav po KP11–KP16 (Supabase místo Clerku, chat, přílohy, Resend, migrace 113
  a 121–125, pořadí nasazení), `docs/klientsky-prostor/PLAN.md` (4.7, 6, 7), rozcestník promptů.

### 2026-11-20 (KP16 — přehled klienta)
- **feat** Přehled `/klient`: „Čeká na vás" (schválení, úkol s „Mám hotovo", nepřečtené zprávy,
  faktura po splatnosti, hodnocení) a karta každé zakázky (etapa s termínem, peníze, konzultace,
  poslední práce), hotové zakázky zvlášť. Načtení jedním požadavkem (`lib/portal/overview.ts`).
  Soubory: `app/klient/page.tsx`, `components/portal/overview.tsx`, `lib/portal/format.ts`.
- **feat** Panel O zakázce u chatu: osa etap, úkoly „Mám hotovo", zaplaceno a zbývá s odkazem na
  faktury, nejbližší konzultace s Meet, co se dělo, živá verze; pod 1280 px výsuvný panel z tlačítka
  v záhlaví. Soubory: `components/portal/{project-aside,aside-sheet}.tsx`, `app/klient/zpravy/[id]/page.tsx`.
- **feat** Faktury a Konzultace jako souhrn přes všechny zakázky (`?zakazka=`, výběr zakázky
  u rezervace), po přihlášení `/klient/start` (chat s nepřečtenou zprávou, jinak Přehled), odkaz do
  prostoru na `/p/[token]`. Soubory: `app/klient/{faktury,konzultace,start,prihlaseni}`,
  `components/portal/{consultations,project-money}.tsx`, `lib/portal/paths.ts`, `app/p/[token]/page.tsx`.
- **feat** Hodnocení hotové zakázky přes dotazník R-119 (`components/portal/survey-card.tsx`,
  `lib/portal/survey.ts`); `FeedbackCard`, `sendFeedback` a `loadProjectExtras` odstraněné.
- **feat** E-mail klientovi o hotové etapě (`lib/admin/phase-email.ts`): 15 s po kliknutí přes
  `after()`, nejvýš 1× za 24 h na zakázku, zbytek ranní cron `send-reminders`.
- **db** Migrace 125 `prehled_klienta` (aplikována: ne, nikde), grant v `scripts/portal-grants.sql`.
- **chore** Ověřeno: `npx tsc --noEmit`; nový `lib/__tests__/kp16-prehled.test.ts` (12 testů nad
  PGlite, migrace dvakrát po sobě); testy KP12–KP15 a oddělení klientů s migrací 125 (106/106);
  celá sada 1512 prošlo, 4 známá selhání (`ws-schema` mezera po 120, `ws-email` pevné datum, dva
  časové limity pod zátěží, samostatně 22/22); `npm run build` napodruhé (napoprvé známá hláška
  Next). Vzhled na dočasné stránce s vymyšlenými daty včetně krajních případů (dlouhé názvy, 11
  zakázek, 10 faktur, euro, prázdná zakázka) na 390 / 768 / 1280 / 1440 px: bez vodorovného
  posouvání, plochy ≥ 44 px, konzole bez chyb; stránka smazaná. Bezpečnostní kontrola: 1 drobnost
  opravená (AUDIT-LOG). **Naživo s databází a Resendem neověřeno.**
- **decision** **R-128**, DECISIONS #045.

### 2026-11-20 (KP15 — chat s klientem a rozvržení jako Slack)
- **feat** Klientský prostor jako Slack: vlevo firma, Přehled, zakázky jako kanály s nepřečtenými
  (tučně s počtem), Faktury, Konzultace; chat `/klient/zpravy/[id]` s panelem O zakázce; telefon
  jako WhatsApp (spodní lišta, chat přes celou obrazovku). Sekce Požadavky zmizela (D-K17), detail
  zakázky odkazuje do chatu. Soubory: `components/portal/{client-shell,project-aside}.tsx`,
  `app/klient/{page.tsx,zpravy/,faktury/,konzultace/,projekt/[id]/page.tsx}`.
- **feat** Sdílené vlákno: bubliny, dny, „Nové zprávy", fajfky odesláno/přečteno („Přečteno 14:32 ·
  jméno"), citace, hlas (přepis, audio se neukládá), obrázky a PDF, „Ke schválení" (Schvaluji / Chci
  změny jednou), stav zadání u zprávy, Enter odešle, obnovení po 10 s s ETagem a počet v titulku.
  Soubory: `components/chat/{chat-thread,chat-live,thread-list,use-voice}.tsx|ts`, `lib/chat/`.
- **feat** Admin: schránka **Zprávy** (`/dashboard/zpravy`) ve stejném rozvržení, odznak v menu,
  poslední aktivita klienta, „Udělat z toho zadání", zpráva ke schválení; totéž vlákno v detailu
  zakázky. E-mail klientovi z krystof@vizeon.cz a Kryštofovi jen když chat nemají otevřený, 1×/h.
  Soubory: `app/dashboard/zpravy/`, `components/admin/chat/`, `lib/admin/chat.ts`, routy `app/api/zpravy/`
  a `app/api/klient/{zpravy,prilohy}/`, `lib/admin-{nav,counts}.ts`, cron `client-retention` (mazání souborů).
- **db** Migrace 124 `chat_s_klientem` (aplikována: ne, nikde).
- **fix** Bezpečnostní kontrola: přílohy pod limitem těla funkce na Vercelu (4 MB na odeslání),
  fotky zmenšuje prohlížeč. `.claude/security/{AUDIT-LOG,DECISIONS,STATE}.md`, #044.
- **chore** Ověřeno: `npx tsc --noEmit`, nový `lib/__tests__/kp15-chat.test.ts` (15 testů nad PGlite,
  migrace dvakrát po sobě, klient jako `portal_app`), testy KP12–KP14 a izolace s migrací 124,
  `admin-db-rounds` (odznaky dál jedno kolo, čtyři dotazy), `npm run build`. Plná sada: známé chyby
  `ws-schema`, `ws-email` a časové limity testů, které zakládají novou PGlite. Vzhled na dočasné
  stránce s vymyšlenými daty (375 a 1280 px, bez vodorovného posouvání, tlačítka 44 px; fajfka
  přečteno 32 px), stránka smazaná. **Naživo s databází, Supabase Storage a Resendem neověřeno.**
- **decision** **R-127**, DECISIONS #044.

### 2026-11-20 (KP14 — konzultace z volna)
- **feat** Kalendář adminu: **Volno pro klienty** v okně Přidat (den, od–do, délka konzultace, týdenní
  opakování do data), plocha pod událostmi v Týdnu a Dni, řádek v Měsíci, detail se smazáním jen dne
  nebo celé řady a Zpět. Konzultace mají v kalendáři skutečnou délku a stav Meetu. Soubory:
  `components/{SmartCalendar,AdminEventModal}.tsx`, `app/calendar-actions.ts`, `lib/admin/{availability,calendar}.ts`.
- **feat** Klientský prostor › projekt: sekce **Konzultace** — Domluvit konzultaci (den, čas z volna, o čem),
  přehled domluvených s Připojit se (Google Meet), Přesunout a Zrušit do 24 h předem, zrušení jde
  Vrátit. Soubory: `components/portal/consultations.tsx`, `components/consultations/slot-picker.tsx`,
  `app/klient/projekt/[id]/{actions.ts,page.tsx}`, `lib/portal/consultations.ts`, `lib/consultations/rules.ts`.
- **feat** Po rezervaci (prostor i `/p`): Google Meet v kalendáři Kryštofa, potvrzení klientovi
  z krystof@vizeon.cz, zvonek; přesun posune událost v Googlu, zrušení ji smaže; denní pojistka v cronu
  `send-reminders`. Nové typy oznámení `consultation_changed`, `consultation_meet_failed`. Soubory:
  `lib/admin/{consultations,consultation-email}.ts`, `moveGoogleEvent` v `lib/admin/google/calendar.ts`.
- **refactor** Odkaz `/p`: rezervace jen ve volnu přes `consultation_book` (pevné hodiny `getHourSlots`
  už nevolá nic), výběr dne a času jako v prostoru. Soubory: `components/{BookingModal,BookingCTA}.tsx`,
  `app/portal-actions.ts`, `app/p/[token]/page.tsx`.
- **db** Migrace 123 `konzultace_z_volna` (aplikována: ne, nikde).
- **fix** Bezpečnostní kontrola (`web-security-review`): limit i na neúspěšné pokusy o rezervaci
  (30/10 min na člena, 15/10 min na zakázku u `/p`). `.claude/security/{AUDIT-LOG,DECISIONS,STATE}.md`, #043.
- **chore** Ověřeno: `npx tsc --noEmit`, nový `lib/__tests__/kp14-konzultace.test.ts` (23 testů nad PGlite,
  migrace dvakrát po sobě, rezervace jako `portal_app`), testy KP11–KP13 s migrací 123 a `npm run build`.
  Plná sada: 3 chyby — známé `ws-schema` (mezera po 120) a `ws-email` (pevné datum) a časový limit 5 s
  v testu, který zakládá novou PGlite (`admin-ai-asistent-crm` „bez migrace 119"); samostatně prochází.
  Vzhled na dočasné stránce s vymyšlenými daty (375 a 1280 px, bez vodorovného posouvání, plochy ≥ 44 px,
  konzole čistá), stránka smazaná. **Naživo s databází, Googlem a Resendem neověřeno.**
- **decision** **R-126**, DECISIONS #043.

### 2026-11-20 (e-maily z Hovorů — R-132)
- **feat** V Hovorech tlačítko „Poslat e-mail" otevře okno se třemi šablonami: Portfolio,
  Nabídka (cena za zakázku) a Schůzka s Google Meet. Výběr → text se načte a jde přepsat →
  Odeslat. Schůzka vytvoří odkaz na Meet v Google Kalendáři, přepíše příští akci kontaktu,
  posune propojenou událost a pošle e-mail z krystof@vizeon.cz s termínem, tlačítkem Připojit se
  a odkazem na vizeon.cz; všechno nebo nic (selže-li Google nebo e-mail, termín se vrátí a Meet se
  smaže). Soubory: `components/LeadEmailDialog.tsx`, `app/lead-mail-actions.ts`,
  `lib/admin/{lead-mail-templates,lead-meeting}.ts`, `components/LeadsTable.tsx`,
  `app/dashboard/calls/page.tsx`. Bez migrace.
- **refactor** Zanikla rychlá akce „Poslat portfolio (odešle ihned)" a okno „Napsat jinou zprávu"
  (`sendPortfolioEmail`, `sendCustomLeadEmail`, `components/PortfolioEmailModal.tsx`); portfolio je
  jedna ze tří šablon.
- **chore** Ověřeno: `npx tsc --noEmit`, nové testy `lib/__tests__/admin-hovory-{sablony,akce}.test.ts`
  (20, schůzka nad PGlite s migracemi 008, 044, 105, 115), plná sada 1416 prošlo, 4 selhaly:
  `ws-schema` (mezera po 113) a `ws-email` (pevné datum) jsou známé, `admin-hovory-asistent` a
  `admin-ai-asistent-crm` padly na 5s limit při startu druhé PGlite instance (počítač měl load 35;
  s `--testTimeout=90000` 22/22). Okno ověřeno v prohlížeči na dočasné stránce s fiktivním
  kontaktem (800 a 375 px, bez chyb v konzoli, stránka smazána). **Naživo s Googlem a Resendem
  neověřeno.**
- **chore** **Na produkci** (2026-11-20): fast-forward `main` `5c9ccec` → `2c0ddb8`, build Ready
  za ~65 s. Ověřeno veřejně: `/` a `/login` 200, `/dashboard/calls` 307 na přihlášení, za 15 min
  žádná běhová chyba. Nabídka po úpravě Kryštofa nese cenu zadanou u zakázky (ne ceník webu).
  **Za přihlášením okem nikdo nic neviděl.** Formální `web-security-review` se nepouštěl, jen
  vlastní kontrola v DECISIONS #048.
- **fix** Tlačítko „Poslat e-mail" bylo jen ikonou ve sloupci úplně vpravo v tabulce široké
  1100 px a v záložce Čekání na odpověď chybělo — Kryštof ho po nasazení nenašel. Teď je
  popsané tlačítko přímo ve sloupci E-mail v obou záložkách. Soubor: `components/LeadsTable.tsx`.
- **feat** Tlačítko „Poslat e-mail" i v **Kontaktech** (sloupec E-mail v seznamu, záhlaví karty kontaktu)
  a v **AI asistentu** (fronta Od asistenta, karta Kontakt v detailu klienta); Kryštof ho chtěl ke
  kontaktům, hovorům i asistentovi. Adresát může být kontakt z Hovorů, z Kontaktů nebo firma od
  asistenta; schůzka adresáta bez řádku v Hovorech založí a při neúspěchu zahodí. Soubory:
  `components/admin/send-email-button.tsx`, `lib/admin/{lead-mail-target,mail-readiness}.ts`,
  `app/lead-mail-actions.ts`, `app/dashboard/kontakty/{page.tsx,[id]/page.tsx}`,
  `components/admin/{outreach-lead-actions.tsx,ai-asistent/contact-detail.tsx}`. Testy 31 + širší sada 969 prošla.
- **decision** **R-132**, DECISIONS #048. Archiv: dny 2026-11-18 přesunuté do `archiv/2026-11.md`.

*Starší dny (2026-11-18 a dřív): `archiv/2026-11.md`, `archiv/2026-10.md`.*
