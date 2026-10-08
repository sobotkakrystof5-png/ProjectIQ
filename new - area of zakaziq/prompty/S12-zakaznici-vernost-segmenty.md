# S12 — Zákazníci, věrnostní karty a segmenty

## Cíl
Zákazníci s historií, věrnostní karty, které se razítkují samy, pět segmentů a panel
„Komu napsat".

## Než začneš
Rituál začátku. Načti `zakaziq-workspace-backend`, `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`.
Mockup C2 (rozložení), LP-D (vzhled, věrnostní karta). Plán: sekce Nastavení (věrnost)
a Segmenty zákazníků a příjmy.

## Kroky
1. **Zákazníci** (`/zakaznici`): tabulka (jméno, skupina, razítka, naposledy, útrata, další
   krok), filtry podle skupin, hledání, detail v pravém panelu (karta, historie návštěv
   a zakázek, útrata, interval návštěv, poznámky, souhlas s kontaktem), sloučení duplicit.
2. **Věrnost** (`lib/ws/loyalty.ts`): pravidla z `loyalty_programs` (počet razítek, co se počítá:
   zaplacená návštěva / dokončená zakázka / každých X Kč, min. útrata, max. 1 denně, platnost,
   jen vybrané služby, auto vs. ruční). Razítko vzniká při zaplacení (idempotentně),
   ruční přidání/odebrání s důvodem, uplatnění odměny při další rezervaci → nová karta.
3. **Segmenty** (`lib/ws/segments.ts`): Noví, Stálí, Jednorázoví, Spící, Ukončení; pořadí
   vyhodnocení Ukončení → Noví → Spící → Stálí → Jednorázoví; obvyklý interval z historie;
   hranice z `segment_rules` (výchozí ze šablony oboru). Přepočet po návštěvě + cron denně
   (`/api/cron/ws-segments`), změny do `segment_history`.
4. **„Komu napsat"**: návrhy (Spící s volnými termíny, karta 4/5, narozeniny, Noví po první
   návštěvě) jen pro zákazníky se souhlasem; akce „Připravit zprávu" → e-mail (SMS až podle
   rozhodnutí v `memory/memory.md` → Otevřené problémy); odeslání přes frontu ze S15 (zatím uložit jako koncept).
5. **Testy (důkladně):** všechna pravidla razítek včetně hranic (min. útrata, 1 denně,
   platnost, duplicitní platba), všech 5 segmentů včetně hraničních dat a časových pásem.

## Hotovo, když
- Zaplacená návštěva přidá právě jedno razítko a plná karta nabídne odměnu.
- Segmenty sedí na seed datech a testy pokrývají hranice.
- Panel „Komu napsat" neukáže nikoho bez souhlasu.

## Konec sezení
`zakaziq-memory` → Konec sezení. Commit `ws/zakaznici: věrnost a segmenty`.
