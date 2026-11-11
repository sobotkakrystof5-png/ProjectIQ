# AD00 — Příprava: větev, zelené testy, viditelný admin, měření

## Cíl
Admin konzole je vidět v prohlížeči na testovacích datech, `npm test` je zase pojistka a máme výchozí
čísla, proti kterým se pak měří rychlost.

## Než začneš
Rituál začátku (`zakaziq-memory`): `git status`, `memory/index.md`, `memory/memory.md`, `memory/pravidla.md`.
Přečti `docs/admin/MODERNIZACE-ADMIN-PLAN.md` (celý) a `docs/admin/AGENTS-ADMIN.md`.
Společná pravidla: `new - area of zakaziq/prompty/admin/00-README.md`.
**Potřebuje rozhodnutí A** (větev a cesta na produkci, plán sekce 8). Bez něj se zeptej hned a nic nedělej.

## Kroky
1. **Větev** podle rozhodnutí A. Nepouštěj žádný merge ani deploy bez výslovného souhlasu —
   `ws/redesign-app` → `main` je fast-forward a znamená nasazení celého launche.
2. **Zelené testy.** Do `vitest.config.ts` přidej `test.exclude` na `**/.claude/worktrees/**`
   (dnes vitest sbírá 11 starých worktree: 494 souborů, 62 padajících, 161 s; bez nich 58 souborů,
   721 testů zelených, 23 s). Ověř `npm test`.
3. **Admin tabulky na testovací Neon.** `.env.local` míří na „ZakazIQ RD test“ (větev `rd-test`), kde
   admin tabulky nejsou — proto dnes admin lokálně padá. Aplikuj migrace 001–063 a adminové části
   092–096 cyklem přes **`scripts/apply-migration.js`** (jednotné číslo, obecný běhoun; `apply-migrations.js`
   v množném je jednorázovka pro 007/008, nepoužívej ji). Nejdřív `--dry`. Pracuješ na **testovací** DB.
4. **Evidence migrací.** Běhounu přidej tabulku `schema_migrations` (název souboru, čas, hash) a zapisuj
   do ní. Zavírá to dávno otevřený problém „neexistuje evidence aplikovaných migrací“.
5. **Ukázková data.** Nový `scripts/admin-seed.mjs` + `lib/admin/demo-seed.ts` podle `scripts/ws-seed.mjs`
   (R-041): dry-run výchozí, `--ano` zapisuje, `--smazat`, data označená (`[ukázková data]`, telefony
   `+420000000xxx`, e-maily `@example.cz`), cizích řádků se nedotkne, skript vypíše host DB.
   Obsah: 2 zakázky VIZEON + 1 ALTENO, 8 leadů ve všech stavech, 12 termínů kolem dneška, 6 faktur
   (2 po splatnosti), náklady, dotazník, 3 projekty Hubu.
6. **Měření před** do plánu, sekce 11: počet kol do DB na navigaci (čítač v testu, v kódu nezůstane)
   a `route-bundle-stats.json` z `next build`. Milisekundy z lokálu nepiš jako produkční čísla.
7. **Mrtvá routa.** `app/dashboard/projekty/**` (559 ř.) je duplikát `app/hub/projekty` a odkazuje jen
   sám na sebe. Podle rozhodnutí B smaž, nebo přesměruj na `/hub/projekty`. Zeptej se, pokud B nemáš.
8. **Paměť.** Rozhodnutí R-081–R-085 i řádky v `memory/index.md` jsou už zapsané (2026-11-10)
   — jen ověř, že souhlasí se skutečností, a doplň changelog za tohle sezení.

## Hotovo, když
- `npm run dev` + přihlášení ukáže Dnes, zakázky, hovory, kalendář a faktury s ukázkovými daty.
- `npm test` je zelený a neběží proti worktree; `npx tsc --noEmit` prochází.
- Výchozí čísla jsou v plánu v sekci 11, rozhodnutí R-081–R-085 v paměti.
- Seed umí svoje data smazat a bez `--ano` nic nezapíše.

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav AD00 v plánu (sekce 6), changelog v `memory/memory.md`.
Commit `admin/priprava: testovací data, zelené testy, výchozí měření`.
