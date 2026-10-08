# Paměť projektu — živý stav

> Co se děje, proč je to takhle a co se stalo. Formát a pravidla zápisu: [`pravidla.md`](pravidla.md). Technická fakta: [`../AGENTS.md`](../AGENTS.md).
>
> **Poslední aktualizace:** 2026-10-08

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

**Rozpracováno:** ZakazIQ Workspace (SaaS) + landing page na větvi `workspace` (R-015). Repo je připravené (S00): plán `docs/workspace/PLAN.md`, skilly `.claude/skills/zakaziq-*`, prázdné složky `app/(marketing)/`, `app/w/`, `components/ws/`, `components/ui/`, `lib/ws/` (jen README), env blok v `.env.example`. Produktový kód zatím neexistuje. Prompty sezení: `new - area of zakaziq/prompty/` (rozcestník `00-README.md`).

**Sezení Workspace:**

| # | Sezení | Stav |
|---|---|---|
| S00 | Příprava repa, paměti, skillů | hotovo (2026-10-08) |
| S01 | Design systém Dílky v kódu | čeká |
| S02 | Bezpečnostní základ | čeká |
| S03 | Brief landing page | čeká |
| S04 | Landing page — stavba a animace | čeká |
| S05 | Landing page — SEO a texty | čeká |
| S06 | Databáze a oddělení účtů | čeká |
| S07 | Clerk, registrace, nový byznys | čeká |
| S08 | Stripe předplatné 249 Kč | čeká |
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

**Další krok:** S01 (`new - area of zakaziq/prompty/S01-design-system-dilky.md`). Souběžně jde S06 (DB) — nezávisí na landing page.

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

---

## 3. Otevřené problémy

- [ ] **Legacy routy:** `app/dashboard/projekty/**` zůstalo po přesunu Projektů do Hubu (R-007); `projekty-actions.ts` se liší od verze v `app/hub/projekty/`. Rozhodnout: smazat, nebo přesměrovat na `/hub/projekty` · od 2026-06-23
- [ ] **Mrtvé env:** `FATSECRET_CLIENT_ID/SECRET` jsou v `.env.example`, ale kód je nepoužívá (vyhledávání jídla jede přes Open Food Facts, `lib/fatsecret.ts` a `/api/fatsecret/search` mají historický název) · od 2026-06-22
- [ ] **Připomínky 2 h před konzultací:** po R-006 není jasné, jestli běží externí hodinový cron (commit 2026-06-20 zmiňuje „externí hodinový cron"). Ověřit u uživatele · od 2026-06-25
- [ ] **Evidence migrací:** neexistuje tabulka, která by evidovala, které migrace jsou aplikované na produkční DB — stav se drží jen v changelogu (pravidlo: u každé migrace zapsat „aplikována: ano/ne") · od 2026-10-08
- [ ] **Resend jen kvůli waitlistu:** závislost `resend` slouží jedné funkci (`sendLaunchEmailBlast`). Zvážit převod na `lib/email.ts` (R-004) · od 2026-10-08
- [ ] **Workspace — IČO a právní texty** (podmínky, ochrana údajů, zpracovatelská smlouva). V S04 zástupně `[DOPLNIT]` (R-023), skutečné texty blokují S19 · od 2026-10-08
- [ ] **Workspace — SMS poskytovatel** pro připomínky a „Komu napsat". Blokuje S12/S15 (lze odložit) · od 2026-10-08
- [ ] **Workspace — zálohy online přes Stripe Connect** teď, nebo až po spuštění? Neblokuje · od 2026-10-08
- [ ] **Workspace — admin přihlášení:** nechat NextAuth natrvalo, nebo později převést na Clerk? Neblokuje · od 2026-10-08
- [ ] **Workspace — limit pro DPH a sazby pro odhad daní** ověřit před S14 · od 2026-10-08
- [ ] **Workspace — cena za další byznys na účtu** a kdy ho zapnout (R-026). Neblokuje · od 2026-10-08
- [ ] **Zranitelné závislosti:** po `npm audit fix` zbývá 11 (1 critical `next` 14 — opravy až v 15.5.24+; high: `nodemailer` 7 → oprava v 10, `next-auth` přes `next`, `postcss` přibalený v `next`, řetězec `tailwindcss` 3 → 4). Obě critical RCE (Image Optimizer s AVIF, Windows hosting) se aplikace netýkají — nepoužívá `next/image` a běží na Vercelu. Zbytek jsou hlavně DoS/SSRF v Server Actions a rewrites. Řešení = upgrade Next 15 + nodemailer 10 jako samostatný krok (AGENTS B2 ho dává až po spuštění) — rozhodnout nejpozději v S19, ideálně před spuštěním · od 2026-10-08
- [ ] **`N8N_API_KEY`** není v lokálním `.env.local` — lokálně `/api/public/leads` vše odmítne (fail-closed). Na produkci ověřit ve Vercelu · od 2026-10-08

---

## 4. Changelog

*Nejnovější nahoře. Starší měsíce → `archiv/YYYY-MM.md` (viz pravidla §4).*

### 2026-10-08
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
