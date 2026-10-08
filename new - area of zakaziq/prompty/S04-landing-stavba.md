# S04 — Landing page: stavba a animace

## Cíl
Landing page na `/` podle `docs/landing/PROJECT-BRIEF.md` a mockupu LP-D, včetně animací.
`/` přestane přesměrovávat na `/hub`/`/login`; admin se dál přihlašuje přes `/login` (odkaz ve footeru).

## Než začneš
Rituál začátku. Načti `zakaziq-design-dilky` (+ references), `frontend-design`,
`zakaziq-ux-texty-cs` a brief. Podívej se do `components/ws/brand/` (S01).

## Kroky
1. `app/(marketing)/layout.tsx` s `data-app="ws"`, písmy a tokeny a `app/(marketing)/page.tsx`
   jako landing page. Stávající `app/page.tsx` (přesměrování na `/hub`/`/login`) **smaž** — je to
   jediná povolená změna mimo nové složky, dvě stránky pro `/` by kolidovaly. Přihlášený admin
   na `/` uvidí v hlavičce odkaz „Do administrace" místo automatického přesměrování; zjistí to
   malá klientská komponenta (`/api/auth/session`), aby stránka zůstala statická. Rozhodnutí zapiš do `memory/memory.md` → Rozhodnutí.
2. Sekce jako samostatné komponenty v `components/marketing/`: `Header`, `Hero`, `LiveDemo`,
   `OborMarquee`, `Features`, `HowItWorks`, `Modules`, `Connect`, `Pricing`, `Faq`, `Footer`.
3. **Hero:** `TileField` v pozadí, jedno jemné radiální světlo, `LiveDot` „Právě dorazila
   poptávka: …", nadpis s `AccentHeading`, CTA.
4. **LiveDemo** (klientská komponenta): 6 ukázkových poptávek v cyklu 2,8 s, vjezd nové
   položky, blok v kalendáři na správném dni/čase, `LoyaltyCard` se razítkuje, při 5/5 odměna.
   Pauza mimo viewport (`IntersectionObserver`), statický stav při `prefers-reduced-motion`.
   Data jsou zjevně ukázková (fiktivní jména), bez tvrzení o skutečných klientech.
5. **HowItWorks:** 4 kroky s ukazatelem postupu, auto-postup + kliknutí na krok.
6. **Faq:** přístupný akordeon (`<details>` nebo Radix), otázky a odpovědi z briefu.
7. **Kontakt „Domluvit hovor"**: dialog s krátkým formulářem → server action → existující
   `/api/public/leads` (bez úpravy toho endpointu) nebo přímý insert stejnou cestou jako
   endpoint. Rate limit, Zod, děkovná zpráva.
8. **Footer:** odkaz **Admin** na `/login` (nenápadný), právní stránky (zatím `[DOPLNIT]`).
9. Nájezdy sekcí `animate-zq-rise` jednou při scrollu. Lighthouse: Performance ≥ 90,
   Accessibility ≥ 95 na mobilu; LCP prvek hero nadpis, ne animace.
10. Mobil 390 px: navigace do menu, LiveDemo zjednodušené (jen seznam + karta).

## Hotovo, když
- `/` vypadá a hýbe se jako LP-D, na telefonu je čitelná a rychlá.
- „Začít za 249 Kč" vede na `/w/registrace` (zatím může být stránka „Brzy"), „Admin" na `/login`.
- Admin přihlášení a všechny admin stránky fungují.
- Build, testy, checklist Dílků.

## Konec sezení
`zakaziq-memory` → Konec sezení. Commit `marketing: landing page`.
