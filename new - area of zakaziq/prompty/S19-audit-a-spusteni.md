# S19 — Bezpečnostní audit a spuštění

## Cíl
Před spuštěním pro veřejnost projde celý projekt bezpečnostním auditem a revizí kódu,
CSP přejde do vynucujícího režimu a máme kontrolní seznam spuštění.

## Než začneš
Rituál začátku. Načti `web-security-audit`, `web-security-review`, `web-security-memory`,
`zakaziq-workspace-backend`. Přečti `.claude/security/*`.

## Kroky
1. **`web-security-review`** nad kódem Workspace: oddělení účtů (každý dotaz má `account_id`),
   veřejné API a klíče, webhooky (podpisy, idempotence), podepsané odkazy v e-mailech, portál,
   upload faktur, rate limity, logy bez osobních údajů a klíčů. Nálezy opravit nebo zapsat.
2. **`web-security-audit`** nad nasazeným preview: hlavičky, CSP, cookies, TLS, security.txt.
   CSP z Report-Only na enforcing (postup ze `web-security-setup`, krok 4), projít web
   i aplikaci v Chrome i Safari. Výsledek do `AUDIT-LOG.md`.
3. Stripe z test na live: nová cena, webhooky, Customer Portal, daňové doklady — postup
   v `SETUP.md`, **živé klíče zadám já**, nikdy do repa.
4. Clerk produkční instance, doména, e-mailová doména (SPF/DKIM/DMARC ověřené).
5. Monitoring: chyby (Vercel), selhané webhooky, nedoručené e-maily, upozornění pro admina.
6. **Kontrolní seznam spuštění** `docs/workspace/LAUNCH.md`: právní texty doplněné, ceny a DPH,
   zálohy DB, obnova ze zálohy vyzkoušená, první pilotní klient, způsob podpory.
7. `HSTS preload` jen zapsat jako otevřenou položku na později (podle skillu).

## Hotovo, když
- Žádný otevřený nález vysoké závažnosti, CSP vynucující, audit zapsaný.
- `LAUNCH.md` je odškrtnutý kromě věcí, které dělám já (klíče, právní texty).

## Konec sezení
`zakaziq-memory` → Konec sezení, `memory/memory.md` → Aktuální stav: fáze = spuštěno / pilot. Commit `release: připraveno ke spuštění`.
