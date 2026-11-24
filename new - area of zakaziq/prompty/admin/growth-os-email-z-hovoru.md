# Growth OS → ZakazIQ: e-mail nadiktovaný v hovoru patří k firmě (R-141 v ZakazIQ)

> Zadání pro Claude Code v repozitáři **vizeon-autopilot**
> (`/Users/krystofsobotka/Documents/growth-os/vizeon-autopilot`). Vlož celé do nového sezení.
> Strana ZakazIQ je hotová v kódu (2026-11-24, R-141, migrace 130): kontrakt se **nemění**,
> stačí, aby Growth OS posílal správný `email`.

---

Pracuješ v repozitáři vizeon-autopilot (Growth OS). Než začneš, přečti `../AGENTS.md`,
`AGENTS.md`, `../STAV.md`, `../memory/memory.md` a `../docs/06-rozhodnuti-a-otevrene.md`
(D-103, D-105, D-107). Pravidla repa platí: čeština, větev `claude/<téma>` ve vlastním worktree,
push = nasazení, takže **push, odesílání e-mailů a hovory jen na pokyn Kryštofa**, testy `npm test`
(zdarma), testy v ElevenLabs ne. Cizí necommitnuté změny v hlavním worktree nepřepisuj.

## Co je špatně

Když volaný v hovoru řekne „pošlete to na jiný e-mail" (nebo e-mail chyběl), agent ho uloží
do sběru dat jako `email_jiny` (`voice/data_collection.json`). Pak:

1. `src/booking.mjs` → `planPostCall` ho **použije** pro e-mail s ukázkou — správně.
2. Ale do `leads.email` ho **nikdo nezapíše**. Další e-maily (připomínka, follow-up) i další
   hovor (`{{email}}`) jedou se starou adresou z importu, nebo s žádnou.
3. Snímek pro ZakazIQ (`src/zakaziq-snapshot.mjs`) posílá `email: email(lead.email)`, tedy
   tu starou. V `calls[].collected` je nadiktovaný e-mail zakrytý na `[e-mail]` (funkce
   `scrub`), takže ho ZakazIQ nemá odkud vzít.

Výsledek u Kryštofa: klient řekl „jasně, pošlete", e-mail nadiktoval, ale v adminu ZakazIQ
(AI asistent, Kontakty, Hovory, okno schůzky) je prázdno nebo stará adresa a musí ho opisovat
z přepisu.

## Co udělat

1. **Po hovoru se souhlasem zapiš nadiktovaný e-mail k firmě.** Na místě, kde webhook ukládá
   výsledek hovoru (`src/call-result.mjs`), když `outcome = accepted` a `email_jiny` projde
   stejnou kontrolou jako v `planPostCall` (`EMAIL_RE`, malá písmena, bez mezer): `UPDATE leads
   SET email = ?` a zapiš událost (např. `lead.email_changed` se starou a novou adresou, bez
   textu hovoru). Idempotentně: stejné `conversation_id` podruhé nic nezmění.
   - Neplatný nebo prázdný `email_jiny` nic nepřepíše.
   - Firma na seznamu „nevolat" se nemění.
2. **Snímek pak pošle nový e-mail sám**, protože čte `lead.email`. Zkontroluj, že se firma po
   takovém hovoru dostane do nejbližší synchronizace (`touched` v dotazu snímku musí změnu
   e-mailu zachytit — jinak ji tam přidej).
3. **`collected` nech zakrytý.** Kontakt patří do `email`, ne do dat z hovoru.
4. Rozhodnutí zapiš jako nové `D-xxx` (číslo podle `docs/06-rozhodnuti-a-otevrene.md`)
   a testy do `tests/` (hovor se souhlasem a `email_jiny` → `leads.email` je nový; bez souhlasu
   nic; neplatný e-mail nic; snímek nese nový e-mail).

## Co se stane v ZakazIQ (nic tam neměň)

ZakazIQ (R-141) bere `email` ze snímku takhle: firma, která řekla ano, má kontakt. Nový e-mail
od Growth OS se do kontaktu propíše, **když kontakt pořád drží ten, který Growth OS poslal
minule** (nebo žádný). Pokud Kryštof e-mail mezitím opravil ručně v Kontaktech, jeho oprava
zůstane. Z kontaktu se pak propíše do Hovorů, zakázek a budoucích schůzek.

## Hotovo, když

- `npm test` prochází,
- zkušební webhook (`scripts/test-webhook.mjs`) se souhlasem a `email_jiny` změní `leads.email`
  a snímek (`npm run zakaziq:sync -- --dry-run` nebo ekvivalent) ho nese v poli `email`,
- nic se nepushlo bez Kryštofa.
