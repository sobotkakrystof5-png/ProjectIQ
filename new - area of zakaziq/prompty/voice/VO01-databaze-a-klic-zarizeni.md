# VO01 — Databáze a klíč zařízení

> Sezení pro Claude Code v kořeni repa ZakazIQ, větev `admin/zakaziq-voice`. Jde kdekoli.

## Cíl jednou větou

Připravit tabulky ZakazIQ Voice (migrace 138) a v adminu stránku, kde si Kryštof vytvoří klíč
pro svůj Mac — klíč se ukáže jednou a jde zneplatnit.

## Než začneš

1. Skill `zakaziq-memory` (začátek), pak `zakaziq-workspace-backend`.
2. Přečti `docs/admin/VOICE-PLAN.md` oddíly 2, 6 a 7 a R-150 v paměti.
3. Podívej se na vzory: `lib/agent-keys.ts` a `lib/client-web/keys.ts` (klíč s pepřem),
   `components/admin/web-key-panel.tsx` (klíč ukázaný jednou), `lib/admin/db.ts`,
   `lib/__tests__/helpers/admin-pglite.ts`, `lib/admin-nav.ts`, `components/admin/card.tsx`.
4. Návrh z jiného sezení: `new - area of zakaziq/prompty/voice/podklady/navrh-serveru/`
   (`138_zakaziq_voice.sql.txt`, `keys.ts.txt`, `store.ts.txt`). Neověřený; vyjdi z něj, kde
   sedí s plánem.

## Rozsah

- `migrations/138_zakaziq_voice.sql` (číslo ověř proti `ls migrations`): všech sedm tabulek
  z plánu, oddíl 6, včetně vestavěných blokovaných frází a výchozích nastavení
  (`styles`, `typing_wpm` 40, `text_retention_days` NULL = natrvalo (D-V7, R-150), `cleanup_enabled`, `auto_learn_terms`,
  `store_text` true, `daily_cost_cap_usd` 1). Idempotentní, jen nové tabulky.
- `lib/admin/voice/keys.ts`: `zk_voice_<prefix>_<tajemství>`, HMAC-SHA256 s `AGENT_KEY_PEPPER`
  a doménou `voice:`, porovnání `timingSafeEqual`, bez pepře selže zavřeně.
- `lib/admin/voice/devices.ts`: vytvořit (vrátí klíč jen jednou), seznam, zneplatnit,
  `resolveDevice(key)` (najde podle prefixu, ověří HMAC, zneplatněný nepustí), `touchDevice`.
- Admin: `app/dashboard/voice/page.tsx` se zatím **jedinou** záložkou **Nastavení → Zařízení**
  (zbytek stránky staví VO10): seznam zařízení (název, prefix zakrytý, vytvořeno, naposledy
  použito, stav), „Přidat zařízení" (název, např. „MacBook"), klíč ukázaný jednou s tlačítkem
  Zkopírovat a větou „Klíč se už znovu neukáže. Vložte ho do aplikace ZakazIQ Voice.",
  „Zneplatnit" se Zpět v toastu. Server actions v `app/voice-actions.ts` se Zodem, výsledek
  `Result`, `requireAdminPage()` na stránce, `requireAuth` v akcích.
- Položka menu **ZakazIQ Voice** ve skupině Osobní (`lib/admin-nav.ts`, ikona mikrofonu
  v `components/admin/admin-icons.tsx`). Uprav test menu, pokud počítá položky.

## Mimo rozsah

Příjem diktátu (VO02), statistiky (VO10), aplikace na Macu.

## Testy

- `lib/__tests__/voice-schema.test.ts` (PGlite): migrace dvakrát po sobě bez chyby, vestavěné
  fráze a nastavení vložené jednou, `CHECK` odmítne špatný stav a kategorii, unikátní
  `(kind, lower(term))`.
- `lib/__tests__/voice-keys.test.ts`: formát klíče, ověření, špatný klíč, zneplatněný,
  bez pepře výjimka, dva klíče nikdy stejný otisk, klíč projektu (`lib/agent-keys.ts`)
  nedá stejný otisk.
- Test číslování migrací `lib/ws/__tests__/ws-schema.test.ts` a `lib/__tests__/admin-nav.test.ts`
  musí projít.

## Migrace na testovací Neon

Aby šel ve VO03 vytvořit skutečný klíč, potřebuje testovací Neon („ZakazIQ RD test", na který
míří `.env.local`) migraci 138. **Zeptej se Kryštofa**; se souhlasem
`node scripts/apply-migration.js migrations/138_zakaziq_voice.sql`. Bez souhlasu nech stránku
odolnou proti chybějící tabulce (prázdný stav „Databáze ještě nemá tabulky ZakazIQ Voice") a
napiš to do Otevřených problémů.

## Ověření v prohlížeči

`npm run dev`, přihlášení do adminu, `/dashboard/voice`: přidat zařízení, klíč se ukáže,
po obnovení stránky už ne, zneplatnit a Zpět. 390 a 1280 px. Co nešlo (třeba přihlášení),
napiš.

## Hotovo, když

- Migrace 138 je v repu, test v PGlite prochází dvakrát po sobě.
- Klíč zařízení jde vytvořit a zneplatnit v adminu, v DB je jen prefix a otisk.
- `npx tsc --noEmit`, `npm test`, `npm run build:check` prošly.
- `.claude/security/DECISIONS.md` má **#057 ZakazIQ Voice — klíč zařízení** (číslo ověř):
  co klíč smí, kde leží, jak se zneplatní, přijatá rizika. `STATE.md` řádek. Sync `--write`
  a `--check`.
- `docs/admin/AGENTS-ADMIN.md` má oddíl „ZakazIQ Voice" (tabulky, klíč, stránka).

## Konec sezení

`web-security-review` na změnu. Skill `zakaziq-memory` (changelog: migrace 138 aplikovaná:
ne / testovací Neon ano-ne). Stav VO01 v plánu. Commit `feat: voice databáze a klíč zařízení`.
