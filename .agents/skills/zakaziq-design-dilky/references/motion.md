# Pohyb v systému Dílky

## Zásady

1. Animace vysvětluje změnu stavu nebo vede oko. Když nic neříká, nepatří tam.
2. Vstup 600–700 ms s `var(--ease-out)`, výstup kratší (200–300 ms).
3. Nikdy neblokuje interakci; tlačítko je klikatelné od prvního snímku.
4. `prefers-reduced-motion` vypíná vše kromě změny barvy (řeší `tokens.css`).
5. Smyčky v pozadí (dílky, pás oborů) jen na landing page a ve velkých prázdných stavech.

## Recepty

**Nová poptávka v seznamu (Framer Motion)**
```tsx
<AnimatePresence initial={false}>
  {items.map((r) => (
    <motion.li key={r.id} layout
      initial={{ opacity: 0, y: -16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }} />
  ))}
</AnimatePresence>
```

**Blok poptávky v kalendáři** — stejný vstup, třídy
`bg-signal-bg border-[1.5px] border-dashed border-signal-line text-signal-ink`.
Po potvrzení přechod (300 ms) na `bg-navy-100 border-l-[3px] border-navy-700`.

**Razítko** — `initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}`, 500 ms.
Při naplnění karty změna textu na „Odměna připravena" (`text-reward`) bez dalšího efektu.

**Tečka „právě dorazilo"** — `w-2 h-2 rounded-full bg-signal animate-zq-dot`.

**Nájezd sekcí (landing)** — `IntersectionObserver` jednou, třída `animate-zq-rise`,
stagger 80–120 ms mezi kartami. Bez knihovny navíc.

**Pole dílků (landing hero)** — CSS grid čtverců 44 px, `rounded-[10px]`, výchozí
`bg-navy-200/5 border border-navy-200/5`; deterministicky (index × 37 mod 100 < 9) vybrané
dílky `bg-navy-500 animate-zq-pulse` s `animation-duration` 4–7 s a zpožděním 0–6 s.
`aria-hidden`, `pointer-events-none`. Aktuální `HeroBackdrop` doplňuje světlo a mírný náklon podle ukazatele; při omezeném pohybu je vypíná. Kalendářový příběh má souvislé tmavé pozadí pro čitelnost.

**Živá ukázka aplikace (landing)** — tři stavy jedné fiktivní poptávky lze ovládat tlačítky i běžným posouváním příběhu. Bez automatické smyčky; po potvrzení se změní podoba bloku, při `prefers-reduced-motion` bez přechodu. Kalendář a detail zůstávají společně viditelné.

**Grafy** — sloupce `origin-bottom animate-zq-grow`, `animation-delay: i * 120ms`.
