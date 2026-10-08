# S08 — Stripe předplatné 249 Kč

## Cíl
Registrace končí platbou 249 Kč měsíčně přes Stripe Checkout, přístup řídí stav předplatného,
klient si vše ostatní řeší sám v Customer Portalu. Vše ověřené v test módu.

## Než začneš
Rituál začátku. Načti `zakaziq-workspace-backend` (sekce Stripe). Zkontroluj v
`memory/memory.md` → Otevřené problémy **DPH v ceně a zkušební dobu** — bez odpovědi nepokračuj, zeptej se.

## Kroky
1. Ve Stripe (test mód) produkt „ZakazIQ" a cena 249 CZK měsíčně → `STRIPE_PRICE_MONTHLY`.
   Návod (co kde naklikat, jaké webhook události zapnout) do `docs/workspace/SETUP.md`.
2. `lib/ws/billing.ts`: `createCheckoutSession(ctx)` (`client_reference_id`, `metadata.account_id`,
   `locale: 'cs'`, platební metody karta + Apple Pay + Google Pay, zkušební doba podle rozhodnutí,
   automatické daňové doklady), `createPortalSession(ctx)`, `hasActiveSubscription(accountId)`.
3. `/api/stripe/webhook` (raw body, ověření podpisu, `ws.stripe_events` idempotence):
   `checkout.session.completed`, `customer.subscription.created|updated|deleted`,
   `invoice.paid`, `invoice.payment_failed` → `ws.subscriptions` a stav účtu.
4. Průvodce `/w/novy` krok 2 → Checkout → návrat `/w?vitejte=1` (uvítací stav s jediným úkolem
   „Zkopírujte odkaz na objednání" — zatím placeholder, odkaz přijde v S11).
5. **Režim jen pro čtení**: `past_due` 7 dní lhůta s pruhem „Platba se nepovedla — aktualizovat
   kartu", pak akce vrací srozumitelnou chybu; čtení funguje, poptávky z webu se ukládají dál.
6. `/w/ucet`: stav předplatného, další platba, tlačítko do Customer Portalu, faktury od Stripe.
7. Testy: webhook idempotence, přechody stavů, `hasActiveSubscription` pro všechny stavy.
   Ruční test: úspěšná platba, karta `4000 0000 0000 0341` (selhání), zrušení v Portalu.

## Hotovo, když
- Celá cesta landing → registrace → obor → platba → `/w` projde v test módu.
- Neúspěšná platba a zrušení se správně projeví, data zůstanou.
- Žádné klíče v klientském kódu, webhook odmítne nepodepsaný požadavek.

## Konec sezení
`zakaziq-memory` → Konec sezení. Commit `ws/billing: předplatné Stripe`.
