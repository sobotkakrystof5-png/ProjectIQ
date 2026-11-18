# KP13 — Peníze a faktury v klientském prostoru

## Cíl
Klient u svých zakázek vidí cenu, kolik zaplatil, kolik zbývá a seznam faktur. Fakturu si stáhne v PDF a nezaplacenou zaplatí QR kódem. Čísla se shodují s adminem na korunu (D-K15, R-121).

## Než začneš
Rituál začátku (`zakaziq-memory`). Přečti `docs/klientsky-prostor/PLAN.md` 4.1, 4.7, 5, R-098, R-110, R-117, R-121, `.claude/security/DECISIONS.md` #020 a #024, `lib/admin/project-payments.ts`, `lib/admin/invoice-issue.ts`, `lib/invoice-pdf/{render,totals}.ts`, `app/api/invoices/[id]/pdf/route.ts`, migrace 053, 095, 107, 109, 117.
Skilly: `zakaziq-workspace-backend`, `web-security-review`, `web-security-memory`, `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`.
**Zadání výslovně povoluje změny v:** `lib/admin/project-payments.ts` (jen sdílení výpočtu, ne změna chování), `lib/invoice-pdf/` (jen sdílení vykreslení), `lib/portal/`, `app/klient/`, `app/api/klient/`.

## Kroky
1. **Co klient vidí, jen u svých zakázek:** cena, zaplaceno (záloha, ruční zálohy, platby faktur), zbývá doplatit, vše tímtéž výpočtem jako admin. Měny se nesčítají. Faktury: vystavené (`number_seq IS NOT NULL`) a archivní navázané na zakázku, stav zaplaceno / čeká / po splatnosti / stornováno. Koncepty nikdy.
2. **Projekce do `portal`** (migrace, první volné číslo, jen připravit): souhrn peněz zakázky a faktury se snímkem položek, dodavatele, odběratele, VS a splatnosti; trigger při změně faktury, platby i zakázky; backfill pro už propojené zakázky. **Nikdy:** poznámky, `invoiced_on_ico`, linie přiznané/nepřiznané, `finance_transactions`, AI přepis.
3. **PDF pro klienta:** `/api/klient/faktury/[id]/pdf` ověří členství přes `portal_app` a vykreslí PDF z projekce (`lib/invoice-pdf/render.ts`), bez spojení vlastníka. ETag jako v adminu. Archivní PDF (`pdf_data`) rozhodni s `web-security-review` (kopie do `portal`, nebo úzká funkce) a zapiš do DECISIONS.
4. **QR platba** jen u nezaplacené faktury v CZK s IBANem (SPAYD, `qrcode`, R-064).
5. **UI** v detailu projektu: tři čísla nahoře a seznam faktur; po splatnosti klidně, ne výhružně. Telefon 390 px první.
6. **Testy:** klient B nevidí peníze ani faktury klienta A; koncept nikdy v `portal`; storno označené; součty sedí s adminem; EUR zvlášť; migrace dvakrát po sobě.
7. **Paměť.** `web-security-review`, DECISIONS a STATE (nový tok účetních dat do `portal`), changelog, stav KP13 v plánu.

## Hotovo, když
- Klient vidí, kolik zaplatil a kolik zbývá, a čísla se shodují s adminem.
- Fakturu si stáhne v PDF; nezaplacenou v CZK zaplatí QR kódem.
- Test oddělení klientů prochází; `tsc`, `npm test`, build; vzhled na 390 / 1280 px.

## Konec sezení
`zakaziq-memory` → Konec sezení (migrace: aplikována ne). Commit na požádání, např. `feat: peníze a faktury v klientském prostoru (R-121)`.
