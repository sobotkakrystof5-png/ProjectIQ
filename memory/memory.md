# Paměť projektu — živý stav

> Co se děje, proč je to takhle a co se stalo. Formát a pravidla zápisu: [`pravidla.md`](pravidla.md). Technická fakta: [`../AGENTS.md`](../AGENTS.md).
>
> **Poslední aktualizace:** 2026-10-09 (S08)

---

## 1. Aktuální stav

*Snímek — přepisuje se, nedoplňuje.*

**Fáze:** osobní produkční nástroj, deploy na Vercelu z `main`. Všechny plány v `docs/` jsou implementované.

**Moduly v provozu:**
- **VIZEON** (`/dashboard`) — zakázky, inbox poptávek z vizeon.cz, kalendář, Hovory (leady z n8n, AI agenta i ručně), Dokončené + dotazník spokojenosti, Hodnocení, Náklady, Faktury (archiv napříč byznysy), Šablony webu (knihovna bloků + drag-and-drop per zakázka), notifikace, profil.
- **ALTENO** (`/alteno`) — jádro zakázek + inbox poptávek z alteno.cz (booking API i kontaktní formulář).
- **Klientský portál** `/p/[token]` — progress, NPS feedback, rezervace konzultací.
- **Hub** (`/hub`) — Finance (dvě linie příjmů, faktury, daňová kalkulačka, limity, termíny, legislativní novinky), Byznys/Startup (waitlist, launch emaily), Projekty, Plány (5 kategorií), Škola (LernSax/Beste Schule scraping), Sport (výživa, trénink, váha, Health Score).

**Poslední práce (2026-09-19):** veřejný endpoint `/api/public/alteno-leads` pro kontaktní formulář alteno.cz.

**Rozpracováno:** ZakazIQ Workspace (SaaS) + landing page na větvi `workspace` (R-015). S00: plán `docs/workspace/PLAN.md`, skilly `.claude/skills/zakaziq-*`, env blok v `.env.example`. S01: design systém Dílky v kódu — tokeny `app/ws-tokens.css`, Tailwind `lib/ws/tailwind-dilky.ts`, písma `lib/ws/fonts.ts`, kořen `components/ws/ws-root.tsx`, UI kit `components/ui/`, komponenty `components/ws/brand/`, přehled `/w/_design` (jen dev). S02: bezpečnostní základ — hlavičky v `next.config.mjs`, CSP s nonce v `middleware.ts` + `lib/security/` (admin Report-Only, `/w` `/r` `/z` vynucená), `security.txt`, CI `.github/workflows/security.yml`, stav v `.claude/security/STATE.md`. Layouty `app/w/layout.tsx` a `app/(marketing)/layout.tsx` existují, stránky zatím ne (kromě `/w/_design`). Prompty sezení: `new - area of zakaziq/prompty/` (rozcestník `00-README.md`).

**Sezení Workspace:**

| # | Sezení | Stav |
|---|---|---|
| S00 | Příprava repa, paměti, skillů | hotovo (2026-10-08) |
| S01 | Design systém Dílky v kódu | hotovo (2026-10-08) |
| S02 | Bezpečnostní základ | hotovo (2026-10-08) |
| S03 | Brief landing page | hotovo (2026-10-08) |
| S04 | Landing page — stavba a animace | hotovo (2026-10-08) |
| S05 | Landing page — SEO a texty | čeká |
| S06 | Databáze a oddělení účtů | hotovo (2026-10-08), migrace a role `ws_app` na Neonu (2026-10-09) |
| S07 | Clerk, registrace, nový byznys | hotovo (2026-10-09) |
| S08 | Stripe předplatné 249 Kč | kód hotový (2026-10-09), čeká sandbox Stripe a ruční test |
| S09 | Kostra aplikace a obrazovka Dnes | čeká |
| S10 | Poptávky a kalendář | čeká |
| S11 | Veřejné API, objednávací stránka, widget | čeká |
| S12 | Zákazníci, věrnost, segmenty | čeká |
| S13 | Nastavení: funkce, služby, kolonky, stavy | čeká |
| S14 | Peníze: faktury, příjmy, daně | čeká |
| S15 | E-maily, upozornění, novinky | čeká |
| S16 | Klientský portál | čeká |
| S17 | Admin: klienti a novinky | čeká |
| S18 | Mobil, tmavý režim, GDPR | čeká |
| S19 | Bezpečnostní audit a spuštění | čeká |

**Landing page (S03):** zadání je `docs/landing/PROJECT-BRIEF.md`. Jedna stránka s kotvami v `app/(marketing)/page.tsx`, sekce LP-D + Proč to řešit (R-031), bez formuláře, kontakt e-mailem podpory (R-032), dynamická s vynucenou CSP (R-033), právní stránky `/podminky`, `/ochrana-udaju`, `/zpracovatelska-smlouva` zástupně. Úmyslně zatím chybí: e-mail podpory, IČO, právní texty, sociální důkaz (nemáme reference), odkaz Novinky.

**Databáze Workspace (S06):** schéma `ws` (migrace 064–075, 33 tabulek, R-035), role `ws_app` (`scripts/ws-create-role.js`), `lib/ws/{db,context,result}.ts`, šablony 8 oborů `lib/ws/templates/`, testy oddělení účtů v PGlite (R-036). Postup: `docs/workspace/SETUP.md`. Migrace 064–075 jsou na produkčním Neonu (ověřeno 2026-10-09: 33 tabulek, RLS na všech kromě `stripe_events`, `webhook_events`, `rate_limits`). Role `ws_app` založená skriptem, `DATABASE_URL_WS` je v `.env.local`; **ve Vercelu zatím chybí** (Otevřené problémy).

**Přihlášení Workspace (S07):** Clerk 6.39.7 jen pod `/w` (R-037), přihlášení `/w/prihlaseni`, registrace `/w/registrace`, průvodce `/w/novy` (název + obor → účet, byznys a šablona oboru), `/w` s hlavičkou a prázdným stavem, webhook `/api/clerk/webhook`. Dev instance Clerku (aplikace ZakazIQ, `app_3KSvZAk4iFgvwVicglMwWtga6Gd`) propojená `clerk link`, klíče v `.env.local`. Registrace → průvodce → `/w` ověřená naostro 2026-10-09 (Kryštof, e-mailem): v produkční DB 1 účet, 1 člen, 1 byznys se šablonou oboru. Neověřeno: přihlášení přes Google, Turnstile, Safari. Webhook nemá endpoint ani `CLERK_WEBHOOK_SECRET`.

**Předplatné (S08):** 14 dní zdarma s kartou přes Stripe Checkout (R-038), `stripe` 22.6.2 (R-039). Průvodce `/w/novy` má krok 2 (předplatné), návrat z Checkoutu `/w/predplatne`, `/w/ucet` (stav, Customer Portal, doklady), pruh `components/ws/billing/billing-banner.tsx`, webhook `/api/stripe/webhook`, logika `lib/ws/billing.ts`. Testy proti podstrčenému Stripe prochází. **Chybí:** sandbox ZakazIQ ve Stripe a klíče v `.env.local`, takže Checkout ani ruční test (`docs/workspace/SETUP.md` → Stripe § 6) zatím neproběhly a vzhled kroku 2 a `/w/ucet` není vyfocený. Zapojení stavu předplatného do kostry `/w/[business]` (přesměrování při `none`, pruh, odkaz Účet, `?vitejte=1`) dělá S09 (souběžné sezení). Kryštofův účet v produkční DB předplatné nemá, po přihlášení ho průvodce pošle do kroku 2.

**Další krok:** dokončit S08: Kryštof založí ve Stripe sandbox ZakazIQ a přihlásí do něj CLI (`stripe login`), pak produkt, cena, omezený klíč, `stripe listen` a ruční test podle `docs/workspace/SETUP.md` → Stripe. Potom S05 (SEO landing). S05 (`new - area of zakaziq/prompty/S05-landing-seo-texty.md`): SEO, metadata, OG obrázek, favicon (dnes 404), strukturovaná data a změření Lighthouse/LCP podle briefu § 11 — v S04 se Lighthouse neměřil. Landing je v `components/marketing/`. Před nasazením `/w` na Vercel: `DATABASE_URL_WS` a klíče Clerku do Vercelu.

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

---

## 3. Otevřené problémy

- [ ] **Legacy routy:** `app/dashboard/projekty/**` zůstalo po přesunu Projektů do Hubu (R-007); `projekty-actions.ts` se liší od verze v `app/hub/projekty/`. Rozhodnout: smazat, nebo přesměrovat na `/hub/projekty` · od 2026-06-23
- [ ] **Mrtvé env:** `FATSECRET_CLIENT_ID/SECRET` jsou v `.env.example`, ale kód je nepoužívá (vyhledávání jídla jede přes Open Food Facts, `lib/fatsecret.ts` a `/api/fatsecret/search` mají historický název) · od 2026-06-22
- [ ] **Připomínky 2 h před konzultací:** po R-006 není jasné, jestli běží externí hodinový cron (commit 2026-06-20 zmiňuje „externí hodinový cron"). Ověřit u uživatele · od 2026-06-25
- [ ] **Workspace — env ve Vercelu:** `DATABASE_URL_WS` (z `.env.local`, `docs/workspace/SETUP.md` krok 3), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `NEXT_PUBLIC_APP_URL` (Production i Preview). Lokálně všechno je. Blokuje nasazení `/w` · od 2026-10-08
- [ ] **Clerk — webhook:** v Clerk dashboardu založit endpoint `https://<doména>/api/clerk/webhook` (události `organization.updated`, `organizationMembership.*`) a jeho podpisový klíč dát do `CLERK_WEBHOOK_SECRET` (`.env.local` i Vercel). Do té doby route vrací 503 a členové se nesynchronizují (vlastníka zapíše průvodce) · od 2026-10-09
- [ ] **Clerk — produkční instance** (`clerk deploy`, doména `clerk.zakaziq.cz`, vlastní Google OAuth údaje, produkční klíče). Dev instance nesmí do produkce · před S19 · od 2026-10-09
- [ ] **Clerk — limit 5 členů na organizaci** (výchozí v Clerku). R-020 slibuje neomezeně pracovníků — pracovníci ve `ws.staff` se přihlašovat nemusí, ale přihlašovací účty pro tým (S13?) limit narazí. Ověřit, jestli jde zvednout na našem plánu Clerku · od 2026-10-09
- [ ] **Clerk — e-maily s kódem** chodí z Clerku (šablona a jazyk podle nastavení instance). Ověřit při první registraci, že jsou česky a jménem ZakazIQ; jinak nastavit v dashboardu Clerku (Customization → Emails) · od 2026-10-09
- [ ] **Clerk — `user.updated`** (změna jména/e-mailu) se do `ws.members` nepropisuje — webhook ho nezpracovává, payload nemá organizace. Řešit, až se jména členů budou někde zobrazovat (S13) · od 2026-10-09
- [ ] **Stripe — sandbox ZakazIQ chybí:** CLI je přihlášené do sandboxů jiných projektů. Kryštof založí sandbox ZakazIQ a `stripe login`, pak produkt, cena, omezený klíč a nastavení dashboardu podle `docs/workspace/SETUP.md` → Stripe (hlavně připomínka 7 dní před koncem zkušební doby, kterou slibuje landing). Blokuje ruční test S08 · od 2026-10-09
- [ ] **Stripe — live mód** (produkt, cena, Portal, e-maily, šablona faktury s IČO a „Nejsem plátce DPH“, webhook endpoint, live klíče jen do Vercelu Production) · před S19 · od 2026-10-09
- [ ] **`ws.accounts.trial_ends_at`** se po R-038 nepoužívá. Nechat, nebo odstranit migrací (data se tím nemažou)? Neblokuje · od 2026-10-09
- [ ] **Evidence migrací:** neexistuje tabulka, která by evidovala, které migrace jsou aplikované na produkční DB — stav se drží jen v changelogu (pravidlo: u každé migrace zapsat „aplikována: ano/ne") · od 2026-10-08
- [ ] **Resend jen kvůli waitlistu:** závislost `resend` slouží jedné funkci (`sendLaunchEmailBlast`). Zvážit převod na `lib/email.ts` (R-004) · od 2026-10-08
- [ ] **Workspace — IČO a právní texty** (podmínky, ochrana údajů, zpracovatelská smlouva). V S04 zástupně `[DOPLNIT]` (R-023), skutečné texty blokují S19 · od 2026-10-08
- [ ] **Workspace — SMS poskytovatel** pro připomínky a „Komu napsat". Blokuje S12/S15 (lze odložit) · od 2026-10-08
- [ ] **Workspace — zálohy online přes Stripe Connect** teď, nebo až po spuštění? Neblokuje · od 2026-10-08
- [ ] **Workspace — admin přihlášení:** nechat NextAuth natrvalo, nebo později převést na Clerk? Neblokuje · od 2026-10-08
- [ ] **Workspace — limit pro DPH a sazby pro odhad daní** ověřit před S14 · od 2026-10-08
- [ ] **Workspace — cena za další byznys na účtu** a kdy ho zapnout (R-026). Neblokuje · od 2026-10-08
- [ ] **Zranitelné závislosti:** po `npm audit fix` zbývá 11 (1 critical `next` 14 — opravy až v 15.5.24+; high: `nodemailer` 7 → oprava v 10, `next-auth` přes `next`, `postcss` přibalený v `next`, řetězec `tailwindcss` 3 → 4). Obě critical RCE (Image Optimizer s AVIF, Windows hosting) se aplikace netýkají — nepoužívá `next/image` a běží na Vercelu. Zbytek jsou hlavně DoS/SSRF v Server Actions a rewrites. Řešení = upgrade Next 15 + nodemailer 10 jako samostatný krok (AGENTS B2 ho dává až po spuštění) — rozhodnout nejpozději v S19, ideálně před spuštěním · od 2026-10-08
- [ ] **Workspace — toasty přes adminův `<Toaster>`** (R-027): pozice a délka jsou společné s adminem (vpravo nahoře). Až bude potřeba vlastní toaster (např. spodní lišta na mobilu v S09/S18), řešit upgradem sonneru na 2.x (víc toasterů) nebo úpravou `app/layout.tsx` — obojí sahá na admin, chce souhlas · od 2026-10-08
- [ ] **Workspace — Inter se stahuje i na stránkách Dílků:** `@import` Google Fonts v `app/globals.css` (admin) se načte všude; Instrument Sans ho přebije, jen zbytečný request CSS. Od S02 ho na `/w` a od S04 i na landing page blokuje vynucená CSP — žádný request, ale chyba v konzoli i na veřejné stránce (Lighthouse Best Practices). Řešit, až se bude sahat na admin · od 2026-10-08
- [ ] **Bezpečnost — otevřené položky** (vynucení admin CSP, Clerk do CSP, DNS `zakaziq.cz`, živý audit, `Expires` v security.txt): vedené v `.claude/security/STATE.md` → Otevřené položky · od 2026-10-08
- [ ] **Landing — e-mail podpory:** firemní adresa pro „Napište nám“ (R-032) chybí, na landing `[DOPLNIT]`. Blokuje spuštění (S19) · od 2026-10-08
- [ ] **Landing — kde jsou data uložená:** odpověď v Dotazech má `[DOPLNIT]` (region Neonu, ověřit) · od 2026-10-08
- [ ] **`N8N_API_KEY`** není v lokálním `.env.local` — lokálně `/api/public/leads` vše odmítne (fail-closed). Na produkci ověřit ve Vercelu · od 2026-10-08

---

## 4. Changelog

*Nejnovější nahoře. Starší měsíce → `archiv/YYYY-MM.md` (viz pravidla §4).*

### 2026-10-09
- **feat** S08 — Stripe předplatné 249 Kč (R-038, R-039). `stripe` 22.6.2. `lib/ws/stripe.ts` (klient, `server-only`), `lib/ws/billing.ts` (stav přístupu `none|trialing|active|grace|read_only`, `hasActiveSubscription`, `assertWritable`, Checkout se 14 dny zdarma jen poprvé, Portal, doklady, `syncSubscription` ze Stripe, `syncCheckoutSession`), `lib/ws/stripe-webhook.ts` + `app/api/stripe/webhook/route.ts` (podpis, idempotence `ws.stripe_events`). Průvodce: krok 2 `components/ws/onboarding/subscribe-step.tsx`, sdílená hlavička `wizard-header.tsx`, `app/w/novy/page.tsx` (účet bez předplatného → krok 2). `/w/predplatne` (návrat z Checkoutu), `/w/ucet` + `actions.ts`, `components/ws/billing/` (pruh, tlačítko, datum). Landing a brief: „bez karty“ pryč, nová odpověď „Co se stane po 14 dnech?“. `docs/workspace/SETUP.md` → Stripe, `.env.example`, `AGENTS.md` B5 + env, bezpečnost STATE + AUDIT-LOG. Review našlo a opravilo dvojí předplatné při `past_due`. Testy `lib/ws/__tests__/ws-billing.test.ts` (20). Ověřeno: `npm test` 247/247, `tsc` OK, `next build` OK (v kopii repa, protože běží `next dev`), Stripe není v klientském bundlu, `npm audit --omit=dev` beze změny (11). **Neověřeno:** skutečný Checkout, Portal, webhook a vzhled kroku 2 a `/w/ucet` (chybí sandbox a klíče Stripe), admin stránky v prohlížeči (admin kód se neměnil).
- **decision** R-038: 14 dní zdarma s kartou, nahrazuje R-019 (rozhodl Kryštof).
- **chore** S07 ověřeno naostro: Kryštof prošel registraci, průvodce a `/w`; v produkční DB vznikl 1 účet, 1 člen (vlastník), 1 byznys (kadeřnictví a kosmetika) se 4 službami a 5 stavy ze šablony.
- **feat** S07 — Clerk, registrace a nový byznys. `@clerk/nextjs` 6.39.7 + `@clerk/localizations` (R-037). `middleware.ts`: Clerk jen pro `/w` a `/api/ws`, ochrana `/w` kromě přihlášení/registrace, CSP s nonce zachovaná. `app/w/layout.tsx`: `ClerkProvider` (česky, nonce, bez telemetrie, `noindex`). Stránky `/w/prihlaseni`, `/w/registrace` (catch-all, vzhled Dílků `components/ws/auth/`), průvodce `/w/novy` (rozložení C5: název, obor z 8 šablon, živý náhled stavů/kolonek/služeb; `app/w/novy/actions.ts`, `components/ws/onboarding/`), `/w` (hlavička s přepínačem byznysů bez „+ Přidat byznys“ podle R-026, odhlášení, prázdný stav). `lib/ws/onboarding.ts` (účet + vlastník + byznys + šablona v jedné transakci pod RLS, slug s koncovkou při kolizi), `lib/ws/clerk-orgs.ts`, `lib/ws/clerk-webhook.ts` + `app/api/clerk/webhook/route.ts` (Svix, idempotence), `lib/ws/paths.ts`, `requireWorkspace()` na Clerk `auth()`. Smazán `components/ws/coming-soon.tsx`. CSP v3 (Clerk host z publishable key, `img.clerk.com`, Turnstile) + test. Instance Clerku přes CLI: `clerk link`, `clerk env pull` (klíče do `.env.local`, ostatní řádky beze změny), přihlášení jen e-mailový kód + Google (heslo, telefon, uživatelské jméno vypnuté), organizace zapnuté, aplikace přejmenovaná na ZakazIQ. Testy `lib/ws/__tests__/ws-onboarding.test.ts` (13): dva nové účty se nevidí ani bez aplikačního filtru, opakované založení nic nezdvojí, webhook (členové, idempotence, organizace bez účtu, mazání organizace nic nemaže), podpis route (bez klíče 503, podvržený/cizí/starý 400). Bezpečnost: CSP-LOG v3, STATE, DECISIONS #009, AUDIT-LOG review. Ověřeno: `npm test` 198/198, `npm run build` OK bez varování, admin `/login` 200, `/dashboard` `/alteno` `/hub` 307 na přihlášení NextAuth, `/p` a `/h` s neplatným tokenem 404, admin chunky bez Clerku; `/w/prihlaseni` a `/w/registrace` v Chromu a headless (390 i 1280 px) bez přetékání a bez hlášení CSP od Clerku; průvodce vyfocen přes dočasnou stránku (smazána) včetně chybové hlášky a klávesnice. `npm audit --omit=dev` beze změny (11). **Neověřeno:** skutečná registrace a průchod průvodcem do `/w`, Google přihlášení, Turnstile, Safari.
- **db** Role `ws_app` založená na produkčním Neonu přes `node scripts/ws-create-role.js` (spustil Kryštof), `DATABASE_URL_WS` zapsaná do `.env.local`. Ověřeno: bez BYPASSRLS a superuser, bez členství v jiné roli, k žádné tabulce v `public` nemá přístup. Ve Vercelu zatím není.
- **db** Migrace 064–075 (schéma `ws`) aplikované na produkčním Neonu (aplikována: ano). Ověřeno dotazem: 33 tabulek ve `ws`, RLS zapnutá na všech kromě systémových `stripe_events`, `webhook_events`, `rate_limits`. Role `ws_app` v DB zatím není a `DATABASE_URL_WS` chybí v `.env.local`, takže krok 2 ze `docs/workspace/SETUP.md` zůstává otevřený.

### 2026-10-08
- **db** S06 — schéma `ws` a oddělení účtů. Migrace 064–075 (aplikována: ne): účty, členové, byznysy, funkce, služby, pracovníci, otevírací doba, kolonky, stavy, zákazníci, poptávky, zakázky, termíny (`EXCLUDE` per pracovník), věrnost (1 návštěva = 1 razítko), skupiny, faktury, příjmy, daně, napojení webu, předplatné, Stripe/Clerk události, e-maily, upozornění, audit, idempotence, rate limit. Role `ws_app`: `scripts/ws-create-role.js` (heslo rovnou do `.env.local`, kontrola bez BYPASSRLS a bez přístupu k `public`) + `scripts/ws-grants.sql`. `lib/ws/db.ts` (`wsDb`, `wsSystem`, `q`), `lib/ws/context.ts` (`requireWorkspace`, `requireBusiness`, `requireRole`, Clerk za rozhraním), `lib/ws/result.ts`, šablony 8 oborů `lib/ws/templates/` (ceny `null`, věrnost vypnutá). Testy `lib/ws/__tests__/ws-{schema,db-context,templates}.test.ts` v PGlite: idempotence (otisk schématu po 2. průchodu stejný, i po jednom příkazu přes splitter `apply-migration.js`), účet A nevidí, nezmění ani nesmaže nic z B ve všech 30 tabulkách, složené FK, překryv, razítka, duplicitní události, mutační kontrola (oslabená politika test shodí). `docs/workspace/SETUP.md`, `AGENTS.md` B3 + env + příkazy, `.env.example`, R-035, R-036, bezpečnost `DECISIONS.md` #008 + `STATE.md`. Ověřeno: `npm test` 182/182, `npm run build` OK, admin `/login` 200, `/dashboard` `/alteno` `/hub` 307 na přihlášení, `/p/[neplatný]` 404. Migrace < 064 beze změny.
- **fix** S04 dokončeno — kontrola v headless Chromu (produkční build i dev, 390/768/1280/1440 px): nic nepřetéká, jeden H1, nájezdy, menu, klávesnice (neviditelná přichycená hlavička mimo tabulátor), akordeon, prefers-reduced-motion; jediné porušení CSP = adminův `@import` Inter (známé), 404 jen `favicon.ico` (S05). Opraveno po screenshotech: štítek „ukázka“ přes nadpis v hero, překrývající se kousky v Proč to řešit (+ natočení i na mobilu), dílky přes nadpis v Jak to funguje (dole vpravo, na mobilu skryté), cena 249 + menší „Kč / měsíc“, ilustrace karty Poptávky na střed. Admin: `/login` 200, `/dashboard` `/alteno` `/hub` → přihlášení, `/p` a `/h` s neplatným tokenem 404. Lighthouse neměřen (→ S05). Pozn.: souběžné `next dev` sdílí `.next` s produkčním buildem — kontrolovat přes dev server.
- **feat** S04 (rozpracováno) — landing page: `app/(marketing)/page.tsx` + `layout.tsx` (`force-dynamic`, `landing.css`), sekce v `components/marketing/` (hero s živou ukázkou, pás oborů, Proč to řešit, Co to umí, Jak to funguje, Funkce, Napojení, Ceník, Dotazy, footer), právní stránky `/podminky`, `/ochrana-udaju`, `/zpracovatelska-smlouva` (`[DOPLNIT]`), zástupné `/w/registrace` a `/w/prihlaseni` (`components/ws/coming-soon.tsx`). Smazán `app/page.tsx` (R-034). CSP: landing cesty vynucené jako přesné cesty (`lib/security/csp.ts` + test, CSP-LOG v2). `AccentHeading` dostal prop `id`. `npm run build` OK bez varování, `npm test` 126/126, `/` vrací 200 s vynucenou CSP. **Neověřeno:** vzhled v prohlížeči, konzole, mobil, Lighthouse, admin stránky.
- **docs** S03 — brief landing page `docs/landing/PROJECT-BRIEF.md` (skill `web-project-brief`, texty podle `zakaziq-ux-texty-cs` a `humanize-text-cs`). Sekce 0 konkrétně (dílky 2×2 z loga jako skládání byznysu, pole dílků, živá ukázka, věrnostní karta, rozházené kousky → mřížka v Proč to řešit), sekce po sekcích s texty, odchylky od LP-D (widget `/embed/` místo `/w/lenka.js`, „Funkce“ místo „Moduly“, konečná cena místo `[DPH: DOPLNIT]`, bez Novinek), zadání SEO pro S05. Šablona `CLAUDE.md` ze skillu se nevytvářela, stav je tady. Prompt `S04-landing-stavba.md` sladěn (bez formuláře, `WhyBother`, dynamický layout). Ověřen tvar `/api/public/leads` (tajný `N8N_API_KEY`, natvrdo „z chatbota“). Rozhodnutí R-031–R-033, bezpečnost `.claude/security/DECISIONS.md` #007 + `STATE.md`. Žádný kód.
- **feat** S02 — bezpečnostní základ podle `web-security-setup`. `middleware.ts` přepsán: NextAuth pro `/dashboard`, `/alteno`, `/hub` beze změny chování (bez session 307 na přihlášení, se session 200), CSP s nonce per request pro všechny stránky, místo pro Clerk (S07). Nové `lib/security/csp.ts` (profily admin/workspace, Report-Only vs vynucená), `lib/security/embed.ts` (`frameAncestorsFor`, `corsHeaders`, `preflightResponse` pro S11) + testy. `next.config.mjs`: plná sada hlaviček, `poweredByHeader: false`, výjimky z X-Frame-Options/CORP pro `/r`, `/embed`, `/api/public/v1`, `SAMEORIGIN` pro PDF faktury (náhled v `<object>` s DENY v Chromu nejspíš nefungoval). `app/w/layout.tsx` `force-dynamic` (nonce). `.gitignore` na všechny `.env*` kromě vzorů, `public/.well-known/security.txt`, `.github/workflows/security.yml` (audit — dočasně jen upozornění, gitleaks, hlavičky), `.claude/security/` (STATE, DECISIONS, CSP-LOG, AUDIT-LOG, `security-check.sh`). `AGENTS.md` → B13 plná pravidla, `CLAUDE.md` → Bezpečnost. R-029, R-030. Ověřeno: `npm run build` OK, `npm test` 125/125, průchod 30 admin stránek v headless Chromu na produkčním buildu (CSP hlášení jen statický `/login` a sonda Zodu na portálu, TradingView i PDF faktury fungují), `/w/_design` pod vynucenou CSP včetně hydratace, gitleaks přes historii čistý. Safari a živý web neověřeny.
- **feat** S01 — design systém Dílky v kódu. Tokeny `app/ws-tokens.css` (+ tmavý režim, doplněné `--secondary`/`--accent`/`--ring` pro tmavý), Tailwind rozšíření `lib/ws/tailwind-dilky.ts` → `tailwind.config.ts` (+ `popover` barva, `darkMode` i pro `[data-theme="dark"]`, vlastní keyframes překryvů `zq-fade|pop|slide-*`), písma `lib/ws/fonts.ts`, `WsRoot` (`components/ws/ws-root.tsx`), layouty `app/w/layout.tsx` a `app/(marketing)/layout.tsx`. UI kit `components/ui/` (18 komponent + `portal.tsx`, toasty s „Zpět"), komponenty `components/ws/brand/` (12), `lib/ws/{motion,money,time,utils}.ts`, stránka `/w/_design` (v produkci 404). Testy `lib/ws/__tests__/dilky-format.test.ts` (částky, pražský čas, pole dílků). Nové závislosti R-028, oddělení od adminu R-027. `npm run build` OK, `npm test` 108/108, admin pixelově beze změny (porovnání screenshotů a zkompilovaného CSS), `/p/[neplatný]` 404, `npm audit --omit=dev` beze změny (11).
- **chore** Dotažení S00. (1) Skilly `web-security-memory`, `web-security-audit`, `web-security-review` nainstalovány globálně do `~/.claude/skills/` z `~/Documents/claude skills/SAFETY /claude-web-security/` (mimo repo). (2) `npm audit fix` bez `--force`: `next-auth` 4.24.14 → 4.24.15 a tranzitivní závislosti (jen `package-lock.json`), zranitelnosti v produkci 16 → 11; build OK, testy 100/100, produkční server: `/login` 200, `/dashboard`, `/alteno`, `/hub` přesměrují na přihlášení, `/p/[neplatný]` 404. (3) Plán v Claude Docs upraven podle R-016–R-026 (bez sekce „Kdo za tím stojí", 14 dní bez karty, konečná cena bez DPH, 1 byznys v ceně, odškrtnuté otázky DPH/doména, odkazy `memory/`, `CLAUDE.md`/`AGENTS.md`) a znovu exportován do `docs/workspace/PLAN.md`. (4) Smazán prázdný `new - area of zakaziq/docs/workspace/PLAN.md`. R-020 nahrazeno R-026.
- **chore** S00 — příprava repa pro Workspace (bez produktového kódu, admin konzole beze změny). Větev `workspace` z `main`. Ze sady `~/Documents/zakaziq-claude-kit/` převzaty `docs/workspace/PLAN.md` a skilly `.claude/skills/zakaziq-{design-dilky,workspace-backend,ux-texty-cs,memory}`; `zakaziq-memory` přepsán na `memory/` podle `pravidla.md` (stará `.claude/memory/` se nezavádí). Prázdné složky s README: `app/(marketing)/`, `app/w/`, `components/ws/`, `components/ui/`, `lib/ws/`. `.env.example`: blok `# --- ZakazIQ Workspace ---` (`DATABASE_URL_WS`, Clerk ×3, Stripe ×4, `WS_KEY_PEPPER`; `NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY`, `CRON_SECRET` už existovaly — neduplikováno). Rozhodnutí R-016–R-025 (cesty, doména, DPH, trial, limity, Dílky, SEO skilly, landing bez „Kdo za tím stojí", napojení webů, segmenty) → `AGENTS.md` Hranice, B2, B4, B5; prompty S03, S05 a `00-README.md` upraveny.
- **chore** S00 výchozí stav: `npm ci` OK (235 balíčků, 1 deprecated varování `uuid@8`, audit 18 zranitelností / `--omit=dev` 16, z toho 2 critical). `npm run build` OK bez varování. `npm test` OK — 10 souborů, 100 testů. Uživatelské skilly: chybí `web-security-memory`, `web-security-audit`, `web-security-review`.
- **docs** Nová složka `new - area of zakaziq/prompty/` — prompty sezení S00–S19 + `00-README.md` převzaté z `~/Documents/zakaziq-claude-kit/prompts/`. Odkazy na paměť sady (`.claude/memory/` STATE/SESSION-LOG/DECISIONS/OPEN-QUESTIONS) přepsány na `memory/memory.md` (R-014), `projectiq` → `ZakazIQ`, S00 upraven na současný stav repa (Claude.md už je AGENTS.md), S02 míří na `AGENTS.md` → B13, S17 na `AGENTS.md` → Část A. Otevřené otázky sady přeneseny do Otevřených problémů.
- **docs** `AGENTS.md` rozšířen o Workspace: hranice v repu, rozdělení na Část A (admin, existující popis) a Část B (Workspace B1–B13: produkt, stack, data/`account_id`, Clerk, Stripe, příjem poptávek, e-maily přes Resend, Dílky, jednoduchost, texty, konvence, testy, bezpečnostní minimum), společné Git (R-015), Nikdy, Paměť. Opraveno: admin nemá shadcn/ui ani `components/ui/` (strom i tech stack tvrdily opak). `CLAUDE.md` sladěn (git, odkazy do AGENTS.md), role souborů v `memory/index.md` a `memory/pravidla.md`.
- **decision** `CLAUDE.md` rozšířen o ZakazIQ Workspace (R-014): tabulka tří částí repa, tvrdá pravidla Workspace (nesahat do admin konzole, `account_id`, Dílky, jednoduchost), kroky 3–4 na začátku sezení, kontrola admin stránek před commitem, tabulka skillů. Sloučeno s paměťovým systémem R-013 místo navržené `.claude/memory/`.
- **docs** Zaveden paměťový systém (R-013): `Claude.md` → `AGENTS.md` (technická fakta, doplněno: příkazy, katalog všech tabulek, kompletní mapa rout, API routy s auth, crony, server actions, další kódová pravidla), nový `CLAUDE.md` (chování + protokol sezení, importuje AGENTS.md a memory/), `memory/index.md`, `memory/pravidla.md`, `memory/memory.md`. Odkazy v komentářích `app/portal-actions.ts` a `app/api/cron/send-reminders/route.ts` přesměrovány na AGENTS.md.
- **chore** `.env.example`: doplněn chybějící `RESEND_API_KEY`.

### 2026-09 (rekonstruováno z git historie)
- **09-19 feat** Veřejný endpoint `/api/public/alteno-leads` pro kontaktní formulář alteno.cz.
- **09-18 feat** Evidence faktur ve VIZEONu (`/dashboard/faktury`, detail faktury) — R-012.
- **09-18 feat** Fakturu jde přetáhnout rovnou na zakázku, AI přepis se spustí sám (`lib/use-pdf-drop.ts`).
- **09-11 feat** Poznámky u zakázky přepracovány na rychlý log schůzek/hovorů (migrace 063).
- **09-11 feat** Poznámky v Hovorech a Zakázkách, sjednocení nákladů do `app/costs-actions.ts`, šablony webu s drag-and-drop (migrace 058–062, `docs/POZNAMKY_NAKLADY_SABLONY_PLAN.md`).
- **09-11 feat** Finanční systém — faktury, AI přepis, dvě linie příjmů, daňová kalkulačka, limity, termíny, legislativní novinky (migrace 053–057, `docs/FINANCE_SYSTEM_PLAN.md`) — R-011.
- **09-10 feat** Přijímací endpoint `/api/public/agent-leads` pro vizeon-lead-agent (migrace 052).
- **09-03 feat** Propojení kalendáře s Hovory (migrace 051) — R-010; email fixy pro info@vizeon.cz.

### 2026-08
- **08-18 feat** Samostatná schránka info@vizeon.cz — R-009.
- **08-14 feat** Sekce ALTENO — klon jádra VIZEON nad oddělenými daty (migrace 050); karta Zakázky přejmenována na VIZEON — R-008.
- **08-07 feat** Automatické odeslání portfolia klientovi z Hovorů (migrace 049) + 3 opravy (pád na `Date`, podpis, skutečné DB id).

### 2026-07
- **07-27 fix** Chybné sčítání cen v souhrnu dashboardu.
- **07-19 feat** Veřejné leads API pro n8n chatbota.
- **07-16 fix** Duplicitní emailové připomínky z cronu; sdílený `getPragueTodayISO`.
- **07-15 merge** Sloučení práce z `downloads-snapshot`.
- **07-08 feat** Modul Plány (5 kategorií, migrace 036–042), byznys kalkulačka, přepracovaná Finance.

### 2026-06
- **06-25** Hodinový cron připomínek zaveden a vrácen (Hobby limit) — R-006.
- **06-24 feat** Mobilní responzivita (navigace, booking modal, kalendář, portál); SaaS pricing tiery; EstatIQ waitlist.
- **06-23 feat** Startup projekty, sekce Projekty (→ Hub, R-007), AI asistenti, fixní náklady, cash-flow oblasti, zálohy.
- **06-22 feat** Hub: rozcestník, Škola (LernSax/Beste Schule, termíny, známky), Sport (výživa → Open Food Facts, gym, váha, Health Score), Finance; Hovory — call_answered, waiting stav.
- **06-21 feat** Notifikace, leady v kalendáři, in-app a emailové připomínky lead akcí.
- **06-20 feat** Hovory, Dokončené, náklady, kalkulačka výdělků, dotazník spokojenosti + Hodnocení, Vizeon Rezervace (inbox), připomínky konzultací, profil.
- **06-16/17 feat** Veřejné booking API pro vizeon.cz s ochranou proti double-bookingu; URL projektu + email klientovi při změně; rate limiting, brute-force lockout, testy.
- **06-15 feat** Smart Calendar, NPS feedback, rezervace konzultací (migrace 001–004); emaily Resend → Gmail (R-004); rebrand na ZakazIQ (R-003).
- **06-14 feat** Initial MVP (ProjectIQ) — zakázky, portál, QR; Neon (R-002).
