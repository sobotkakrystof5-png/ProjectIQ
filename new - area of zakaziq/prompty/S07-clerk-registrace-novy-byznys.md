# S07 — Clerk, registrace a založení byznysu

## Cíl
Z landing page se dá zaregistrovat (e-mailový kód nebo Google), založit účet a první byznys
podle oboru a dostat se do `/w`. Admin přihlášení přes NextAuth dál funguje.

## Než začneš
Rituál začátku. Načti `zakaziq-workspace-backend`, `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`.
Podívej se na mockup C5 (Nový byznys) — vzhled podle Dílků, rozložení podle C5.

## Kroky
1. `@clerk/nextjs` (verzi kompatibilní s Next 14 ověř), `ClerkProvider` jen v `app/w/layout.tsx`
   a v registračních stránkách. Clerk Organizations zapnuté, přihlášení jen e-mailový kód
   + Google, bez hesla. Vzhled Clerk komponent (`appearance`) podle tokenů Dílků, česká lokalizace.
2. **Jeden `middleware.ts`**: veřejné cesty (`/`, marketing, `/r/*`, `/z/*`, `/embed/*`,
   `/api/public/*`, `/api/stripe/webhook`, `/api/clerk/webhook`, `/api/cron/*`); Workspace
   `/w/*` a `/api/ws/*` přes Clerk; admin `/dashboard/*`, `/alteno/*`, `/hub/*` přes NextAuth
   token (`getToken`) s přesměrováním na `/login` jako dnes. Zachovej bezpečnostní nonce z S02.
   **Test:** admin login a všechny admin cesty fungují stejně jako před sezením.
3. Stránky `/w/registrace` a `/w/prihlaseni` (Clerk komponenty ve stylu Dílků).
4. `/api/clerk/webhook` (svix podpis, idempotence) → `ws.accounts`, `ws.members`.
5. **Průvodce `/w/novy`** (krok 1 ze 2 povinných): název byznysu + obor (dlaždice).
   Vytvoří organizaci, účet a byznys ze šablony oboru (S06). Krok 2 = platba (S08); do té doby
   tlačítko „Pokračovat" vede rovnou do `/w`. Celé musí jít do 3 minut.
6. `requireWorkspace()` napoj na `auth()`; bez organizace → `/w/novy`.
7. Přepínač byznysů a „+ Přidat byznys" (stejný průvodce) — zatím jen v hlavičce prázdné `/w`.

## Hotovo, když
- Nový uživatel: landing → „Začít" → kód z e-mailu → název + obor → `/w` za < 3 min.
- Druhý uživatel nevidí nic z prvního (test).
- Admin `/login` → `/hub` a celá admin konzole fungují.

## Konec sezení
`zakaziq-memory` → Konec sezení. Commit `ws/auth: Clerk a nový byznys`.
