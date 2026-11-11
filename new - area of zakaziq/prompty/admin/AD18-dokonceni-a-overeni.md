# AD18 — Dokončení sjednocení, modály a závěrečné ověření

## Cíl
Nezbyla stará vizuální vrstva, modály mají focus trap a čísla se dají porovnat s výchozím měřením.

## Než začneš
Rituál začátku. Přečti plán celý, hlavně sekce 6 (stav) a 11 (naměřeno).
Skilly: `zakaziq-design-dilky`, `web-security-review`.

## Kroky
1. **Doběh mechanického sjednocení** ve zbylých souborech (přes `git grep`, po oblastech):
   `text-muted-foreground` → `text-quiet` (výchozí stav 1057×), `bg-white` → `bg-surface` (302×),
   `rounded-xl|2xl|lg` → `rounded-chip|box|panel` (710×), duhové `bg-{barva}-NNN` → tóny
   z `lib/admin-status.ts` (477×), šedé škály (`gray`, `slate`, `zinc`, `neutral`, `stone`).
2. **Modály.** Devět ručně psaných `fixed inset-0` bez focus trapu (`AiAssistantModal`,
   `AdminEventModal`, `BookingModal`, `InvoiceUploadModal`, `PortfolioEmailModal`,
   `ConsultationCalendar`, `SmartCalendar`, `app/hub/school/{AddGradeModal,AddDeadlineModal}.tsx`)
   → `components/ui/dialog.tsx` / `sheet.tsx`. Radix řeší focus trap, `Escape` i `aria-modal`.
   Funguje díky `PortalContainerProvider` z AD04.
3. **`.brand-gradient` smazat** z `app/globals.css` (dočasný alias z AD04) a dořešit posledních
   44 výskytů.
4. **Přístupnost a klávesnice:** průchod tabulátorem na denních obrazovkách, viditelný focus,
   kontrast drobných popisků, `prefers-reduced-motion`.
5. **Měření po** do plánu, sekce 11, stejným postupem jako v AD00. Nepiš číslo, které nevzniklo
   měřením; absolutní milisekundy jen z produkce po deployi.
6. **Dokumentace a paměť:** `docs/admin/AGENTS-ADMIN.md` (kostra, nové tabulky, `lib/admin/db.ts`,
   `data-table`, kontakty, fakturace, asistent, paměť), changelog a stav v `memory/memory.md`,
   řádky v `memory/index.md`. `web-security-review` a `node scripts/sync-agent-context.mjs --write` + `--check`.
7. **Deploy** navrhni, ale **nepouštěj bez výslovného souhlasu**.

## Hotovo, když
- `admin-classes.test.ts` má strop **0** u `brand-`, `bg-white` a `muted-foreground`.
- `git grep 'fixed inset-0'` nenajde modál bez Radixu.
- Tabulka v sekci 11 má čísla před i po; testy, `tsc` a `build:check` zelené.
- `AGENTS-ADMIN.md` popisuje skutečný stav kódu.

## Konec sezení
`zakaziq-memory` → Konec sezení. Uzavři tabulku stavu v plánu, zapiš, co zůstalo vědomě nedořešené.
Commit `admin/vzhled: dokončení sjednocení a závěrečné ověření`.
