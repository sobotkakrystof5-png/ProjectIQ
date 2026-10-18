# RD16 — Zákazníci: telefon, e-mail a „Napsat“ jedním klikem

## Cíl
U každého zákazníka je vždy po ruce telefon a e-mail, chybějící se doplní na místě a e-mail se pošle jedním klikem. Stejně jednoduše, jako to dělá admin v Hovorech (tlačítko, předvyplněná zpráva, Odeslat, štítek „Odesláno“).

## Než začneš
Rituál začátku (`zakaziq-memory`): `git status`, větev `ws/redesign-app`, `memory/index.md`, `memory/memory.md`, `memory/pravidla.md`.
Přečti `docs/workspace/REDESIGN-APP-PLAN.md` (F8b, D-10), R-050 (fronta e-mailů, „Zpět“ 60 s), R-054 (GDPR) a `AGENTS.md` B3, B7, B13. Skilly: `zakaziq-workspace-backend`, `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`, `humanize-text-cs` (výchozí texty šablon), `web-security-review`.
Společná pravidla: `new - area of zakaziq/prompty/redesign/00-README.md`. Doporučeno po RD12; nezávisí na RD05–RD11, potřebuje společnou hlavičku z RD04.
Potřebuje D-10 (povinnost kontaktu, odeslání přímo vs. `mailto:`, pravidlo souhlasu). Není-li rozhodnuté, zeptej se hned.

**Vzor v adminu (jen číst, neměnit):** `components/PortfolioEmailModal.tsx`, `app/calls-actions.ts` (`sendCustomLeadEmail`, `sendPortfolioEmail`), `components/LeadsTable.tsx` (`EmailCell`, štítek „Odesláno“).
**Workspace dnes:** karta zákazníka (`components/ws/app/customer-summary.tsx`, `components/ws/customers/customer-detail.tsx`) má jen odkazy `tel:` a `mailto:`. Poptávka a termín v `components/ws/app/detail-slot.tsx` stejně. Rezervační formulář (`components/ws/app/booking/booking-form.tsx`) má telefon a e-mail „nepovinné“. „Komu napsat“ (`lib/ws/outreach.ts`, `lib/ws/email/outbox.ts` `sendOutreachDraft`) posílá jen automatické návrhy a jen se souhlasem. Zákazník má `phone` (E.164, unikátní na účet) a `email` (malá písmena, unikátní na účet), `normalizePhone` je v `lib/ws/bookings.ts`.

## Kroky
1. **Kontakt vždy na očích.** Při zadání zákazníka (nová rezervace, ruční poptávka, nový zákazník) jsou Telefon a E-mail vždy viditelné pod sebou, ne schované. Povinnost podle D-10 (doporučeno: aspoň jedno). Telefon se normalizuje (`normalizePhone`, „777 123 456“ → `+420777123456`), e-mail na malá písmena, srozumitelná hláška při chybě.
2. **Doplnit na místě.** Chybí-li údaj, ukáže se na kartě zákazníka, v panelu poptávky a termínu a v řádku seznamu „+ Přidat e-mail“ / „+ Přidat telefon“: jedno pole, uloží se Enterem, bez otevírání formuláře. Server action s Zodem a `Result`. Kolize s unikátem (jiný zákazník už má ten e-mail nebo telefon) → česká hláška a nabídka sloučit (`MergeBox` z `customer-controls.tsx`), nikdy tichý přepis.
3. **Napsat jedním klikem.** Tlačítko **Napsat e-mail** (nemá-li zákazník e-mail, je na jeho místě „+ Přidat e-mail“) na kartě zákazníka (Dnes, Zákazníci, pravý panel), v poptávce, v termínu a v řádku seznamu. Otevře malé okno jako v adminu: předmět a text předvyplněné šablonou podle situace, výběr šablony nahoře, **Odeslat**. Žádné další povinné kroky.
4. **Šablony.** Výchozí texty v kódu, česky podle `zakaziq-ux-texty-cs` a `humanize-text-cs`, s proměnnými (jméno zákazníka, byznys, termín, služba): Děkuji za objednávku · Potvrzení nebo změna termínu · Nabízím volný termín · Informace k zakázce · Vlastní zpráva. Úprava textů per byznys přes `ws.message_settings` (rozšíření CHECK `message_settings_type_check` o nové typy, **migrace od 085, jen připravit**); úprava v UI patří do Nastavení › Komunikace (RD13), tady stačí použít uloženou hodnotu.
5. **Odeslání.** Přes stávající frontu (`enqueueEmail` + okamžité `deliver`, vzor `sendOutreachDraft`): odesílatel = jméno byznysu, `Reply-To` = e-mail byznysu, takže odpověď chodí majiteli. Po odeslání štítek „Odesláno 18. 10.“ u zákazníka a záznam v historii (`ws.outbound_messages`, zobrazit posledních pár zpráv na kartě). 60 sekund „Zpět“ jako u ostatních zpráv (R-050), bez potvrzovacího dialogu.
6. **Dokud není ověřená doména v Resendu** (`WS_EMAIL_FROM`, stav `sendingReady`), tlačítko otevře `mailto:` s předvyplněným předmětem i textem (funguje hned). Po ověření domény se přepne na přímé odeslání; pro uživatele stejné tlačítko. Žádný falešný štítek „Odesláno“ u `mailto:`.
7. **Pravidla odesílání.** Osobní zpráva k obsluze (termín, zakázka, faktura, odpověď) smí odejít zákazníkovi s e-mailem, který se neodhlásil. Nabídky, akce a „už dlouho jste nebyli“ jen se souhlasem (`contact_consent_at`) a s odkazem na odhlášení, jako „Komu napsat“ (pozor na `sender.customerMail`, tj. předplatné; bez něj výsledek `read_only` s vysvětlením). Šablona, která souhlas vyžaduje, je bez něj vypnutá s jednou větou proč. Právní výklad ověří Kryštof s právníkem, v kódu jen pravidlo z D-10.
8. **Telefon.** Tlačítko **Zavolat** (`tel:`). SMS a WhatsApp mimo rozsah (poskytovatel SMS není rozhodnutý, Otevřené problémy).
9. **Soukromí a GDPR.** Zprávy zákazníka maže `ws.erase_customer` a jsou v exportu; ověř testem. Tělo zprávy neloguj do konzole ani auditu. `web-security-review`: Zod a délky, odesílatel nesmí jít přepsat z formuláře, hlavičky se nesmí vložit z předmětu (odstranit řádkové zalomení), rate limit odeslání na účet.
10. **Testy:** normalizace telefonu, přidání e-mailu a kolize s jiným zákazníkem, odeslání zařazené do fronty s `Reply-To`, `Zpět` zruší zprávu, zákazník bez souhlasu a nabídková šablona, oddělení účtů, výmaz zákazníka.

## Hotovo, když
- U zákazníka bez e-mailu stačí „+ Přidat e-mail“, napsat adresu, Enter, a hned tlačítko Napsat e-mail.
- E-mail jde odeslat jedním klikem z karty zákazníka, poptávky i termínu; objeví se „Odesláno“ a „Zpět“ na 60 sekund.
- Bez ověřené domény se otevře `mailto:` s předvyplněným textem; po ověření domény odchází zpráva přímo. Ověřeno oběma cestami.
- Testy, `tsc`, `build:check` procházejí; vzhled ověřen na 390 / 768 / 1280 / 1440 px, světlý i tmavý režim.

## Konec sezení
`zakaziq-memory` → Konec sezení (migrace: aplikována ne). Stav RD16 v plánu. Commit `ws/zakaznici: kontakt a e-mail jedním klikem`.
