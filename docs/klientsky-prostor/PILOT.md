# Pilot klientského prostoru — kontrolní seznam (KP10, kritérium 6)

> Jeden klient, jedna zakázka, jeden průchod. Cíl: kritérium 6 z `PLAN.md` 11.1. Pilot smí začít, až platí
> kritéria 1–5 (hlavně **TOTP u admina**). Pilot je podle R-066 zdarma. Zjištění se zapisují na konci tohoto
> souboru; opravené do changelogu, odložené do Otevřených problémů v `memory/memory.md`.

## Před pilotem (Kryštof, ~15 min)

- [ ] TOTP zapnutý: `/dashboard/profil` → Přihlášení.
- [ ] Google propojený (Profil → Propojit Google účet), jinak konzultace nevytvoří odkaz na Meet.
- [ ] V kalendáři je aspoň jedno **Volno pro klienty** v budoucnu (Přidat → Volno pro klienty, 30 min, nejdřív za 2 h).
- [ ] Zakázka pilotního klienta má **e-mail klienta**, cenu, službu s etapami a aspoň jednu etapu s úkolem.
- [ ] Víte, na jaký e-mail pozvánka půjde. Pozvánka je vázaná na ten e-mail; **nikdy na `ADMIN_EMAIL`**.
- [ ] Klient ví, že jde o pilot a co se bude zkoušet. Údaje do prostoru nedávejte jiné než jeho vlastní.

## Průchod (měřte čas od otevření e-mailu)

| # | Krok | Co má klient vidět | Co zkontrolovat v adminu |
|---|---|---|---|
| 1 | Zakázka → **Pozvat do prostoru** (Zpět 10 s) | E-mail z `krystof@vizeon.cz` s odkazem | Pozvánka v `/dashboard/klientsky-prostor` |
| 2 | Klient klikne, nastaví heslo | Formulář hesla, žádný cizí e-mail | Člen se objeví u klienta |
| 3 | První obrazovka | Přehled, „Čeká na vás" nebo klidná věta; **do 2 minut od e-mailu** | — |
| 4 | Klient napíše zprávu (text, pak hlas, pak foto) | Odešlo, po přečtení dvě fajfky | Zpráva do 10 s ve Zprávách, zvonek |
| 5 | Kryštof odpoví a pošle **Ke schválení** | Karta Schvaluji / Chci změny | Rozhodnutí klienta u zprávy |
| 6 | „Mám hotovo" u úkolu etapy | Úkol zašedne, jde **Vrátit** | Stav úkolu, procenta zakázky |
| 7 | Kryštof přepne etapu na **Hotovo** | E-mail o hotové etapě za ~15 s, jen jeden | Druhá změna do 24 h e-mail neposílá |
| 8 | **Domluvit konzultaci** (den, čas, o čem) | Potvrzení, odkaz na Meet | Událost v kalendáři a Hovorech, Meet v Google Kalendáři |
| 9 | Přesunout, pak Zrušit konzultaci | Změny se projeví, Vrátit funguje | Událost se posune/smaže i v Googlu |
| 10 | Vystavit fakturu k zakázce | **Faktury**: PDF, QR platba, „Čeká na zaplacení" | PDF shodné s adminem |
| 11 | Označit fakturu zaplacenou | Zbývá klesne | Zbývá klesne i v adminu (R-125) |
| 12 | Zakázku uzavřít (Hotovo/Zaplaceno) | **Hodnocení** (dotazník) v Přehledu | Odpověď v Hodnocení, upozornění při nízké známce |
| 13 | Klient otevře **Vaše údaje** (`/klient/soukromi`) | Text odpovídá `GDPR.md` | — |
| 14 | Odhlásit, přihlásit, **Zapomenuté heslo** | E-mail z `info@zakaziq.cz` česky, odkaz funguje | — |

Navíc na telefonu (390 px) a v jiném prohlížeči než Chrome: kroky 3, 4, 8 a 10.

## Hotovo, když

- Kroky 1–14 prošly, nebo je u každého, co neprošel, zápis níže.
- Krok 3 se stihl do 2 minut.
- Žádná chyba v konzoli a v Runtime Logs ve Vercelu (hledat `portal`, `klient`, `500`).
- Klient neviděl nic, co mu nepatří (interní poznámky, cena jiné zakázky, koncepty).

## Zjištění z pilotu

| Datum | Krok | Co se stalo | Stav (opraveno / zapsáno do paměti) |
|---|---|---|---|
| | | | |
