// Vzhled Workspace (S18): volba v Účtu, uložená v cookie jen pro /w a pro
// tohle zařízení. „Podle systému“ dořeší skript ve WsRoot ještě před
// vykreslením obsahu, takže stránka nebliká.

export const THEME_COOKIE = 'ws_vzhled'

export const THEME_PREFS = ['system', 'light', 'dark'] as const
export type ThemePref = (typeof THEME_PREFS)[number]
export type Theme = 'light' | 'dark'

export function parseThemePref(value: string | undefined | null): ThemePref {
  return (THEME_PREFS as readonly string[]).includes(value ?? '') ? (value as ThemePref) : 'system'
}

export const THEME_LABELS: Record<ThemePref, string> = { system: 'Podle telefonu', light: 'Světlý', dark: 'Tmavý' }

/** Cookie na rok, jen pro /w (landing a admin ji nevidí). */
export const themeCookie = (pref: ThemePref) => `${THEME_COOKIE}=${pref}; Path=/w; Max-Age=31536000; SameSite=Lax`

/** Inline skript pro „Podle systému“: nastaví data-theme rodiči, než se vykreslí obsah. */
export const SYSTEM_THEME_SCRIPT =
  "(function(s){try{s.parentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){}})(document.currentScript)"
