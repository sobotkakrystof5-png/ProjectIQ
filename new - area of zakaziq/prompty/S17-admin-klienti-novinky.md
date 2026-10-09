# S17 — Admin konzole: Klienti a Novinky

## Cíl
V admin konzoli přibudou **dvě nové stránky**, nic stávajícího se nezmění:
`/dashboard/klienti` (přehled účtů Workspace) a `/dashboard/novinky` (psaní novinek).

## Než začneš
Rituál začátku. Načti `zakaziq-workspace-backend`. Přečti `docs/admin/AGENTS-ADMIN.md` (dřív `AGENTS.md` → Část A) a
`app/dashboard/layout.tsx`. Toto je jediné sezení, kde smíš do `app/dashboard/` **přidat**
soubory; existující neměň kromě jednoho řádku navigace (nové položky).

## Kroky
1. `/dashboard/klienti` (vzhled admin konzole, ne Dílky): seznam účtů (název, obor, byznysy,
   stav předplatného, poslední aktivita, poptávek za 30 dní, napojený web ano/ne), detail účtu.
   Čtení přes admin roli se `SELECT` na `ws` (S06), žádný zápis do cizích dat kromě akcí níže.
2. Akce: **pozvat klienta** (Clerk pozvánka + předvyplněný účet a byznys ze šablony, když mu
   stavím web), **vygenerovat klíče a prompt pro Claude Code** pro jeho web (stejná logika jako
   S11), poznámka k účtu. Každá akce do `ws.audit_log` s „provedl admin".
3. `/dashboard/novinky`: nadpis, krátký text, obrázek, odkaz, štítek (Nové/Vylepšení/Oprava),
   náhled v aplikaci i v e-mailu, „Zveřejnit v aplikaci", „Poslat e-mailem všem" (s potvrzením
   počtu příjemců, odhlášení respektovat). Text projdi `humanize-text-cs` (tlačítko „Učesat text"
   jen jako návod v UI, ne AI volání — rozhodni a zapiš).
4. Navigace adminu: přidat 2 položky, nic jiného.
5. Test: admin bez NextAuth session se k ničemu nedostane; klient Workspace na `/dashboard/*` ne.

## Hotovo, když
- Klienta pozvu, založím mu byznys a získám prompt pro jeho web bez SQL.
- Novinka se objeví v aplikaci klientů a odejde e-mailem.
- Zbytek admin konzole beze změny (`git diff` jen nové soubory + navigace).

## Konec sezení
`zakaziq-memory` → Konec sezení. Commit `admin: klienti a novinky`.
