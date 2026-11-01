---
name: zakaziq-hlaseni
description: Hlášení o dokončené práci klientovi přes ZakazIQ. Použij v projektu klienta, který má nastavené ZAKAZIQ_AGENT_KEY, vždy po dokončené změně, kterou má klient vidět (nová stránka, oprava, změna textu), a když se Kryštof ptá, jak napsat nebo odeslat hlášení. Hlášení se uloží jako koncept ke schválení, klient ho uvidí až po schválení.
---

# Hlášení klientovi (ZakazIQ)

Po dokončené změně pošli krátké hlášení. Uloží se jako **koncept**; Kryštof ho v adminu zkontroluje a jedním klikem schválí, teprve potom ho uvidí klient. Nic se nepublikuje samo.

## Kdy hlásit

- Po dokončené změně, kterou klient pozná nebo ji ocení (nová stránka, opravená chyba, změněný text, nasazení).
- Ne po každém příkazu, ne po průzkumu kódu, ne po neúspěšném pokusu. Rozpracovanou větší věc hlas jednou (`rozpracováno`), ne pokaždé.
- Dotaz na klienta (`otázka`) jen když bez jeho odpovědi nejde pokračovat.

## Jak odeslat

```
node scripts/zakaziq-report.mjs --kind hotovo --title "Nadpis" --body "Text pro klienta"
```

Druhy: `hotovo`, `rozpracováno`, `otázka`. Skript čte `ZAKAZIQ_URL`, `ZAKAZIQ_PROJECT_ID` a `ZAKAZIQ_AGENT_KEY` z prostředí. Klíč nikdy nevypisuj, neloguj ani necommituj. Chybí-li proměnné, řekni to Kryštofovi, nehádej je.

## Jak psát (pro laika)

Piš podle `zakaziq-ux-texty-cs`: obyčejná čeština, oslovení vy, krátké věty.

- **Nadpis** (do 160 znaků): co je nového, ne jak. „Na stránce Kontakt je nový formulář", ne „Refactor ContactForm".
- **Text** (do 4000 znaků): co se změnilo, co to pro klienta znamená, co bude dál (nebo co potřebujeme od něj).
- Nikdy: diff, názvy souborů, příkazy, cesty, názvy knihoven, hesla, klíče, adresy databází. Server takové řetězce zakryje a hlášení označí jako citlivé, takže ho nepůjde schválit jedním klikem; nespoléhej na to, nepiš je.
- Žádná vymyšlená čísla ani sliby termínů. Co nevíš, nepiš.

## Příklad

```
node scripts/zakaziq-report.mjs --kind hotovo \
  --title "Na stránce Kontakt je nový formulář" \
  --body "Návštěvníci vám teď mohou napsat přímo ze stránky Kontakt. Zprávy vám přijdou na e-mail. Příště doladíme text potvrzení po odeslání."
```

Odpověď „Hlášení odesláno ke schválení." znamená jen uložení konceptu. Klient zatím nic nevidí.
