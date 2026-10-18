# RD12 — Věrnostní karty

## Cíl
Věrnostní karta vypadá dobře všude (karta zákazníka, portál, e-mail), nastavení má dvě otázky místo deseti voleb a razítko nebo odměna je jeden klik.

## Než začneš
Rituál začátku (`zakaziq-memory`): `git status`, větev `ws/redesign-app`, `memory/index.md`, `memory/memory.md`, `memory/pravidla.md`.
Přečti `docs/workspace/REDESIGN-APP-PLAN.md` (F8), R-025, R-048 a `AGENTS.md` B9 (S12). Skilly: `zakaziq-design-dilky`, `zakaziq-workspace-backend`, `zakaziq-ux-texty-cs`.
Společná pravidla: `new - area of zakaziq/prompty/redesign/00-README.md`. Soubory: `lib/ws/loyalty.ts`, `components/ws/brand/loyalty-card.tsx`, `components/ws/settings/loyalty-settings.tsx`,
`app/w/[business]/nastaveni/vernost/`, `components/ws/customers/{customer-detail,visit-payment}.tsx`, `components/ws/portal/portal-screen.tsx`, `lib/ws/email/` (poděkování s kartou, odměna).

## Kroky
1. **Jedna karta, všude stejná.** `LoyaltyCard` použij v kartě zákazníka, portálu `/z` a e-mailu (HTML tabulkou v `lib/ws/email/layout.ts`, ne obrázkem). Razítka jako dílky, „3 z 10“, odměna, platnost; prázdná, plná a uplatněná odměna mají vlastní podobu. Akcentová barva byznysu s kontrolou kontrastu.
2. **Jednoduché nastavení.** Dvě otázky: Kolik razítek? Jaká je odměna? Razítko se dává za zaplacenou návštěvu. Náhled karty vedle. Všechno ostatní (počítání podle částky nebo zakázky, vybrané služby, minimální útrata, jedno za den, platnost, automatika) pod **Pokročilé**. Žádná změna pravidel v `lib/ws/loyalty.ts`, jen jiné zobrazení a výchozí hodnoty.
3. **Jeden klik.** Na kartě zákazníka tlačítko Razítko (s datem a poznámkou nepovinně) a Uplatnit odměnu, obojí se „Zpět“. Atomicita a ochrana proti dvojímu razítku (migrace 077–078) zůstávají.
4. **Zákazník.** V portálu vidí kartu a kolik zbývá do odměny; v e-mailu po návštěvě stav karty. Žádné Wallet karty (mimo rozsah).
5. **Texty** přes `zakaziq-ux-texty-cs` („Po 5 zaplacených návštěvách dostane zákazník: střih zdarma“), bez vymyšlených odměn.
6. **Testy:** razítko a odměna s „Zpět“, souběh, jednoduché nastavení uloží stejná data jako dřív.

## Hotovo, když
- Majitel nastaví věrnost za půl minuty a vidí, jak karta vypadá.
- Razítko i odměna jsou jeden klik se „Zpět“.
- Vzhled ověřen na 390 / 768 / 1280 / 1440 px, světlý i tmavý režim; testy, `tsc`, `build:check` procházejí.

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav RD12 v plánu. Commit `ws/vernost: karta, jednoduché nastavení, razítko jedním klikem`.
