# KP10 — Audit, GDPR, pilot a spuštění klientského prostoru

## Cíl
Klientský prostor a hlášení z Claude Code jsou bezpečné, zdokumentované a nasazené u jednoho skutečného klienta. Rozhodnutí o spuštění pro všechny je na Kryštofovi po pilotu.

## Než začneš
Rituál začátku (`zakaziq-memory`). Přečti `docs/klientsky-prostor/PLAN.md` (celý, hlavně 5, 8, 11), `.claude/security/{STATE,DECISIONS,CSP-LOG,AUDIT-LOG}.md`, `docs/workspace/LAUNCH.md` a `LAUNCH-PLAN.md`, R-066 (bezplatný pilot), R-069 a výsledky všech předchozích KP sezení v paměti.
Skilly: `web-security-audit`, `web-security-review`, `web-security-memory`, `humanize-text-cs`, `zakaziq-ux-texty-cs`.
**Zadání výslovně povoluje:** oprava nálezů v kódu klientského prostoru, hlášení a nového adminu. Deploy a změny externích služeb (Clerk produkce, Vercel env, DNS) jen s výslovným souhlasem Kryštofa v daném kroku.

## Kroky
1. **Kontrola celku.** `web-security-review` nad všemi veřejnými vstupy (`/api/agent`, `/api/public/portal`, `/klient`, server actions klientského prostoru, pozvánky, cron hodnocení). Ověř seznam hrozeb z plánu sekce 5 bod po bodu a u každého zapiš „ověřeno testem“, „ověřeno ručně“ nebo „neověřeno“.
2. **Oddělení klientů.** Znovu spusť test PGlite, doplň případy z posledních sezení (zprávy, požadavky, soubory, aktivita) a ručně na testovací DB se dvěma firmami projdi, že firma A nevidí nic od firmy B (včetně přímých URL a ID).
3. **Hlášení z Claude Code.** Pokus o únik: vlož do hlášení falešný klíč, `.env` řádek a connection string; ověř zakrytí a blokaci schválení. Ověř zneplatnění a otočení klíče.
4. **GDPR.** Doplň do postupu výmazu a exportu: člen klienta, zprávy, požadavky, aktivita, přílohy. Retence podle D-K10 jako cron nebo ruční postup. Zpracovatelé: Neon, Vercel, Clerk, Anthropic, OpenAI (přepis hlasu), e-mailová služba. Ověř DPA a evropskou rezidenci OpenAI pro přepis řeči; co nejde ověřit, napiš.
5. **Právní a informační texty.** Podle `humanize-text-cs` a `zakaziq-ux-texty-cs`: krátká informace pro klienta, co se s jeho zprávami a nahrávkami děje, kdo je zpracovatel, jak požádat o výmaz. Údaje, které neznáš, `[DOPLNIT]`. Právní výklad ověří Kryštof s právníkem.
6. **Produkční příprava (jen s výslovným souhlasem):** produkční instance Clerku (sdílí se s Workspace), env ve Vercelu (`OPENAI_API_KEY`, pepř klíčů, Clerk), aplikace migrací a vytvoření role `portal_app`, ověření, že produkce neběží na starém buildu bez těchto změn.
7. **Pilot.** Jeden skutečný klient (bezplatný, R-066): pozvánka, první přihlášení, první schválené hlášení, první požadavek. Kryštof sleduje, kde se klient zasekl; do 2 minut od pozvánky k první obrazovce je cíl (plán sekce 11). Zapiš zjištění.
8. **`web-security-audit`** po nasazení na živé URL; výsledek do `AUDIT-LOG.md`.
9. **Rozhodnutí o spuštění pro všechny** je Kryštofovo. Zapiš kritéria (co musí být hotové) do `LAUNCH-PLAN.md` nebo nového oddílu.

## Hotovo, když
- Seznam hrozeb má u každé položky pravdivý stav ověření.
- Pilotní klient prošel od pozvánky po první požadavek a Kryštof má jeho zpětnou vazbu.
- `AUDIT-LOG.md` a `STATE.md` odpovídají skutečnosti; GDPR postup pokrývá všechny nové tabulky.
- Co není ověřené (zejména s přihlášením na skutečné produkci), je v paměti výslovně.

## Konec sezení
`zakaziq-memory` → Konec sezení. Commit a deploy jen s výslovným souhlasem Kryštofa.
