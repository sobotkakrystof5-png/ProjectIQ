# VO11 — Mac: okno ZakazIQ Voice jako Wispr Flow

> Sezení pro Claude Code na **MacBooku**, v kořeni repa ZakazIQ, větev `admin/zakaziq-voice`.

## Cíl jednou větou

Okno aplikace s levým pruhem jako ve Wispr Flow, v Dílkách: Domů se slovy dnes, sérií
a posledními diktáty, Historie, Slovník, Styl a Nastavení.

## Než začneš

1. Skill `zakaziq-memory` (začátek), `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`, `dataviz`.
2. Plán `docs/admin/VOICE-PLAN.md` oddíl 9 („Okno ZakazIQ Voice") a 8 (čísla).
3. Server: `GET /stats` (VO10), `/config`, `/terms`, `/settings` (VO08). Kód z VO03–VO09.
4. Pro představu otevři admin `/dashboard/voice` (VO10) — okno má ukazovat tatáž čísla.

## Rozsah

- `Hub/HubWindow.swift` — jedno okno (`NSWindow` + SwiftUI), minimální velikost asi 860 × 560,
  pamatuje si polohu, otevře ho „Otevřít ZakazIQ Voice" v menu a dvojklik na lištu.
  Levý pruh: logo (dílky 2×2 + „ZakazIQ Voice"), Domů, Historie, Slovník, Styl, Nastavení,
  dole stav připojení. Pozadí `ground`, karty bílé, Instrument Sans, čísla JetBrains Mono.
- **Domů:** pozdrav podle denní doby, „Dnes jste nadiktovali 1 240 slov", sloupce za 7 dní
  (Swift Charts), série s tečkami dnů týdne, rychlost (slov za minutu), ušetřený čas,
  posledních 10 diktátů (aplikace, čas, text, Zkopírovat, příznak „opraveno"). Čísla
  ze `/stats`, při výpadku poslední uložená s větou „Naposledy aktualizováno 14:02".
- **Historie:** místní historie (LocalDB z VO06), hledání, filtr stavu, Zkopírovat,
  **Zkusit znovu** u diktátů ve frontě nebo s chybou, Smazat (místně).
- **Slovník:** slova (správný tvar + jak to slyší, přidat, upravit, smazat), zkratky
  (zkratka → text), co se naučilo samo (označené) — přes `/terms`.
- **Styl:** pro každou kategorii (E-maily, Pracovní zprávy, Osobní zprávy, Zadání pro AI,
  Dokumenty, Ostatní) Formální / Neutrální / Osobní / Přesně s krátkou ukázkou téže věty —
  přes `/settings`.
- **Nastavení:** Zkratka (Fn / pravý ⌥), Mikrofon (výběr vstupního zařízení), Zvuky,
  Spustit po přihlášení (`SMAppService.mainApp`), Lišta v klidu, Připojení (adresa, klíč,
  Vyzkoušet), Soukromí (ukládat text na serveru / jen čísla, učit se z mých oprav, smazat
  místní historii), Oprávnění (stav tří oprávnění s tlačítky do Nastavení systému),
  O aplikaci (verze, počítadlo „pole nešlo přečíst" z VO09).
- **Úvod při prvním spuštění** (3 kroky v okně): oprávnění, klíč zařízení, „Zkuste to:
  podržte fn a řekněte Dobrý den". Fn nastavení výběru emoji podle VO04.
- Texty česky podle `zakaziq-ux-texty-cs` (oslovení vy, žádný žargon). Prázdné stavy
  užitečné („Zatím žádný diktát. Podržte fn a mluvte.").
- Klávesnice: ⌘1–⌘5 záložky, ⌘F hledání v Historii, Esc zavře list.

## Mimo rozsah

Nové funkce serveru (kromě drobné opravy, kdyby `/stats` něco chybělo — pak zapsat).

## Testy

XCTest na view modely: formátování čísel a času česky (mezery v tisících, „1 h 20 min"),
série s tečkami, sloučení místní historie a serverových čísel, chování bez sítě. `make test`.

## Ověření naostro

Projdi všechny záložky, změň styl e-mailů na Formální a nadiktuj e-mail (projeví se?), přidej
slovo do slovníku z okna a ověř v adminu, zapni „jen čísla" a ověř, že nový diktát nemá text
na serveru. Snímky okna (`screencapture -l`) porovnej s Dílky a s adminem. Zapni Spustit po
přihlášení a ověř po odhlášení a přihlášení.

## Hotovo, když

- Okno má pět záložek podle plánu, čísla sedí s adminem.
- Slovník, styl a soukromí jdou měnit z okna a projeví se na serveru.
- Úvod provede nového uživatele do prvního diktátu.
- `make -C voice-mac test app` prošlo.

## Konec sezení

Skill `zakaziq-memory`. Stav VO11 v plánu. Commit `feat: voice okno aplikace`.
