# Paměť projektu — živý stav

> Co se děje, proč je to takhle a co se stalo. Formát a pravidla zápisu: [`pravidla.md`](pravidla.md). Stručné instrukce: [`../AGENTS.md`](../AGENTS.md); technická fakta: [`../docs/AGENTS-REFERENCE.md`](../docs/AGENTS-REFERENCE.md).
>
> **Poslední aktualizace:** 2026-11-03 · Právní texty a provozovatel na webu (R-079) · Review před spuštěním a opravy (R-077, migrace 099 připravená, CI s testy, chybové stránky, Clerk `authorizedParties`, session adminu 12 h) · 2026-11-01 · Klientský prostor, hlášení z Claude Code a nová kostra adminu (R-070–R-073, migrace 092–096 aplikované na produkci, `portal_app` vytvořena, commit 41c6873 pushnutý, Preview Ready) · Požadavky klientů z portálu (R-069) · Preview na testovací DB, 084 na testu i produkci; redesign aplikace: R-058 až R-063; RD01–RD14 a RD16 hotovo v kódu, RD15 rozpracováno; produkční migrace 064–091 aplikované; připraven samostatný prázdný testovací Neon projekt · S19 částečný živý audit/Preview; S05 základní SEO (R-055); Next 16.4 + React 19 (R-053)

---

## 1. Aktuální stav

*Snímek — přepisuje se, nedoplňuje. Předchozí podrobný snímek po sezeních: `archiv/2026-10.md`.*

**Admin konzole (produkce):** VIZEON `/dashboard`, ALTENO `/alteno`, portál `/p/[token]`, Hub `/hub`; deploy z `main`, produkce běží na starém buildu `d948400`. Popis: `docs/admin/AGENTS-ADMIN.md`. Na větvi `ws/redesign-app` (nenasazeno) má admin novou kostru (R-071), Dnes, detail zakázky se záložkami a správu klientských prostorů.

**Klientský prostor (R-070–R-073), stav po sezení 2026-11-01:** kód KP01–KP07 a KP09 (úroveň 2) je commitnutý (`41c6873`) a pushnutý na `origin/ws/redesign-app`, na produkci (`main`) nasazený není. Migrace 092–096 jsou **aplikované na produkčním Neonu** (projekt `projectiq`, ověřeno čtecím dotazem), role `portal_app` je tam vytvořená (`scripts/portal-create-role.js`, kontrola skriptu prošla: bez BYPASSRLS, bez přístupu do `public`). Ve Vercelu nastaveno: `DATABASE_URL_PORTAL` (jen Production; Preview míří na testovací DB bez schématu `portal`), `PORTAL_INVITE_PEPPER`, `AGENT_KEY_PEPPER`, `OPENAI_API_KEY`, `OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe`, `CLIENT_REQUEST_AI_MODEL=claude-haiku-5-5` (poslední tři Production i Preview). Preview https://project-iq-git-ws-redesign-app-sobotkakrystof5-pngs-projects.vercel.app vrací 200 na `/`, `/login`, `/w/prihlaseni`, `/klient/prihlaseni`. Ověřeno testy (PGlite oddělení klientů, nav, Dnes, hlášení, aktivita, CSP) a `tsc`/`build:check`; **v prohlížeči nic z toho ověřeno není** (admin lokálně nemá data, přihlášení Clerku na `/klient` nikdo neprošel). Zbývá KP08 (soubory, odloženo), KP10 (audit, GDPR, pilot) a úroveň 3 předání. Plán: `docs/klientsky-prostor/PLAN.md` sekce 6.

**Workspace + landing:** všechna sezení S00–S18 a redesign RD01–RD14, RD16 jsou v kódu na větvi `ws/redesign-app` (RD15 vizuální audit rozpracovaný). Plán rozsahu `docs/workspace/PLAN.md`, redesign `docs/workspace/REDESIGN-APP-PLAN.md`, technika `docs/AGENTS-REFERENCE.md` část B, spuštění `docs/workspace/LAUNCH.md`. Nic z Workspace není na produkci.

**Landing R-068:** vrácena interaktivní mřížka v hero, zploštěny dekorativní rámečky, přichycené scény omezeny na široké obrazovky a animace respektují reduced motion. Typová kontrola a náhledy 390/768/1440 px hotové; testy/build neprovedeny.

**Databáze:** produkční Neon má migrace 064–096 a role `ws_app`, `portal_app`. Testovací Neon `ZakazIQ RD test` (větev `rd-test`) má totéž, `.env.local` míří na něj (bez admin tabulek → admin lokálně i v Preview padá/je prázdný). Práva `ws_app` doplní `node scripts/ws-create-role.js` (`scripts/ws-grants.sql`); na produkci po dnešním doplnění neověřeno. Migrace 099 (R-077) je připravená, neaplikovaná nikde; 097 a 098 na produkci čekají na nové heslo `neondb_owner`.

**Preview `ws/redesign-app`:** https://project-iq-git-ws-redesign-app-sobotkakrystof5-pngs-projects.vercel.app — testovací DB, vlastní `NEXT_PUBLIC_APP_URL`. Testovací účet `rdtest+clerk_test@example.com` (Clerk testovací kód), byznys `testovaci-salon` (kadeřnictví, ukázková data ze seedu, zapnuté Faktury, fiktivní dodavatel), předplatné `trialing` do 2026-11-14 ve Stripe sandboxu. Ověřeno s přihlášením 2026-10-31: Dnes, Kalendář, Poptávky, Zákazníci, Nastavení › Firma, vystavení faktury a PDF s QR (200, 1 strana), export ZIP, výmaz zákazníka; telefonní rozvržení (614 px). Vzhled PDF okem neověřen.

**Externí služby (ověřeno 2026-11-03):** Clerk: produkční instance `zakaziq.cz` má DNS, SSL i poštu hotové (`clerk deploy status` = `oauth_pending`); chybí vlastní Google OAuth klient, webhook, `force_organization_selection=false` v produkci (neověřeno) a produkční klíče ve Vercelu, aplikace dál běží na dev instanci. Resend: doména ověřená, `WS_EMAIL_FROM` a `RESEND_WEBHOOK_SECRET` ve Vercel Production, webhook vypnutý do nasazení; doručení zatím nikdo nezkusil. Stripe jen sandbox, live mód a produkční webhook chybí. DNS u WEDOS: 5 CNAME Clerku a `_dmarc` (`p=none`, bez `rua`) existují, chybí CAA (už jde přidat, certifikáty Clerku jsou vydané) a SPF apexu.

**Další krok:** blokující věci před spuštěním. Kryštof: aktivace Stripe live, kontrola právních textů právníkem (doporučená, R-079), provozovatel do Stripe (Public details, šablona faktury), výměna hesla `neondb_owner` a migrace 097–099 na produkci, Google OAuth klient pro Clerk, pilotní klient a podpora (D4, D6, D7), Vercel Pro, test obnovy Neonu, DNS CAA, SPF a `rua` v DMARC. Agent: admin po Next 16 s daty (V2), klientský prostor v prohlížeči, scénáře Stripe sandboxu, zkušební e-maily do tří klientů, telefon 390 px a RD15. Pořadí v `docs/workspace/LAUNCH-PLAN.md`. Merge a produkční deploy jen se souhlasem Kryštofa.

**Prostředí agentů:** `AGENTS.md` + `docs/AGENTS-REFERENCE.md` (R-047), skilly a bezpečnost synchronizované do `.agents/` (R-046, `docs/CODEX.md`).

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
**Důsledek:** nahrazuje R-023 v části „právní texty se negenerují“. Údaje provozovatele a seznam zpracovatelů jen v `components/marketing/legal.ts` (patička, tři stránky, záznam o zpracování v Účtu); nový zpracovatel nebo změna chování = upravit text a `LEGAL_VERSION` a oznámit e-mailem. Souhlas s podmínkami pod tlačítkem „Pokračovat k platbě“. Stránky jsou indexované a v sitemapě (konec `LEGAL_ROBOTS` z R-055). Neon nesmí držet historii, snímky ani větve s produkčními daty déle než 30 dní, jinak upravit text.

---

## 3. Otevřené problémy

- [ ] **Landing — zbytek auditu R-078:** (1) na telefonu 390 px je v Jak to funguje úsek asi 3 100 px skoro bez obsahu (velké mezery mezi kroky), (2) žádná fotka, (3) ozdoby: tenké a čárkované čáry, stíny v klidu, modrá záře v hero, plovoucí navigace ve tvaru pilulky, (4) 21 velikostí písma a texty pod 13 px, (5) karty Funkce se stejným rámečkem · `components/marketing/` · od 2026-11-03
- [ ] **Vercel Hobby a komerční provoz:** podle podmínek Vercelu je Hobby jen pro nekomerční osobní použití; placený Workspace potřebuje Pro. Pro zároveň dovolí častější crony (připomínky 2 h předem, rychlejší fronta e-mailů, R-006, R-050) a Observability. Rozhodnutí a platba: Kryštof · před spuštěním · od 2026-11-03
- [ ] **Heslo `neondb_owner`:** po vložení do chatu (2026-11-01) výměna nepotvrzená; potvrdit, upravit `DATABASE_URL` ve Vercelu a `.env.local`, zapsat do `.claude/security/AUDIT-LOG.md`. Blokuje i aplikaci 097–099 na produkci · od 2026-11-01
- [ ] **Admin bez dvoufázového ověření:** session je od 2026-11-03 jen 12 h, zámek na IP zůstává; dvoufázové ověření (TOTP s novou závislostí, nebo admin přes Clerk s MFA) potřebuje rozhodnutí · `lib/auth.ts`, DECISIONS #021 · od 2026-11-03
- [ ] **Monitoring chyb:** žádný (Sentry, Vercel Observability); chybové stránky už jsou, ale o chybě se nikdo nedozví. Sentry potřebuje závislost a záznam v CSP-LOG · od 2026-11-03
- [ ] **Admin běží rolí vlastníka DB:** `DATABASE_URL` = `neondb_owner` s BYPASSRLS; samostatná role pro běh adminu bez DDL, vlastník jen na migrace · `lib/db.ts`, `lib/ws/admin/db.ts` · od 2026-11-03
- [ ] **Testy s pevnými daty:** 16 testových souborů míchá pevná data z listopadu 2026 se skutečnými hodinami (`now()`); jak dny projdou, můžou padat jako `ws-email.test.ts` 2026-11-03. Převést na `vi.setSystemTime` nebo data od dneška · `lib/ws/__tests__`, `lib/__tests__` · od 2026-11-03

- [ ] **Požadavky klientů (R-069) — před nasazením:** (1) ~~migrace 092~~ aplikovaná na produkci, (2) ~~`OPENAI_API_KEY`~~ ve Vercelu (Production i Preview), (3) ověřit v prohlížeči mikrofon a nahrávání (Chrome, Safari iOS `audio/mp4`) a že hlavička `Permissions-Policy` na `/p/*` má `microphone=(self)`, (4) ~~ověřit rezidenci a DPA~~ ověřeno 2026-11-01 (`docs/klientsky-prostor/PLAN.md` 8.1: OpenAI i Anthropic zpracovávají v USA na SCC; EU přepis jen s žádostí u OpenAI; zda je DPA OpenAI přijaté automaticky, ověřit v nastavení organizace), zbývá doplnit zpracovatele do právních textů, (5) nahrávku klienta zatím nikdo nevyzkoušel s češtinou · od 2026-11-01
- [ ] **Klientský prostor — před nasazením (R-070–R-073):** (1) ~~migrace 092–096 a role `portal_app`~~ hotovo na produkci, (2) ~~env ve Vercelu~~ nastaveno (`DATABASE_URL_PORTAL` jen Production), (3) **průchod v prohlížeči nikdo neprošel** (jde jen na Neon větvi `projectiq` s migracemi 092–096 a `portal_app`, nebo na produkci se souhlasem; Preview míří na testovací DB bez schématu `portal`): pozvánka → registrace v Clerku → přijetí → přehled → požadavek (text i hlas) → zpráva → hodnocení; kostra adminu, Dnes, záložky detailu, schvalování hlášení a klíč projektu na datech; telefon 390 px, (4) Clerk je jen dev instance, `/klient` s ním ověřit až s produkční, (5) test hlášení ze skriptu `zakaziq-report.mjs` proti běžící aplikaci, (6) souhrnný e-mail o aktivitě se neposlal nikdy naostro · od 2026-11-01
- [ ] **KP08 a KP10:** soubory od klienta jsou odložené (D-K8). KP10: ~~retence 3 roky~~ v kódu (R-076, migrace 098), ~~DPA a rezidence AI~~ ověřeno; zbývá audit `web-security-audit` a pilot s jedním klientem (~~právní texty se zpracovateli a retencí~~ R-079) · od 2026-11-01
- [ ] **Předání do Claude Code úroveň 3** (Routines API) se nedělá, dokud nebude experiment a samostatné rozhodnutí (D-K7) · od 2026-11-01
- [ ] **Admin pod Dílky — zbytek:** obsah stránek adminu je dál v `brand-*` a Inter; přepis po stránkách je volitelný další krok. Starý seznam na `/dashboard` se přesunul na `/dashboard/zakazky`; odkazy z e-mailů a poznámek na `/dashboard` teď vedou na Dnes · od 2026-11-01
- [ ] **Nestabilní test widgetu:** `ws-intake` test „skript je platný JS, malý a data jsou escapovaná“ jednou padl při plném běhu (časový limit), samostatně prochází · `lib/ws/__tests__` · od 2026-11-01
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
- [ ] **Právní texty — schválení a Stripe:** texty jsou na webu (R-079), volby Kryštof potvrdil 2026-11-03, doporučená kontrola právníkem. Provozovatel chybí ve Stripe (Public details, šablona faktury). Volitelně `consent_collection.terms_of_service` v Checkoutu. Kontaktní dotazy v Hovorech nemají automatický výmaz po 3 letech (slib v ochraně údajů, zatím ručně) · od 2026-10-17
- [ ] **Výmaz a odeslané e-maily majiteli:** přehledy dne/týdne v `ws.outbound_messages.payload` můžou nést jméno vymazaného zákazníka (výmaz maže jen zprávy s jeho id nebo klíčem). Zvážit čištění payloadu odeslaných zpráv po 90 dnech · od 2026-10-17
- [ ] **Tmavý režim — nové třídy:** přemapování v `app/ws-tokens.css` pokrývá třídy použité k 2026-10-17; nová světlá třída (např. `bg-navy-200/50`) potřebuje vlastní `dark:` nebo řádek v tokenech. `/r`, `/z` a landing zůstávají světlé (rozhodnout, jestli i ony) · od 2026-10-17
- [ ] **Upgrade Next 16 — admin s přihlášením:** Workspace (Clerk) a PDF ověřeny na Preview 2026-10-31; zbývá admin NextAuth na datech (Preview má testovací DB bez admin tabulek) · od 2026-10-17
- [ ] **`Dockerfile` nesedí s konfigurací:** kopíruje `.next/standalone`, ale `next.config.mjs` nemá `output: 'standalone'`. Produkce běží na Vercelu; rozhodnout, jestli Dockerfile smazat nebo opravit · od 2026-10-17
- [ ] **Legacy routy:** `app/dashboard/projekty/**` zůstalo po přesunu Projektů do Hubu (R-007); `projekty-actions.ts` se liší od verze v `app/hub/projekty/`. Rozhodnout: smazat, nebo přesměrovat na `/hub/projekty` · od 2026-06-23
- [ ] **Mrtvé env:** `FATSECRET_CLIENT_ID/SECRET` jsou v `.env.example`, ale kód je nepoužívá (vyhledávání jídla jede přes Open Food Facts, `lib/fatsecret.ts` a `/api/fatsecret/search` mají historický název) · od 2026-06-22
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
- [ ] **Evidence migrací:** neexistuje tabulka, která by evidovala, které migrace jsou aplikované na produkční DB — stav se drží jen v changelogu (pravidlo: u každé migrace zapsat „aplikována: ano/ne") · od 2026-10-08
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

### 2026-11-03
- **feat** Právní texty a provozovatel (R-079): plné Obchodní podmínky, Ochrana osobních údajů a Zpracovatelská smlouva; provozovatel z ARES v patičce, textech a záznamu o zpracování; souhlas s podmínkami v kroku platby; Dotazy říkají, že databáze běží ve Frankfurtu; odkaz na ochranu údajů u kontaktního formuláře; právní stránky indexované a v sitemapě. Soubory: `components/marketing/{legal,legal-page,content,footer,contact-form,seo}.ts(x)`, `app/(marketing)/{podminky,ochrana-udaju,zpracovatelska-smlouva}/page.tsx`, `app/sitemap.ts`, `app/w/ucet/zpracovani/page.tsx`, `components/ws/onboarding/subscribe-step.tsx`, brief, LAUNCH, LAUNCH-PLAN. Ověřeno: `tsc`, Vitest landing a bezpečnost (82 testů), prohlížeč 375 a 1024 px (žádné `[DOPLNIT]`, bez noindex, sitemap se 4 adresami, konzole bez chyb). Krok platby s přihlášením neověřen.
- **decision** Kryštof potvrdil volby v právních textech (R-079).
- **docs** Kontrola stavu spuštění: `clerk deploy status` = `oauth_pending` (DNS, SSL a pošta hotové, chybí Google OAuth); `dig`: 5 CNAME Clerku a `_dmarc` (`p=none`, bez `rua`) existují, CAA a SPF apexu chybí; `[DOPLNIT]` zůstává v 8 souborech (právní stránky, `components/marketing/{content,seo,legal-page}.ts*`, `/w/ucet/zpracovani`, brief). Aktualizovány Aktuální stav, `docs/workspace/LAUNCH.md` a `LAUNCH-PLAN.md`.
- **feat** Landing: přepsané nadpisy a popisky bez vzhledu AI šablony (R-078). Bez kurzívy, čísel sekcí a štítků nad nadpisy; nový text hero, Proč to řešit, Co to umí, Jak to funguje, Funkce, Napojení, Ceník, Dotazy, Kontakt a patičky; OG obrázek s novým H1 (bez serifového písma). Soubory: `components/marketing/*`, `app/(marketing)/opengraph-image.tsx`, brief, `DESIGN.md`, `.impeccable/design.json`. Ověřeno: `tsc`, Vitest landing (9 testů), měření `design-taste-frontend` na 1440/768/390 px (štítky verzálkami 64 → 5, zbylé jen uvnitř ukázek rozhraní; kurzíva v nadpisech 12 → 0). Celé `npm test` a build neproběhly.
- **fix** Review před spuštěním (`.claude/security/AUDIT-LOG.md`): Clerk `authorizedParties` v produkci (`lib/security/clerk.ts`, `proxy.ts`, DECISIONS #021), session adminu 12 h (`lib/auth.ts`), předání do Claude Code s `--permission-mode plan` (`lib/claude-code-handoff.ts`).
- **feat** Objednávací stránka jen po dokončeném Checkoutu (R-077): migrace 099 (aplikována: ne), test v `ws-intake.test.ts`.
- **feat** Chybové stránky v Dílkách: `components/ws/error-screen.tsx`, `error.tsx` v `app/w`, `app/w/[business]`, `app/r`, `app/z`, `app/klient`, `app/(marketing)`, kořen `app/global-error.tsx`. V prohlížeči neověřeno.
- **chore** CI: `.github/workflows/ci.yml` (`tsc` + `npm test`, Node 24, větve `main`, `workspace`, `ws/**` a PR); `security.yml` na `ws/**` a Node 24. Na GitHubu zatím neběželo (nic nepushnuto).
- **fix** Testy: `ws-email.test.ts` padal od 2026-11-03 (termín „teď + 2 dny“ narazil na pevný 2026-11-05), úklid v `finally`; tři suity s PGlite (`client-retention`, `migrations-activity`, `portal-isolation`) mají limit přípravy 60 s jako ostatní. `node_modules` v repu chyběly, obnoveny `npm ci`.
- **chore** Ověřeno: `tsc` 0 chyb, `npm test` 58 souborů (721 + 1 přeskočený), `npm run build:check` prošel, `npm audit` 0. Ignorování písma Inter v `app/globals.css` pro hook Impeccable (`.impeccable/config.json`, admin podle R-027).

*Starší dny: `archiv/2026-11.md`, `archiv/2026-10.md` (včetně 2026-10-31).*
