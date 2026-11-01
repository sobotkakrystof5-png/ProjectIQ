# KP04 — Hlášení z Claude Code do systému

## Cíl
Když Kryštof dokončí práci v projektu klienta v Claude Code, systém dostane srozumitelné hlášení jako koncept. Kryštof nic nepíše, jen schválí. Klíč každého projektu umí jen zapsat koncept do toho jednoho projektu.

## Než začneš
Rituál začátku (`zakaziq-memory`). Přečti `docs/klientsky-prostor/PLAN.md` 4.3 a 5, výsledek KP03 v paměti (`lib/project-activity.ts`, `redactSensitive`), `lib/ws/keys.ts` (HMAC s pepřem, výpis klíče jednou), `lib/api-auth.ts`, `lib/api-rate-limit.ts`, `docs/workspace/API.md` a skill `zakaziq-napojeni` (vzor, jak se klíč dostává do cizího projektu).
Skilly: `zakaziq-workspace-backend`, `web-security-review`, `web-security-memory`, `zakaziq-ux-texty-cs`.
**Zadání výslovně povoluje změny v:** detailu zakázky (záložka Nastavení napojení nebo sekce Přehled), novém `app/api/agent/v1/…`, `proxy.ts` jen pokud je potřeba (rate limit či výjimka pro `/api/agent`, zapsat do CSP/DECISIONS).

## Kroky
1. **Klíče (migrace, první volné číslo).** `project_agent_keys`: `id`, `project_id`, `prefix` (jedinečný), `key_hash` (HMAC-SHA256 s `WS_KEY_PEPPER` nebo nový `AGENT_KEY_PEPPER` — rozhodni a zapiš), `created_at`, `last_used_at`, `revoked_at`. Formát `zk_agent_<prefix>_<tajemství>`. Ukáže se jednou. **Jen připravit migraci.** Logika vzorem `lib/ws/keys.ts` (porovnání v konstantním čase, bez pepře selže zavřeně), vlastní soubor `lib/agent-keys.ts`.
2. **Endpoint** `POST /api/agent/v1/projects/{projectId}/reports`: `Authorization: Bearer`, Zod (`title` ≤ 160, `body` ≤ 4000, `kind` ∈ hotovo/rozpracováno/otázka), klíč musí patřit tomu projektu, rate limit na klíč (např. 20/hodinu) a na IP, `contains_sensitive` a zakrytí přes `redactSensitive`, uložení vždy jako `draft` se `source = claude_code`. Odpověď jen `{ ok: true, id }`. Chyby bez detailů (401/404 neprozradí, jestli projekt existuje). CORS ne.
3. **Spravovat klíč v adminu.** V detailu zakázky: Vytvořit klíč · Otočit · Zneplatnit, datum posledního použití, jednorázové zobrazení. Audit (kdo a kdy).
4. **Skript pro projekt klienta** `scripts/zakaziq-report.mjs`: bez závislostí, čte `ZAKAZIQ_AGENT_KEY` a `ZAKAZIQ_PROJECT_ID` z prostředí, odešle `title` a `body` z argumentů nebo stdin, nic nestahuje a nespouští. Výstup krátký (`Hlášení odesláno ke schválení`). Nikdy nelogovat klíč.
5. **Skill `zakaziq-hlaseni`** v `.claude/skills/` (a po `sync-agent-context` kopie pro Codex): kdy hlásit (po dokončené změně, ne po každém příkazu), jak psát pro laika (co se změnilo, co to znamená pro klienta, co dál; žádný diff, názvy souborů, příkazy ani cesty), příklad. Do skillu odkaz na `zakaziq-ux-texty-cs` pravidla.
6. **Návod pro nový projekt** (`docs/klientsky-prostor/NAPOJENI-CLAUDE-CODE.md`): krok za krokem, jak v repu klienta přidat skript, env a pravidlo do `CLAUDE.md` („na konci práce zavolej…“), volitelný hook `Stop` nebo `SessionEnd` jako pojistka. Přesná pole hooku ověř v aktuální dokumentaci před zápisem a uveď zdroj.
7. **Tlačítko „Zkopírovat nastavení pro Claude Code“** v adminu: vygeneruje blok pro `CLAUDE.md` klientského projektu (bez klíče, jen název proměnné).
8. **Testy:** klíč jiného projektu je odmítnutý; zneplatněný klíč je odmítnutý; rate limit; délky; citlivý řetězec zakrytý a příznak nastavený; klíč není v odpovědi, logu ani auditu; endpoint nic nepublikuje.
9. **Bezpečnost.** `web-security-review` celého endpointu, zápis do `.claude/security/DECISIONS.md` (klíč s právem jen zápisu konceptu, přijatá rizika) a `STATE.md`. Paměť: changelog, `docs/AGENTS-REFERENCE.md` (env, API), `.env.example` (pepř), stav v plánu.

## Hotovo, když
- Z terminálu v testovacím projektu skript odešle hlášení a v adminu se objeví koncept; po schválení ho uvidí klient na `/p`.
- Klíč jiného projektu ani zneplatněný klíč nic nezapíše.
- Migrace připravená (aplikace: Kryštof), testy a `tsc` procházejí, neověřené věci jsou v paměti výslovně.

## Konec sezení
`zakaziq-memory` → Konec sezení (migrace: aplikována ne). Commit na požádání, např. `ws/hlaseni: klíče projektu a příjem hlášení z Claude Code`.
