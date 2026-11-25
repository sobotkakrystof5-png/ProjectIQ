# VO12 — Nasazení, ostrý týden a ladění (milník 4)

> Sezení pro Claude Code na **MacBooku**, v kořeni repa ZakazIQ, větev `admin/zakaziq-voice`.
> Má dvě části: nasazení (první den) a vyhodnocení po týdnu (stejný prompt znovu, Claude
> pozná podle paměti, kde je).

## Cíl jednou větou

ZakazIQ Voice běží proti produkci, Kryštof ho týden opravdu používá a podle čísel se doladí
pojistky, čištění a učení.

## Než začneš

1. Skill `zakaziq-memory` (začátek). Zjisti z paměti, jestli jde o **nasazení**, nebo
   o **vyhodnocení po týdnu**.
2. Plán `docs/admin/VOICE-PLAN.md` oddíly 14 (stav všech sezení), 11, 13 a 16.
3. `.claude/security/STATE.md` a `DECISIONS.md` #055.

## Část A — nasazení

Každý krok, který mění produkci, jen se **souhlasem Kryštofa v konverzaci**; zeptej se po
jednom a řekni, co přesně se stane.

1. Kontrola větve: `npx tsc --noEmit`, `npm test`, `npm run build`, `make -C voice-mac test app`,
   regresní kontrola `/login`, `/dashboard`, `/dashboard/finance`, `/p/[token]` (B12).
   `web-security-review` na celý rozdíl větve proti `main`.
2. **Migrace 136 na produkci** — se souhlasem: buď ji pustí Kryštof, nebo agent přes Neon
   MCP v jedné transakci se zápisem do `public.schema_migrations` (jako u migrací 130–135).
   Ověř tabulky a výchozí řádky čtením.
3. **`GROQ_API_KEY` do Vercelu Production** jako sensitive — vloží Kryštof (nebo agent přes
   CLI ze stdin, hodnota se nikde nevypíše). Ostatní nové proměnné jen pokud se liší od výchozích.
4. **Merge do `main` a push** (= produkční deploy) — se souhlasem. Fast-forward, žádný force.
5. Po nasazení: `POST /api/public/voice/dictate` bez klíče 401, s `Origin` 403, `/dashboard/voice`
   307 na přihlášení, `/`, `/login` 200, běhové chyby ve Vercelu (`get_runtime_errors`) 30 min.
   `web-security-audit` na živé adrese.
6. Kryštof v produkčním adminu vytvoří zařízení „MacBook", v aplikaci přepne adresu na
   `https://www.zakaziq.cz`, vloží nový klíč, Vyzkoušet připojení. Starý vývojový klíč
   v aplikaci smazat.
7. `make -C voice-mac app install` z `main`, Spustit po přihlášení zapnout.
8. Zapiš do paměti: na produkci od data a commitu, migrace 136 aplikovaná, co je ověřené
   a co ne. Otevřený problém „Vyhodnotit týden ZakazIQ Voice" s datem za 7 dní.

## Část B — vyhodnocení po týdnu

1. Z produkce (jen čtení, se souhlasem): počet diktátů a slov za den, stavy, pojistky podle
   kódu, `raw` a proč, latence p50/p95 (`total_ms`), náklady za den, podíl opravených
   diktátů po dnech, co se naučilo samo, návrhy čekající na schválení. Text diktátů
   nečti, stačí čísla a kódy (osobní obsah).
2. S Kryštofem projdi: co ho štvalo, kde vložení nefungovalo, kde si přepis vymýšlel.
3. Laď jen to, co čísla ukážou: prahy G2/G5/G7/G8, nové blokované fráze, styl kategorií,
   práh čištění krátkých diktátů, výchozí poskytovatel. Každou změnu doplň do zlaté sady
   (VO07) a zdůvodni v paměti.
4. Je-li p50 nad 1,5 s, změř, kde čas leží (přepis, čištění, síť) a navrhni řešení
   (bez čištění pro krátké, přepis přímo z Macu podle D-V2 — to je nové rozhodnutí).
5. Uzavři plán: oddíl 14 všechno hotovo nebo s poznámkou, oddíl 16 odškrtnout, co platí.

## Hotovo, když

- ZakazIQ Voice běží proti produkci, migrace 136 a env jsou venku, bez běhových chyb.
- Po týdnu jsou čísla v paměti, ladění je v kódu i ve zlaté sadě a plán je uzavřený.
- Nic, co se neověřilo, není označené za hotové.

## Konec sezení

Skill `zakaziq-memory` (changelog, Aktuální stav, Otevřené problémy). `.claude/security/`
podle nasazení (STATE, AUDIT-LOG), sync. Commit na `main` jen se souhlasem, zpráva
`feat: voice …` / `docs: voice vyhodnocení týdne`.
