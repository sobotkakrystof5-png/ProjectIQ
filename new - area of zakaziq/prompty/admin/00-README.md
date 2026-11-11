# Prompty pro Claude Code — modernizace admin konzole

Čtrnáct sezení (AD00–AD18). **Jedno sezení = jedna nová konverzace v Claude Code** v kořeni repa
`ZakazIQ`, na větvi `admin/modernizace` (vznikne v AD00 z `main`, až se tam fast-forwardem dostane `ws/redesign-app`). Každé sezení začíná přečtením paměti
a končí jejím zápisem, takže na sebe navazují i bez kontextu z minula.
Zdroj pravdy je plán `docs/admin/MODERNIZACE-ADMIN-PLAN.md` (fáze, rozhodnutí, tabulka stavu v sekci 6).

## Jak spustit sezení

1. Otevři Claude Code v repu, nová konverzace (`/clear`).
2. Zkopíruj celý obsah souboru `ADxx-….md` jako první zprávu.
3. Na otázky odpovídej hned, Claude je klade jen tam, kde by odhad stál za přepracování.
4. Na konci zkontroluj body „Hotovo, když“ a že je zapsaná paměť (`memory/memory.md`) i stav v plánu (sekce 6).
5. Teprve pak další sezení.

Kdyby sezení nestihlo vše: napiš „ukonči sezení podle zakaziq-memory“ a v novém sezení dej stejný
prompt znovu. Pokračuje podle `memory/memory.md` a tabulky v plánu.

## Pořadí a závislosti

| # | Sezení | Hlavní skilly | Potřebuje |
|---|---|---|---|
| AD00 | Příprava: větev, zelené testy, testovací data, měření | zakaziq-memory | — |
| AD01 | **Úklid:** Škola, Sport, Plány a Šablony pryč (migrace 100+101) | zakaziq-memory | AD00 |
| AD02 | **Jeden byznys:** Alteno jako zdroj poptávky, Prvotka (migrace 102) | workspace-backend, web-security-review | AD01 |
| AD03 | **Jedna navigace:** zrušení Hubu, Dnes s čísly | design-dilky, ux-texty-cs | AD02 |
| AD04 | Vizuální základ: tokeny, písmo, CSP, portály, `brand→navy` | design-dilky, web-security-memory | AD03 |
| AD05 | Kostra, šířky, jeden systém odznaků | design-dilky, ux-texty-cs | AD04 |
| AD06 | Rychlost I: dávkování, indexy, streaming | workspace-backend | AD04 |
| AD07 | Sdílená tabulka a výpisy | design-dilky, workspace-backend | AD05, AD06 |
| AD08 | Rychlost II: `after()`, **opravy kalendáře**, bundle | workspace-backend | AD06 |
| AD09 | Jedna entita kontaktu (karta klienta) | workspace-backend, web-security-review | AD06 |
| AD10 | Klikací kontakt, šablony, kalendář ↔ hovory | design-dilky, ux-texty-cs | AD09 |
| AD11 | **Dokončené do zakázky, průvodka** (migrace 106) | workspace-backend | AD09 |
| AD12 | Fakturace: vystavování, PDF, QR, ARES | workspace-backend, web-security-review | AD06, AD09 |
| AD13 | Fakturace: náprava financí, náklady, zisk na zakázku | workspace-backend | AD12 |
| AD14 | AI asistent + oprava `/api/ai-assistant` | workspace-backend, web-security-review | AD05, AD09 |
| AD15 | Paměť projektu (facts + project_memory) | workspace-backend, web-security-memory | AD14 |
| AD16 | **Hodnocení, reference, předávací dokument, AI leady** | ux-texty-cs, humanize-text-cs | AD11, AD12 |
| AD17 | Ruční překreslení denních obrazovek | design-dilky, ux-texty-cs, frontend-design | AD07, AD10, AD14 |
| AD18 | Dokončení sjednocení, modály, závěrečné ověření | design-dilky, web-security-review | vše |

**AD01 až AD03 jdou první a není to libovůle.** Smažou nebo sloučí to, co by AD04 jinak přepisoval
a AD17 překresloval. Každá obrazovka smazaná v AD01 je obrazovka, kterou nikdo nemusí navrhovat.
Proto se nezačíná vzhledem, i když vzhled pálí nejvíc.

Po AD06 jsou AD07, AD08 a AD09 na sobě nezávislé a jde je prohodit podle toho, co nejvíc pálí.
AD12+AD13 nezávisí na AD14+AD15.
**Nejkratší cesta k „už to není pomalé“:** AD00 → AD04 → AD06 → AD08.
**Nejkratší cesta k „kalendář konečně funguje“:** AD00 → AD08 (opravy kalendáře na AD04 nezávisí).
**Nejkratší cesta k „volám jedním klikem“:** AD00 → AD09 → AD10.
**Nejkratší cesta k „nestydím se za to“:** AD00 → AD01 → AD03 → AD04 → AD05 → AD17.
**Nejkratší cesta k „vystavím fakturu v appce“:** AD00 → AD06 → AD09 → AD12.

## Společná pravidla (platí v každém sezení)

- Česky, stručně. Na začátku řekni záměr, na konci výsledek, skutečné ověření a co zbývá.
- **Workspace a landing page se nesmí změnit.** Kontrolní podmínka každého vizuálního sezení:
  `/w` a `/` porovnat před a po (screenshot i zkompilované CSS, jako to dělal R-027).
  Soubory `app/globals.css`, `tailwind.config.ts`, `next.config.mjs`, `lib/security/csp.ts`
  a `app/layout.tsx` mění **jen** admin větev; Workspace si je bere rebasem.
- **Migrace jen připravit, aplikuje je Kryštof.** Číslování od **100** (poslední v repu je 099),
  idempotentní, aditivní. Číslo si vždy ověř proti `ls migrations`.
- **Žádný nový npm balíček.** `qrcode`, `@anthropic-ai/sdk`, `puppeteer-core`, `@sparticuz/chromium`,
  `cmdk`, `sonner` už v projektu jsou. Jediná nová vnější závislost je ARES (AD12) → R-086.
- Jen Dílky. Texty podle `zakaziq-ux-texty-cs`. Žádné vymyšlené údaje ani čísla.
- Hromadné úpravy **vždy přes `git grep`** (jen verzované soubory) — tím vypadne `.claude/worktrees/`
  (11 kopií, 7,5 GB), `.agents/`, `node_modules` i `new - area of zakaziq`. Nikdy `sed` přes repo.
- Staré adresy zůstávají funkční (přesměrování).
- Cizí neuložené změny nepřepisuj, nevracej ani nestaguj. Stageuj jen konkrétní soubory, nikdy `git add -A`.
- Deploy, merge do `main` a změny externích služeb jen s výslovným souhlasem.
- Po sezení: `npx tsc --noEmit`, `npm test`, `npm run build:check` (při běžícím dev), vzhled na
  390 / 768 / 1280 / 1440 px. Co jsi neověřil s přihlášením, napiš. Neoznačuj neověřené za hotové.
- Bezpečnostní změna = zápis do `.claude/security/` ve stejném commitu, pak
  `node scripts/sync-agent-context.mjs --write` a `--check`.

## Skilly

Projektové (`.claude/skills/`): `zakaziq-design-dilky`, `zakaziq-workspace-backend` (platí i pro admin
datovou vrstvu), `zakaziq-ux-texty-cs`, `zakaziq-memory`.
Uživatelské: `web-security-review` (před commitem u vstupů, API a DB), `web-security-memory`
(zápis bezpečnostní změny), `frontend-design` a `impeccable` (AD17), `humanize-text-cs` (texty pro lidi).

## Než začneš první sezení

Odpověz na rozhodnutí **A–D** v plánu (sekce 8). AD00 potřebuje aspoň **A** (větev a cesta na produkci);
ostatní se sezení zeptají sama, až na ně dojde.
