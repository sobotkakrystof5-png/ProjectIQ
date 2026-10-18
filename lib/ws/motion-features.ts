import { domAnimation } from 'framer-motion'

// Funkce Framer Motion, které Workspace používá (animate / exit, bez `layout`
// a `drag`). Načítají se líně z WsRoot (`LazyMotion`), takže se nestahují
// s první stránkou (RD03). Potřebuje-li někdo `layout` nebo `drag`, musí sem
// přidat `domMax` — a vědomě přijmout větší balíček.
export default domAnimation
