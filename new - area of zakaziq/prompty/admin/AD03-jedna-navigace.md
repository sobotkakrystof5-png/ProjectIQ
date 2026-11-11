# AD03 — Jedna navigace, jeden přehled

## Cíl
Konec dvou navigací a tří layoutů. Hub se ruší, jeho zbytek se vlije do hlavního menu.
Dnes dostane odpověď na otázku „jak se mi daří".

## Než začneš
Rituál začátku (`zakaziq-memory`). Přečti `docs/admin/MODERNIZACE-ADMIN-PLAN.md` → AD03.
Platí **R-087** — mění R-081 v části „Hub je v rozsahu modernizace". Hub se nemoderniuzje, ruší se.
Společná pravidla: `00-README.md`. Navazuje na AD02.

## Kroky

### 1. Přesun obrazovek z Hubu
| Odkud | Kam |
|---|---|
| `/hub/finance` | `/dashboard/finance` |
| `/hub/projekty` (+ `/new`, `/[id]`) | `/dashboard/projekty` |
| `/hub/byznys/startup` (+ `/new`, `/[id]`) | `/dashboard/startup` |
| `/hub/byznys` | zaniká — jeho čísla jsou na Dnes |
| `/hub` | zaniká — přesměruje na `/dashboard` |

Smaž `components/HubSidebarNav.tsx`, `app/hub/layout.tsx` a `app/hub/page.tsx`.
**Trvalá přesměrování `/hub/*`** — adresy jsou v e-mailech a v `notifications.link`.

> `app/dashboard/projekty/**` (559 ř., mrtvý duplikát po R-007) se **maže** (rozhodnutí B),
> takže cesta `/dashboard/projekty` je volná pro přesunutý Hub. Ověř, že se nepřetáhne starší
> verze `projekty-actions.ts` — liší se od té v `app/hub/projekty/`.

### 2. Jedna navigace v `lib/admin-nav.ts`
```
PŘEHLED   Dnes
PRÁCE     Zakázky · Poptávky · Hovory · Kalendář · Kontakty
PENÍZE    Faktury · Náklady · Finance a daně
OSOBNÍ    Projekty · Startup
          Oznámení · Profil
```
**Zůstávají** Klientský prostor, Klienti Workspace a Novinky — patří k SaaS, ne k osobnímu systému.
**Kontakty** jsou zatím prázdná položka (naplní je AD09) — nebo ji přidej až tam, ať menu neslibuje,
co neexistuje. Rozhodni a napiš proč.
Uprav `ADMIN_MOBILE_TABS` i `OLD_MENU_PATHS` v `lib/__tests__/admin-nav.test.ts`.

### 3. Dnes dostane pravý sloupec
K dnešním sekcím (`lib/admin-today-queries.ts`) přibude **„Jak se daří tenhle měsíc"**:
příjem a z toho přiznaný, nezaplacené faktury, odhad daně a měsíční rezerva.
Čísla z existujících `getBusinessIncome` (`app/hub/finance/finance-actions.ts`), `calculateTax`
(`lib/tax.ts`) a `getInvoices` — **žádná nová logika**, jen přesun tam, kam se Kryštof dívá.
Na telefonu pod sebou, na počítači vedle „Co hoří".

### 4. Ověření
`npx tsc --noEmit`, `npm test`, `npm run build`. V prohlížeči: každá stará adresa `/hub/*`
přesměruje; menu vypadá stejně na 390 i 1440 px; Dnes ukazuje skutečná čísla z testovacích dat.

## Hotovo, když
- `app/hub/` neexistuje a všechny staré adresy přesměrují (ověř i `/hub/plany`, `/hub/school`,
  `/hub/sport` — po AD01 už neexistují, ať nevrací 500).
- Menu má jednu podobu; `components/HubSidebarNav.tsx` je pryč.
- Dnes ukazuje měsíční čísla a odkazy vedou na správné nové adresy.
- `npm test`, `tsc` i build zelené.

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav AD03 v plánu, changelog, R-087 ověřit v paměti.
Commit `admin/navigace: zrušení Hubu, jedna navigace, Dnes s čísly`.
