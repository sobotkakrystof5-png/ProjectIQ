# vizeon.cz: správa za 999 Kč, web patří klientovi, všechno v ceně (R-147 v ZakazIQ)

> Zadání pro Claude Code v repozitáři **vizeon.cz**
> (`/Users/krystofsobotka/Desktop/Podnikání/Websites /VIZEON /vizeon`). Vlož celé do nového sezení.
> Pravidla vznikla v ZakazIQ při stavbě navrhovače nabídek (2026-11-25, `docs/admin/NABIDKY-PLAN.md`
> oddíl 5 a 5.2). Web a obchodní podmínky jim dnes odporují.

---

Pracuješ v repozitáři webu vizeon.cz. Než začneš, přečti jeho `CLAUDE.md`/`AGENTS.md` a paměť, pokud
ji repo má. Čeština, vlastní větev, **push a nasazení jen na pokyn Kryštofa**. Cizí necommitnuté změny
nepřepisuj. Texty pro lidi piš obyčejně česky a na závěr je projdi skillem `humanize-text-cs`.

## Co Kryštof rozhodl (2026-11-25)

1. **Správa webu stojí 999 Kč měsíčně.** Obsahuje: web běží na hostingu VIZEONu, drobné úpravy
   průběžně, 2 články měsíčně po dohodě s klientem, aktualizace, bezpečnost, zálohy. Nová stránka
   nebo nová funkce jde přes samostatnou nabídku.
2. **Web patří klientovi.** Bez správy od začátku. Se správou běží na hostingu VIZEONu; když klient
   správu zruší, web se **zdarma** přesune na jeho hosting, předá se kód a všechno je jeho.
   Výpověď správy s měsíční lhůtou.
3. **V ceně je všechno, i texty a SEO optimalizace.** Fotky od klienta nebo licencované z fotobanky.
   Focení na místě se většinou nedělá; když ano, je součástí zakázky, bez zvláštního příplatku.
4. **Úpravy do maximální spokojenosti** v rámci schváleného rozsahu, do spuštění a 14 dní po něm.
5. **Úpravy po spuštění bez správy** za individuální cenu. Příplatek +50 % jen tehdy, když klient
   chce úpravu hotovou do 48 hodin.
6. Záloha 30 % předem, 70 % po předání, splatnost 14 dní (beze změny).
7. Ceny v ceníku zůstávají jako „od" a **bez pokynu Kryštofa je neměň**.

## Kde web dnes říká něco jiného

Zjištěno čtením repa 2026-11-25. Každé místo ověř, než ho změníš, a najdi i další výskyty
(`grep` na „480", „1 000 Kč", „Web Care", „copywriting", „kol úprav", „licenc", „zdrojový kód").

| Místo | Dnes | Má být |
|---|---|---|
| `components/services/MaintenancePlan.tsx` (`MAINTENANCE_PRICE`), `app/sluzby/sprava-webu/page.tsx`, `lib/data/home-faq.ts`, `content/blog/kolik-stoji-tvorba-webu-2026.mdx` | Správa „od 480 Kč / měsíc", 1 hodina práce | 999 Kč, obsah podle bodu 1 |
| `app/podminky/page.tsx` čl. 9 | „Web u nás" 1 000 Kč, bez úprav obsahu | 999 Kč, obsah podle bodu 1 |
| `app/podminky/page.tsx` čl. 6 | Kód zůstává poskytovateli, klient má licenci | Bod 2 |
| `components/services/WebGuarantees.tsx`, `lib/data/home-faq.ts` | „Web je váš" | Ponechat, doplnit, jak to je se správou (bod 2) |
| `components/services/PackageCompareTable.tsx`, `app/cena-tvorby-webu/page.tsx`, `app/podminky/page.tsx` čl. 5 | Copywriting a focení mimo cenu, texty dodává klient | Bod 3 |
| `PackageCompareTable`, `lib/data/faq.ts` | „Dohodnutý počet kol úprav" × „opravím vše, dokud nejste 100% spokojeni" | Bod 4, všude stejně |
| `app/podminky/page.tsx` čl. 7 | Záruka 14 dní na technické chyby | Sladit s bodem 4 |

## Pozor

- **Obchodní podmínky jsou smlouva.** Nové znění dostane nové datum účinnosti; přechodné ustanovení
  pro dosavadní smlouvy (dnes řeší starší „měsíční správu webu") zachovej a doplň. Jestli a jak
  oznámit změnu stávajícím klientům, se zeptej Kryštofa, nic sám neposílej.
- Strukturovaná data a FAQ (JSON-LD) musí říkat totéž co text stránky.
- Neměň ceník balíčků, termíny dodání ani nic, co tu není.

## Hotovo, když

Na webu i v podmínkách je všude správa 999 Kč s obsahem z bodu 1, vlastnictví podle bodu 2,
texty a SEO v ceně, úpravy do spokojenosti; `grep` na staré formulace nic nenajde; build projde;
stránky Ceník, Správa webu, Podmínky a úvod jsou prohlédnuté na telefonu i počítači. Kryštofovi
ukaž změněné odstavce podmínek před commitem.
