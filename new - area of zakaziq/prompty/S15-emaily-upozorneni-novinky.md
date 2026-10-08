# S15 — E-maily, upozornění a novinky

## Cíl
Všechny e-maily zákazníkům i majitelům, upozornění v aplikaci, ranní/týdenní/měsíční přehledy
a newsletter „Co jsme vylepšili" — vše nastavitelné klientem.

## Než začneš
Rituál začátku. Načti `zakaziq-workspace-backend` (E-maily a cron), `zakaziq-design-dilky`,
`zakaziq-ux-texty-cs`, `humanize-text-cs`. Plán: sekce E-maily, upozornění a novinky.

## Kroky
1. Resend + React Email v `lib/ws/email/`: společný layout Dílků (logo a akcent byznysu),
   odesílatel „Jméno byznysu <rezervace@[DOMÉNA]>", Reply-To e-mail klienta.
   Fronta `ws.outbound_messages` (stav, pokusy, další pokus), odesílací cron, webhook Resend
   pro nedoručené. **Uložení poptávky nikdy nečeká na e-mail.**
2. **Zákazníkům:** přijali jsme poptávku · potvrzení rezervace (tlačítko „Přidat do kalendáře"
   s `.ics`, odkazy Přesunout/Zrušit přes podepsaný token) · změna/odmítnutí · připomínka 24 h ·
   poděkování se stavem karty a prosbou o hodnocení · odměna připravena · faktura (PDF) ·
   zpráva skupině („Komu napsat", jen se souhlasem, s odhlášením).
3. **Majiteli:** nová poptávka s tlačítky **Potvrdit / Navrhnout jiný čas** fungujícími bez
   přihlášení (jednorázový podepsaný odkaz, platnost 72 h, po použití neplatný) · ranní přehled
   7:00 · týdenní (pondělí) · **měsíční (1. den)** · po splatnosti · limit DPH · selhání platby.
4. **Upozornění v aplikaci** (zvonek) + Web Push na telefon (volitelné, se souhlasem).
5. **Nastavení › E-maily a upozornění**: každý typ zapnout/vypnout, upravit text s proměnnými
   (`{jmeno}`, `{termin}`, `{sluzba}`…), živý náhled, poslat si zkušební.
6. **Novinky ZakazIQ:** tabulka novinek; zobrazení v aplikaci v panelu „Co je nového";
   e-mail všem účtům s odhlášením (zápis novinek je v adminu, S17).
7. Texty všech šablon podle `zakaziq-ux-texty-cs`, pak `humanize-text-cs`.
8. Testy: fronta opakuje a nezdvojí, podepsané odkazy nejdou použít dvakrát ani po expiraci,
   vypnutý typ se neodešle, odhlášený zákazník nedostane hromadnou zprávu.

## Hotovo, když
- Celá cesta poptávka → potvrzení z e-mailu → připomínka → poděkování funguje v testu.
- Klient vidí a upraví každý e-mail, náhled odpovídá odeslanému.
- SPF/DKIM/DMARC pro odesílací doménu zapsané v `.claude/security/STATE.md`.

## Konec sezení
`zakaziq-memory` → Konec sezení. Commit `ws/email: e-maily, přehledy, novinky`.
