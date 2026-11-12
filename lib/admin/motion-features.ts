import { domAnimation } from 'framer-motion'

// Funkce Framer Motion, které admin používá (animate / exit, bez `layout`
// a `drag`). Načítají se líně z `AdminRoot` (`LazyMotion`), takže ~40 kB
// gzip balíčku nestahuje každá obrazovka adminu kvůli dvěma modalům (AD08).
//
// Vedle `lib/ws/motion-features.ts` schválně: obě části si vedou vlastní
// seznam, aby přidání `layout` v jedné nezdražilo tu druhou.
export default domAnimation
