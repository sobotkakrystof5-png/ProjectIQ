# S10 — Poptávky a kalendář

## Cíl
Poptávky a termíny fungují doopravdy: přijmout, potvrdit jedním klikem, navrhnout jiný čas,
odmítnout, ruční rezervace, kalendář den/týden/měsíc, pracovníci, blokace.

## Než začneš
Rituál začátku. Načti `zakaziq-workspace-backend`, `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`.
Mockupy: C (kalendář), A (rozložení detailu poptávky), vzhled LP-D.

## Kroky
1. Server actions v `app/w/[business]/poptavky/actions.ts`: `confirmRequest`, `proposeOtherTime`,
   `declineRequest`, `createManualBooking`, `moveAppointment`, `cancelAppointment`, `createBlock`.
   Vše v transakci, kolize řeší DB omezení a vrací lidskou hlášku.
2. **Poptávky** (`/poptavky`): seznam (Nové / Potvrzené / Vyřízené), detail v pravém panelu:
   zákazník + věrnostní karta, služba, chtěný termín, hodnoty vlastních kolonek, zpráva,
   tip „Termín je volný / Koliduje s…", tlačítka Potvrdit / Jiný čas / Odmítnout.
3. **Kalendář** (`/kalendar`): den / týden / měsíc, sloupce podle pracovníků, délka podle služby,
   poptávky jako čárkovaný signal blok na chtěném čase, potvrzení kliknutím na blok,
   přetažení termínu (s potvrzením „Zpět"), blokace (dovolená, školení).
4. **„Zpět" místo dialogů:** odmítnutí a zrušení se provede hned, toast s „Zpět" 8 s.
5. **Živé obnovení:** nové poptávky se v otevřené aplikaci objeví do 15 s (polling
   s `If-None-Match`/`updated_at` kurzorem; WebSocket ne), animace vjezdu.
6. Zakázky (`/zakazky`) jako tabule podle vlastních stavů (rozložení B, vzhled Dílků) —
   jen zobrazení a přesun mezi stavy; podrobné nastavení stavů je S13.
7. Testy: potvrzení vytvoří termín a změní stav, kolize vrátí chybu, cizí účet nic nezmění.

## Hotovo, když
- Poptávku ze seed dat jde potvrdit jedním klikem z Dnes, Poptávek i Kalendáře.
- Kolize termínů nejde vytvořit ani souběžně (test).
- Odmítnutí/zrušení jde vrátit.

## Konec sezení
`zakaziq-memory` → Konec sezení. Commit `ws/poptavky: poptávky a kalendář`.
