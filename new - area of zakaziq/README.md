# Prompty pro Claude Code — ZakazIQ Workspace

Dvacet sezení (S00–S19). **Jedno sezení = jedna nová konverzace v Claude Code** v kořeni repa
`projectiq` na větvi `workspace`. Každé sezení začíná přečtením paměti a končí jejím zápisem,
takže na sebe navazují i bez kontextu z minula.

## Jak spustit sezení

1. Otevři Claude Code v repu, nová konverzace (`/clear`).
2. Zkopíruj celý obsah souboru `Sxx-….md` jako první zprávu.
3. Na otázky odpovídej hned, Claude je klade jen tam, kde by odhad stál za přepracování.
4. Na konci zkontroluj body „Hotovo, když" a že je zapsaná paměť (`.claude/memory/`).
5. Teprve pak další sezení.

Kdyby sezení nestihlo vše: napiš „ukonči sezení podle zakaziq-memory" a v novém sezení dej
stejný prompt znovu. Pokračuje podle `STATE.md` a `SESSION-LOG.md`.

## Pořadí a závislosti

| # | Sezení | Hlavní skilly | Závisí na |
|---|---|---|---|
| S00 | Příprava repa, paměti, skillů | zakaziq-memory | — |
| S01 | Design systém Dílky v kódu | zakaziq-design-dilky, frontend-design | S00 |
| S02 | Bezpečnostní základ | web-security-setup (+ memory) | S00 |
| S03 | Brief landing page | web-project-brief, zakaziq-ux-texty-cs | S01 |
| S04 | Landing page — stavba a animace | zakaziq-design-dilky, frontend-design | S03 |
| S05 | Landing page — SEO a texty | **[SEO skill]**, humanize-text-cs | S04 |
| S06 | Databáze a oddělení účtů | zakaziq-workspace-backend | S00 |
| S07 | Clerk, registrace, nový byznys | zakaziq-workspace-backend, design | S06 |
| S08 | Stripe předplatné 249 Kč | zakaziq-workspace-backend | S07 |
| S09 | Kostra aplikace a obrazovka Dnes | zakaziq-design-dilky | S07 |
| S10 | Poptávky a kalendář | backend + design | S09 |
| S11 | Veřejné API, objednávací stránka, widget | backend | S10 |
| S12 | Zákazníci, věrnost, segmenty | backend + design | S10 |
| S13 | Nastavení: funkce, služby, kolonky, stavy | backend + design | S11 |
| S14 | Peníze: faktury, příjmy, daně | backend + design | S12 |
| S15 | E-maily, upozornění, novinky | backend, ux-texty, humanize | S12 |
| S16 | Klientský portál | design + backend | S13 |
| S17 | Admin: klienti a novinky | backend | S15 |
| S18 | Mobil, tmavý režim, GDPR | design + backend | S16 |
| S19 | Bezpečnostní audit a spuštění | web-security-audit, web-security-review | vše |

Landing page (S03–S05) a backend (S06–S08) jdou souběžně, nezávisí na sobě. Landing page
v S04 vede tlačítko „Začít" na `/w/registrace`; po S07–S08 začne fungovat celá cesta.

## Skilly, které musí být v Claude Code k dispozici

- **V repu** (`.claude/skills/`, přidá S00): `zakaziq-design-dilky`, `zakaziq-workspace-backend`,
  `zakaziq-ux-texty-cs`, `zakaziq-memory`.
- **Tvoje uživatelské** (`~/.claude/skills/`): `web-security-setup`, `web-security-memory`,
  `web-security-audit`, `web-security-review`, `web-project-brief`, `humanize-text-cs`,
  `frontend-design`, tvůj **SEO skill** → doplň jeho přesný název do `S05` místo `[SEO-SKILL]`.
- **Pro klientské weby** (ne pro toto repo): `zakaziq-napojeni` — navržený zvlášť.

## Než začneš

Vyřeš co nejvíc z `.claude/memory/OPEN-QUESTIONS.md`: DPH v ceně, zkušební dobu, doménu,
název SEO skillu. Sezení, která na nich závisí, se jinak zastaví a zeptají.
