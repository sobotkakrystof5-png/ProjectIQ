// Pohyb systému Dílky pro Framer Motion (pravidla: skill zakaziq-design-dilky → references/motion.md).
// V aplikaci se animuje jen změna stavu. prefers-reduced-motion řeší <MotionConfig reducedMotion="user">
// ve WsRoot (vypne posuny a měřítko) a CSS v app/ws-tokens.css (vypne keyframes).

export const zqEase = [0.2, 0.8, 0.2, 1] as const

/** Nová položka v seznamu / kalendáři: vyjede shora a zprůhlední se. */
export const zqIn = {
  initial: { opacity: 0, y: -16, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, transition: { duration: 0.2, ease: zqEase } },
  transition: { duration: 0.6, ease: zqEase },
}

/** Razítko na věrnostní kartě „vyskočí". */
export const zqStamp = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  transition: { duration: 0.5, ease: zqEase },
}

/** Přechod mezi stavy (poptávka → potvrzený termín, uloženo). */
export const zqSwap = { duration: 0.3, ease: zqEase }
