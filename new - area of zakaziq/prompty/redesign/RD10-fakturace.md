# RD10 — Fakturace: vystavit za 30 sekund

## Cíl
Nová faktura je jedna obrazovka, dodavatel se vyplňuje jednou, zaplacení je jeden klik a seznam faktur řekne, co je potřeba udělat.

## Než začneš
Rituál začátku (`zakaziq-memory`): `git status`, větev `ws/redesign-app`, `memory/index.md`, `memory/memory.md`, `memory/pravidla.md`.
Přečti `docs/workspace/REDESIGN-APP-PLAN.md` (F6, D-5), R-049, `docs/workspace/MONEY.md` a `AGENTS.md` B3, B9. Skilly: `zakaziq-workspace-backend`, `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`.
Společná pravidla: `new - area of zakaziq/prompty/redesign/00-README.md`. Soubory: `components/ws/money/{page,forms}.tsx`, `app/w/[business]/faktury/actions.ts`,
`lib/ws/money/{data,calculations,schema,pdf}.ts`, `lib/ws/money.ts`, `lib/ws/email/` (faktura e-mailem), `lib/ws/__tests__/ws-money*.test.ts`.
Potřebuje D-5 (QR platba). Bez rozhodnutí QR nedělej.

## Kroky
1. **Refaktor nejdřív.** `components/ws/money/page.tsx` a `forms.tsx` (husté řádky přes 300 znaků) rozděl do čitelných souborů s běžnou délkou řádku (např. `invoice-list`, `invoice-form`, `invoice-detail`, `payment-form`). Chování beze změny, testy zelené, potom teprve změny.
2. **Profil dodavatele jednou.** Jméno, adresa, IČO, DIČ, bankovní účet (IBAN pro QR), plátce DPH. Úložiště: nová tabulka s RLS nebo sloupce účtu (rozhodni podle toho, co už existuje v `ws.accounts` a daňovém nastavení; migrace 088 po RD07, jen připravit). Formulář v Nastavení › Firma (v RD13 přesun do nové struktury). Faktura se na dodavatele už neptá, odkaz „Upravit dodavatele“.
3. **Nová faktura na jedné obrazovce.** Komu (hledání zákazníka; z poptávky, zakázky a karty zákazníka předvyplněno) · Co (služby z ceníku jedním klikem s cenou, vlastní řádek) · Splatnost (7 / 14 / 30 dnů, výchozí 14) · součet. Datum plnění, měna, DPH a poznámka pod „Další údaje“. Zod a délky v akci beze změny.
4. **Tlačítka.** „Vystavit a poslat“ (po vystavení zařadí e-mail `queueInvoiceAction`; dokud není ověřená doména v Resendu, tlačítko se jmenuje „Vystavit a stáhnout PDF“) a „Jen vystavit“. Žádné klamavé slovo, e-mail se neposílá, když nemůže.
5. **Seznam.** Filtry K zaplacení / Po splatnosti / Zaplacené (stav v URL), součet vlevo nahoře po měnách (neslučovat), v řádku jedním klikem **Zaplaceno** (výchozí dnes, převodem, úprava až po). Pro „Zpět“ ověř, zda existuje bezpečné zrušení platby; nemá‑li, naimplementuj ho **atomicky** (smaže i příjem, R-049) s testem, nebo použij jiný vzor, ale ne potvrzovací dialog.
6. **QR platba** (po D-5): řetězec SPAYD na PDF, bez nové závislosti (stávající `qrcode.react`, vykreslení na server), jen když je v profilu IBAN.
7. **Přijaté faktury** beze změny funkce, jen úklid zobrazení.
8. **Testy:** atomické číslování, souběh dvou faktur, Zaplaceno a Zpět bez dvojího příjmu, předvyplnění z zakázky, oddělení účtů. `web-security-review`.

## Hotovo, když
- Faktura z hotové zakázky se vystaví na dva kliky, ručně do 30 sekund.
- Zaplaceno je jeden klik se Zpět, neexistuje cesta ke dvojímu příjmu.
- Refaktor nezměnil výstup PDF, testy, `tsc`, `build:check` procházejí.

## Konec sezení
`zakaziq-memory` → Konec sezení (migrace: aplikována ne). Stav RD10 v plánu. Commit `ws/faktury: jedna obrazovka, profil dodavatele, zaplaceno jedním klikem`.
