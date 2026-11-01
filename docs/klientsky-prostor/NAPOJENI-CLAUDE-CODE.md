# Napojení projektu klienta na hlášení z Claude Code

Cíl: po dokončené práci v projektu klienta vznikne v ZakazIQ **koncept hlášení**. Kryštof ho v detailu zakázky (Aktivita) jedním klikem schválí a klient ho uvidí na svém přehledu. Klíč projektu umí **jen uložit koncept do jednoho projektu**; nic nečte, nic nemění a nic nepublikuje.

## Jednorázově v ZakazIQ

1. V prostředí aplikace (Vercel i `.env.local`) musí být `AGENT_KEY_PEPPER` (min. 32 znaků, `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). Bez něj klíč nejde vytvořit ani ověřit.
2. Migrace 093 (`project_activity`) a 094 (`project_agent_keys`) musí být aplikované (aplikuje Kryštof).

## Pro každý projekt klienta

1. **Klíč.** V adminu otevřete zakázku → Napojení Claude Code → **Vytvořit klíč**. Klíč se ukáže jednou, zkopírujte ho. Ztracený klíč se neobnovuje, otočí se na nový (starý přestane platit).
2. **Skript.** Zkopírujte `scripts/zakaziq-report.mjs` z repa ZakazIQ do `scripts/` v projektu klienta. Skript nemá závislosti, jen odesílá, nic nestahuje ani nespouští. Potřebuje Node 18+.
3. **Proměnné prostředí** (jen lokálně u vás, nikdy do gitu; klíč nesmí do repa klienta ani do `.env`, který se commituje):
   ```
   ZAKAZIQ_URL=https://<adresa aplikace ZakazIQ>
   ZAKAZIQ_PROJECT_ID=<id zakázky>
   ZAKAZIQ_AGENT_KEY=<klíč>
   ```
   Tlačítko **Zkopírovat nastavení pro Claude Code** v adminu připraví první dva řádky a text pro `CLAUDE.md` (bez klíče).
4. **Pravidlo do `CLAUDE.md` projektu klienta.** Vložte blok z tlačítka výše („Hlášení klientovi (ZakazIQ)"). Claude Code pak na konci práce hlášení pošle sám. Doporučený je i skill `zakaziq-hlaseni` (zkopírujte `.claude/skills/zakaziq-hlaseni/` do projektu) – obsahuje pravidla, jak psát pro laika.
5. **Zkouška.** `node scripts/zakaziq-report.mjs --title "Zkouška" --body "Zkušební hlášení"`. V adminu se objeví koncept; zamítněte ho.

## Volitelná pojistka: připomenutí na konci sezení

Hook `SessionEnd` umí jen zobrazit zprávu, sezení nezablokuje. Do `.claude/settings.json` projektu klienta:

```json
{
  "hooks": {
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Poslali jste klientovi hlášení? node scripts/zakaziq-report.mjs --title ... --body ...' >&2; exit 2",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

Hook `Stop` s `exit 2` by Claude Code nenechal skončit, dokud hlášení neodešle, a hrozí smyčka; nepoužívejte ho bez kontroly, zda už hlášení odešlo.

Ověřeno v dokumentaci hooků (2026-11-01): struktura událost → skupina → handler, pole `type`, `command`, `timeout`; `SessionEnd` neblokuje a má sdílený rozpočet 1,5 s (`timeout` jde zvednout), `Stop` s kódem 2 pokračuje v konverzaci. Pole vstupu (stdin) pro `Stop`/`SessionEnd` jsem nečetl celá, hook je proto napsaný bez nich. Zdroj: <https://code.claude.com/docs/en/hooks>. Před nasazením vyzkoušejte na testovacím projektu.

## Bezpečnost

- Klíč patří jen do prostředí u vás. Uniklý klíč v adminu zneplatněte (Zneplatnit) a vytvořte nový.
- Server zakrývá klíče, tokeny, připojovací řetězce, řádky z `.env` a cesty v domovské složce; takové hlášení nejde schválit bez úpravy.
- Limity: 20 hlášení za hodinu na klíč, 60 volání za hodinu na IP. Délky: nadpis 160, text 4000 znaků.
- Podrobnosti a přijatá rizika: `.claude/security/DECISIONS.md` (záznam o klíči projektu).
