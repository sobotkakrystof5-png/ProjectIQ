# S16 — Klientský portál pro zákazníky firem

## Cíl
Zákazník firmy otevře odkaz `/z/[token]` bez registrace a vidí svou zakázku nebo rezervaci:
stav, termín, postup, zprávy, věrnostní kartu, může přesunout/zrušit a ohodnotit.

## Než začneš
Rituál začátku. Načti `zakaziq-design-dilky`, `zakaziq-workspace-backend`, `zakaziq-ux-texty-cs`.
Přečti (jen čti) admin portál `app/p/[token]`, `app/portal-actions.ts`, `components/NpsRating.tsx`,
`FeedbackBlock.tsx`, `BookingModal.tsx`. **Admin portál `/p/[token]` neměň.**

## Kroky
1. `app/(portal)/z/[token]/page.tsx` s `data-app="ws"`, logem a akcentem byznysu.
   Token = náhodný, nehádatelný (generuje DB), bez osobních údajů v URL.
2. Obsah podle typu: **rezervace** (služba, termín, adresa, Přidat do kalendáře, Přesunout,
   Zrušit podle pravidel byznysu) nebo **zakázka** (stavy jako časová osa, postup, zprávy
   od firmy, odkaz na výsledek, faktura). Interní poznámky se nikdy nezobrazí.
3. Věrnostní karta zákazníka (animace razítka podle Dílků).
4. Hodnocení 1–10 + komentář po dokončení (rate limit jako v adminu).
5. Veřejné akce v `app/(portal)/z/actions.ts`: jen token, Zod, rate limit, nikdy `account_id`
   z klienta.
6. Funkce Klientský portál v Nastavení › Funkce; odkaz na portál v e-mailech (S15).
7. Test: cizí/neplatný token = 404 bez rozdílu; poznámky se neobjeví; přesun respektuje kolize.

## Hotovo, když
- Portál funguje na telefonu, ve stylu Dílků s brandem byznysu, bez registrace.
- Admin portál `/p/[token]` funguje beze změny.

## Konec sezení
`zakaziq-memory` → Konec sezení. Commit `ws/portal: klientský portál`.
