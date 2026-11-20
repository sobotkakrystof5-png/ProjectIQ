# KP10 — Audit, GDPR, pilot a spuštění klientského prostoru

> Aktualizováno 2026-11-20 na stav po KP11–KP17: přihlášení klientů běží přes **Supabase Auth**
> (R-107), ne Clerk; požadavky jsou zprávy v **chatu** (KP15, D-K17); přílohy leží v **Supabase
> Storage** (D-K18); pošta klientům jde přes **Resend** z vizeon.cz (R-114, R-116). Větve KP11–KP17
> jdou za sebou a žádná není na produkci.

## Cíl
Klientský prostor, hlášení z Claude Code a nový admin jsou bezpečné, zdokumentované a nasazené u jednoho skutečného klienta. Rozhodnutí o spuštění pro všechny je na Kryštofovi po pilotu.

## Než začneš
Rituál začátku (`zakaziq-memory`). Přečti `docs/klientsky-prostor/PLAN.md` (celý, hlavně 5, 6, 8, 11), `docs/AUTH-SUPABASE-PLAN.md` (F1), `.claude/security/{STATE,DECISIONS,CSP-LOG,AUDIT-LOG}.md` (hlavně #019, #020, #031, #040–#046), `docs/workspace/LAUNCH.md` a `LAUNCH-PLAN.md`, R-066 (bezplatný pilot), R-069, R-107, R-121–R-130 a Otevřené problémy KP11–KP17 v paměti.
Skilly: `web-security-audit`, `web-security-review`, `web-security-memory`, `humanize-text-cs`, `zakaziq-ux-texty-cs`.
**Zadání výslovně povoluje:** opravy nálezů v kódu klientského prostoru, hlášení a adminu. **Deploy, merge do `main`, migrace na produkci a změny externích služeb (Supabase, Vercel env, Resend, DNS) jen s výslovným souhlasem Kryštofa v daném kroku.** Tajné hodnoty (klíče, hesla, kódy) agent nevkládá, zadává je Kryštof (R-115).

## Kroky
1. **Kontrola celku.** `web-security-review` nad všemi veřejnými vstupy: `/api/agent` (hlášení), `/api/auth/supabase-hook`, přihlášení a pozvánky `/klient/*`, server actions prostoru (úkoly, konzultace, schválení, přečteno), `POST /api/klient/zpravy`, `GET /api/klient/prilohy/[id]`, `GET /api/klient/faktury/[id]/pdf`, `/api/klient/transcribe`, `POST /api/public/web-udalost` (KP17), `/p/[token]` a `/h/[token]`, crony `client-retention` a `send-reminders`. Projdi seznam hrozeb z plánu, oddíl 5, bod po bodu a u každého zapiš „ověřeno testem", „ověřeno ručně" nebo „neověřeno".
2. **Oddělení klientů.** Spusť testy PGlite (`portal-isolation`, `kp12`–`kp16`) a ručně na testovací DB se dvěma firmami projdi, že firma A nevidí nic od firmy B — etapy, peníze a faktury včetně PDF, konzultace, zprávy a přílohy, dotazník — ani přes přímé URL a id.
3. **Hlášení z Claude Code.** Pokus o únik: vlož do hlášení falešný klíč, `.env` řádek a connection string; ověř zakrytí a blokaci schválení. Ověř zneplatnění a otočení klíče.
4. **GDPR.** Postup výmazu a exportu musí pokrýt: člena klienta (`portal.members`, účet v Supabase Auth), zprávy, přílohy (soubory v bucketu `chat-prilohy` přes `storage_deletions`), stav vláken, aktivitu, etapy a úkoly, konzultace (a událost v Google Kalendáři), dotazník, kontakt (výmaz kontaktu v adminu dnes chybí — Otevřené problémy). Retence podle D-K10/R-076 je cron `client-retention`; ověř, že o nových tabulkách z migrací 121–126 ví. Zpracovatelé: Neon, Vercel, Supabase (Auth a Storage, eu-central-1), Resend, Google (Kalendář a Meet), Anthropic, OpenAI (přepis hlasu). Ověř DPA a rezidenci; co nejde ověřit, napiš.
5. **Právní a informační texty.** Podle `humanize-text-cs` a `zakaziq-ux-texty-cs`: krátká informace pro klienta v prostoru, co se děje s jeho zprávami, nahrávkami a soubory, kdo je zpracovatel, jak požádat o výmaz. Údaje, které neznáš, `[DOPLNIT]`. Výklad ověří Kryštof (R-079).
6. **Produkční příprava (jen s výslovným souhlasem v tomhle kroku):**
   - migrace na produkci v pořadí 113, 121, 122, 123, 124, 125, 126 (všechny aditivní), potom `node scripts/portal-create-role.js` (granty pro `portal_app`);
   - Supabase: SMTP, HTTPS hook `/api/auth/supabase-hook` s tajemstvím, soukromý bucket `chat-prilohy`, šablona „Reset Password" (Otevřené problémy, R-107 F1);
   - Vercel: `SUPABASE_AUTH_HOOK_SECRET` (před deployem), ověřit `SUPABASE_SERVICE_ROLE_KEY`, `VIZEON_RESEND_API_KEY`, `NEXT_PUBLIC_APP_URL=https://www.zakaziq.cz`;
   - sloučení větví KP11 → KP17 do `main` a push = produkční deploy;
   - po nasazení ověřit, že produkce neběží na starém buildu (veřejné adresy, `/klient/prihlaseni`, cron 401).
7. **Pilot (jen s výslovným souhlasem):** jeden skutečný klient (bezplatný, R-066). Pozvání z detailu zakázky → nastavení hesla → první obrazovka (cíl do 2 minut, plán oddíl 11) → první zpráva v chatu → schválení návrhu → domluvená konzultace → faktura v prostoru → po dokončení dotazník. Kryštof sleduje, kde se klient zasekl; zapiš zjištění.
8. **`web-security-audit`** po nasazení na živé URL; výsledek do `AUDIT-LOG.md`.
9. **Rozhodnutí o spuštění pro všechny** je Kryštofovo. Zapiš kritéria (co musí být hotové) do `LAUNCH-PLAN.md` nebo nového oddílu.

## Hotovo, když
- Seznam hrozeb má u každé položky pravdivý stav ověření.
- Pilotní klient prošel od pozvánky po první zprávu a schválení a Kryštof má jeho zpětnou vazbu.
- `AUDIT-LOG.md` a `STATE.md` odpovídají skutečnosti; GDPR postup pokrývá všechny tabulky z migrací 093–126 a soubory v úložišti.
- Co není ověřené (zejména s přihlášením na skutečné produkci), je v paměti výslovně.

## Konec sezení
`zakaziq-memory` → Konec sezení. Commit, merge a deploy jen s výslovným souhlasem Kryštofa.
