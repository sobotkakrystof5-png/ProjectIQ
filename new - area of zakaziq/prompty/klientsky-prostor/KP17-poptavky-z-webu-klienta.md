# KP17 — Poptávky z webu klienta

## Cíl
Klient ve svém prostoru vidí, kolik lidí mu napsalo nebo se objednalo přes web, který mu Kryštof postavil, po měsících (D-K16, R-129). Kryštof totéž vidí u zakázky v adminu. Návštěvnost se nedělá; práci a peníze už ukazují KP13 a KP16.

## Než začneš
Rituál začátku (`zakaziq-memory`). **Ověř, že je rozhodnuté D-K20** (`docs/klientsky-prostor/PLAN.md` oddíl 7). Bez rozhodnutí nezačínej a zeptej se Kryštofa; doporučení je varianta (a).
Přečti `docs/klientsky-prostor/PLAN.md` 4.7 (odstavec Analýza), 5 a 6, R-072, R-128, R-129, výsledky KP04 (klíče projektu `project_agent_keys`, migrace 094, `AGENT_KEY_PEPPER`, DECISIONS #019) a KP16 (`lib/portal/overview.ts`, `components/portal/overview.tsx`), `lib/web-leads.ts` a `lib/lead-origins.ts` (jen pro poučení), `docs/workspace/API.md` (jak vypadá veřejné API Workspace), `.claude/security/{STATE,DECISIONS,CSP-LOG}.md`.
Skilly: `zakaziq-workspace-backend` (veřejný vstup, klíče, limity), `web-security-review`, `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`, `break-ui`.
**Zadání výslovně povoluje změny v:** `app/api/public/` (nová routa), `lib/portal/`, `components/portal/`, `app/klient/`, detail zakázky v adminu (karta s počty a správa klíče), nová migrace (126+).

## Nesmí se
- Napojit weby klientů na `lib/web-leads.ts` ani `LEAD_ORIGINS`. Ten příjem zakládá zakázky v Kryštofově schránce Poptávky — zákazníci klienta by se objevili jako Kryštofovy poptávky.
- Ukládat jméno, e-mail, telefon nebo text poptávky (u varianty a). Počítá se jen událost.

## Kroky (varianta a — jen počet)
1. **Migrace:** klíč webu zakázky (hash s pepřem jako `project_agent_keys`, zneplatnění a otočení) a tabulka událostí `project_web_events` (zakázka, druh `poptavka` | `objednavka`, čas, bez osobních údajů a bez IP). Projekce do `portal` jako měsíční součty (`portal.web_lead_months`: zakázka, měsíc, druh, počet) triggerem; `portal_app` jen čte. Retence: jednotlivé události 13 měsíců, měsíční součty se zakázkou (R-076). Idempotentní, dvakrát po sobě v PGlite.
2. **Veřejný vstup:** `POST /api/public/web-udalost` s hlavičkou klíče (ne v URL), tělo `{ "druh": "poptavka" | "objednavka" }`, Zod, strop těla 1 kB, limit na klíč (např. 30 za hodinu) a na IP, odpověď vždy rychlá a bez detailů. Volá ho **server** webu klienta po úspěšném odeslání formuláře (serverová akce nebo route webu), nikdy prohlížeč — klíč nesmí do JavaScriptu stránky. Žádný CORS. Zkušební událost (`test: true`) se uloží, ale do čísel nejde.
3. **Admin:** v detailu zakázky karta „Poptávky z webu": vytvořit klíč (ukáže se jednou), zkopírovat úryvek pro web klienta, zneplatnit, poslední událost, čísla za posledních 12 měsíců.
4. **Klientský prostor:** v Přehledu u zakázky webu a v panelu O zakázce „Poptávky z vašeho webu": tento měsíc, minulý měsíc a sloupce za 12 měsíců (dataviz podle Dílků, žádné barvy natvrdo, popis pro čtečku). Prázdný stav užitečný: „Jakmile vám někdo napíše přes web, uvidíte to tady." Zakázka bez klíče sekci nemá.
5. **Návod pro web klienta:** krátký úryvek pro Next.js (serverová akce) do `docs/klientsky-prostor/` a skill nebo krok v `zakaziq-napojeni`, jak web napojit; klíč jen v env webu.
6. **Testy:** klient vidí jen své součty; cizí klíč, špatný druh a velké tělo odmítnuté; limit; zkušební událost se nepočítá; zneplatněný klíč nefunguje; migrace dvakrát po sobě.
7. **Odolnost:** `break-ui` s nulou, jedním měsícem, rokem plným čísel a velkým číslem.
8. **Bezpečnost a paměť:** `web-security-review`, zápis do `.claude/security/` (nový veřejný vstup = DECISIONS), changelog, R-xxx, `docs/AGENTS-REFERENCE.md`, stav KP17 v plánu.

## Když D-K20 dopadne jinak
- **(b) celá poptávka přes ZakazIQ:** navíc uložení poptávky (jméno, kontakt, text) do tabulky klienta, e-mail klientovi z vizeon.cz, seznam v prostoru, honeypot a limit jako u Workspace (`lib/ws/intake/`), retence a výmaz (GDPR — ZakazIQ je zpracovatel, do právních textů a smlouvy s klientem), a zápis do DECISIONS. Odhad velikosti L místo M.
- **(c) jen klienti s Workspace:** žádný nový vstup; čísla z `ws.requests` (bez `is_test`) přes úzkou funkci podle vazby zakázky na účet Workspace. Klient bez Workspace sekci nemá.

## Hotovo, když
- Zkušební událost z webu klienta se do minuty objeví v adminu i v prostoru jako číslo, ne jako osobní údaj.
- Klient B nevidí čísla klienta A (test).
- `tsc`, `npm test`, build; vzhled na 390 / 768 / 1280 / 1440 px, plochy ≥ 44 px.

## Konec sezení
`zakaziq-memory` → Konec sezení. Commit na požádání, např. `feat: poptávky z webu klienta v prostoru (KP17, R-129)`. Migrace na produkci, env a deploy jen s výslovným souhlasem Kryštofa.
